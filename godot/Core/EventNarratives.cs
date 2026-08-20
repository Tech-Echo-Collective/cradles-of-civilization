using System.Collections.Generic;
using System;

namespace CradlesOfCivilization.Core;

/// <summary>
/// Player-facing event prose from web v0.2, the last pre-map release.
/// Chinese is verbatim; English preserves the same event structure.
/// </summary>
public static class EventNarratives
{
    private static readonly Dictionary<string, (string Zh, string En)> Copy = new()
    {
        ["微粒封锁假说"] = ("最先进的实验同时失败，前沿学者们耳语道，物理学不存在了。", "The most advanced experiments fail at once. Frontier scholars whisper that physics no longer exists."),
        ["不信者税"] = ("不信者自当征收重税，神殿的账本上写满了他们的名字；天意如此。", "Unbelievers are duly taxed. Temple ledgers fill with their names; such is divine will."),
        ["双相启示"] = ("公式与祷文不过是一体两面，经文和论文亦不过是双生的姊妹。这天，学者和祭司第一次在同一份日历上签名。", "Formula and prayer prove two faces of one truth, scripture and paper twin sisters. That day, scholars and priests sign the same calendar for the first time."),
        ["蒸汽管线"] = ("工坊把热量从地底引向街区，机器第一次像城市的血管一样搏动。", "Workshops pipe heat from underground into the streets; machines pulse like the city's veins for the first time."),
        ["轨道学校"] = ("孩子们在黑板上计算三颗恒星的影子，旧神话被改写成作业。", "Children calculate the shadows of three stars on blackboards, turning old myths into homework."),
        ["反应堆试车"] = ("地下反应堆点亮了一整片城市，也让每一位官员学会恐惧仪表盘。", "An underground reactor lights an entire district and teaches every official to fear the instrument panel."),
        ["计算中心"] = ("纸带、继电器和早期算法接管粮仓调度，迷信第一次输给了排队论。", "Paper tape, relays, and early algorithms take over granary logistics; superstition loses to queueing theory for the first time."),
        ["巡礼季"] = ("数万人沿着恒星升落的方向步行，市集、神殿和粮仓一同膨胀。", "Tens of thousands walk with the rising and setting stars; markets, temples, and granaries swell together."),
        ["誓约法庭"] = ("祭司把争端写进誓约，人们服从判决，但学院开始小声抗议。", "Priests write disputes into covenants. The people obey the judgments, while the academies begin to protest in whispers."),
        ["圣城税册"] = ("捐献、赎罪券和粮票被装订在同一本账册里，秩序变得昂贵而稳定。", "Donations, indulgences, and ration slips are bound into one ledger; order becomes costly and stable."),
        ["钟楼合唱"] = ("每座钟楼在同一刻发声，恐慌被压低，怀疑也被压低。", "Every bell tower sounds at once. Panic is subdued, and so is doubt."),
        ["学院神殿联合会"] = ("学者和祭司共享同一份历法，争论没有停止，但预算终于能通过。", "Scholars and priests share one calendar. Their arguments continue, but the budget finally passes."),
        ["双语档案"] = ("同一场灾难被写成论文，也被写成祷文，后人第一次读懂两种恐惧。", "The same disaster is recorded as both paper and prayer; later generations understand two kinds of fear for the first time."),
        ["拆庙取铜"] = ("观测器需要更多金属，旧神像被熔进望远镜底座。", "The observatories need more metal, so old idols are melted into telescope mounts."),
        ["无神论讲坛"] = ("教授们公开嘲笑神迹，学生们鼓掌，街角的老人们沉默。", "Professors openly mock miracles. Students applaud; old people on street corners fall silent."),
        ["禁书清点"] = ("审查官把一批星图锁进地下室，钥匙交给唱诗班保管。", "Censors lock a collection of star charts underground and entrust the key to the choir."),
        ["苦修大队"] = ("年轻人离开工坊进入修院，城市安静下来，机器也安静下来。", "Young people leave the workshops for monasteries. The city grows quiet, and so do its machines."),
        ["环城温室"] = ("温室沿着城墙向外扩张，更多人口被养活，也有更多人口需要被养活。", "Greenhouses spread beyond the walls, feeding more people and creating still more mouths to feed."),
        ["排水暴动"] = ("拥挤的地下街区为了水渠爆发冲突，行政官用粮票买来一夜安静。", "Crowded underground districts riot over drainage canals; administrators buy one quiet night with ration slips."),
        ["债券风波"] = ("城邦把未来三十年的税写成纸片出售，纸片比粮食更快贬值。", "The city-states sell thirty years of future taxes on scraps of paper; the paper loses value faster than grain."),
        ["黑市粮仓"] = ("地下粮仓拒绝开门，价格比恒星轨道更难预测。", "The underground granaries refuse to open. Prices become harder to predict than stellar orbits."),
        ["城邦互疑"] = ("每座城都怀疑下一座城偷走了恒纪元，贸易线被临时关停。", "Every city suspects the next of stealing the Stable Era, and trade routes close temporarily."),
        ["街垒夜谈"] = ("人们在街垒后讨论明天由谁统治，没人讨论明天由谁播种。", "Behind the barricades, people debate who will rule tomorrow. No one asks who will sow tomorrow."),
        ["火种演习"] = ("EERF 进行整夜演习，地表城市骂它浪费，地下工程师假装没听见。", "EERF runs drills through the night. Surface cities call it wasteful; underground engineers pretend not to hear."),
        ["地下档案校订"] = ("上一代人的错误被重新编号，下一代人的课本因此变厚。", "The previous generation's mistakes are renumbered, making the next generation's textbooks thicker."),
        ["三日凌空"] = ("三颗恒星同时占据天空，海洋沸腾，山脉像纸页一样卷曲。", "Three stars fill the sky at once. Oceans boil and mountains curl like sheets of paper."),
        ["引力长鞭"] = ("恒星轨道突然抽紧，整颗行星被甩入一段无法计算的黑暗。", "The stellar orbits suddenly tighten, flinging the whole planet into an incalculable darkness."),
        ["三日连珠"] = ("大地被三颗太阳的潮汐力撕开，地下河与城市一起坠入裂谷。", "The tidal force of three suns tears the ground apart; underground rivers and cities plunge into the rifts."),
        ["烈焰长夜"] = ("天空在同一天内经历正午与深夜，热浪和冰霜轮流碾过地表。", "The sky passes through noon and midnight in a single day, while heat waves and frost take turns crushing the surface."),
        ["板块运动"] = ("远古海床重新隆起，城市像沉船一样被埋进盐壳和石灰岩。", "Ancient seabeds rise again, burying cities like shipwrecks beneath salt crust and limestone."),
        ["黑星凌日"] = ("一颗恒星在另一颗恒星前方变暗，潮汐和辐射同时失序，历法彻底失效。", "One star darkens before another. Tides and radiation lose order together, and every calendar fails."),
        ["三颗飞星"] = ("长夜提前降临，冰层越过赤道，火种和粮仓在同一周内熄灭。", "The long night arrives early. Ice crosses the equator, and seedbanks and granaries fail within the same week."),
        ["碎片雨"] = ("来自旧轨道的碎片贯穿大气层，城市和神殿一起消失在白光里。", "Debris from an old orbit pierces the atmosphere; cities and temples vanish together in white light."),
        ["地下城窒息"] = ("人口超过洞穴和粮仓的承载极限，最后的避难所从内部崩塌。", "Population exceeds the capacity of caverns and granaries. The final refuge collapses from within."),
        ["人口断代"] = ("从何时开始，文明掐死了自己的最后一个婴儿？万籁俱寂，一切重新开始。", "When did civilization strangle its own last infant? All falls silent, and everything begins again."),
        ["终极答案倒计时归零"] = ("第 42 号答案完成最后一次回响，文明在确定性里停止。", "Answer 42 completes its final echo, and civilization halts within certainty."),
        ["乱纪元延长"] = ("昼夜和季节失去意义，人们靠猜测安排播种和迁徙。", "Day, night, and season lose meaning; people schedule planting and migration by guesswork."),
        ["稳定恒纪元"] = ("浸泡在恒纪元的光辉里，文明的秩序和产出都获得了提升。", "Bathed in the light of the Stable Era, civilization gains both order and output."),
        ["地层翻页"] = ("新的矿脉从断崖里露出，代价是一片旧城被埋进岩层。", "New ore seams emerge from the cliffs at the cost of an old city buried in the strata."),
        ["神权辩论"] = ("祭司们用一场漫长争论解释灾变，群众获得方向，学院失去经费。", "Priests explain the disaster through a long debate. The people gain direction; the academies lose funding."),
        ["观测失误"] = ("一次错误预报让迁徙队走向错误山谷，星象学派趁机扩张。", "A faulty forecast sends the migration party into the wrong valley, and the astrologers seize the chance to expand."),
        ["丰收季"] = ("温暖、雨水和安静的夜晚罕见地同时出现，粮仓被装满。", "Warmth, rain, and quiet nights arrive together in a rare season, filling the granaries."),
        ["热疫"] = ("高温唤醒古老病灶，医师与祈祷者都被推到人群前方。", "Heat awakens an ancient plague, pushing physicians and supplicants alike to the front of the crowd."),
        ["工匠学院"] = ("师者，所以传道授业解惑也。", "A teacher is one who transmits the Way, imparts knowledge, and resolves doubts."),
        ["圣典整理"] = ("要依靠主得救。", "Believe in the Lord, and you will be saved."),
        ["星象安静"] = ("这一年没有宏大的灾变，普通人的手艺和耐心反而推进了文明。", "No grand disaster comes this year; ordinary skill and patience advance civilization instead."),
        ["冷寂季"] = ("长夜覆盖地表，人口退入洞穴，火和故事成为同一种资源。", "The long night covers the surface. People retreat into caves, where fire and story become the same resource."),
        ["轨道共振"] = ("天体运行短暂呈现规律，历法、神谕和工程计划同时变得可信。", "The heavens briefly become regular, making calendars, oracles, and engineering plans credible at once."),
        ["盐湖退潮"] = ("盐湖露出一圈旧码头，商人带回矿盐，祭司带回远古咒语。", "A receding salt lake reveals old docks. Merchants return with mineral salt, priests with ancient incantations."),
        ["迁徙争执"] = ("观测队要求向北，长老会要求向东，最后车队在原地消耗了整整一季。", "The observers demand north and the elders demand east; in the end, the caravan spends an entire season going nowhere."),
        ["井水变甜"] = ("地下水脉短暂恢复，谣言说这是神迹，工程师说这是地层压力。", "The aquifer briefly recovers. Rumor calls it a miracle; engineers call it geological pressure."),
        ["抄写院失火"] = ("一场小火烧掉了半座抄写院，幸存的书页反而被抄得更快。", "A small fire burns half the scriptorium; the surviving pages are copied faster than ever."),
        ["青铜钟裂"] = ("城中央的青铜钟在寒夜中裂开，人们第一次听见自己心跳的声音。", "The bronze bell at the city center cracks in the cold night, and people hear their own heartbeats for the first time."),
        ["测绘队归来"] = ("失踪三年的测绘队带回新地图，也带回一串没人敢看的死亡名单。", "Surveyors missing for three years return with new maps and a casualty list no one dares read."),
        ["粮仓审计"] = ("账本被重新计算，少了一些神迹，多了一些库存。", "The ledgers are recalculated: fewer miracles, more inventory."),
        ["祭日市场"] = ("祭日吸引了远方部落，祈祷、交易和盗窃在同一条街上发生。", "The holy day draws distant tribes. Prayer, trade, and theft fill the same street."),
        ["恒星色变"] = ("一颗太阳呈现异常红光，学院增设观测班，民间增设忏悔日。", "One sun turns an unnatural red. The academies add observation shifts; the public adds days of penitence."),
        ["旧王陵开启"] = ("王陵里没有永生秘密，只有金器、霉菌和一份相当准确的历法。", "The royal tomb holds no secret of immortality—only gold, mold, and a remarkably accurate calendar."),
        ["煤烟争议"] = ("工坊烟囱遮住了祷告时的星光，城里第一次为天空的所有权争吵。", "Workshop smoke hides the stars during prayer, and the city argues over ownership of the sky for the first time."),
        ["修道院药圃"] = ("修道院把草药配方交给医师，医师承认这次确实有效。", "The monastery gives its herbal formula to the physicians, who admit that this time it actually works."),
        ["税吏失踪"] = ("负责征粮的税吏在夜里消失，第二天所有人都声称没有看见。", "The tax collector responsible for grain disappears at night. The next day, everyone claims to have seen nothing."),
        ["木星般的影子"] = ("天空出现一片缓慢移动的巨大阴影，孩子们把它画进课本边角。", "A vast, slow-moving shadow crosses the sky; children draw it in the margins of their textbooks."),
        ["港口复工"] = ("干涸河床重新容纳浅船，商路像旧伤口一样被重新撕开。", "Shallow boats return to the dry riverbed, reopening trade routes like old wounds."),
        ["孤儿院扩建"] = ("灾年留下的孩子被集中抚养，他们很快学会同时背诵公式和祷文。", "Children orphaned by disaster are raised together and soon learn to recite formulas and prayers side by side."),
        ["钟表匠罢工"] = ("钟表匠拒绝继续修理互相矛盾的时间，城里的预约系统崩溃了。", "Clockmakers refuse to repair mutually contradictory time. The city's appointment system collapses."),
        ["夜校开课"] = ("白天种地的人夜里学习几何，白天祷告的人夜里学习账簿。", "Those who farm by day study geometry at night; those who pray by day study ledgers at night."),
        ["赦免令"] = ("逃亡者被允许返回城市，条件是交出武器、粮票和一半故事。", "Exiles may return if they surrender their weapons, ration slips, and half their stories."),
        ["矿井歌声"] = ("矿工在深处发现稳定岩层，歌声沿着竖井传到地表。", "Miners find stable rock deep below, and their songs rise to the surface through the shaft."),
        ["干热风"] = ("风像从炉膛里吹来，地表作物卷曲，地下课堂却坐满了人。", "The wind blows like a furnace. Surface crops curl, while underground classrooms fill."),
        ["铸币改革"] = ("新币上没有国王头像，只刻着三颗太阳和一行小到看不清的税率。", "The new coin bears no king, only three suns and a tax rate too small to read."),
        ["城墙加高"] = ("城墙又高了一层，外面的人看不见粮仓，里面的人看不见地平线。", "The wall rises another level. Those outside cannot see the granaries; those inside cannot see the horizon."),
        ["诗歌竞赛"] = ("市民把灾年、粮价和三颗太阳写进韵脚，广场第一次因为记忆而拥挤。", "Citizens rhyme disasters, grain prices, and three suns; for the first time, memory crowds the square."),
        ["壁画出土"] = ("旧文明的壁画从盐壳下露出，孩子们照着那些线条重新想象祖先。", "Murals of an older civilization emerge from the salt crust, and children use their lines to imagine their ancestors anew."),
        ["剧场禁令"] = ("城邦禁止剧场上演灾变寓言，演员散入酒馆，把沉默变成更锋利的故事。", "The city-state bans disaster allegories from the stage. Actors scatter into taverns and sharpen silence into stories."),
        ["档案霉变"] = ("潮气钻进地下档案室，一整架族谱在早晨变成无法展开的灰。", "Damp enters the underground archive; by morning, an entire shelf of genealogies has become ash that cannot be unfolded.")
    };

    public static string Chinese(string title) => Copy.TryGetValue(title, out var copy) ? copy.Zh : "";
    public static string English(string title) => Copy.TryGetValue(title, out var copy) ? copy.En : "";

    public static string TranslateChineseSegments(string source)
    {
        var result = source;
        foreach (var copy in Copy.Values)
            result = result.Replace(copy.Zh, copy.En, StringComparison.Ordinal);
        return result;
    }
}
