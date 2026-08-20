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
            return Event("微粒封锁假说", -50, 50, 0, -1_200, -18_000, -9, "special");
        }

        if (state.Belief >= 7_500 && rand % 271 == 0)
        {
            return Event("不信者税", -50, 50, 0, -1_600, -22_000, -7, "special");
        }

        if (state.Science >= 6_000 && state.Belief >= 6_000 && rand % 89 == 0)
        {
            return Event("双相启示", 50, 50, 0, 4_200, 18_000, 10, "special");
        }

        return EventCatalog.SelectNormalEvent(rand, state);
    }

    public static EventDefinition? SelectSpecial(GameState state, int spec, Lcg rng)
    {
        var current = state.Snapshot();
        return spec switch
        {
            1 => Reunion(rng),
            42 => Special("Answers to All - 终极答案",
                "我们不禁驻足思考。生命、宇宙和万物的终极答案，究竟是什么？\nSC 暴涨，旧神学体系崩塌，EERF 被一次性推至满级。人口被锁定 5 次行动。\n",
                "We cannot help but pause and wonder: what is the ultimate answer to life, the universe, and everything?\nSC surges, the old theology collapses, and EERF is raised to maximum level at once. Population is locked for 5 actions.\n",
                new StatDelta(2_000, -4_000), effect: "answer42"),
            1861 => CivilWar(current, rng),
            2020 => Special("Plague Inc. - 瘟疫公司",
                "灰烬，灰烬，我们都将倒下。\n——中世纪英国民谣。\n先按 4/5 人口减半、1/5 人口保留得到幸存基数。\n",
                "Ashes, ashes, we all fall down.\n—Medieval English folk song.\nThe survivor base is calculated by halving four-fifths of the population and retaining one-fifth.\n",
                new StatDelta(Population: CoreRules.JsRound(current.Population * 0.6) - current.Population)),
            2006 => Special("Genesis Birth - 创世出生", "冬至过了那整三天，耶稣降生在驻马店。\n", "Three full days after the winter solstice, Jesus is born in Zhumadian.\n", new StatDelta(200, 100, 0, 20_000, 5_000)),
            38 => GenderEquality(rng),
            1922 => Special("Union We Stand - 团结永存", "所有派系暂时站在同一条防线上，本代文明内发展与打压效率 ×2。\n", "All factions temporarily stand on the same defensive line. Development and suppression efficiency is ×2 for this civilization.\n", new StatDelta(), effect: "controlMultiplier", effectValue: 2),
            1991 => Special("Divide and Fall - 分崩离析", "共同体碎裂。本代文明内，玩家行动无法再控制任何发展。文明将自行推进，直到本轮毁灭，或自动结算。\n", "The community fractures. Player actions can no longer control development in this civilization. It will advance on its own until collapse or automatic settlement.\n", new StatDelta(), effect: "controlLock"),
            1937 => Special("Remember the Pain - 勿忘国耻", "铸兹宝鼎，祀我国殇。\n人口损失 300,000，且EERF保护作用无效。\n", "Cast this treasured cauldron to honor our national dead.\nPopulation loses 300,000, and EERF protection does not apply.\n", new StatDelta(Population: -300_000), piercesPopulationProtection: true),
            1945 => Special("Revenge Our Loss - 招核男儿", "亲王亲王御马前，何物随风斩娇颜？\n", "Prince, prince, before the royal horse—what rides the wind to cut down beauty?\n", new StatDelta(400, 0, 0, -800_000)),
            1800 => IndustrialRevolution(current),
            476 => MiddleAges(current),
            1776 => Special("Independence and Freedom - 独立自由", "独立宣言扩散进学院和神殿，本代文明内 SC/BE 正向增速 ×1.15。\n", "The Declaration of Independence spreads through academies and temples. Positive SC/BE growth is ×1.15 for this civilization.\n", new StatDelta(), effect: "knowledgeMultiplier", effectValue: 1.15),
            1453 => Special("Anarchy - 时代终结", "难道就没有一个基督徒来砍下我的头吗？！\n——君士坦丁十一世，1453年5月29日。\n经济衰退至原有的五分之一，人口流失一成。\n", "Is there no Christian here who will take my head?!\n—Constantine XI, May 29, 1453.\nThe economy falls to one-fifth of its former level, and one-tenth of the population is lost.\n", new StatDelta(Population: CoreRules.JsRound(current.Population * 0.9) - current.Population, Economy: CoreRules.JsRound(current.Economy / 5.0) - current.Economy)),
            3332 => Special("No Meaning - 虚无主义", "跳舞吧，狂欢吧。一切都没有意义。\n经济损失 30,000，神学增长 600。\n", "Dance and revel. Nothing has meaning.\nThe economy loses 30,000, while theology gains 600.\n", new StatDelta(Belief: 600, Economy: -30_000)),
            3141 => Special("Great Ratio - π", "山巅一寺一壶酒。\n", "On the mountaintop: one temple, one flask of wine.\n", new StatDelta(3_141.59, Economy: 31_000)),
            2718 => Special("Nature Goddess - 自然对数", "自然对数被奉为女神，人们在她的祭坛上计算——嗯，几乎是一切。\n", "The natural logarithm is worshiped as a goddess. At her altar, people calculate—well, almost everything.\n", new StatDelta(2_718.28, Economy: 27_000)),
            3688 => Special("No Refund - 概不退款", "朋友，随我来，加入这场伟大的合唱。\n", "Friend, follow me and join this grand chorus.\n", new StatDelta(Economy: -30_000)),
            404 => Special("God Not Found - 查无此神", "我们把天空翻了个遍，没有发现上帝和天使。\n——尤里·加加林，1961年。\n", "We searched the whole sky and found neither God nor angels.\n—Yuri Gagarin, 1961.\n", new StatDelta(Belief: -1_000)),
            1611 => Special("The Tempest - 暴风雨", "啊，这美丽的新世界，竟有这样的人。\n——《暴风雨》，莎士比亚，1611年。\n", "O brave new world, that has such people in it.\n—The Tempest, William Shakespeare, 1611.\n", new StatDelta(200, 120, 2_200, Economy: -12_000)),
            213 => Special("Ashes of Alexandria - 亚历山大灰烬", "图书馆的火光照亮海港，也照亮空白的目录。LA 大幅下降。\n", "The library fire illuminates the harbor—and an empty catalogue. LA falls sharply.\n", new StatDelta(-360, 160, -2_600, Economy: -18_000, Stability: -5)),
            _ => null
        };
    }

    private static EventDefinition Reunion(Lcg rng)
    {
        var loss = 50_000 + rng.NextInt(100_001);
        return Special("ReUnion - 叛军起义",
            $"王侯将相，宁有种乎？ \n——陈胜、吴广，公元前209年。\n叛军夺取粮仓与观测站，人口损失 {loss:N0}。",
            $"Are kings, lords, generals, and ministers born into their rank?\n—Chen Sheng and Wu Guang, 209 BCE.\nRebels seize granaries and observatories; population loses {loss:N0}.",
            new StatDelta(-600, -200, Population: -loss));
    }

    private static EventDefinition CivilWar(MetricSnapshot current, Lcg rng)
    {
        var divisor = rng.NextInt(2) == 0 ? 2 : 3;
        return Special("Civil War - 三体内战",
            $"消灭三体暴政，世界属于人类。\n人口被除以 {divisor}，经济损失 100,000。\n",
            $"Destroy Trisolaran tyranny; the world belongs to humanity.\nPopulation is divided by {divisor}, and the economy loses 100,000.\n",
            new StatDelta(Population: CoreRules.JsRound(current.Population / (double)divisor) - current.Population, Economy: -100_000));
    }

    private static EventDefinition GenderEquality(Lcg rng)
    {
        var slowsGrowth = rng.NextInt(2) == 0;
        return Special("Gender Equality - 两性平等",
            slowsGrowth
                ? "女孩们只想玩乐。\n——辛迪·劳帕，1983年。\n人口增长策略转向审慎，本代文明内人口增速变为原来的 2/3。\n"
                : "妇女能顶半边天。新的家庭制度释放劳动与生育潜能，本代文明内人口增速变为原来的 5/4。\n",
            slowsGrowth
                ? "Girls just want to have fun.\n—Cyndi Lauper, 1983.\nPopulation policy turns cautious; population growth becomes 2/3 of its former rate for this civilization.\n"
                : "Women hold up half the sky. New family institutions release labor and reproductive potential; population growth becomes 5/4 of its former rate for this civilization.\n",
            new StatDelta(), effect: "populationMultiplier", effectValue: slowsGrowth ? 2.0 / 3 : 5.0 / 4);
    }

    private static EventDefinition IndustrialRevolution(MetricSnapshot current)
    {
        var receivesBoost = current.Science <= 6_000;
        return Special("Industrial Revolution - 工业革命",
            receivesBoost ? "工厂、滚轮和蒸汽噪声同时启动，科学被推至 8,400。\n" : "工业革命擦过地平线，但当前科学基础已不需要这次补课。\n",
            receivesBoost ? "Factories, rollers, and steam roar to life together, pushing science to 8,400.\n" : "The Industrial Revolution brushes the horizon, but the current scientific base no longer needs the lesson.\n",
            new StatDelta(Science: receivesBoost ? 8_400 - current.Science : 0));
    }

    private static EventDefinition MiddleAges(MetricSnapshot current)
    {
        var receivesBoost = current.Belief <= 6_000;
        return Special("Middle Aged Times - 中古世纪",
            receivesBoost ? "旧秩序用城墙、钟声和滚轮重组信仰，BE 被推至 14,000。\n" : "中古世纪的影子出现了，但神学基础已经更高。\n",
            receivesBoost ? "The old order rebuilds belief with walls, bells, and wheels, pushing BE to 14,000.\n" : "The shadow of the Middle Ages appears, but the theological foundation is already higher.\n",
            new StatDelta(Belief: receivesBoost ? 14_000 - current.Belief : 0));
    }

    private static EventDefinition Special(string title, string text, string textEn, StatDelta delta, bool piercesPopulationProtection = false, string effect = "", double effectValue = 0)
        => new(title, delta, text, PiercesPopulationProtection: piercesPopulationProtection, Effect: effect, EffectValue: effectValue, TextEn: textEn, Type: "special");

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
        return new EventDefinition(title, new StatDelta(), EventNarratives.Chinese(title), Destroy: true, TextEn: EventNarratives.English(title), Type: "disaster");
    }

    private static EventDefinition Event(string title, double science, double belief, double literatureAndArt, double population, double economy, double stability, string type = "progress")
    {
        return new EventDefinition(title, new StatDelta(science, belief, literatureAndArt, population, economy, stability), EventNarratives.Chinese(title), TextEn: EventNarratives.English(title), Type: type);
    }
}
