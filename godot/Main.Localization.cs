using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using CradlesOfCivilization.Core;
using Godot;

namespace CradlesOfCivilization;

public partial class Main
{
    private bool IsEnglish => _state.UiLanguage == "en";

    private string T(string chinese, string english) => IsEnglish ? english : chinese;

    private string DifficultyLabel(int index)
    {
        string[] chinese = ["简单", "普通", "困难", "终极困难"];
        string[] english = ["Easy", "Normal", "Hard", "Ultimate"];
        return (IsEnglish ? english : chinese)[Math.Clamp(index, 0, chinese.Length - 1)];
    }

    private string GovernorLabel(int index)
    {
        string[] chinese = ["杨卫平", "麦克劳德", "塞万提斯", "监听员"];
        string[] english = ["Yang Weiping", "MacLeod", "Cervantes", "Listener"];
        return (IsEnglish ? english : chinese)[Math.Clamp(index, 0, chinese.Length - 1)];
    }

    private void ToggleLanguage()
    {
        _state.UiLanguage = IsEnglish ? "zh" : "en";
        if (!_state.SetupComplete && _state.SetupStage == "name" && _state.Turn == 0)
        {
            if (IsEnglish && _state.RealmName == "长生军") _state.RealmName = "Longevity Army";
            if (!IsEnglish && _state.RealmName == "Longevity Army") _state.RealmName = "长生军";
        }
        RebuildInterface();
        AutoSave();
    }

    private void RebuildInterface()
    {
        foreach (var child in GetChildren().ToArray())
        {
            RemoveChild(child);
            child.QueueFree();
        }

        _metricValues.Clear();
        _metricDetails.Clear();
        _metricTrends.Clear();
        _metricMeters.Clear();
        _actionButtons.Clear();
        _actionReasons.Clear();
        _chronicleFilterButtons.Clear();
        _difficultyButtons.Clear();
        _governorButtons.Clear();
        _endingRecapValues.Clear();
        BuildInterface();
        SyncSetupInputs();
        SetChronicleFilter(_chronicleFilter);
        RenderState();
    }

    private static readonly Dictionary<string, (string Zh, string En, string DescriptionEn)> ActionCopy = new()
    {
        ["science"] = ("建造研究所", "Build Research Institute", "Advance science, reduce theology, and spend economy."),
        ["belief"] = ("潜心苦修", "Devote to Asceticism", "Advance theology and increase order."),
        ["population"] = ("扩建聚居地", "Expand Settlements", "Trade economy and order for population."),
        ["economy"] = ("刺激经济", "Stimulate the Economy", "Spend a little population and order to restart growth."),
        ["arts"] = ("文艺复兴", "Renaissance", "Accumulate LA cultural memory."),
        ["hibernate"] = ("脱水", "Dehydrate", "Let part of the population hibernate in exchange for knowledge and order."),
        ["balance"] = ("均衡治理", "Balanced Governance", "Develop science, theology, population, and economy together."),
        ["suppressBelief"] = ("打压神学", "Suppress Theology", "Replace theology with science at the cost of order."),
        ["order"] = ("维持秩序", "Maintain Order", "Sacrifice economy to stabilize society quickly."),
        ["suppressScience"] = ("打压科学", "Suppress Science", "Replace science with theology."),
        ["buildEerf"] = ("建造 EERF", "Build EERF", "Establish a Level 1 Extreme Environment Resistance Facility."),
        ["upgradeEerf"] = ("升级 EERF", "Upgrade EERF", "Improve post-disaster retention of population, knowledge, and trends."),
        ["recovery"] = ("炉边谈话", "Fireside Chat", "Restore public finances when the economy reaches zero."),
        ["restartCivilization"] = ("重启文明", "Restart Civilization", "Start the next civilization from the EERF seedbank."),
        ["settleEnding"] = ("脱离苦海", "Settle Ending", "Settle the currently available ending.")
    };

    private string ActionLabel(string actionId)
    {
        if (!ActionCopy.TryGetValue(actionId, out var copy)) return actionId;
        return IsEnglish ? copy.En : copy.Zh;
    }

    private string ActionTooltip(string actionId)
    {
        if (!ActionCopy.TryGetValue(actionId, out var copy)) return actionId;
        return IsEnglish ? copy.DescriptionEn : _actionsById[actionId].Description;
    }

    private string ActionQuote(string actionId)
    {
        if (!_actionsById.TryGetValue(actionId, out var action)) return "";
        return IsEnglish ? action.TextEn : action.Text;
    }

    private static readonly Dictionary<string, string> EventNamesEn = new()
    {
        ["乱纪元延长"] = "Chaotic Era Extended", ["稳定恒纪元"] = "Stable Era", ["地层翻页"] = "Strata Turn Over",
        ["神权辩论"] = "Theocracy Debate", ["观测失误"] = "Observation Error", ["丰收季"] = "Harvest Season",
        ["热疫"] = "Heat Plague", ["工匠学院"] = "Artisans' Academy", ["圣典整理"] = "Canon Compilation",
        ["星象安静"] = "Quiet Heavens", ["冷寂季"] = "Cold Silence", ["轨道共振"] = "Orbital Resonance",
        ["盐湖退潮"] = "Salt Lake Recedes", ["迁徙争执"] = "Migration Dispute", ["井水变甜"] = "Sweetened Wells",
        ["抄写院失火"] = "Scriptorium Fire", ["青铜钟裂"] = "Cracked Bronze Bell", ["测绘队归来"] = "Surveyors Return",
        ["粮仓审计"] = "Granary Audit", ["祭日市场"] = "Festival Market", ["恒星色变"] = "Stellar Color Shift",
        ["旧王陵开启"] = "Old Royal Tomb Opened", ["煤烟争议"] = "Coal-Smoke Dispute", ["修道院药圃"] = "Monastery Physic Garden",
        ["税吏失踪"] = "Tax Collector Missing", ["木星般的影子"] = "A Jovian Shadow", ["港口复工"] = "Harbor Reopens",
        ["孤儿院扩建"] = "Orphanage Expansion", ["钟表匠罢工"] = "Clockmakers' Strike", ["夜校开课"] = "Night School Opens",
        ["赦免令"] = "Act of Pardon", ["矿井歌声"] = "Songs from the Mine", ["干热风"] = "Hot Dry Wind",
        ["铸币改革"] = "Coinage Reform", ["城墙加高"] = "Walls Raised", ["诗歌竞赛"] = "Poetry Contest",
        ["壁画出土"] = "Unearthed Mural", ["剧场禁令"] = "Theater Ban", ["档案霉变"] = "Mold in the Archives",
        ["蒸汽管线"] = "Steam Pipeline", ["轨道学校"] = "Orbital School", ["反应堆试车"] = "Reactor Trial",
        ["计算中心"] = "Computing Center", ["巡礼季"] = "Pilgrimage Season", ["誓约法庭"] = "Covenant Court",
        ["圣城税册"] = "Holy City Tax Roll", ["钟楼合唱"] = "Belfry Choir", ["学院神殿联合会"] = "Academy–Temple Union",
        ["双语档案"] = "Bilingual Archives", ["拆庙取铜"] = "Temple Bronze Requisition", ["无神论讲坛"] = "Atheist Lectern",
        ["禁书清点"] = "Forbidden Book Census", ["苦修大队"] = "Ascetic Corps", ["环城温室"] = "Ring-City Greenhouses",
        ["排水暴动"] = "Drainage Riot", ["债券风波"] = "Bond Crisis", ["黑市粮仓"] = "Black-Market Granary",
        ["城邦互疑"] = "City-State Suspicion", ["街垒夜谈"] = "Night Talks at the Barricades", ["火种演习"] = "Seedbank Drill",
        ["地下档案校订"] = "Underground Archive Revision", ["微粒封锁假说"] = "Particle Lockdown Hypothesis", ["不信者税"] = "Tax on Unbelievers",
        ["双相启示"] = "Dual Revelation", ["三日凌空"] = "Three Suns Aloft", ["引力长鞭"] = "Gravitational Whip",
        ["三日连珠"] = "Three-Sun Syzygy", ["烈焰长夜"] = "Long Night of Flame", ["板块运动"] = "Tectonic Upheaval",
        ["黑星凌日"] = "Black Star Transit", ["三颗飞星"] = "Three Flying Stars", ["碎片雨"] = "Debris Rain",
        ["地下城窒息"] = "Undercity Suffocation", ["人口断代"] = "Population Extinction", ["终极答案倒计时归零"] = "Ultimate Answer Countdown Reaches Zero",
        ["等待观测"] = "Awaiting Observation", ["文明苏醒"] = "Civilization Awakens"
    };

    private static readonly Dictionary<string, string> SpecialNamesEn = new()
    {
        ["ReUnion - 叛军起义"] = "ReUnion", ["Answers to All - 终极答案"] = "Answers to All",
        ["Civil War - 三体内战"] = "Civil War", ["Plague Inc. - 瘟疫公司"] = "Plague Inc.",
        ["Genesis Birth - 创世出生"] = "Genesis Birth", ["Gender Equality - 两性平等"] = "Gender Equality",
        ["Union We Stand - 团结永存"] = "Union We Stand", ["Divide and Fall - 分崩离析"] = "Divide and Fall",
        ["Remember the Pain - 勿忘国耻"] = "Remember the Pain", ["Revenge Our Loss - 招核男儿"] = "Revenge Our Loss",
        ["Industrial Revolution - 工业革命"] = "Industrial Revolution", ["Middle Aged Times - 中古世纪"] = "Middle Aged Times",
        ["Independence and Freedom - 独立自由"] = "Independence and Freedom", ["Anarchy - 时代终结"] = "Anarchy",
        ["No Meaning - 虚无主义"] = "No Meaning", ["Great Ratio - π"] = "Great Ratio - π",
        ["Nature Goddess - 自然对数"] = "Nature Goddess", ["No Refund - 概不退款"] = "No Refund",
        ["God Not Found - 查无此神"] = "God Not Found", ["The Tempest - 暴风雨"] = "The Tempest",
        ["Ashes of Alexandria - 亚历山大灰烬"] = "Ashes of Alexandria"
    };

    private string LocalizeEvent(string source)
    {
        if (!IsEnglish || string.IsNullOrEmpty(source)) return source;
        if (EventNamesEn.TryGetValue(source, out var translated)) return translated;
        if (SpecialNamesEn.TryGetValue(source, out translated)) return translated;
        var bilingualSeparator = source.IndexOf(" - ", StringComparison.Ordinal);
        return bilingualSeparator > 0 ? source[..bilingualSeparator] : source;
    }

    private string LocalizeEndingName(string source)
    {
        if (!IsEnglish) return source;
        var slash = source.IndexOf('/');
        return slash >= 0 && slash + 1 < source.Length ? source[(slash + 1)..] : source;
    }

    private string LocalizeCoreText(string source)
    {
        if (!IsEnglish || string.IsNullOrEmpty(source)) return source;
        if (EventNamesEn.ContainsKey(source) || SpecialNamesEn.ContainsKey(source)) return LocalizeEvent(source);
        foreach (var copy in ActionCopy.Values)
            if (source == copy.Zh) return copy.En;

        var exact = new Dictionary<string, string>
        {
            ["文明的旅程尚未停息。"] = "Civilization's journey continues.",
            ["游戏已经结束"] = "The game has ended.", ["文明尚未毁灭"] = "Civilization has not collapsed.",
            ["当前没有可结算结局"] = "No ending is currently available.", ["等待重启文明"] = "Awaiting civilization restart.",
            ["经济尚未归零"] = "The economy has not reached zero.", ["经济危机锁死普通行动"] = "The economic crisis blocks normal actions.",
            ["文明已经分崩离析，不再响应控制"] = "Civilization has fragmented and no longer responds to control.",
            ["EERF 已经存在"] = "EERF already exists.", ["尚未建造 EERF"] = "EERF has not been built.", ["EERF 已满级"] = "EERF is at maximum level.",
            ["会跌破最低可持续人口"] = "This would fall below the minimum sustainable population.",
            ["文明已重启"] = "Civilization restarted.", ["当前无法重启"] = "Civilization cannot restart now.",
            ["结局已结算"] = "Ending settled.", ["行动受阻"] = "Action blocked.", ["未知行动"] = "Unknown action.", ["未知原因"] = "Unknown reason.",
            ["经济危机：正向知识发展冻结"] = "Economic crisis: positive knowledge growth is frozen.",
            ["文明毁灭性天体灾变。"] = "A civilization-ending celestial disaster.",
            ["三颗恒星在天幕上留下互相矛盾的轨迹。"] = "Three stars trace contradictory paths across the sky.",
            ["三颗恒星在天幕上留下互相矛盾的轨迹。执政官看着围在篝火旁的各人，那时科学、神学、人口与经济都脆弱不堪：这是一个文明的新生。"] = "Three stars trace contradictory paths across the sky. The governor looks at those gathered around the fire; science, theology, population, and economy are all fragile. This is the birth of a civilization.",
            ["尚无毁灭记录。"] = "No collapse has been recorded.", ["重启文明"] = "Restart Civilization"
        };
        if (exact.TryGetValue(source, out var exactResult)) return exactResult;

        var civilizationMatch = Regex.Match(source, @"^第\s*(\d+)\s*号文明毁灭，等待重启$");
        if (civilizationMatch.Success) return $"Civilization {civilizationMatch.Groups[1].Value} collapsed; awaiting restart.";
        civilizationMatch = Regex.Match(source, @"^第\s*(\d+)\s*号文明毁灭，EERF 火种等待重启。?$");
        if (civilizationMatch.Success) return $"Civilization {civilizationMatch.Groups[1].Value} collapsed; the EERF seedbank awaits restart.";
        civilizationMatch = Regex.Match(source, @"^第\s*(\d+)\s*号文明从 EERF 火种中启动。?$");
        if (civilizationMatch.Success) return $"Civilization {civilizationMatch.Groups[1].Value} started from the EERF seedbank.";
        civilizationMatch = Regex.Match(source, @"^第\s*(\d+)\s*号文明从 EERF 和废墟档案里醒来。?$");
        if (civilizationMatch.Success) return $"Civilization {civilizationMatch.Groups[1].Value} awakens from EERF and the ruin archives.";
        civilizationMatch = Regex.Match(source, @"^第\s*(\d+)\s*号文明苏醒$");
        if (civilizationMatch.Success) return $"Civilization {civilizationMatch.Groups[1].Value} Awakens";

        var result = source;
        result = EventNarratives.TranslateChineseSegments(result);
        foreach (var endingId in new[] { "A", "B", "C", "D", "E", "F", "G", "H", "I", "J" })
        {
            var endingName = EndingRules.Name(endingId);
            result = result.Replace(endingName, LocalizeEndingName(endingName), StringComparison.Ordinal);
        }
        foreach (var action in _engine.Actions.OrderByDescending(action => action.ChronicleText.Length))
        {
            result = result.Replace(action.ChronicleText, action.ChronicleTextEn, StringComparison.Ordinal);
            result = result.Replace(action.Text, action.TextEn, StringComparison.Ordinal);
        }
        foreach (var (zh, en) in SpecialNamesEn.OrderByDescending(pair => pair.Key.Length)) result = result.Replace(zh, en, StringComparison.Ordinal);
        foreach (var (zh, en) in EventNamesEn.OrderByDescending(pair => pair.Key.Length)) result = result.Replace(zh, en, StringComparison.Ordinal);
        foreach (var copy in ActionCopy.Values.OrderByDescending(copy => copy.Zh.Length)) result = result.Replace(copy.Zh, copy.En, StringComparison.Ordinal);
        foreach (var (zh, en) in exact.OrderByDescending(pair => pair.Key.Length)) result = result.Replace(zh, en, StringComparison.Ordinal);
        foreach (var (zh, en) in new (string Zh, string En)[]
                 {
                     ("石器时代", "Stone Age"), ("铜石并用时代", "Chalcolithic Age"), ("青铜时代", "Bronze Age"), ("铁器时代", "Iron Age"),
                     ("古典机械时代", "Classical Mechanics"), ("蒸汽时代", "Steam Age"), ("电气时代", "Electrical Age"),
                     ("原子时代", "Atomic Age"), ("信息时代", "Information Age"), ("太空时代", "Space Age"),
                     ("星际航行时代", "Interstellar Age"), ("宇宙工程时代", "Cosmic Engineering Age"), ("戴森球时代", "Dyson Sphere Age"),
                     ("巫祝萌芽", "Shamanic Beginnings"), ("图腾祭司", "Totem Priests"), ("祖灵城邦", "Ancestral City-States"),
                     ("神权律法", "Theocratic Law"), ("经院神学", "Scholastic Theology"), ("圣城体系", "Holy City System"),
                     ("正典教会", "Canonical Church"), ("三位一体", "Trinity"), ("教皇选举", "Papal Election"),
                     ("尼西亚信经", "Nicene Creed"), ("异端审判", "Inquisition"), ("唯有上帝", "God Alone"), ("天国王朝", "Kingdom of Heaven")
                 })
            result = result.Replace(zh, en, StringComparison.Ordinal);
        result = Regex.Replace(result, @"第\s*(\d+)\s*号文明毁灭，EERF 火种等待重启。?", "Civilization $1 collapsed; the EERF seedbank awaits restart.");
        result = Regex.Replace(result, @"第\s*(\d+)\s*号文明从 EERF 和废墟档案里醒来。?", "Civilization $1 awakens from EERF and the ruin archives.");
        result = Regex.Replace(result, @"第\s*(\d+)\s*号文明", "Civilization $1");
        result = Regex.Replace(result, @"第\s*(\d+)\s*年", "Year $1");
        result = Regex.Replace(result, @"需要\s*([\d,]+)\s*(SC|ECO)", "Requires $1 $2");
        result = Regex.Replace(result, @"([A-J])结局可结算；可继续发展", "$1 ending available; development may continue");
        result = Regex.Replace(result, @"终极答案倒计时：还剩\s*(\d+)\s*次行动", "Ultimate Answer countdown: $1 actions remaining");
        result = Regex.Replace(result, @"(.+?)已经抵达", match => $"{LocalizeEndingName(match.Groups[1].Value)} reached");
        result = result
            .Replace("｜文明毁灭", " | Civilization Collapsed", StringComparison.Ordinal)
            .Replace("｜终局达成", " | Ending Achieved", StringComparison.Ordinal)
            .Replace("文明毁灭，EERF 火种等待重启", "collapsed; the EERF seedbank awaits restart", StringComparison.Ordinal)
            .Replace("从 EERF 火种中启动", "started from the EERF seedbank", StringComparison.Ordinal)
            .Replace("在三颗恒星互相矛盾的轨迹下苏醒", "awakens beneath the contradictory paths of three stars", StringComparison.Ordinal)
            .Replace("特殊事件：", "Special event: ", StringComparison.Ordinal)
            .Replace("行动受阻：", "Action blocked: ", StringComparison.Ordinal)
            .Replace("执行：", "Action: ", StringComparison.Ordinal)
            .Replace("系统压力：", "System pressure: ", StringComparison.Ordinal)
            .Replace("人口承载压力正在回收扩张。", "Population carrying pressure is reclaiming expansion. ", StringComparison.Ordinal)
            .Replace("经济维护成本吞噬了部分产出。", "Economic maintenance consumes part of the output. ", StringComparison.Ordinal)
            .Replace("秩序让学院、工坊与档案系统更快运转。", "Order makes academies, workshops, and archives run faster. ", StringComparison.Ordinal)
            .Replace("神学共同体正在把松散人群重新编入秩序。", "The theological community is drawing scattered people back into order. ", StringComparison.Ordinal)
            .Replace("知识结构的互斥开始显现。", "Conflict between knowledge systems begins to show. ", StringComparison.Ordinal)
            .Replace("科学史进入", "The history of science enters the ", StringComparison.Ordinal)
            .Replace("神学史进入", "The history of theology enters the ", StringComparison.Ordinal)
            .Replace("粮仓和账本之间的距离正在变得危险。", "The distance between granaries and ledgers is becoming dangerous. ", StringComparison.Ordinal)
            .Replace("财政盈余让统治者第一次相信明年可以被规划。", "A fiscal surplus makes the ruler believe for the first time that next year can be planned. ", StringComparison.Ordinal)
            .Replace("地方城邦开始以自己的钟声代替中央命令。", "Local city-states begin replacing central commands with their own bells. ", StringComparison.Ordinal)
            .Replace("秩序严密到连谣言都要排队通过街口。", "Order is so strict that even rumors must queue at the street corner. ", StringComparison.Ordinal)
            .Replace("学院与神殿仍在争吵，但他们已经在使用同一份日历。", "Academy and temple still argue, but they now use the same calendar. ", StringComparison.Ordinal)
            .Replace("望远镜的影子盖过祭坛，城市开始用证据审判传统。", "The telescope's shadow covers the altar, and the city begins judging tradition by evidence. ", StringComparison.Ordinal)
            .Replace("钟声盖过仪器噪音，疑问被重新命名为诱惑。", "Bells drown out the instruments, and questions are renamed temptations. ", StringComparison.Ordinal)
            .Replace("地下火种工程已经成为另一种国家。", "The underground seed project has become another kind of state. ", StringComparison.Ordinal)
            .Replace("这一年没有答案，只有更精确的问题。", "This year brings no answers, only more precise questions. ", StringComparison.Ordinal)
            .Replace("只生一个好，政府来养老。本年所有人口变化均被回滚。", "One child is best; the state will provide. All population changes this year were rolled back. ", StringComparison.Ordinal)
            .Replace("中毁灭了，该文明进化至", " and had advanced to the ", StringComparison.Ordinal)
            .Replace("。文明的种子仍在，它将重新启动，再次开启在三体世界中命运莫测的进化。", ". Civilization's seed remains; it will restart and begin another uncertain evolution in the three-body world. ", StringComparison.Ordinal)
            .Replace(" 后抵达终局。游戏结束。终局统计已更新。", " reached the ending after the stated trigger. The game is over, and ending statistics have been updated. ", StringComparison.Ordinal)
            .Replace("手动结算：", "Manual settlement: ", StringComparison.Ordinal)
            .Replace("连续 18 代青铜停滞", "18 consecutive civilizations stagnated in the Bronze Age", StringComparison.Ordinal)
            .Replace("连续 3 代文明达到 LA 记忆饱和", "3 consecutive civilizations reached maximum LA memory", StringComparison.Ordinal)
            .Replace("连续 16 代文明以无政府收束", "16 consecutive civilizations ended in anarchy", StringComparison.Ordinal)
            .Replace("文明毁灭", "Civilization Collapsed", StringComparison.Ordinal)
            .Replace("等待重启", "Awaiting Restart", StringComparison.Ordinal)
            .Replace("已经抵达", "Reached", StringComparison.Ordinal)
            .Replace("。", ".", StringComparison.Ordinal)
            .Replace("；", "; ", StringComparison.Ordinal)
            .Replace("，", ", ", StringComparison.Ordinal)
            .Replace("｜", " | ", StringComparison.Ordinal);
        result = Regex.Replace(result, @"Civilization (\d+)在(.+?) and had advanced to the ", "Civilization $1 was destroyed in $2 and had advanced to the ");
        return result;
    }

    private void RunUiLocalizationVerification()
    {
        var errors = new List<string>();
        var checkedStrings = 0;

        void Check(string context, string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value == "中文") return;
            checkedStrings += 1;
            if (Regex.IsMatch(value, @"[\u3400-\u9fff]")) errors.Add($"{context}: {value}");
        }

        void CheckNode(Node node)
        {
            switch (node)
            {
                case Label label:
                    Check(node.Name, label.Text);
                    break;
                case RichTextLabel richText:
                    Check(node.Name, richText.Text);
                    break;
                case OptionButton option:
                    Check(node.Name + ".tooltip", option.TooltipText);
                    for (var i = 0; i < option.ItemCount; i++) Check(node.Name + $".item[{i}]", option.GetItemText(i));
                    break;
                case Button button:
                    Check(node.Name + ".text", button.Text);
                    Check(node.Name + ".tooltip", button.TooltipText);
                    break;
                case LineEdit input:
                    Check(node.Name + ".placeholder", input.PlaceholderText);
                    break;
            }
            foreach (var child in node.GetChildren()) CheckNode(child);
        }

        if (!IsEnglish) errors.Add("verification did not start in English mode");
        CheckNode(this);
        foreach (var action in _engine.Actions)
        {
            Check($"action.{action.Id}.label", ActionLabel(action.Id));
            Check($"action.{action.Id}.tooltip", ActionTooltip(action.Id));
            Check($"action.{action.Id}.quote", ActionQuote(action.Id));
        }
        foreach (var (source, translated) in EventNamesEn) Check($"event.{source}", translated);
        foreach (var (source, translated) in SpecialNamesEn) Check($"special.{source}", translated);
        foreach (var endingId in new[] { "A", "B", "C", "D", "E", "F", "G", "H", "I", "J" })
            Check($"ending.{endingId}", LocalizeEndingName(EndingRules.Name(endingId)));
        foreach (var sample in new[]
                 {
                     "第 7 号文明毁灭，等待重启", "B结局可结算；可继续发展", "终极答案倒计时：还剩 4 次行动",
                     "第 22 年｜三日凌空｜文明毁灭", "第 2 号文明从 EERF 火种中启动。",
                     "乱纪元延长。 特殊事件：ReUnion - 叛军起义。 执行：文艺复兴。 系统压力：SC +1 / BE -2。"
                 })
            Check("dynamic", LocalizeCoreText(sample));

        var simulation = new GameState(1_058) { SetupComplete = true, UiLanguage = "en" };
        string[] simulationActions = ["science", "belief", "population", "economy", "arts", "balance", "buildEerf", "upgradeEerf", "recovery"];
        for (var turn = 0; turn < 320; turn++)
        {
            if (simulation.Finished) simulation = new GameState(1_058 + turn) { SetupComplete = true, UiLanguage = "en" };
            var actionId = simulation.AwaitingCivilizationRestart
                ? "restartCivilization"
                : simulation.Economy <= 0
                    ? "recovery"
                    : simulationActions.FirstOrDefault(id => _engine.DisabledReason(simulation, id) is null) ?? "science";
            var result = _engine.Advance(simulation, actionId);
            Check("turn.event", LocalizeEvent(result.EventTitle));
            Check("turn.special", LocalizeEvent(result.SpecialEventTitle));
            Check("turn.action", LocalizeCoreText(result.ActionLabel));
            Check("turn.message", LocalizeCoreText(result.Message));
            Check("turn.ending", LocalizeCoreText(simulation.EndingStatus));
            foreach (var entry in simulation.Chronicle.Take(2))
            {
                Check("chronicle.title", LocalizeCoreText(entry.Title));
                Check("chronicle.text", LocalizeCoreText(entry.Text));
            }
        }

        foreach (var error in errors) GD.PushError($"LOCALIZATION {error}");
        GD.Print($"UI_LOCALIZATION strings={checkedStrings} status={(errors.Count == 0 ? "PASS" : "FAIL")}");
        GetTree().Quit(errors.Count == 0 ? 0 : 1);
    }
}
