using System;
using System.Collections.Generic;
using System.Linq;

namespace CradlesOfCivilization.Core;

public sealed record ActionDefinition(
    string Id,
    string Label,
    string Description,
    string Text,
    string TextEn,
    string ChronicleText,
    string ChronicleTextEn,
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
    string Message = "",
    string EventText = "",
    string EventTextEn = "",
    string SpecialEventText = "",
    string SpecialEventTextEn = "",
    StatDelta SpecialEventDelta = default);

public sealed class GameEngine
{
    public const double KnowledgeCap = CoreRules.KnowledgeCap;
    public const int KnowledgeTrendMinimum = CoreRules.KnowledgeTrendMinimum;
    public const int KnowledgeTrendMaximum = CoreRules.KnowledgeTrendMaximum;

    private static readonly ActionDefinition[] CoreActions =
    [
        new("science", "建造研究所", "推进科学，压低神学并消耗经济。", "我们必须知道；我们必将知道。\n ——大卫·希尔伯特，1930年", "We must know. We will know.\n —David Hilbert, 1930", "研究者把恐惧写成公式，科学上升，但旧祭司们感到不安。", "Researchers turn fear into formulas. Science rises, but the old priests grow uneasy."),
        new("belief", "潜心苦修", "推进神学并提高秩序。", "万物非主，唯有真主。", "There is no deity but God.", "苦修者重新解释星象，人群获得秩序，怀疑者退回暗处。", "Ascetics reinterpret the stars. The crowd gains order, while doubters retreat into the shadows."),
        new("population", "扩建聚居地", "用经济和秩序换取人口。", "居者有其屋，耕者有其田。\n安得广厦千万间，大庇天下寒士俱欢颜？", "Homes for those who live; land for those who till.\nOh, for a mansion vast enough to shelter all the poor in joy!", "新的洞穴、温室与地下街区被打开，人口膨胀带来繁荣，也带来拥挤。", "New caverns, greenhouses, and underground districts open. Population growth brings prosperity—and crowding."),
        new("balance", "均衡治理", "同时发展科学、神学、人口与经济。", "政治是妥协的艺术。由此，百花齐放，百家争鸣；\n我看没什么，起码挺热闹。", "Politics is the art of compromise. Thus, let a hundred flowers bloom and a hundred schools contend;\nI see no harm in it—at least it is lively.", "学院和神殿互相让出一步，文明暂时学会用两种语言说话。", "Academy and temple each yield a step. Civilization briefly learns to speak in two languages."),
        new("order", "维持秩序", "牺牲经济以快速稳定社会。", "您自由了。\n——《悲惨世界》，1862年", "You are free.\n—Les Misérables, 1862", "巡夜队、粮票与临时法院重新挤压混乱，经济为秩序让路。", "Night patrols, ration slips, and provisional courts press chaos back. The economy yields to order."),
        new("suppressBelief", "打压神学", "以科学取代神学，秩序会受损。", "陛下，我不需要上帝这个假设。\n——皮埃尔·西蒙·拉普拉斯，1802年", "Sire, I had no need of that hypothesis.\n—Pierre-Simon Laplace, 1802", "学院夺回祭坛、税粮与钟楼，教化蒙昧。神学退却，科学获得一段残酷的清场。", "The academies reclaim altars, taxes, and bell towers to educate the benighted. Theology retreats; science gains a brutal clearing."),
        new("suppressScience", "打压科学", "以神学取代科学。", "不管怎么说，它依然在转动！\n——伽利略·伽利莱，1632年", "And yet it moves!\n—Galileo Galilei, 1632", "祭司接管学院、工坊与账簿，清算异端。科学退却，神学获得一段安静的扩张。", "Priests seize the academies, workshops, and ledgers to purge heresy. Science retreats; theology gains a quiet expansion."),
        new("hibernate", "脱水", "让部分人口休眠，以换取知识与秩序。", "脱水！脱水！！！", "Dehydrate! Dehydrate!!!", "一批人进入脱水状态，文明用当下的热闹换取下一次醒来的秩序。", "Part of the population dehydrates. Civilization trades the bustle of the present for order at the next awakening."),
        new("arts", "文艺复兴", "积累 LA 文化记忆。", "真正的艺术，是不显得像艺术。\n——巴尔达萨雷·卡斯蒂廖内，1528年", "True art is that which does not appear to be art.\n—Baldassare Castiglione, 1528", "佛罗伦萨的晨钟敲碎中世纪的蒙昧,人文主义的曙光正为每块大理石注入体温.", "Florence's morning bells shatter medieval ignorance; the dawn of humanism breathes warmth into every block of marble."),
        new("economy", "刺激经济", "用少量人口和秩序重启增长。", "牛奶会有的，面包也会有的。一切都会有的！\n ——弗拉基米尔·伊里奇·列宁，1917年", "There will be milk, there will be bread. There will be everything!\n —Vladimir Ilyich Lenin, 1917", "粮仓、工坊和税制重新开始工作，文明卖出了理想，得到了现金。", "Granaries, workshops, and taxation begin working again. Civilization sells its ideals and receives cash."),
        new("buildEerf", "建造 EERF", "建立一级极端环境抵抗设施。", "E.E.R.F.极端环境抵抗设施在地下开工。\n子子孙孙无穷匮也，而山不加增，何苦而不平？", "The E.E.R.F. begins construction underground.\nGeneration after generation is endless, while the mountain grows no taller—why should it remain unconquered?", "极端环境抵抗设施在地下开工，地表文明为下一代火种支付第一笔代价。", "The Extreme Environment Resistance Facility begins underground. Surface civilization pays the first price for the next generation's seed."),
        new("upgradeEerf", "升级 EERF", "提高灾后人口、知识和趋势保留。", "风雨不动安如山。\n呜呼！何时眼前突兀见此屋，吾庐独破受冻死亦足！", "Unmoved by wind and rain, secure as a mountain.\nOh, to see such a house rise before us—even if my own hut fell and I froze, it would be enough!", "更深的门、更厚的隔热层、更长的冬眠协议被写入 EERF。", "Deeper doors, thicker insulation, and longer hibernation protocols are added to EERF."),
        new("recovery", "炉边谈话", "仅在经济归零时恢复财政。", "我想花几分钟时间，向我们的人民谈谈银行的情况。\n ——富兰克林·罗斯福，1933年", "I want to talk for a few minutes with the people of the United States about banking.\n —Franklin D. Roosevelt, 1933", "城邦发行硬债、重启税粮并征用冬眠库物资，财政恢复了最小心跳。", "The city-state issues hard debt, restores taxes and grain levies, and requisitions hibernation stores. Public finance regains a minimal pulse.", CrisisOnly: true, CanRunWithZeroPopulation: true),
        new("restartCivilization", "重启文明", "从 EERF 火种启动下一代文明。", "神又说，要有光。于是又有了光。", "And God said, Let there be light: and there was light.", "幸存者打开 EERF 和废墟档案，下一代文明从火种中醒来。", "Survivors open EERF and the ruin archives. The next civilization awakens from the seed.", RestartOnly: true, CanRunWithZeroPopulation: true),
        new("settleEnding", "脱离苦海", "结算当前已经满足的结局。", "必须想象你是幸福的。", "One must imagine you happy.", "文明把当前状态写成最终结局。", "Civilization records its present state as the final ending.", SettleOnly: true, CanRunWithZeroPopulation: true)
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

        if (actionId == "buildEerf" && state.EerfLevel > 0) return "EERF 已经存在";
        if (actionId == "upgradeEerf" && state.EerfLevel <= 0) return "尚未建造 EERF";
        if (actionId == "upgradeEerf" && state.EerfLevel >= 5) return "EERF 已满级";
        if (actionId == "upgradeEerf")
        {
            int[] requirements = [0, 0, 2_000, 4_000, 8_000, 16_000];
            var nextLevel = Math.Min(5, state.EerfLevel + 1);
            if (state.Science < requirements[nextLevel]) return $"需要 {requirements[nextLevel]:N0} SC";
        }

        var delta = RawActionDelta(state, actionId);
        if (delta.Economy < 0 && state.Economy + delta.Economy < 0) return $"需要 {Math.Abs(delta.Economy):N0} ECO";
        if (delta.Population < 0 && state.Population + delta.Population < MinimumSustainablePopulation(state)) return "会跌破最低可持续人口";

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
        state.LastSpecialTitle = "";
        state.LastSpecialText = "";
        state.LastSpecialTextEn = "";
        state.LastSpecialDelta = new StatDelta();

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
                GameFinished: state.Finished, Message: state.EndingStatus,
                EventText: primaryEvent.Text, EventTextEn: primaryEvent.TextEn);
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
            var appliedSpecialDelta = ApplyDelta(
                state,
                specialEvent.Delta,
                protectPopulationFloor: !specialEvent.PiercesPopulationProtection,
                freezeKnowledge: crisisAtRoundStart);
            ApplySpecialEffect(state, specialEvent);
            state.LastSpecialTitle = specialEvent.Title;
            state.LastSpecialText = specialEvent.Text;
            state.LastSpecialTextEn = specialEvent.TextEn;
            state.LastSpecialDelta = appliedSpecialDelta;
            if (specialEvent.PiercesPopulationProtection && state.Population <= 0)
            {
                state.RngState = rng.State;
                CollapseCivilization(state, specialEvent, before);
                return new TurnResult(
                    state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, true,
                    drift, eventDelta, new StatDelta(), specialEvent.Title, CivilizationCollapsed: true,
                    GameFinished: state.Finished, Message: state.EndingStatus,
                    EventText: primaryEvent.Text, EventTextEn: primaryEvent.TextEn,
                    SpecialEventText: specialEvent.Text, SpecialEventTextEn: specialEvent.TextEn,
                    SpecialEventDelta: state.LastSpecialDelta);
            }

            if (EndingRules.Evaluate(state, specialEvent.Title))
            {
                state.RngState = rng.State;
                return EarlyEndingResult(state, action, primaryEvent, drift, spec, eventDelta, specialEvent.Title);
            }
        }

        var populationLockedBeforeAction = EnforcePopulationLock(state);
        if (state.Population <= 0 && !action.CanRunWithZeroPopulation)
        {
            state.RngState = rng.State;
            CollapseCivilization(state, new EventDefinition(
                "人口断代", new StatDelta(),
                "从何时开始，文明掐死了自己的最后一个婴儿？万籁俱寂，一切重新开始。",
                Destroy: true,
                TextEn: "When did civilization strangle its own last infant? All falls silent, and everything begins again."), before);
            return new TurnResult(
                state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, true,
                drift, eventDelta, new StatDelta(), specialEvent?.Title ?? "", CivilizationCollapsed: true,
                GameFinished: state.Finished, Message: state.EndingStatus,
                EventText: primaryEvent.Text, EventTextEn: primaryEvent.TextEn,
                SpecialEventText: specialEvent?.Text ?? "", SpecialEventTextEn: specialEvent?.TextEn ?? "",
                SpecialEventDelta: state.LastSpecialDelta);
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
        var populationWasLocked = EnforcePopulationLock(state) || populationLockedBeforeAction;
        if (state.Population <= 0)
        {
            state.RngState = rng.State;
            CollapseCivilization(state, new EventDefinition(
                "人口断代", new StatDelta(),
                "最后的配给没有等来接收者，文明被迫再次归零。",
                Destroy: true,
                TextEn: "No one remains to receive the final ration. Civilization is forced back to zero once more."), before);
            return new TurnResult(
                state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, actionLocked,
                drift, eventDelta, pressure, specialEvent?.Title ?? "", CivilizationCollapsed: true,
                GameFinished: state.Finished, Message: state.EndingStatus,
                EventText: primaryEvent.Text, EventTextEn: primaryEvent.TextEn,
                SpecialEventText: specialEvent?.Text ?? "", SpecialEventTextEn: specialEvent?.TextEn ?? "",
                SpecialEventDelta: state.LastSpecialDelta);
        }

        var timerDisaster = TickTimers(state);
        if (timerDisaster is not null)
        {
            state.RngState = rng.State;
            CollapseCivilization(state, timerDisaster, before);
            return new TurnResult(
                state.Turn, rand, spec, state.RngState, primaryEvent.Title, action.Label, actionLocked,
                drift, eventDelta, pressure, specialEvent?.Title ?? "", CivilizationCollapsed: true,
                GameFinished: state.Finished, Message: state.EndingStatus,
                EventText: primaryEvent.Text, EventTextEn: primaryEvent.TextEn,
                SpecialEventText: specialEvent?.Text ?? "", SpecialEventTextEn: specialEvent?.TextEn ?? "",
                SpecialEventDelta: state.LastSpecialDelta);
        }

        KnowledgeTrends.Update(state, primaryEvent, specialEvent, actionId, actionLocked, actionDelta, pressure, rand);
        state.RngState = rng.State;
        state.LastAction = action.Label;
        state.LastEvent = primaryEvent.Title;
        state.Weather = $"{primaryEvent.Title}；{action.Label}";
        state.CurrentCivilization.Observe(state.Snapshot(), state.Turn);
        EndingRules.Evaluate(state, state.Weather);
        AddChronicle(state, before, primaryEvent, specialEvent, action, actionLocked, disabledReason, pressure, populationWasLocked);

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
            Message: actionLocked ? disabledReason ?? "行动受阻" : state.EndingStatus,
            EventText: primaryEvent.Text,
            EventTextEn: primaryEvent.TextEn,
            SpecialEventText: specialEvent?.Text ?? "",
            SpecialEventTextEn: specialEvent?.TextEn ?? "",
            SpecialEventDelta: state.LastSpecialDelta);
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
                state.AutoRunUntilCollapse = true;
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

    private static bool EnforcePopulationLock(GameState state)
    {
        if (state.PopulationLockTurns > 0 && state.LockedPopulation.HasValue)
        {
            var changed = state.Population != state.LockedPopulation.Value;
            state.Population = Math.Max(0, state.LockedPopulation.Value);
            return changed;
        }
        return false;
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
            if (state.DoomCountdown == 0) return new EventDefinition(
                "终极答案倒计时归零", new StatDelta(), EventNarratives.Chinese("终极答案倒计时归零"),
                Destroy: true, TextEn: EventNarratives.English("终极答案倒计时归零"));
        }

        return null;
    }

    private static void CollapseCivilization(GameState state, EventDefinition cause, MetricSnapshot before, int minimumRestartLevel = 0)
    {
        state.AutoRunUntilCollapse = false;
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
            Text = $"{cause.Text} 第 {state.Civilization} 号文明在{cause.Title}中毁灭了，该文明进化至{ScienceEra(before.Science)}。文明的种子仍在，它将重新启动，再次开启在三体世界中命运莫测的进化。",
            Delta = Difference(before, state.Snapshot())
        });
        EndingRules.UpdateStatus(state);
    }

    private static bool RestartCivilization(GameState state)
    {
        if (!state.AwaitingCivilizationRestart || state.PendingRestart is null) return false;
        var before = state.Snapshot();
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
        state.AutoRunUntilCollapse = false;
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
            Text = $"第 {state.Civilization} 号文明从 EERF 和废墟档案里醒来。",
            Delta = Difference(before, state.Snapshot())
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
        MetricSnapshot before,
        EventDefinition primary,
        EventDefinition? special,
        ActionDefinition action,
        bool locked,
        string? disabledReason,
        StatDelta pressure,
        bool populationWasLocked)
    {
        var after = state.Snapshot();
        var actionText = locked
            ? $"行动受阻：{disabledReason ?? "未知原因"}。"
            : action.ChronicleText;
        var pressureText = DescribeSystemPressure(pressure);
        var stateText = DescribeChronicleState(state, before, after, primary, action);
        var populationLockText = populationWasLocked ? "只生一个好，政府来养老。本年所有人口变化均被回滚。" : "";
        var type = primary.Type == "special" || special is not null || action.Id is "belief" or "order" or "suppressBelief" or "suppressScience" or "hibernate" or "buildEerf" or "upgradeEerf" or "recovery"
            ? "special"
            : "progress";
        state.Chronicle.Insert(0, new ChronicleEntry
        {
            Turn = state.Turn,
            Type = type,
            Title = $"第 {state.Turn} 年｜Rand {state.LastRand:0000}｜{primary.Title}；{action.Label}",
            Text = string.Join(" ", new[] { primary.Text, actionText, pressureText, stateText, populationLockText }.Where(text => !string.IsNullOrWhiteSpace(text))),
            Delta = Difference(before, after)
        });
        if (state.Chronicle.Count > 80) state.Chronicle.RemoveAt(state.Chronicle.Count - 1);
    }

    private static StatDelta Difference(MetricSnapshot before, MetricSnapshot after) => new(
        after.Science - before.Science,
        after.Belief - before.Belief,
        after.LiteratureAndArt - before.LiteratureAndArt,
        after.Population - before.Population,
        after.Economy - before.Economy,
        after.Stability - before.Stability);

    private static string DescribeChronicleState(
        GameState state,
        MetricSnapshot before,
        MetricSnapshot after,
        EventDefinition primary,
        ActionDefinition action)
    {
        var notes = new List<string>();
        var beforeScienceEra = ScienceEra(before.Science);
        var afterScienceEra = ScienceEra(after.Science);
        var beforeBeliefEra = BeliefEra(before.Belief);
        var afterBeliefEra = BeliefEra(after.Belief);
        var harmony = CoreRules.KnowledgeHarmony(after.Science, after.Belief);

        if (beforeScienceEra != afterScienceEra) notes.Add($"科学史进入{afterScienceEra}。");
        if (beforeBeliefEra != afterBeliefEra) notes.Add($"神学史进入{afterBeliefEra}。");

        if (after.Population > 0 && after.Economy <= after.Population * 0.18)
            notes.Add("粮仓和账本之间的距离正在变得危险。");
        else if (after.Economy >= 180_000)
            notes.Add("财政盈余让统治者第一次相信明年可以被规划。");

        if (after.Stability <= 24)
            notes.Add("地方城邦开始以自己的钟声代替中央命令。");
        else if (after.Stability >= 82)
            notes.Add("秩序严密到连谣言都要排队通过街口。");

        if (harmony >= 0.86 && after.Science + after.Belief >= 6_000)
            notes.Add("学院与神殿仍在争吵，但他们已经在使用同一份日历。");
        else if (after.Science > after.Belief * 1.65 && after.Science >= 5_000)
            notes.Add("望远镜的影子盖过祭坛，城市开始用证据审判传统。");
        else if (after.Belief > after.Science * 1.65 && after.Belief >= 5_000)
            notes.Add("钟声盖过仪器噪音，疑问被重新命名为诱惑。");

        if (state.EerfLevel >= 4) notes.Add("地下火种工程已经成为另一种国家。");
        if (notes.Count < 2 && (state.Turn + primary.Title.Length + action.Label.Length) % 5 == 0)
            notes.Add("这一年没有答案，只有更精确的问题。");
        return string.Join(" ", notes.Take(2));
    }

    private static string ScienceEra(double value)
    {
        string[] eras = ["石器时代", "铜石并用时代", "青铜时代", "铁器时代", "古典机械时代", "蒸汽时代", "电气时代", "原子时代", "信息时代", "太空时代", "星际航行时代", "宇宙工程时代", "戴森球时代"];
        return eras[Math.Min(eras.Length - 1, CoreRules.EraIndexFor(value))];
    }

    private static string BeliefEra(double value)
    {
        string[] eras = ["巫祝萌芽", "图腾祭司", "祖灵城邦", "神权律法", "经院神学", "圣城体系", "正典教会", "三位一体", "教皇选举", "尼西亚信经", "异端审判", "唯有上帝", "天国王朝"];
        return eras[Math.Min(eras.Length - 1, CoreRules.EraIndexFor(value))];
    }

    private static string DescribeSystemPressure(StatDelta delta)
    {
        var notes = new List<string>();
        if (delta.Population < -1_000) notes.Add("人口承载压力正在回收扩张。");
        if (delta.Economy < -3_000) notes.Add("经济维护成本吞噬了部分产出。");
        if (delta.Science > 0) notes.Add("秩序让学院、工坊与档案系统更快运转。");
        if (delta.Stability > 0) notes.Add("神学共同体正在把松散人群重新编入秩序。");
        if (delta.Science < 0 || delta.Belief < 0) notes.Add("知识结构的互斥开始显现。");
        return string.Join(" ", notes);
    }
}
