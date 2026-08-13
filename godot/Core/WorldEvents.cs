using System;

namespace CradlesOfCivilization.Core;

internal static class WorldEvents
{
    public static EventDefinition SelectPrimary(GameState state, int rand)
    {
        var disaster = DoomEvent(state, rand);
        if (disaster is not null) return disaster;

        if (state.Science >= 7_500 && rand % 313 == 0)
        {
            return Event("微粒封锁假说", -50, 50, 0, -1_200, -18_000, -9);
        }

        if (state.Belief >= 7_500 && rand % 271 == 0)
        {
            return Event("不信者税", -50, 50, 0, -1_600, -22_000, -7);
        }

        if (state.Science >= 6_000 && state.Belief >= 6_000 && rand % 89 == 0)
        {
            return Event("双相启示", 50, 50, 0, 4_200, 18_000, 10);
        }

        return EventCatalog.SelectNormalEvent(rand, state);
    }

    public static EventDefinition? SelectSpecial(GameState state, int spec, Lcg rng)
    {
        var current = state.Snapshot();
        return spec switch
        {
            1 => Event("ReUnion - 叛军起义", -600, -200, 0, -(50_000 + rng.NextInt(100_001)), 0, 0),
            42 => new EventDefinition("Answers to All - 终极答案", new StatDelta(2_000, -4_000), Effect: "answer42"),
            1861 => Event("Civil War - 三体内战", 0, 0, 0,
                CoreRules.JsRound(current.Population / (rng.NextInt(2) == 0 ? 2.0 : 3.0)) - current.Population,
                -100_000, 0),
            2020 => Event("Plague Inc. - 瘟疫公司", 0, 0, 0, CoreRules.JsRound(current.Population * 0.6) - current.Population, 0, 0),
            2006 => Event("Genesis Birth - 创世出生", 200, 100, 0, 20_000, 5_000, 0),
            38 => new EventDefinition("Gender Equality - 两性平等", new StatDelta(), Effect: "populationMultiplier", EffectValue: rng.NextInt(2) == 0 ? 2.0 / 3 : 5.0 / 4),
            1922 => new EventDefinition("Union We Stand - 团结永存", new StatDelta(), Effect: "controlMultiplier", EffectValue: 2),
            1991 => new EventDefinition("Divide and Fall - 分崩离析", new StatDelta(), Effect: "controlLock"),
            1937 => new EventDefinition("Remember the Pain - 勿忘国耻", new StatDelta(Population: -300_000), PiercesPopulationProtection: true),
            1945 => Event("Revenge Our Loss - 招核男儿", 400, 0, 0, -800_000, 0, 0),
            1800 => Event("Industrial Revolution - 工业革命", current.Science <= 6_000 ? 8_400 - current.Science : 0, 0, 0, 0, 0, 0),
            476 => Event("Middle Aged Times - 中古世纪", 0, current.Belief <= 6_000 ? 14_000 - current.Belief : 0, 0, 0, 0, 0),
            1776 => new EventDefinition("Independence and Freedom - 独立自由", new StatDelta(), Effect: "knowledgeMultiplier", EffectValue: 1.15),
            1453 => Event("Anarchy - 时代终结", 0, 0, 0, CoreRules.JsRound(current.Population * 0.9) - current.Population, CoreRules.JsRound(current.Economy / 5.0) - current.Economy, 0),
            3332 => Event("No Meaning - 虚无主义", 0, 600, 0, 0, -30_000, 0),
            3141 => Event("Great Ratio - π", 3_141.59, 0, 0, 0, 31_000, 0),
            2718 => Event("Nature Goddess - 自然对数", 2_718.28, 0, 0, 0, 27_000, 0),
            3688 => Event("No Refund - 概不退款", 0, 0, 0, 0, -30_000, 0),
            404 => Event("God Not Found - 查无此神", 0, -1_000, 0, 0, 0, 0),
            1611 => Event("The Tempest - 暴风雨", 200, 120, 2_200, 0, -12_000, 0),
            213 => Event("Ashes of Alexandria - 亚历山大灰烬", -360, 160, -2_600, 0, -18_000, -5),
            _ => null
        };
    }

    private static EventDefinition? DoomEvent(GameState state, int rand)
    {
        var multiplier = DifficultyDisasterMultiplier(state.Difficulty);
        var result = BaseDoomEvent(state, rand);
        var gate = Math.Abs(rand * 37L + state.Turn * 101L + state.Seed) % 10_000;
        if (result is not null)
        {
            return multiplier < 1 && gate >= CoreRules.JsRound(multiplier * 10_000) ? null : result;
        }

        if (multiplier <= 1) return null;
        var extraChance = CoreRules.JsRound((multiplier - 1) * 320);
        if (gate >= extraChance) return null;
        int[] representativeRolls = [50, 2_990, 7_400, 6_150, 1_855, 4_528, 8_848];
        return BaseDoomEvent(state, representativeRolls[(rand + state.Turn) % representativeRolls.Length]);
    }

    private static EventDefinition? BaseDoomEvent(GameState state, int rand)
    {
        if (rand < 130) return Disaster("三日凌空");
        if (rand is >= 2_968 and <= 3_024) return Disaster("引力长鞭");
        if (rand is >= 7_375 and <= 7_429) return Disaster("三日连珠");
        if (rand is >= 6_140 and <= 6_165) return Disaster("烈焰长夜");
        if (rand is >= 1_848 and <= 1_862) return Disaster("板块运动");
        if (rand is >= 4_520 and <= 4_536) return Disaster("黑星凌日");
        if (rand is >= 8_840 and <= 8_857) return Disaster("三颗飞星");
        if (rand > 0 && rand % 769 == 0) return Disaster("碎片雨");
        if (state.Population > 105_000 && rand % 607 == 0) return Disaster("地下城窒息");
        return null;
    }

    private static double DifficultyDisasterMultiplier(string difficulty)
    {
        return difficulty switch
        {
            "easy" => 0.78,
            "hard" => 1.22,
            "ultimate" => 1.48,
            _ => 1
        };
    }

    private static EventDefinition Disaster(string title)
    {
        return new EventDefinition(title, new StatDelta(), "文明毁灭性天体灾变。", Destroy: true);
    }

    private static EventDefinition Event(string title, double science, double belief, double literatureAndArt, double population, double economy, double stability)
    {
        return new EventDefinition(title, new StatDelta(science, belief, literatureAndArt, population, economy, stability));
    }
}
