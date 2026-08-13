using System;
using System.Collections.Generic;

namespace CradlesOfCivilization.Core;

public sealed record ActionDefinition(
    string Id,
    string Label,
    string Description,
    bool CrisisOnly = false,
    bool RestartOnly = false,
    bool SettleOnly = false,
    bool CanRunWithZeroPopulation = false);

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
    StatDelta Pressure,
    string SpecialEventTitle = "",
    bool CivilizationCollapsed = false,
    bool GameFinished = false,
    string Message = "");

public sealed class GameEngine
{
    public const double KnowledgeCap = CoreRules.KnowledgeCap;
    public const int KnowledgeTrendMinimum = CoreRules.KnowledgeTrendMinimum;
    public const int KnowledgeTrendMaximum = CoreRules.KnowledgeTrendMaximum;

    private static readonly ActionDefinition[] CoreActions =
    [
        new("science", "建造研究所", "推进科学，压低神学并消耗经济。"),
        new("belief", "潜心苦修", "推进神学并提高秩序。"),
        new("population", "扩建聚居地", "用经济和秩序换取人口。"),
        new("balance", "均衡治理", "同时发展科学、神学、人口与经济。"),
        new("order", "维持秩序", "牺牲经济以快速稳定社会。"),
        new("suppressBelief", "打压神学", "以科学取代神学，秩序会受损。"),
        new("suppressScience", "打压科学", "以神学取代科学。"),
        new("hibernate", "脱水", "让部分人口休眠，以换取知识与秩序。"),
        new("arts", "文艺复兴", "积累 LA 文化记忆。"),
        new("economy", "刺激经济", "用少量人口和秩序重启增长。"),
        new("buildEerf", "建造 EERF", "建立一级极端环境抵抗设施。"),
        new("upgradeEerf", "升级 EERF", "提高灾后人口、知识和趋势保留。"),
        new("recovery", "炉边谈话", "仅在经济归零时恢复财政。", CrisisOnly: true, CanRunWithZeroPopulation: true),
        new("restartCivilization", "重启文明", "从 EERF 火种启动下一代文明。", RestartOnly: true, CanRunWithZeroPopulation: true),
        new("settleEnding", "脱离苦海", "结算当前已经满足的结局。", SettleOnly: true, CanRunWithZeroPopulation: true)
    ];

    private static readonly Dictionary<string, ActionDefinition> ActionsById = BuildActionIndex();

    public IReadOnlyList<ActionDefinition> Actions => CoreActions;

    public string? DisabledReason(GameState state, string actionId)
    {
        if (!ActionsById.TryGetValue(actionId, out var action)) return "未知行动";
        if (state.Finished) return "游戏已经结束";
        if (action.RestartOnly) return state.AwaitingCivilizationRestart ? null : "文明尚未毁灭";
        if (action.SettleOnly) return state.EndingCandidate is not null && !state.AwaitingCivilizationRestart ? null : "当前没有可结算结局";
        if (state.AwaitingCivilizationRestart) return "等待重启文明";
        if (action.CrisisOnly) return state.Economy <= 0 ? null : "经济尚未归零";
        if (state.Economy <= 0) return "经济危机锁死普通行动";
        if (state.ControlLocked) return "文明已经分崩离析，不再响应控制";

        var delta = RawActionDelta(state, actionId);
        if (delta.Economy < 0 && state.Economy + delta.Economy < 0) return $"需要 {Math.Abs(delta.Economy):N0} ECO";
        if (delta.Population < 0 && state.Population + delta.Population < MinimumSustainablePopulation(state)) return "会跌破最低可持续人口";
        if (actionId == "buildEerf" && state.EerfLevel > 0) return "EERF 已经存在";
        if (actionId == "upgradeEerf" && state.EerfLevel <= 0) return "尚未建造 EERF";
        if (actionId == "upgradeEerf" && state.EerfLevel >= 5) return "EERF 已满级";
        if (actionId == "upgradeEerf")
        {
            int[] requirements = [0, 0, 2_000, 4_000, 8_000, 16_000];
            var nextLevel = Math.Min(5, state.EerfLevel + 1);
            if (state.Science < requirements[nextLevel]) return $"需要 {requirements[nextLevel]:N0} SC";
        }

        return null;
    }

    public TurnResult Advance(GameState state, string actionId)
    {
        if (!ActionsById.TryGetValue(actionId, out var action))
        {
            throw new ArgumentException($"Unknown action: {actionId}", nameof(actionId));
        }

        if (action.RestartOnly)
        {
            var restarted = RestartCivilization(state);
            return EmptyResult(state, action.Label, restarted ? "文明已重启" : "当前无法重启");
        }

        if (action.SettleOnly)
        {
            var settled = EndingRules.Settle(state);
            return EmptyResult(state, action.Label, settled ? "结局已结算" : "当前没有可结算结局");
        }

        if (state.Finished || state.AwaitingCivilizationRestart)
        {
            return EmptyResult(state, action.Label, state.Finished ? "游戏已经结束" : "等待重启文明");
        }

        var crisisAtRoundStart = state.Economy <= 0;
        var rng = new Lcg(state.RngState);
        var rand = rng.NextInt(10_000);
        var spec = rng.NextInt(5_000) + 1;
        state.Turn += 1;
        state.LastRand = rand;
        state.LastSpec = spec;

        var before = state.Snapshot();
        var primaryEvent = WorldEvents.SelectPrimary(state, rand);
        if (primaryEvent.Destroy)
        {
            var minimumRestartLevel = 0;
            var collapseSnapshot = before;
            if (actionId is "buildEerf" or "upgradeEerf" && DisabledReason(state, actionId) is null)
            {
                var previousLevel = state.EerfLevel;
                var prepared = PrepareActionDelta(state, actionId, RawActionDelta(state, actionId));
                ApplyDelta(state, prepared, freezeKnowledge: crisisAtRoundStart);
                ApplyActionEffect(state, actionId);
                collapseSnapshot = state.Snapshot();
                minimumRestartLevel = state.EerfLevel > previousLevel ? Math.Max(1, state.EerfLevel - 1) : 0;
            }

            state.RngState = rng.State;
            CollapseCivilization(state, primaryEvent, collapseSnapshot, minimumRestartLevel);
            return new TurnResult(
                state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, true,
                new StatDelta(), new StatDelta(), new StatDelta(), CivilizationCollapsed: true,
                GameFinished: state.Finished, Message: state.EndingStatus);
        }

        var drift = ComputeDrift(state, rand);
        ApplyDelta(state, drift, protectPopulationFloor: true, freezeKnowledge: crisisAtRoundStart);
        if (EndingRules.Evaluate(state, primaryEvent.Title))
        {
            state.RngState = rng.State;
            return EarlyEndingResult(state, action, primaryEvent, drift, spec);
        }

        var eventDelta = ApplyDelta(state, primaryEvent.Delta, protectPopulationFloor: true, freezeKnowledge: crisisAtRoundStart);
        if (EndingRules.Evaluate(state, primaryEvent.Title))
        {
            state.RngState = rng.State;
            return EarlyEndingResult(state, action, primaryEvent, drift, spec, eventDelta);
        }

        var specialEvent = WorldEvents.SelectSpecial(state, spec, rng);
        if (specialEvent is not null)
        {
            ApplyDelta(
                state,
                specialEvent.Delta,
                protectPopulationFloor: !specialEvent.PiercesPopulationProtection,
                freezeKnowledge: crisisAtRoundStart);
            ApplySpecialEffect(state, specialEvent);
            if (specialEvent.PiercesPopulationProtection && state.Population <= 0)
            {
                state.RngState = rng.State;
                CollapseCivilization(state, specialEvent, before);
                return new TurnResult(
                    state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, true,
                    drift, eventDelta, new StatDelta(), specialEvent.Title, CivilizationCollapsed: true,
                    GameFinished: state.Finished, Message: state.EndingStatus);
            }

            if (EndingRules.Evaluate(state, specialEvent.Title))
            {
                state.RngState = rng.State;
                return EarlyEndingResult(state, action, primaryEvent, drift, spec, eventDelta, specialEvent.Title);
            }
        }

        EnforcePopulationLock(state);
        if (state.Population <= 0 && !action.CanRunWithZeroPopulation)
        {
            state.RngState = rng.State;
            CollapseCivilization(state, new EventDefinition("人口断代", new StatDelta(), Destroy: true), before);
            return new TurnResult(
                state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, true,
                drift, eventDelta, new StatDelta(), specialEvent?.Title ?? "", CivilizationCollapsed: true,
                GameFinished: state.Finished, Message: state.EndingStatus);
        }

        var disabledReason = action.CrisisOnly && crisisAtRoundStart ? null : DisabledReason(state, actionId);
        var actionLocked = disabledReason is not null || crisisAtRoundStart && !action.CrisisOnly;
        var actionDelta = new StatDelta();
        if (!actionLocked)
        {
            actionDelta = PrepareActionDelta(state, actionId, RawActionDelta(state, actionId));
            ApplyDelta(state, actionDelta, freezeKnowledge: crisisAtRoundStart);
            ApplyActionEffect(state, actionId);
            if (EndingRules.Evaluate(state, action.Label))
            {
                state.RngState = rng.State;
                return EarlyEndingResult(state, action, primaryEvent, drift, spec, eventDelta, specialEvent?.Title ?? "", actionLocked);
            }
        }

        var pressure = ApplyDelta(state, SystemPressure.Calculate(state), freezeKnowledge: crisisAtRoundStart);
        EnforcePopulationLock(state);
        if (state.Population <= 0)
        {
            state.RngState = rng.State;
            CollapseCivilization(state, new EventDefinition("人口断代", new StatDelta(), Destroy: true), before);
            return new TurnResult(
                state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, actionLocked,
                drift, eventDelta, pressure, specialEvent?.Title ?? "", CivilizationCollapsed: true,
                GameFinished: state.Finished, Message: state.EndingStatus);
        }

        var timerDisaster = TickTimers(state);
        if (timerDisaster is not null)
        {
            state.RngState = rng.State;
            CollapseCivilization(state, timerDisaster, before);
            return new TurnResult(
                state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, actionLocked,
                drift, eventDelta, pressure, specialEvent?.Title ?? "", CivilizationCollapsed: true,
                GameFinished: state.Finished, Message: state.EndingStatus);
        }

        KnowledgeTrends.Update(state, primaryEvent, specialEvent, actionId, actionLocked, actionDelta, pressure, rand);
        state.RngState = rng.State;
        state.LastAction = action.Label;
        state.LastEvent = primaryEvent.Title;
        state.Weather = $"{primaryEvent.Title}；{action.Label}";
        state.CurrentCivilization.Observe(state.Snapshot(), state.Turn);
        EndingRules.Evaluate(state, state.Weather);
        AddChronicle(state, primaryEvent, specialEvent, action, actionLocked, disabledReason, pressure);

        return new TurnResult(
            state.Turn,
            rand,
            spec,
            state.RngState,
            primaryEvent.Title,
            action.Label,
            actionLocked,
            drift,
            eventDelta,
            pressure,
            specialEvent?.Title ?? "",
            GameFinished: state.Finished,
            Message: actionLocked ? disabledReason ?? "行动受阻" : state.EndingStatus);
    }

    private static Dictionary<string, ActionDefinition> BuildActionIndex()
    {
        var result = new Dictionary<string, ActionDefinition>(StringComparer.OrdinalIgnoreCase);
        foreach (var action in CoreActions) result[action.Id] = action;
        return result;
    }

    private static TurnResult EmptyResult(GameState state, string actionLabel, string message)
    {
        return new TurnResult(
            state.Turn, state.LastRand, state.LastSpec, state.RngState, state.LastEvent, actionLabel,
            false, new StatDelta(), new StatDelta(), new StatDelta(), GameFinished: state.Finished, Message: message);
    }

    private static TurnResult EarlyEndingResult(
        GameState state,
        ActionDefinition action,
        EventDefinition primaryEvent,
        StatDelta drift,
        int spec,
        StatDelta eventDelta = default,
        string specialTitle = "",
        bool actionLocked = true)
    {
        return new TurnResult(
            state.Turn, state.LastRand, spec, state.RngState, primaryEvent.Title, action.Label, actionLocked,
            drift, eventDelta, new StatDelta(), specialTitle, GameFinished: true, Message: state.EndingStatus);
    }

    private static StatDelta RawActionDelta(GameState state, string actionId)
    {
        return actionId switch
        {
            "science" => new StatDelta(235, -20, 0, -120, -7_800, -2),
            "belief" => new StatDelta(-18, 170, 0, 300, -6_400, 4),
            "population" => new StatDelta(-18, 24, 0, 2_600, -9_500, -5),
            "balance" => new StatDelta(95, 95, 0, 1_100, 4_000, 8),
            "order" => new StatDelta(-6, 22, 0, -160, -11_500, 18),
            "suppressBelief" => new StatDelta(125, -125, 0, -420, -8_800, -8),
            "suppressScience" => new StatDelta(-125, 125, 0, 120, -6_200, 3),
            "hibernate" => new StatDelta(35, 35, 0, -Math.Max(1, Math.Ceiling(state.Population * 0.06)), -5_000, 14),
            "arts" => new StatDelta(0, 0, 750, 260, -9_200, 3),
            "economy" => new StatDelta(
                -8, -6, 0, -Math.Max(0, CoreRules.JsRound(state.Population * 0.008)),
                CoreRules.JsRound(18_000 + Math.Sqrt(Math.Max(0, state.Population)) * 72 + state.Stability * 190), -1),
            "buildEerf" => new StatDelta(-45, -35, 0, -800, -65_000, -4),
            "upgradeEerf" => UpgradeEerfDelta(state),
            "recovery" => new StatDelta(
                -25, -15, 0, state.Population <= 0 ? 3_000 : 0,
                Math.Max(24_000, CoreRules.JsRound(Math.Sqrt(Math.Max(1, state.Population)) * 130 + state.Stability * 320)), -3),
            _ => new StatDelta()
        };
    }

    private static StatDelta UpgradeEerfDelta(GameState state)
    {
        var nextLevel = Math.Min(5, state.EerfLevel + 1);
        return new StatDelta(
            -20 - nextLevel * 6,
            -18 - nextLevel * 5,
            0,
            -CoreRules.JsRound(600 + nextLevel * 450),
            -(36_000 + nextLevel * 34_000),
            -3);
    }

    private static StatDelta PrepareActionDelta(GameState state, string actionId, StatDelta raw)
    {
        var science = raw.Science;
        var belief = raw.Belief;
        var population = raw.Population;
        if (science > 0) science *= state.KnowledgeGrowthMultiplier;
        if (belief > 0) belief *= state.KnowledgeGrowthMultiplier;
        science *= state.ControlEfficiencyMultiplier;
        belief *= state.ControlEfficiencyMultiplier;
        if (population > 0) population *= state.PopulationGrowthMultiplier;
        population *= state.ControlEfficiencyMultiplier;
        return raw with { Science = science, Belief = belief, Population = population };
    }

    private static void ApplyActionEffect(GameState state, string actionId)
    {
        if (actionId == "buildEerf") state.EerfLevel = Math.Max(state.EerfLevel, 1);
        if (actionId == "upgradeEerf") state.EerfLevel = Math.Min(5, state.EerfLevel + 1);
    }

    private static void ApplySpecialEffect(GameState state, EventDefinition specialEvent)
    {
        switch (specialEvent.Effect)
        {
            case "answer42":
                state.PopulationLockTurns = 5;
                state.DoomCountdown = 0;
                state.LockedPopulation = state.Population;
                state.EerfLevel = 5;
                break;
            case "populationMultiplier":
                state.PopulationGrowthMultiplier = CoreRules.JsRound4(state.PopulationGrowthMultiplier * specialEvent.EffectValue);
                break;
            case "controlMultiplier":
                state.ControlEfficiencyMultiplier = CoreRules.JsRound4(state.ControlEfficiencyMultiplier * specialEvent.EffectValue);
                break;
            case "knowledgeMultiplier":
                state.KnowledgeGrowthMultiplier = CoreRules.JsRound4(state.KnowledgeGrowthMultiplier * specialEvent.EffectValue);
                break;
            case "controlLock":
                state.ControlLocked = true;
                break;
        }
    }

    private static StatDelta ComputeDrift(GameState state, int rand)
    {
        var scienceJitter = ((rand % 9) - 4) * 2;
        var beliefJitter = (rand / 10 % 9 - 4) * 2;
        var science = CoreRules.Clamp(state.ScienceTrend + scienceJitter, KnowledgeTrendMinimum, KnowledgeTrendMaximum);
        var belief = CoreRules.Clamp(state.BeliefTrend + beliefJitter, KnowledgeTrendMinimum, KnowledgeTrendMaximum);
        var populationNoise = rand / 100 % 41 - 19;
        var orderNoise = rand / 1_000 % 9 - 4;
        var lowOrderPenalty = state.Stability < 30 ? 900 : 0;
        var highOrderBonus = state.Stability > 72 ? 650 : 0;
        var lowEconomyBuffer = state.Economy is > 0 and < 42_000 ? (42_000 - state.Economy) * 0.05 : 0;
        var literatureAndArt = CoreRules.JsRound(
            (state.Population > 12_000 ? Math.Sqrt(state.Population - 12_000) * 0.09 : 0) +
            CoreRules.KnowledgeHarmony(state.Science, state.Belief) * 5 +
            (state.Stability >= 58 ? 3 : 0) -
            (state.Economy <= 0 ? 18 : 0));
        var population = CoreRules.JsRound(
            state.Population * (0.004 + state.Stability / 18_000.0) + populationNoise * 70 - lowOrderPenalty + highOrderBonus);
        var economy = CoreRules.JsRound(
            Math.Sqrt(Math.Max(0, state.Economy)) * 7 + state.Stability * 8 - state.Population * 0.003 -
            state.EerfLevel * 620 + lowEconomyBuffer);
        return new StatDelta(science, belief, literatureAndArt, population, economy, orderNoise);
    }

    internal static StatDelta ApplyDelta(
        GameState state,
        StatDelta delta,
        bool protectPopulationFloor = false,
        bool freezeKnowledge = false)
    {
        var science = delta.Science;
        var belief = delta.Belief;
        if (freezeKnowledge || state.Economy <= 0)
        {
            if (science > 0) science = 0;
            if (belief > 0) belief = 0;
        }

        var population = delta.Population;
        var economy = delta.Economy;
        var governor = state.GovernorId;
        if (belief > 0 && governor == "white-woman") belief *= 1.08;
        if (population > 0 && governor == "east-asian-man") population *= 1.08;
        if (economy > 0 && governor == "black-man") economy *= 1.1;
        if (protectPopulationFloor && population < 0)
        {
            var floor = MinimumSustainablePopulation(state);
            population = state.Population <= floor ? 0 : Math.Max(population, floor - state.Population);
        }

        state.Science = CoreRules.Clamp(CoreRules.JsRound4(state.Science + science), 0, KnowledgeCap);
        state.Belief = CoreRules.Clamp(CoreRules.JsRound4(state.Belief + belief), 0, KnowledgeCap);
        state.LiteratureAndArt = CoreRules.Clamp(Math.Floor(state.LiteratureAndArt + delta.LiteratureAndArt), 0, KnowledgeCap);
        state.Population = Math.Max(0, (long)CoreRules.JsRound(state.Population + population));
        state.Economy = Math.Max(0, (long)CoreRules.JsRound(state.Economy + economy));
        state.Stability = (int)CoreRules.Clamp(state.Stability + CoreRules.JsRound(delta.Stability), 0, 100);
        state.CurrentCivilization.Observe(state.Snapshot(), state.Turn);
        return delta with { Science = science, Belief = belief, Population = population, Economy = economy };
    }

    private static long MinimumSustainablePopulation(GameState state)
    {
        var knowledgeBuffer = CoreRules.Clamp((state.Science + state.Belief) / (KnowledgeCap * 2), 0, 1) * 260;
        var economyBuffer = CoreRules.Clamp(Math.Log10(Math.Max(1, state.Economy) + 10) / 6, 0, 1) * 220;
        var orderBuffer = state.Stability >= 70 ? 180 : state.Stability >= 40 ? 90 : 0;
        return (long)CoreRules.JsRound(1_200 + knowledgeBuffer + economyBuffer + orderBuffer);
    }

    private static void EnforcePopulationLock(GameState state)
    {
        if (state.PopulationLockTurns > 0 && state.LockedPopulation.HasValue)
        {
            state.Population = Math.Max(0, state.LockedPopulation.Value);
        }
    }

    private static EventDefinition? TickTimers(GameState state)
    {
        if (state.PopulationLockTurns > 0)
        {
            state.PopulationLockTurns -= 1;
            if (state.PopulationLockTurns == 0) state.LockedPopulation = null;
        }

        if (state.DoomCountdown > 0)
        {
            state.DoomCountdown -= 1;
            if (state.DoomCountdown == 0) return new EventDefinition("终极答案倒计时归零", new StatDelta(), Destroy: true);
        }

        return null;
    }

    private static void CollapseCivilization(GameState state, EventDefinition cause, MetricSnapshot before, int minimumRestartLevel = 0)
    {
        state.CurrentCivilization.Observe(before, state.Turn);
        state.CurrentCivilization.CollapseCause = cause.Title;
        var archived = state.CurrentCivilization;
        state.History.Insert(0, archived);
        if (state.History.Count > 12) state.History.RemoveAt(state.History.Count - 1);

        state.StagnantCivilizationStreak = archived.PeakScience < 1_600 ? state.StagnantCivilizationStreak + 1 : 0;
        state.LaMemoryCivilizationStreak = archived.HadLaCap || archived.PeakLiteratureAndArt >= 18_000 ? state.LaMemoryCivilizationStreak + 1 : 0;
        state.LowOrderCivilizationStreak = archived.FinalSnapshot.Stability < 20 ? state.LowOrderCivilizationStreak + 1 : 0;
        if (state.StagnantCivilizationStreak >= 18)
        {
            EndingRules.Finish(state, "C", "连续 18 代青铜停滞", before);
            return;
        }
        if (state.LaMemoryCivilizationStreak >= 3)
        {
            EndingRules.Finish(state, "J", "连续 3 代文明达到 LA 记忆饱和", before);
            return;
        }
        if (state.LowOrderCivilizationStreak >= 16)
        {
            EndingRules.Finish(state, "I", "连续 16 代文明以无政府收束", before);
            return;
        }

        var restartPopulation = ComputeRestartPopulation(state, before);
        var (science, belief) = ComputeRestartKnowledge(state, before);
        var (scienceTrend, beliefTrend) = ComputeRestartTrends(state, before);
        var restartEerf = Math.Max(Math.Max(0, state.EerfLevel - 1), CoreRules.Clamp(minimumRestartLevel, 0, 5));
        state.PendingRestart = new RestartState
        {
            NextCivilization = state.Civilization + 1,
            Science = science,
            Belief = belief,
            ScienceTrend = scienceTrend,
            BeliefTrend = beliefTrend,
            Population = restartPopulation,
            Economy = restartPopulation > 2_600 ? (long)CoreRules.JsRound(restartPopulation * 2.2) : 0,
            Stability = Math.Max(18, (int)Math.Floor(before.Stability * 0.42)),
            EerfLevel = restartEerf,
            CollapseCause = cause.Title
        };
        state.AwaitingCivilizationRestart = true;
        state.Science = 0;
        state.Belief = 0;
        state.LiteratureAndArt = 0;
        state.ScienceTrend = 0;
        state.BeliefTrend = 0;
        state.Population = 0;
        state.Economy = 0;
        state.Stability = Math.Max(0, (int)Math.Floor(before.Stability * 0.2));
        state.Weather = cause.Title;
        state.LastEvent = cause.Title;
        state.Chronicle.Insert(0, new ChronicleEntry
        {
            Turn = state.Turn,
            Type = "disaster",
            Title = $"第 {state.Turn} 年｜{cause.Title}｜文明毁灭",
            Text = $"第 {state.Civilization} 号文明毁灭，EERF 火种等待重启。"
        });
        EndingRules.UpdateStatus(state);
    }

    private static bool RestartCivilization(GameState state)
    {
        if (!state.AwaitingCivilizationRestart || state.PendingRestart is null) return false;
        var restart = state.PendingRestart;
        state.Science = restart.Science;
        state.Belief = restart.Belief;
        state.LiteratureAndArt = 0;
        state.ScienceTrend = restart.ScienceTrend;
        state.BeliefTrend = restart.BeliefTrend;
        state.Population = restart.Population;
        state.Economy = restart.Economy;
        state.Stability = restart.Stability;
        state.EerfLevel = restart.EerfLevel;
        state.Civilization = restart.NextCivilization;
        state.PopulationGrowthMultiplier = 1;
        state.KnowledgeGrowthMultiplier = 1;
        state.ControlEfficiencyMultiplier = 1;
        state.ControlLocked = false;
        state.PopulationLockTurns = 0;
        state.DoomCountdown = 0;
        state.LockedPopulation = null;
        state.AwaitingCivilizationRestart = false;
        state.PendingRestart = null;
        state.EndingCandidate = null;
        state.CurrentCivilization = CivilizationRecord.Create(state.Civilization, state.Turn, state.Snapshot());
        state.Weather = $"第 {state.Civilization} 号文明苏醒";
        state.Chronicle.Insert(0, new ChronicleEntry
        {
            Turn = state.Turn,
            Type = "special",
            Title = "重启文明",
            Text = $"第 {state.Civilization} 号文明从 EERF 火种中启动。"
        });
        EndingRules.UpdateStatus(state);
        return true;
    }

    private static long ComputeRestartPopulation(GameState state, MetricSnapshot snapshot)
    {
        var level = state.EerfLevel;
        if (level <= 0) return 2_600;
        double[] rates = [0, 0.045, 0.085, 0.13, 0.19, 0.28];
        var preserved = CoreRules.JsRound(snapshot.Population * rates[level]);
        return (long)CoreRules.Clamp(2_600 + level * 1_450 + preserved, 2_600, 95_000);
    }

    private static (double Science, double Belief) ComputeRestartKnowledge(GameState state, MetricSnapshot snapshot)
    {
        var level = state.EerfLevel;
        if (level <= 0) return (0, 0);
        double[] scienceRates = [0, 0.03, 0.06, 0.09, 0.125, 0.165];
        int[] scienceCaps = [0, 750, 1_450, 2_200, 3_000, 3_800];
        int[] beliefCaps = [0, 820, 1_600, 2_450, 3_350, 4_200];
        var culture = CoreRules.Clamp(snapshot.LiteratureAndArt / KnowledgeCap, 0, 1);
        var scienceRate = Interpolate(scienceRates[level], 0.5, culture);
        var beliefRate = scienceRate * 1.08;
        var scienceCap = Math.Floor(Interpolate(scienceCaps[level], KnowledgeCap * 0.5, culture));
        var beliefCap = Math.Floor(Interpolate(beliefCaps[level], KnowledgeCap * 0.5 * 1.08, culture));
        var science = CoreRules.Clamp(Math.Floor(level * 35 + snapshot.Science * scienceRate), 0, scienceCap);
        var belief = CoreRules.Clamp(Math.Floor(level * 35 + snapshot.Belief * beliefRate), 0, beliefCap);
        return (science, belief);
    }

    private static (int Science, int Belief) ComputeRestartTrends(GameState state, MetricSnapshot snapshot)
    {
        var level = state.EerfLevel;
        if (level <= 0) return (0, 0);
        double[] rates = [0, 0.08, 0.12, 0.16, 0.2, 0.25];
        int[] caps = [0, 8, 14, 20, 28, 36];
        var culture = CoreRules.Clamp(snapshot.LiteratureAndArt / KnowledgeCap, 0, 1);
        var rate = Interpolate(rates[level], 0.8, culture);
        var cap = Math.Floor(Interpolate(caps[level], KnowledgeTrendMaximum * 0.8, culture));
        var science = (int)CoreRules.Clamp(Math.Floor(level * 2 + Math.Max(0, state.ScienceTrend) * rate), 0, cap);
        var belief = (int)CoreRules.Clamp(Math.Floor(level * 2 + Math.Max(0, state.BeliefTrend) * rate), 0, cap);
        return (science, belief);
    }

    private static double Interpolate(double from, double to, double ratio) => from + (to - from) * CoreRules.Clamp(ratio, 0, 1);

    private static void AddChronicle(
        GameState state,
        EventDefinition primary,
        EventDefinition? special,
        ActionDefinition action,
        bool locked,
        string? disabledReason,
        StatDelta pressure)
    {
        var specialText = special is null ? "" : $" 特殊事件：{special.Title}。";
        var actionText = locked ? $"行动受阻：{disabledReason ?? "未知原因"}。" : $"执行：{action.Label}。";
        state.Chronicle.Insert(0, new ChronicleEntry
        {
            Turn = state.Turn,
            Type = special is null ? "progress" : "special",
            Title = $"第 {state.Turn} 年｜Rand {state.LastRand:0000}｜{primary.Title}",
            Text = $"{primary.Title}。{specialText} {actionText} 系统压力：SC {pressure.Science:+0;-0;0} / BE {pressure.Belief:+0;-0;0} / POP {pressure.Population:+0;-0;0} / ECO {pressure.Economy:+0;-0;0} / ORD {pressure.Stability:+0;-0;0}。"
        });
        if (state.Chronicle.Count > 80) state.Chronicle.RemoveAt(state.Chronicle.Count - 1);
    }
}
