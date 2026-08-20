using System.Collections.Generic;

namespace CradlesOfCivilization.Core;

public sealed record EndingCopy(
    string NameZh,
    string NameEn,
    string[] ParagraphsZh,
    string[] ParagraphsEn,
    string QuoteZh,
    string QuoteEn);

/// <summary>Non-military endings A-J, copied from the v0.2 web release.</summary>
public static class EndingCatalog
{
    private static readonly Dictionary<string, EndingCopy> Endings = new()
    {
        ["A"] = new("地上天国", "Promised Land",
            ["终于，我们可以骄傲地宣告，人类为理想流血漂橹的日子结束了；没有天使吹响号角，也没有圣城从天而降——", "这应许之地，是你我亲手所造。"],
            ["At last, we may proudly declare that the days when humanity bled rivers for ideals are over. No angel sounds a trumpet; no holy city descends from heaven—", "This promised land was made by our own hands."],
            "“看哪，我将一切都更新了。”——《启示录》21:5", "“Behold, I make all things new.” —Revelation 21:5"),
        ["B"] = new("人间地狱", "Suffer In Hell",
            ["终于，我们可以骄傲地宣告，人类为圣灵流血漂橹的日子结束了；不会有天使吹响号角，不会有圣城从天而降——", "你们终将归于上上善道。"],
            ["At last, we may proudly declare that the days when humanity bled rivers for the Holy Spirit are over. No angel will sound a trumpet; no holy city will descend from heaven—", "You will all return to the highest good."],
            "“进入此门者，当舍弃一切希望。”——《神曲·地狱篇》，但丁，1307年", "“Abandon all hope, you who enter here.” —Inferno, Dante, 1307"),
        ["C"] = new("都灵之马", "The Turin Horse",
            ["这片大地人烟荒芜。可是没关系，人们拥有信仰；但是，人们仅仅拥有信仰，因为可怜的青铜器永远无法战胜三颗太阳。"],
            ["The land lies empty. Yet it does not matter: the people have faith. But faith is all they have, for their pitiful bronze can never defeat three suns."],
            "“哦，妈妈，我真傻。”——弗里德里希·尼采，1889年", "“Mother, I am stupid.” —Friedrich Nietzsche, 1889"),
        ["D"] = new("四海为家", "Space Odyssey",
            ["在无数轮灾难、饥荒、战争之后，我们登上了前往天空的飞船，告别了脚下残酷的故乡；家园垂泪，故国荒芜，我们再不回头。"],
            ["After countless cycles of disaster, famine, and war, we board ships bound for the sky and bid farewell to the cruel homeland beneath us. Home weeps, the old country lies barren, and we never look back."],
            "“在朦胧的月光下，泪水涌出我的眼睛。”——《Take Me Home, Country Roads》，约翰·丹佛，1971年", "“Moonlit mist brings tears to my eyes.” —Take Me Home, Country Roads, John Denver, 1971"),
        ["E"] = new("唯主是依", "In God We Trust",
            ["在无数轮灾难、饥荒、战争之后，我们信仰了前往天国的正道，告别了过去迷惘的时光；土地哭泣，山脉默哀，我们无动于衷。"],
            ["After countless cycles of disaster, famine, and war, we embrace the true path to heaven and leave our lost years behind. The land weeps, the mountains mourn, and we remain unmoved."],
            "“耶和华是我的牧者，我必不至缺乏。”——《诗篇》23:1", "“The Lord is my shepherd; I shall not want.” —Psalm 23:1"),
        ["F"] = new("各执一词", "Agree to Disagree",
            ["对于尚处于黎明的物种，超前的科学就如同巫术一般令人恐惧；我们又怎敢说自己不再蒙昧呢？", "造物主以他的博爱同时创造科学家与祭司；方程与圣歌或许本就是一体两面。", "——来吧，我们要作砖；将土烧透了。"],
            ["To a species still at dawn, advanced science is as frightening as sorcery. How dare we claim that ignorance is behind us?", "In universal love, the Creator made scientist and priest alike; perhaps equation and hymn were always two faces of one truth.", "—Come, let us make bricks, and burn them thoroughly."],
            "“看哪，我们将造一座塔，为要传扬我们的名，使我们免于分散在全地上。”——《创世记》，11:4", "“Come, let us build ourselves a city and a tower, and make a name for ourselves, lest we be dispersed.” —Genesis 11:4"),
        ["G"] = new("如梦方醒", "Brave New World",
            ["城市和未来一同消失在地平线上，一如既往。幸存者拆下机器的零件，重新学习耕种、取水和辨认季节，一如既往。他们终于从进步的长梦中醒来，面对旧世界留下的废墟，一如既往。", "他们称其为新世界。", "一如既往。"],
            ["City and future vanish together beyond the horizon, as always. Survivors strip machines for parts and relearn farming, water, and seasons, as always. They wake at last from the long dream of progress to face the ruins of the old world, as always.", "They call it a new world.", "As always."],
            "“啊，这美丽的新世界，竟有这样的人！”——《暴风雨》，莎士比亚，1611年", "“O brave new world, that has such people in it!” —The Tempest, William Shakespeare, 1611"),
        ["H"] = new("1984", "Big Brother",
            ["科学只要达到这种程度就足够了。我们永远无法征服群星，但我们可以征服草民：不要抬起头，不要看你至高无上的王。", "双加好，双加好，老大哥在看着你。"],
            ["Science has gone far enough. We will never conquer the stars, but we can conquer the masses: do not raise your head; do not look upon your supreme ruler.", "Doubleplusgood, doubleplusgood. Big Brother is watching you."],
            "“他战胜了自己，他热爱老大哥。”——《1984》，乔治·奥威尔，1949年", "“He had won the victory over himself. He loved Big Brother.” —1984, George Orwell, 1949"),
        ["I"] = new("罗马再临", "Do As the Romans Do",
            ["总督与城邦自立为王，对抗中央政府的权威与号令。狼烟四起，大权旁落，秩序荡然无存。战争带来血仇，血仇带来新的战争；为了水源、土地、科技、正信，或者为了更好的明天。", "谈判破裂，大军压境，你我唯有浴血。"],
            ["Governors and city-states crown themselves and defy the authority of the center. Beacons rise, power slips away, and order vanishes. War breeds blood feud, and blood feud breeds new wars—for water, land, technology, true faith, or a better tomorrow.", "Negotiations fail. Armies close in. You and I can only bleed."],
            "“君不见，青海头，古来白骨无人收。”——《兵车行》，杜甫，750年", "“Do you not see, by the shores of Kokonor, the white bones uncollected since ancient times?” —Ballad of the Army Carts, Du Fu, 750"),
        ["J"] = new("永志不忘", "Here's Looking At You",
            ["我们创作小说、诗歌、画作和音乐，等待一场巨大的灾难把它们化作历史。终有一日，凡是尘土的都归于尘土；但在那之前，他们知道我们存在过。", "多谢后世人，戒之慎勿忘。"],
            ["We create novels, poems, paintings, and music, waiting for a great disaster to turn them into history. One day, all that is dust returns to dust; before then, they will know we existed.", "Thank you, people of the future. Take heed, and do not forget."],
            "“把字刻在石头上。”——罗辑，掩体纪元67年", "“Carve the words into stone.” —Luo Ji, Bunker Era 67")
    };

    public static EndingCopy Get(string id) => Endings.TryGetValue(id, out var copy)
        ? copy
        : new EndingCopy($"{id}结局", $"Ending {id}", [], [], "", "");
}
