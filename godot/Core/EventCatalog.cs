using System.Collections.Generic;

namespace CradlesOfCivilization.Core;

public sealed record EventDefinition(string Title, StatDelta Delta);

internal static class EventCatalog
{
    private static readonly EventDefinition[] BaseEvents =
    [
        Event("乱纪元延长", 12, 45, 0, -2_800, -9_000, -8),
        Event("稳定恒纪元", 40, 14, 0, 3_600, 7_000, 7),
        Event("地层翻页", 50, -8, 0, -900, 12_000, -2),
        Event("神权辩论", -30, 50, 0, 500, -5_000, 4),
        Event("观测失误", -45, 35, 0, -1_300, -7_000, -5),
        Event("丰收季", 20, 28, 0, 4_600, 10_000, 5),
        Event("热疫", 45, 45, 0, -3_600, -12_000, -6),
        Event("工匠学院", 50, -10, 0, 900, 8_000, 1),
        Event("圣典整理", -8, 50, 0, 700, 3_000, 6),
        Event("星象安静", 36, 36, 0, 1_500, 5_000, 3),
        Event("冷寂季", -12, 46, 0, -2_200, -8_000, -3),
        Event("轨道共振", 50, 32, 0, 1_200, 9_000, 7),
        Event("盐湖退潮", 26, 18, 0, 900, 14_000, 2),
        Event("迁徙争执", 16, 22, 0, -1_200, -10_000, -6),
        Event("井水变甜", 20, 34, 0, 3_100, 6_000, 5),
        Event("抄写院失火", -18, 50, -520, -300, -7_000, -2),
        Event("青铜钟裂", 12, 40, 0, -700, -5_000, -3),
        Event("测绘队归来", 50, 8, 0, -900, 11_000, -1),
        Event("粮仓审计", 32, -10, 0, 600, 17_000, 4),
        Event("祭日市场", 6, 38, 0, 1_800, 13_000, -1),
        Event("恒星色变", 48, 42, 0, -500, -9_000, -5),
        Event("旧王陵开启", 40, 24, 0, -600, 19_000, 1),
        Event("煤烟争议", 50, -24, 0, -400, 18_000, -7),
        Event("修道院药圃", 34, 36, 0, 2_600, 5_000, 4),
        Event("税吏失踪", -4, 10, 0, 400, -16_000, -8),
        Event("木星般的影子", 46, 30, 0, -300, -6_000, -2),
        Event("港口复工", 24, 8, 0, 1_500, 22_000, 3),
        Event("孤儿院扩建", 22, 28, 0, 2_400, -11_000, 6),
        Event("钟表匠罢工", -10, 20, 0, -400, -13_000, -5),
        Event("夜校开课", 50, 22, 340, 900, -4_000, 2),
        Event("赦免令", 6, 34, 0, 3_000, 4_000, 8),
        Event("矿井歌声", 38, 16, 0, 700, 21_000, 2),
        Event("干热风", 30, 28, 0, -2_400, -15_000, -6),
        Event("铸币改革", 18, -4, 0, 500, 24_000, 3),
        Event("城墙加高", 10, 26, 0, 600, -12_000, 9),
        Event("诗歌竞赛", 8, 18, 760, 500, -6_500, 3),
        Event("壁画出土", 28, 22, 920, 300, -9_000, 2),
        Event("剧场禁令", -6, 20, -850, -200, -4_500, 6),
        Event("档案霉变", -14, 8, -980, -120, -7_200, -2)
    ];

    public static EventDefinition SelectNormalEvent(int rand, GameState current)
    {
        var contextual = SelectContextualEvent(rand, current);
        return contextual is not null && rand % 4 != 1
            ? contextual
            : BaseEvents[rand % BaseEvents.Length];
    }

    private static EventDefinition? SelectContextualEvent(int rand, GameState current)
    {
        var candidates = new List<EventDefinition>();
        var scienceEraLevel = CoreRules.EraIndexFor(current.Science);
        var beliefEraLevel = CoreRules.EraIndexFor(current.Belief);
        var harmony = CoreRules.KnowledgeHarmony(current.Science, current.Belief);
        var scienceDominant = current.Science > current.Belief * 1.35;
        var beliefDominant = current.Belief > current.Science * 1.35;

        if (scienceEraLevel >= 5)
        {
            candidates.Add(Event("蒸汽管线", 50, -12, 0, 900, 16_000, -1));
            candidates.Add(Event("轨道学校", 50, -18, 0, 300, -6_000, 2));
        }

        if (scienceEraLevel >= 8)
        {
            candidates.Add(Event("反应堆试车", 50, -20, 0, -700, 26_000, -4));
            candidates.Add(Event("计算中心", 50, -16, 0, 1_200, 22_000, 3));
        }

        if (beliefEraLevel >= 5)
        {
            candidates.Add(Event("巡礼季", -18, 50, 0, 2_600, 9_000, 5));
            candidates.Add(Event("誓约法庭", -22, 50, 0, 500, -3_000, 9));
        }

        if (beliefEraLevel >= 8)
        {
            candidates.Add(Event("圣城税册", -28, 50, 0, 1_100, 18_000, 7));
            candidates.Add(Event("钟楼合唱", -24, 50, 0, 1_800, -5_000, 11));
        }

        if (harmony >= 0.82 && current.Science + current.Belief >= 7_000)
        {
            candidates.Add(Event("学院神殿联合会", 50, 50, 0, 2_400, 21_000, 8));
            candidates.Add(Event("双语档案", 44, 44, 0, 800, 7_000, 6));
        }

        if (scienceDominant && current.Science >= 5_000)
        {
            candidates.Add(Event("拆庙取铜", 50, -42, 0, -500, 13_000, -7));
            candidates.Add(Event("无神论讲坛", 50, -38, 0, -300, -4_000, -6));
        }

        if (beliefDominant && current.Belief >= 5_000)
        {
            candidates.Add(Event("禁书清点", -44, 50, 0, 200, -6_000, 5));
            candidates.Add(Event("苦修大队", -36, 50, 0, -900, -9_000, 8));
        }

        if (current.Population >= 60_000)
        {
            candidates.Add(Event("环城温室", 28, 14, 0, 5_200, -14_000, -3));
            candidates.Add(Event("排水暴动", 8, 24, 0, -2_600, -18_000, -10));
        }

        if (current.Economy <= 35_000)
        {
            candidates.Add(Event("债券风波", -12, 18, 0, -900, -14_000, -8));
            candidates.Add(Event("黑市粮仓", -6, 20, 0, -1_800, -9_000, -9));
        }

        if (current.Stability <= 30)
        {
            candidates.Add(Event("城邦互疑", -18, 12, 0, -1_200, -20_000, -6));
            candidates.Add(Event("街垒夜谈", 10, 10, 0, -900, -11_000, -5));
        }

        if (current.EerfLevel >= 2)
        {
            candidates.Add(Event("火种演习", 28, 12, 0, -500, -12_000, 4));
            candidates.Add(Event("地下档案校订", 42, 30, 0, 200, -8_000, 3));
        }

        return candidates.Count == 0 ? null : candidates[rand / 7 % candidates.Count];
    }

    private static EventDefinition Event(
        string title,
        double science,
        double belief,
        double literatureAndArt,
        double population,
        double economy,
        double stability)
    {
        return new EventDefinition(
            title,
            new StatDelta(science, belief, literatureAndArt, population, economy, stability));
    }
}
