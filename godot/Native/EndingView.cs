using Godot;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;

namespace CradlesOfCivilization.Native;

/// <summary>
/// Native, read-only presentation of a sealed web-compatible ending archive.
/// All session mutations belong to the host; this view only emits requests.
/// </summary>
public partial class EndingView : Control
{
    public event Action? ReturnRequested;
    public event Action? NewWorldRequested;
    public event Action? ExportRequested;

    private static readonly Color Ink = new("171c19");
    private static readonly Color Panel = new("222922");
    private static readonly Color Parchment = new("e5d8b7");
    private static readonly Color Text = new("bcc5ad");
    private static readonly Color Muted = new("89997c");
    private static readonly Color Bronze = new("b69b63");
    private static readonly Color Border = new("645f414f");
    private static readonly (string Key, string Name, string Code)[] Metrics =
    [
        ("sc", "科学", "SC"), ("be", "神学", "BE"), ("la", "记忆", "LA"),
        ("pop", "人口", "POP"), ("eco", "经济", "ECO"),
        ("stability", "秩序", "ORDER"), ("eerf", "永恒设施", "EERF")
    ];
    private static readonly Dictionary<string, string> Owners = new()
    {
        ["player"] = "本国", ["neutral"] = "中立", ["rival"] = "敌国",
        ["ruins"] = "废墟", ["hostile"] = "敌对", ["defense"] = "防御",
        ["attack"] = "进攻", ["march"] = "行军"
    };
    private JsonObject _view = new();
    private JsonObject _ending = new();
    private VBoxContainer _tabBody = null!;
    private ScrollContainer _scroll = null!;
    private int _tab;
    private int _archivePage;
    private int _expanded = -1;
    private int _samplePage;
    private readonly Dictionary<string, int> _pages = new();

    public void SetView(JsonObject view)
    {
        // Retain the host's immutable projection; never write to this object.
        _view = view;
        _ending = Obj(view["finalEnding"]);
        _tab = _archivePage = _samplePage = 0;
        _expanded = -1;
        _pages.Clear();
        BuildPage();
    }

    public override void _Ready()
    {
        SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        if (GetChildCount() == 0) BuildPage();
    }

    private void BuildPage()
    {
        Clear(this);
        var background = new ColorRect { Color = Ink, MouseFilter = MouseFilterEnum.Ignore };
        background.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        AddChild(background);
        _scroll = new ScrollContainer
        {
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled,
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        _scroll.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        AddChild(_scroll);
        var margin = Margin(40, 26);
        margin.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        _scroll.AddChild(margin);
        var page = Stack(20);
        margin.AddChild(page);

        var top = Row(18);
        top.AddChild(Button("← 返回世界记录", () => ReturnRequested?.Invoke()));
        var brand = Stack(3);
        brand.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        brand.AddChild(Label("CUNABULA CIVILITATIS", 18, Parchment));
        brand.AddChild(Label("THE CIVILIZATION ARCHIVE", 10, Bronze));
        top.AddChild(brand);
        top.AddChild(Label("● RECORD SEALED", 11, Bronze));
        page.AddChild(top);
        page.AddChild(new HSeparator());

        var id = Str(_ending["id"]);
        if (string.IsNullOrEmpty(id))
        {
            page.AddChild(Label("尚未形成结局档案", 30, Parchment));
            page.AddChild(Label("文明的旅程尚未停息。", 16, Text));
            return;
        }
        BuildHero(page, id);
        var actions = Row(14);
        var note = Label("YOUR WORLD, PRESERVED\n这一页保存了文明抵达终局时的记录。", 13, Muted);
        note.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        actions.AddChild(note);
        actions.AddChild(Button("↓ 导出终局存档", () => ExportRequested?.Invoke()));
        actions.AddChild(Button("开启新的世界 ↗", () => NewWorldRequested?.Invoke(), true));
        page.AddChild(actions);
        var tabs = Row(12);
        string[] tabNames = ["01  终局纪要", "02  文明档案", "03  领土军情"];
        for (var index = 0; index < tabNames.Length; index++)
        {
            var selected = index;
            var tabButton = Button(tabNames[index], () => { _tab = selected; RenderTab(); });
            tabButton.ToggleMode = true;
            tabButton.ButtonPressed = index == _tab;
            tabButton.Pressed += () =>
            {
                foreach (var child in tabs.GetChildren())
                    if (child is Godot.Button sibling) sibling.SetPressedNoSignal(sibling == tabButton);
            };
            tabs.AddChild(tabButton);
        }
        page.AddChild(tabs);
        _tabBody = Stack(18);
        page.AddChild(_tabBody);
        RenderTab();
        page.AddChild(new HSeparator());
        page.AddChild(Label("◇ CUNABULA CIVILITATIS · Tech Echo Game Studio\n此档案只读。世界与文明数据均来自封存的终局存档。", 11, Muted));
    }

    private void BuildHero(VBoxContainer page, string id)
    {
        var hero = PanelStack(page, "AN ERA COMES TO ITS CLOSE", "");
        var titles = Row(24);
        var seal = new PanelContainer { CustomMinimumSize = new Vector2(84, 116) };
        seal.AddThemeStyleboxOverride("panel", Style(new Color("303629"), Bronze, 9));
        var sealColumn = Stack(8);
        sealColumn.Alignment = BoxContainer.AlignmentMode.Center;
        var sealLabel = Label(id, 42, Bronze);
        sealLabel.AutowrapMode = TextServer.AutowrapMode.Off;
        sealLabel.HorizontalAlignment = HorizontalAlignment.Center;
        sealColumn.AddChild(sealLabel);
        var sealCaption = Label("FINIS", 10, Bronze);
        sealCaption.AutowrapMode = TextServer.AutowrapMode.Off;
        sealCaption.HorizontalAlignment = HorizontalAlignment.Center;
        sealColumn.AddChild(sealCaption);
        seal.AddChild(sealColumn);
        titles.AddChild(seal);
        var catalog = Obj(_view["endingCatalog"]);
        var copy = Obj(catalog[id]);
        if (copy.Count == 0) copy = Obj(_ending["copy"]);
        if (copy.Count == 0) copy = _ending;
        var title = Str(copy["name"], Str(_ending["name"], id + " 结局"));
        var titleParts = title.Split('/', 2);
        var titleColumn = Stack(6);
        titleColumn.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        var number = id.Length == 1 && id[0] is >= 'A' and <= 'Z' ? (id[0] - 'A' + 1).ToString("00") : id;
        titleColumn.AddChild(Label($"ENDING {number}  ·  第 {Value(_ending["civilization"])} 号文明", 11, Bronze));
        titleColumn.AddChild(Label(titleParts[0], 38, Parchment));
        var englishTitle = Str(copy["nameEn"], titleParts.Length > 1 ? titleParts[1] : "");
        if (englishTitle.Length > 0) titleColumn.AddChild(Label(englishTitle, 21, Bronze));
        titleColumn.AddChild(Label($"{Str(_ending["realmName"], "—")}  ─  第 {Value(_ending["turn"])} 年", 13, Muted));
        titles.AddChild(titleColumn);
        hero.AddChild(titles);
        var paragraphs = Arr(copy["paragraphs"]);
        if (paragraphs.Count == 0) hero.AddChild(Label("此档案没有附带结局正文。", 16, Muted));
        foreach (var paragraph in paragraphs) AddQuotedCopy(hero, Str(paragraph), 17, Text);
        var quote = Str(copy["quote"]);
        if (quote.Length > 0)
        {
            hero.AddChild(new HSeparator());
            AddQuotedCopy(hero, quote, 20, Parchment);
        }
    }

    private void RenderTab()
    {
        Clear(_tabBody);
        switch (_tab)
        {
            case 1: BuildCivilizations(); break;
            case 2: BuildWorld(); break;
            default: BuildSummary(); break;
        }
    }

    private void BuildSummary()
    {
        var metrics = PanelStack(_tabBody, "THE FINAL ACCOUNT", "文明留下的刻度 · 终值 / 全程峰值");
        var current = Obj(_ending["snapshot"]);
        var peak = Obj(_ending["peakSnapshot"]);
        var table = new GridContainer { Columns = 3, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        table.AddThemeConstantOverride("h_separation", 28);
        table.AddThemeConstantOverride("v_separation", 14);
        foreach (var heading in new[] { "指标", "终局数值", "全程峰值" }) table.AddChild(Label(heading, 12, Muted));
        foreach (var metric in Metrics)
        {
            table.AddChild(Label(metric.Name + "  /  " + metric.Code, 15, Text));
            table.AddChild(Label(Value(current[metric.Key]), 22, Parchment));
            table.AddChild(Label(Value(peak[metric.Key]), 19, Bronze));
        }
        metrics.AddChild(table);
        var record = PanelStack(_tabBody, "SEALED IN THE ARCHIVE", "封存记录");
        record.AddChild(Label($"国家  {Str(_ending["realmName"], "—")}       执政官  {Str(_ending["governorLabel"], "—")}\n终局年份  第 {Value(_ending["turn"])} 年       终局文明  第 {Value(_ending["civilization"])} 号\n世界种子  {Str(_ending["seed"], "—")}", 16, Text));
        var trigger = Str(_ending["trigger"]);
        if (trigger.Length > 0) AddQuotedCopy(record, "终局触发  ·  " + trigger, 14, Text);
        var endingStats = Obj(_ending["endingStats"]);
        if (endingStats.Count == 0) endingStats = Obj(_view["endingStats"]);
        var repeats = Obj(endingStats["endings"])[Str(_ending["id"])];
        if (repeats is not null) record.AddChild(Label($"这是此结局第 {Value(repeats)} 次被记录。", 12, Muted));
        var map = Obj(_ending["mapArchive"]);
        var world = PanelStack(_tabBody, "AT THE CLOSE OF AN ERA", "终局时的世界");
        if (map.Count == 0) world.AddChild(Label("此终局没有保存领土数据。", 14, Muted));
        else
        {
            world.AddChild(Label(Str(map["status"], "领土记录已封存"), 14, Text));
            var counts = Obj(map["counts"]);
            world.AddChild(Label($"本国 {Value(counts["player"])}  ·  中立 {Value(counts["neutral"])}  ·  敌国 {Value(counts["rival"])}  ·  废墟 {Value(counts["ruins"])}  省份", 18, Bronze));
        }
        var military = Obj(_ending["military"]);
        if (military.Count > 0) world.AddChild(Label($"本国军力 {Value(military["force"])}  ·  进攻 {Value(military["attack"])}  ·  防守 {Value(military["defense"])}", 15, Text));
        var samples = Arr(_ending["metricArchive"]).OfType<JsonObject>().SelectMany(a => Arr(a["samples"]).OfType<JsonObject>()).ToArray();
        if (samples.Length > 0)
        {
            var trends = PanelStack(_tabBody, "THE LONG VIEW", "全程趋势 · 各指标按自身峰值归一化");
            AddTrend(trends, samples);
        }
    }

    private void BuildCivilizations()
    {
        var archive = Arr(_ending["metricArchive"]).OfType<JsonObject>().ToArray();
        var panel = PanelStack(_tabBody, "THE LIVES BEFORE THIS MOMENT", "历代文明档案");
        panel.AddChild(Label($"已保存 {archive.Length} 代 · 每页至多 12 代。展开一代文明，查看封存的逐年观测。", 13, Muted));
        if (archive.Length == 0) panel.AddChild(Label("此终局没有保存历代观测。", 16, Muted));
        _archivePage = ClampPage(_archivePage, archive.Length, 12);
        for (var index = _archivePage * 12; index < Math.Min(archive.Length, (_archivePage + 1) * 12); index++)
        {
            var recordIndex = index;
            var record = archive[index];
            var samples = Arr(record["samples"]).OfType<JsonObject>().ToArray();
            var civilization = Value(record["civilization"]);
            var cause = Str(record["collapseCause"], Str(record["ending"], Num(record["civilization"]) == Num(_ending["civilization"]) ? "终局文明" : "已封存"));
            var toggle = Button($"{(_expanded == index ? "−" : "+")} 第 {civilization} 号文明  ·  {cause}  ·  存续 {Value(record["turns"])} 年  ·  {samples.Length} 条观测", () =>
            {
                _expanded = _expanded == recordIndex ? -1 : recordIndex;
                _samplePage = 0;
                RenderTab();
            });
            toggle.ClipText = true;
            toggle.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            toggle.TooltipText = cause;
            panel.AddChild(toggle);
            if (_expanded != index) continue;
            var detail = Stack(12);
            panel.AddChild(detail);
            AddQuotedCopy(detail, cause, 14, Text);
            if (samples.Length == 0) { detail.AddChild(Label("这一代没有保存逐年观测。", 14, Muted)); continue; }
            AddTrend(detail, samples);
            var columns = new List<(string, Func<JsonObject, string>)> { ("年份", row => Value(row["turn"])) };
            columns.AddRange(Metrics.Select(m => (m.Name, (Func<JsonObject, string>)(row => Value(row[m.Key])))));
            columns.Add(("记录", row => Str(row["collapse"], Str(row["label"], "—"))));
            _samplePage = ClampPage(_samplePage, samples.Length, 16);
            AddTable(detail, samples.Skip(_samplePage * 16).Take(16), columns.ToArray());
            Pagination(detail, _samplePage, samples.Length, 16, next => { _samplePage = next; RenderTab(); });
        }
        Pagination(panel, _archivePage, archive.Length, 12, next => { _archivePage = next; _expanded = -1; _samplePage = 0; RenderTab(); });
    }

    private void BuildWorld()
    {
        var map = Obj(_ending["mapArchive"]);
        var entities = Arr(map["entities"]).OfType<JsonObject>().ToArray();
        var regions = Arr(map["regions"]).OfType<JsonObject>().ToArray();
        var armies = Arr(map["armies"]).OfType<JsonObject>().ToArray();
        var entityNames = entities.GroupBy(x => Str(x["id"])).ToDictionary(g => g.Key, g => Str(g.First()["name"], g.Key));
        var regionNames = regions.GroupBy(x => Str(x["id"])).ToDictionary(g => g.Key, g => Str(g.First()["name"], g.Key));
        PagedTable("国家档案", "REALMS AT THE FINAL HOUR", entities,
            ("国家", row => Str(row["name"], Str(row["id"]))),
            ("关系", row => Bool(row["eliminated"]) ? "已灭亡" : OwnerName(Str(row["relation"], Str(row["owner"], "—")))),
            ("领土", row => Value(row["territories"])), ("军力", row => Value(row["force"])),
            ("发展", row => Value(row["development"])), ("技术", row => Value(row["technology"])));
        PagedTable("军团名册", "THE ARMIES THAT REMAINED", armies,
            ("军团", row => Str(row["name"], Str(row["id"]))),
            ("所属国家", row => Named(entityNames, row["entityId"])),
            ("驻地", row => Named(regionNames, row["regionId"])),
            ("兵力", row => Value(row["force"])), ("姿态", row => OwnerName(Str(row["posture"], "—"))));
        PagedTable("省份簿册", "THE TERRITORY REGISTER", regions,
            ("省份", row => Str(row["name"], Str(row["id"]))),
            ("控制者", row => Str(row["controllerName"], Named(entityNames, row["controllerId"]))),
            ("归属", row => OwnerName(Str(row["owner"], "—"))), ("工事", row => Value(row["fortification"])));
        var dispatch = Obj(map["lastEvent"]);
        if (dispatch.Count > 0)
        {
            var panel = PanelStack(_tabBody, "THE LAST DISPATCH", Str(dispatch["title"], "最后的军情"));
            AddQuotedCopy(panel, Str(dispatch["text"]), 15, Text);
        }
    }

    private void PagedTable(string title, string eyebrow, JsonObject[] rows, params (string Title, Func<JsonObject, string> Read)[] columns)
    {
        var panel = PanelStack(_tabBody, eyebrow, title);
        panel.AddChild(Label($"共 {rows.Length} 条封存记录 · 每页至多 16 条", 12, Muted));
        if (rows.Length == 0) { panel.AddChild(Label("此终局没有保存记录。", 14, Muted)); return; }
        var page = ClampPage(_pages.GetValueOrDefault(title), rows.Length, 16);
        _pages[title] = page;
        AddTable(panel, rows.Skip(page * 16).Take(16), columns);
        Pagination(panel, page, rows.Length, 16, next => { _pages[title] = next; RenderTab(); });
    }

    private static void AddTable(VBoxContainer parent, IEnumerable<JsonObject> rows, (string Title, Func<JsonObject, string> Read)[] columns)
    {
        var scroller = new ScrollContainer { VerticalScrollMode = ScrollContainer.ScrollMode.Disabled, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        var grid = new GridContainer { Columns = columns.Length, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 20);
        grid.AddThemeConstantOverride("v_separation", 14);
        foreach (var column in columns) grid.AddChild(Label(column.Title, 12, Bronze));
        foreach (var row in rows)
            for (var index = 0; index < columns.Length; index++)
            {
                var cell = Label(columns[index].Read(row), 13, index == 0 ? Parchment : Text);
                cell.CustomMinimumSize = new Vector2(index == 0 ? 130 : 76, 0);
                cell.SizeFlagsHorizontal = SizeFlags.ExpandFill;
                grid.AddChild(cell);
            }
        scroller.AddChild(grid);
        parent.AddChild(scroller);
    }

    private static void AddTrend(VBoxContainer parent, JsonObject[] samples)
    {
        var colors = new[] { new Color("8daab8"), new Color("b79f6a"), new Color("8baf78") };
        string[] keys = ["sc", "be", "pop"];
        parent.AddChild(Label("科学 SC  /  神学 BE  /  人口 POP  ·  按各自峰值归一化；横轴为存档中的观测顺序", 12, Muted));
        // A bounded native draw list: large archives never create a node per observation.
        const int maxPoints = 192;
        var points = Math.Min(maxPoints, samples.Length);
        var series = keys.Select(key =>
        {
            var peak = Math.Max(1, samples.Max(sample => Num(sample[key])));
            return Enumerable.Range(0, points).Select(index =>
            {
                var source = points <= 1 ? 0 : (int)Math.Round((double)index * (samples.Length - 1) / (points - 1));
                return Math.Clamp(Num(samples[source][key]) / peak, 0, 1);
            }).ToArray();
        }).ToArray();
        var chart = new Control { CustomMinimumSize = new Vector2(0, 180), SizeFlagsHorizontal = SizeFlags.ExpandFill, MouseFilter = MouseFilterEnum.Ignore };
        chart.Draw += () =>
        {
            var rect = new Rect2(new Vector2(12, 12), new Vector2(Math.Max(1, chart.Size.X - 24), 156));
            chart.DrawRect(rect, new Color("171f1a"));
            for (var line = 0; line <= 4; line++)
                chart.DrawLine(new Vector2(rect.Position.X, rect.Position.Y + rect.Size.Y * line / 4), new Vector2(rect.End.X, rect.Position.Y + rect.Size.Y * line / 4), Border);
            for (var channel = 0; channel < series.Length; channel++)
            {
                var path = series[channel].Select((number, index) => new Vector2(rect.Position.X + rect.Size.X * index / Math.Max(1, points - 1), rect.End.Y - rect.Size.Y * (float)number)).ToArray();
                if (path.Length == 1) chart.DrawCircle(path[0], 3, colors[channel]);
                else chart.DrawPolyline(path, colors[channel], 2, true);
            }
        };
        chart.Resized += chart.QueueRedraw;
        parent.AddChild(chart);
        chart.QueueRedraw();
    }

    private static void AddQuotedCopy(VBoxContainer parent, string copy, int size, Color color)
    {
        if (string.IsNullOrWhiteSpace(copy)) return;
        // Endings use an explicit closing quotation followed by ——. Narrative
        // dashes (including F's final paragraph) remain untouched.
        var separator = copy.LastIndexOf("——", StringComparison.Ordinal);
        var closing = separator > 0 ? copy[..separator].TrimEnd() : "";
        var attributed = closing.EndsWith('”') || closing.EndsWith('’') || closing.EndsWith('」') || closing.EndsWith('』') || closing.EndsWith('"');
        if (!attributed) { parent.AddChild(Label(copy, size, color)); return; }
        parent.AddChild(Label(copy[..separator].TrimEnd(), size, color));
        parent.AddChild(Label(copy[separator..].Trim(), 12, Muted));
    }

    private static VBoxContainer PanelStack(VBoxContainer parent, string eyebrow, string title)
    {
        var panel = new PanelContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        panel.AddThemeStyleboxOverride("panel", Style(Panel, Border, 24));
        var body = Stack(16);
        panel.AddChild(body);
        body.AddChild(Label(eyebrow, 11, Bronze));
        if (title.Length > 0) body.AddChild(Label(title, 23, Parchment));
        parent.AddChild(panel);
        return body;
    }

    private static void Pagination(VBoxContainer parent, int page, int count, int size, Action<int> changed)
    {
        var pages = Math.Max(1, (int)Math.Ceiling((double)count / size));
        if (pages <= 1) return;
        var rail = Row(16);
        var previous = Button("← 上一页", () => changed(page - 1));
        previous.Disabled = page <= 0;
        var next = Button("下一页 →", () => changed(page + 1));
        next.Disabled = page + 1 >= pages;
        rail.AddChild(previous);
        rail.AddChild(Label($"{page + 1} / {pages}", 14, Bronze));
        rail.AddChild(next);
        parent.AddChild(rail);
    }

    private static Godot.Button Button(string text, Action callback, bool primary = false)
    {
        var button = new Godot.Button { Text = text, CustomMinimumSize = new Vector2(0, 42) };
        button.AddThemeFontSizeOverride("font_size", 14);
        button.AddThemeColorOverride("font_color", primary ? Ink : Parchment);
        button.AddThemeColorOverride("font_hover_color", primary ? Ink : Parchment);
        button.AddThemeColorOverride("font_pressed_color", primary ? Ink : Parchment);
        button.AddThemeStyleboxOverride("normal", Style(primary ? Bronze : Panel, Bronze, 12));
        button.AddThemeStyleboxOverride("hover", Style(primary ? new Color("c3aa72") : new Color("303728"), Bronze, 12));
        button.AddThemeStyleboxOverride("pressed", Style(primary ? Bronze : new Color("383d2b"), Bronze, 12));
        button.AddThemeStyleboxOverride("focus", Style(new Color(0, 0, 0, 0), Parchment, 12));
        button.Pressed += callback;
        return button;
    }

    private static Label Label(string text, int size, Color color)
    {
        var label = new Label { Text = text, AutowrapMode = TextServer.AutowrapMode.WordSmart, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        label.AddThemeFontSizeOverride("font_size", size);
        label.AddThemeColorOverride("font_color", color);
        label.AddThemeConstantOverride("line_spacing", Math.Max(3, size / 3));
        return label;
    }
    private static StyleBoxFlat Style(Color background, Color border, int padding)
    {
        var style = new StyleBoxFlat { BgColor = background, BorderColor = border };
        style.SetBorderWidthAll(1);
        style.ContentMarginLeft = style.ContentMarginRight = padding;
        style.ContentMarginTop = style.ContentMarginBottom = padding;
        return style;
    }
    private static VBoxContainer Stack(int separation)
    {
        var stack = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        stack.AddThemeConstantOverride("separation", separation);
        return stack;
    }
    private static HBoxContainer Row(int separation)
    {
        var row = new HBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        row.AddThemeConstantOverride("separation", separation);
        return row;
    }
    private static MarginContainer Margin(int horizontal, int vertical)
    {
        var margin = new MarginContainer();
        foreach (var side in new[] { "left", "right" }) margin.AddThemeConstantOverride("margin_" + side, horizontal);
        foreach (var side in new[] { "top", "bottom" }) margin.AddThemeConstantOverride("margin_" + side, vertical);
        return margin;
    }
    private static void Clear(Node parent)
    {
        foreach (var child in parent.GetChildren()) { parent.RemoveChild(child); child.QueueFree(); }
    }
    private static JsonObject Obj(JsonNode? node) => node as JsonObject ?? new JsonObject();
    private static JsonArray Arr(JsonNode? node) => node as JsonArray ?? new JsonArray();
    private static string Str(JsonNode? node, string fallback = "") => node is null ? fallback : node.ToString();
    private static bool Bool(JsonNode? node) => node is JsonValue value && value.TryGetValue<bool>(out var boolean) && boolean;
    private static double Num(JsonNode? node) => double.TryParse(Str(node), NumberStyles.Float, CultureInfo.InvariantCulture, out var number) && double.IsFinite(number) ? number : 0;
    private static string Value(JsonNode? node) => node is not null && double.TryParse(Str(node), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value)
        ? value.ToString("N0", CultureInfo.InvariantCulture) : "—";
    private static string OwnerName(string owner) => Owners.GetValueOrDefault(owner, owner);
    private static string Named(Dictionary<string, string> names, JsonNode? id) => names.GetValueOrDefault(Str(id), Str(id, "—"));
    private static int ClampPage(int page, int count, int size) => Math.Clamp(page, 0, Math.Max(0, (count - 1) / size));
}
