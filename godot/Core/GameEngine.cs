using System;
using System.Collections.Generic;

namespace CradlesOfCivilization.Core;

public sealed record ActionDefinition(string Id, string Label, StatDelta Delta);

public readonly record struct StatDelta(
    double Science = 0,
    double Belief = 0,
    double LiteratureAndArt = 0,
    double Population = 0,
    double Economy = 0,
    double Stability = 0);

public readonly record struct TurnResult(
    int Turn,
    int Rand,
    int Spec,
    long RngState,
    string EventTitle,
    string ActionLabel,
    bool ActionLocked,
    StatDelta Drift,
    StatDelta EventDelta,
    StatDelta Pressure);

public sealed class GameEngine
{
    public const double KnowledgeCap = CoreRules.KnowledgeCap;
    public const int KnowledgeTrendMinimum = CoreRules.KnowledgeTrendMinimum;
    public const int KnowledgeTrendMaximum = CoreRules.KnowledgeTrendMaximum;

    private static readonly ActionDefinition[] CoreActions =
    [
        new("science", "建造研究所", new StatDelta(Science: 235, Belief: -20, Population: -120, Economy: -7_800, Stability: -2)),
        new("belief", "潜心苦修", new StatDelta(Science: -18, Belief: 170, Population: 300, Economy: -6_400, Stability: 4)),
        new("population", "扩建聚居地", new StatDelta(Science: -18, Belief: 24, Population: 2_600, Economy: -9_500, Stability: -5)),
        new("balance", "均衡治理", new StatDelta(Science: 95, Belief: 95, Population: 1_100, Economy: 4_000, Stability: 8))
    ];

    private static readonly Dictionary<string, ActionDefinition> ActionsById = BuildActionIndex();

    public IReadOnlyList<ActionDefinition> Actions => CoreActions;

    public TurnResult Advance(GameState state, string actionId)
    {
        if (!ActionsById.TryGetValue(actionId, out var action))
        {
            throw new ArgumentException($"Unknown action: {actionId}", nameof(actionId));
        }

        var rng = new Lcg(state.RngState);
        var rand = rng.NextInt(10_000);
        var spec = rng.NextInt(5_000) + 1;
        var crisisAtRoundStart = state.Economy <= 0;
        var drift = ComputeDrift(state, rand);
        var normalEvent = EventCatalog.SelectNormalEvent(rand, state);

        ApplyDelta(state, drift, protectPopulationFloor: true, freezeKnowledge: crisisAtRoundStart);
        var eventDelta = ApplyDelta(
            state,
            normalEvent.Delta,
            protectPopulationFloor: true,
            freezeKnowledge: crisisAtRoundStart);
        var actionLocked = crisisAtRoundStart ||
                           state.Economy <= 0 ||
                           action.Delta.Economy < 0 && state.Economy + action.Delta.Economy < 0 ||
                           action.Delta.Population < 0 && state.Population + action.Delta.Population < MinimumSustainablePopulation(state);
        if (!actionLocked)
        {
            ApplyDelta(state, action.Delta, freezeKnowledge: crisisAtRoundStart);
        }

        var pressure = ApplyDelta(state, SystemPressure.Calculate(state), freezeKnowledge: crisisAtRoundStart);

        state.RngState = rng.State;
        state.Turn += 1;
        state.LastRand = rand;
        state.LastSpec = spec;
        state.LastAction = action.Label;
        state.LastEvent = normalEvent.Title;

        return new TurnResult(
            state.Turn,
            rand,
            spec,
            state.RngState,
            normalEvent.Title,
            action.Label,
            actionLocked,
            drift,
            eventDelta,
            pressure);
    }

    private static Dictionary<string, ActionDefinition> BuildActionIndex()
    {
        var result = new Dictionary<string, ActionDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var action in CoreActions)
        {
            result[action.Id] = action;
        }

        return result;
    }

    private static StatDelta ComputeDrift(GameState state, int rand)
    {
        var scienceJitter = ((rand % 9) - 4) * 2;
        var beliefJitter = (((rand / 10) % 9) - 4) * 2;
        var science = CoreRules.Clamp(state.ScienceTrend + scienceJitter, KnowledgeTrendMinimum, KnowledgeTrendMaximum);
        var belief = CoreRules.Clamp(state.BeliefTrend + beliefJitter, KnowledgeTrendMinimum, KnowledgeTrendMaximum);
        var populationNoise = (rand / 100 % 41) - 19;
        var orderNoise = (rand / 1_000 % 9) - 4;
        var lowOrderPenalty = state.Stability < 30 ? 900 : 0;
        var highOrderBonus = state.Stability > 72 ? 650 : 0;
        var lowEconomyBuffer = state.Economy is > 0 and < 42_000
            ? (42_000 - state.Economy) * 0.05
            : 0;
        var literatureAndArt = CoreRules.JsRound(
            (state.Population > 12_000 ? Math.Sqrt(state.Population - 12_000) * 0.09 : 0) +
            CoreRules.KnowledgeHarmony(state.Science, state.Belief) * 5 +
            (state.Stability >= 58 ? 3 : 0) -
            (state.Economy <= 0 ? 18 : 0));

        var population = CoreRules.JsRound(
            state.Population * (0.004 + state.Stability / 18_000.0) +
            populationNoise * 70 -
            lowOrderPenalty +
            highOrderBonus);
        var economy = CoreRules.JsRound(
            Math.Sqrt(Math.Max(0, state.Economy)) * 7 +
            state.Stability * 8 -
            state.Population * 0.003 +
            -state.EerfLevel * 620 +
            lowEconomyBuffer);

        return new StatDelta(
            Science: science,
            Belief: belief,
            LiteratureAndArt: literatureAndArt,
            Population: population,
            Economy: economy,
            Stability: orderNoise);
    }

    private static StatDelta ApplyDelta(
        GameState state,
        StatDelta delta,
        bool protectPopulationFloor = false,
        bool freezeKnowledge = false)
    {
        var scienceDelta = delta.Science;
        var beliefDelta = delta.Belief;
        if (freezeKnowledge || state.Economy <= 0)
        {
            if (scienceDelta > 0) scienceDelta = 0;
            if (beliefDelta > 0) beliefDelta = 0;
        }

        var populationDelta = delta.Population;
        if (populationDelta > 0)
        {
            populationDelta *= 1.08; // 默认执政官“民生防线”，与网页版一致。
        }

        if (protectPopulationFloor && populationDelta < 0)
        {
            var floor = MinimumSustainablePopulation(state);
            populationDelta = state.Population <= floor
                ? 0
                : Math.Max(populationDelta, floor - state.Population);
        }

        state.Science = CoreRules.Clamp(CoreRules.JsRound4(state.Science + scienceDelta), 0, KnowledgeCap);
        state.Belief = CoreRules.Clamp(CoreRules.JsRound4(state.Belief + beliefDelta), 0, KnowledgeCap);
        state.LiteratureAndArt = CoreRules.Clamp(Math.Floor(state.LiteratureAndArt + delta.LiteratureAndArt), 0, KnowledgeCap);
        state.Population = Math.Max(0, (long)CoreRules.JsRound(state.Population + populationDelta));
        state.Economy = Math.Max(0, (long)CoreRules.JsRound(state.Economy + delta.Economy));
        state.Stability = (int)CoreRules.Clamp(state.Stability + CoreRules.JsRound(delta.Stability), 0, 100);

        return delta with
        {
            Science = scienceDelta,
            Belief = beliefDelta,
            Population = populationDelta
        };
    }

    private static long MinimumSustainablePopulation(GameState state)
    {
        var knowledgeBuffer = CoreRules.Clamp((state.Science + state.Belief) / (KnowledgeCap * 2), 0, 1) * 260;
        var economyBuffer = CoreRules.Clamp(Math.Log10(Math.Max(1, state.Economy) + 10) / 6, 0, 1) * 220;
        var orderBuffer = state.Stability >= 70 ? 180 : state.Stability >= 40 ? 90 : 0;
        return (long)CoreRules.JsRound(1_200 + knowledgeBuffer + economyBuffer + orderBuffer);
    }
}
