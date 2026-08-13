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
    string ActionLabel,
    StatDelta Drift);

public sealed class GameEngine
{
    public const double KnowledgeCap = 20_000;
    public const int KnowledgeTrendMinimum = -180;
    public const int KnowledgeTrendMaximum = 240;

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
        var drift = ComputeDrift(state, rand);

        ApplyDelta(state, drift, protectPopulationFloor: true);
        ApplyDelta(state, action.Delta);

        state.RngState = rng.State;
        state.Turn += 1;
        state.LastRand = rand;
        state.LastSpec = spec;
        state.LastAction = action.Label;

        return new TurnResult(state.Turn, rand, spec, state.RngState, action.Label, drift);
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
        var science = Clamp(state.ScienceTrend + scienceJitter, KnowledgeTrendMinimum, KnowledgeTrendMaximum);
        var belief = Clamp(state.BeliefTrend + beliefJitter, KnowledgeTrendMinimum, KnowledgeTrendMaximum);
        var populationNoise = (rand / 100 % 41) - 19;
        var orderNoise = (rand / 1_000 % 9) - 4;
        var lowOrderPenalty = state.Stability < 30 ? 900 : 0;
        var highOrderBonus = state.Stability > 72 ? 650 : 0;
        var lowEconomyBuffer = state.Economy is > 0 and < 42_000
            ? (42_000 - state.Economy) * 0.05
            : 0;

        var population = JsRound(
            state.Population * (0.004 + state.Stability / 18_000.0) +
            populationNoise * 70 -
            lowOrderPenalty +
            highOrderBonus);
        var economy = JsRound(
            Math.Sqrt(Math.Max(0, state.Economy)) * 7 +
            state.Stability * 8 -
            state.Population * 0.003 +
            lowEconomyBuffer);

        return new StatDelta(
            Science: science,
            Belief: belief,
            Population: population,
            Economy: economy,
            Stability: orderNoise);
    }

    private static void ApplyDelta(GameState state, StatDelta delta, bool protectPopulationFloor = false)
    {
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

        state.Science = Clamp(JsRound4(state.Science + delta.Science), 0, KnowledgeCap);
        state.Belief = Clamp(JsRound4(state.Belief + delta.Belief), 0, KnowledgeCap);
        state.LiteratureAndArt = Clamp(Math.Floor(state.LiteratureAndArt + delta.LiteratureAndArt), 0, KnowledgeCap);
        state.Population = Math.Max(0, (long)JsRound(state.Population + populationDelta));
        state.Economy = Math.Max(0, (long)JsRound(state.Economy + delta.Economy));
        state.Stability = (int)Clamp(state.Stability + JsRound(delta.Stability), 0, 100);
    }

    private static long MinimumSustainablePopulation(GameState state)
    {
        var knowledgeBuffer = Clamp((state.Science + state.Belief) / (KnowledgeCap * 2), 0, 1) * 260;
        var economyBuffer = Clamp(Math.Log10(Math.Max(1, state.Economy) + 10) / 6, 0, 1) * 220;
        var orderBuffer = state.Stability >= 70 ? 180 : state.Stability >= 40 ? 90 : 0;
        return (long)JsRound(1_200 + knowledgeBuffer + economyBuffer + orderBuffer);
    }

    private static double JsRound(double value) => Math.Floor(value + 0.5);

    private static double JsRound4(double value) => JsRound(value * 10_000) / 10_000;

    private static int Clamp(int value, int minimum, int maximum) => Math.Min(maximum, Math.Max(minimum, value));

    private static double Clamp(double value, double minimum, double maximum) => Math.Min(maximum, Math.Max(minimum, value));
}
