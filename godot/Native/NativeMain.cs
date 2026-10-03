using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Godot;

namespace CradlesOfCivilization.Native;

/// <summary>Native desktop presentation of the shared civilization rules.</summary>
public partial class NativeMain : Control
{
    private static readonly (string Id, string Label)[] Navigation =
    [ ("overview", "国度"), ("development", "发展"), ("governance", "治理"),
      ("military", "军务"), ("facilities", "设施"), ("records", "记录") ];
    private static readonly (string Key, string Label)[] Metrics =
    [ ("sc", "科学 · SC"), ("be", "神学 · BE"), ("pop", "人口 · POP"),
      ("eco", "经济 · ECO"), ("la", "记忆 · LA"), ("stability", "秩序"), ("eerfLevel", "EERF") ];
    private static readonly Dictionary<string, string[]> Groups = new()
    {
        ["development"] = ["science", "belief", "population", "balance", "arts", "economy"],
        ["governance"] = ["order", "suppressBelief", "suppressScience", "hibernate", "crownAuthority"],
        ["military"] = ["militaryCampaign", "levyHost", "secureFrontier", "trainLegion", "fieldWorks"],
        ["facilities"] = ["buildEerf", "upgradeEerf", "recovery", "restartCivilization", "settleEnding"],
    };
    private static readonly Dictionary<string, string> Terrain = new()
    {
        ["tundra"] = "冻原", ["coast"] = "海岸", ["mountain"] = "山地", ["basin"] = "盆地",
        ["urban"] = "城邦", ["salt"] = "盐碱地", ["river"] = "河谷", ["plain"] = "平原",
        ["waste"] = "荒原", ["canyon"] = "峡谷",
    };

    private GameSession _session = null!;
    public GameSession Session => _session;
    public StrategicMap Map => _map;
    private JsonObject View => _session.View;
    private string _active = "overview";
    private string _selectedAction = "science";
    private int _observation = -1;
    private bool _endingDismissed;
    private bool _refreshing;
    private bool _relief = true;
    private string _recordTab = "log";
    private string _recordFilter = "all";
    private int _recordPage;
    private VBoxContainer _shell = null!;
    private Label _realm = null!;
    private Label _year = null!;
    private Label _yearDetail = null!;
    private Label _caption = null!;
    private Label _observationLabel = null!;
    private Label _notice = null!;
    private Button _annual = null!;
    private Button _currentObservation = null!;
    private Button _projectionButton = null!;
    private Button _labelsButton = null!;
    private readonly Dictionary<string, Label> _metricLabels = new();
    private readonly Dictionary<string, Button> _navButtons = new();
    private readonly Dictionary<string, Texture2D> _portraits = new();
    private StrategicMap _map = null!;
    private VBoxContainer _sidebar = null!;
    private ScrollContainer _sidebarScroll = null!;
    private HBoxContainer _events = null!;
    private VBoxContainer _mapMessage = null!;
    private NativeTrendChart _chart = null!;
    private HSlider _historySlider = null!;
    private EndingView _ending = null!;
    private Control? _overlay;
    private bool _modalClosable = true;
    private Godot.Timer _autoTimer = null!;
    private Godot.Timer _noticeTimer = null!;
    private FileDialog _fileDialog = null!;

    public override void _Ready()
    {
        if (OS.GetCmdlineUserArgs().Contains("--verify-native"))
        {
            GetTree().Quit(NativeVerifier.Run());
            return;
        }
        Theme = NativeTheme.Create();
        SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        if (!IsNativeSmoke) LoadDisplayPreference();
        _session = new GameSession(persistent: !IsNativeSmoke);
        BuildShell();
        Refresh();
        StartNativeSmokeIfRequested();
    }

    public override void _ExitTree()
    {
        _session?.SavePersistent();
        _session?.Dispose();
    }

    private void BuildShell()
    {
        var background = new ColorRect { Color = NativeTheme.Background, MouseFilter = MouseFilterEnum.Ignore };
        AddChild(background);
        background.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        _shell = V(0);
        _shell.Name = "CivilizationShell";
        AddChild(_shell);
        _shell.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        BuildTopbar();
        var workspace = H(0);
        workspace.SizeFlagsVertical = SizeFlags.ExpandFill;
        _shell.AddChild(workspace);
        var navPanel = Panel(NativeTheme.Background);
        navPanel.CustomMinimumSize = new Vector2(82, 0);
        workspace.AddChild(navPanel);
        var nav = V(8);
        navPanel.AddChild(nav);
        foreach (var (id, text) in Navigation)
        {
            var captured = id;
            var button = B(text, () => Navigate(captured));
            button.Name = "Navigate_" + id;
            button.CustomMinimumSize = new Vector2(0, 52);
            button.ToggleMode = true;
            nav.AddChild(button);
            _navButtons[id] = button;
        }
        nav.AddChild(new Control { SizeFlagsVertical = SizeFlags.ExpandFill });
        nav.AddChild(B("帮助", ShowHelp));
        var stageMargin = new MarginContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        stageMargin.AddThemeConstantOverride("margin_left", 14);
        stageMargin.AddThemeConstantOverride("margin_right", 14);
        workspace.AddChild(stageMargin);
        var stage = V(10);
        stageMargin.AddChild(stage);
        var mapHeader = H(8);
        var mapTitle = V(2);
        mapTitle.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        mapTitle.AddChild(Kicker("THE THREE SUNS"));
        _realm = L("", 21);
        mapTitle.AddChild(_realm);
        mapHeader.AddChild(mapTitle);
        var layerGroup = new ButtonGroup();
        foreach (var (id, text) in new[] { ("political", "政治"), ("terrain", "地形"), ("military", "军事") })
        {
            var captured = id;
            var button = B(text, () => { _map.Layer = captured; });
            button.Name = "Layer_" + id;
            button.TooltipText = "切换地图图层";
            button.ToggleMode = true;
            button.ButtonGroup = layerGroup;
            button.ButtonPressed = id == "political";
            mapHeader.AddChild(button);
        }
        _projectionButton = B(_relief ? "立体" : "平面", ToggleProjection);
        _projectionButton.Name = "ProjectionToggle";
        _projectionButton.ToggleMode = true;
        _projectionButton.ButtonPressed = _relief;
        mapHeader.AddChild(_projectionButton);
        _labelsButton = B("省名", () => { _map.ShowLabels = !_map.ShowLabels; _labelsButton.ButtonPressed = _map.ShowLabels; });
        _labelsButton.ToggleMode = true;
        _labelsButton.ButtonPressed = true;
        mapHeader.AddChild(_labelsButton);
        stage.AddChild(mapHeader);
        var mapPanel = Panel(NativeTheme.Background, 0);
        mapPanel.SizeFlagsVertical = SizeFlags.ExpandFill;
        stage.AddChild(mapPanel);
        var mapStack = V(0);
        mapPanel.AddChild(mapStack);
        _map = new StrategicMap { Name = "StrategicMap", Relief = _relief, ShowLabels = true, SizeFlagsVertical = SizeFlags.ExpandFill, CustomMinimumSize = new Vector2(380, 220) };
        _map.ProvinceSelected += SelectProvince;
        _map.ArmySelected += id => { _active = "military"; Invoke("selectArmy", id); };
        mapStack.AddChild(_map);
        var mapTools = H(5);
        _caption = L("", 11, NativeTheme.Muted);
        _caption.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        mapTools.AddChild(_caption);
        mapTools.AddChild(B("−", () => _map.Zoom(.83f)));
        mapTools.AddChild(B("+", () => _map.Zoom(1.2f)));
        mapTools.AddChild(B("全图", () => _map.ResetView()));
        mapTools.AddChild(B("定位", () => _map.FocusSelected()));
        mapStack.AddChild(mapTools);
        _mapMessage = V(6);
        mapStack.AddChild(_mapMessage);
        var eventHeader = H(8);
        var chronicleKicker = Kicker("CHRONICLE · 最新编年");
        chronicleKicker.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        eventHeader.AddChild(chronicleKicker);
        eventHeader.AddChild(B("查看全部 →", () => ShowRecords()));
        stage.AddChild(eventHeader);
        _events = H(8);
        _events.CustomMinimumSize = new Vector2(0, 118);
        stage.AddChild(_events);
        var sidebarPanel = Panel(NativeTheme.Panel, 12);
        sidebarPanel.CustomMinimumSize = new Vector2(322, 0);
        workspace.AddChild(sidebarPanel);
        _sidebarScroll = new ScrollContainer { HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled, SizeFlagsVertical = SizeFlags.ExpandFill };
        sidebarPanel.AddChild(_sidebarScroll);
        _sidebar = V(10);
        _sidebar.Name = "CivilizationDetails";
        _sidebar.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        _sidebar.CustomMinimumSize = new Vector2(286, 0);
        _sidebarScroll.AddChild(_sidebar);
        BuildTimeline();
        _notice = L("", 14, NativeTheme.Gold);
        _notice.Visible = false;
        _shell.AddChild(_notice);
        _ending = new EndingView { Name = "EndingArchive", Visible = false };
        AddChild(_ending);
        _ending.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        _ending.ReturnRequested += () => { _endingDismissed = true; Refresh(); };
        _ending.NewWorldRequested += () => ShowSetup(true);
        _ending.ExportRequested += ShowExport;
        _autoTimer = new Godot.Timer { WaitTime = .5, OneShot = false };
        AddChild(_autoTimer);
        _autoTimer.Timeout += () =>
        {
            if (!DisplayServer.WindowIsFocused()) return;
            if (!N.Bool(View, "autoRunUntilCollapse") || N.Bool(View, "finished") || N.Bool(View, "awaitingCivilizationRestart")) { _autoTimer.Stop(); return; }
            Invoke("tickAutoRun");
        };
        _noticeTimer = new Godot.Timer { WaitTime = 6.5, OneShot = true };
        AddChild(_noticeTimer);
        _noticeTimer.Timeout += () => { _notice.Visible = false; };
        _fileDialog = new FileDialog { Name = "SaveFileDialog", Access = FileDialog.AccessEnum.Filesystem, Filters = new[] { "*.json ; 文明存档 JSON" } };
        AddChild(_fileDialog);
        _fileDialog.FileSelected += HandleSaveFile;
    }

    private void BuildTopbar()
    {
        var panel = Panel(NativeTheme.Panel, 12);
        panel.Name = "Topbar";
        _shell.AddChild(panel);
        var row = H(14);
        panel.AddChild(row);
        var title = V(1);
        title.CustomMinimumSize = new Vector2(183, 0);
        title.AddChild(NoWrap(L("CUNABULA", 23, NativeTheme.Ink)));
        title.AddChild(NoWrap(L("C I V I L I T A T I S", 11, NativeTheme.Gold)));
        row.AddChild(title);
        foreach (var (key, text) in Metrics)
        {
            var captured = key;
            var button = B("", () => { if (captured == "eerfLevel") Navigate("facilities"); else ShowMetrics(); });
            button.Name = "Metric_" + key;
            button.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            var values = V(1);
            values.MouseFilter = MouseFilterEnum.Ignore;
            button.AddChild(values);
            values.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
            values.OffsetLeft = 6; values.OffsetRight = -6;
            values.AddChild(NoWrap(L(text, 10, NativeTheme.Muted, HorizontalAlignment.Center)));
            var value = NoWrap(L("", 20, key == "sc" ? NativeTheme.Science : NativeTheme.Gold, HorizontalAlignment.Center));
            value.Name = "Value_" + key;
            values.AddChild(value);
            _metricLabels[key] = value;
            button.CustomMinimumSize = new Vector2(80, 54);
            row.AddChild(button);
        }
        var save = V(2);
        save.CustomMinimumSize = new Vector2(102, 0);
        save.SizeFlagsVertical = SizeFlags.ShrinkCenter;
        save.AddChild(NoWrap(L("TECH ECHO", 11, NativeTheme.Gold)));
        save.AddChild(NoWrap(L("● 本机自动存档", 10, NativeTheme.Muted)));
        row.AddChild(save);
        var world = B("☷", ShowWorld);
        world.Name = "WorldAndSave";
        world.TooltipText = "世界与存档";
        row.AddChild(world);
    }

    private void BuildTimeline()
    {
        var panel = Panel(NativeTheme.Panel, 12);
        panel.Name = "Timeline";
        panel.CustomMinimumSize = new Vector2(0, 116);
        _shell.AddChild(panel);
        var row = H(18);
        panel.AddChild(row);
        var yearBox = V(2);
        yearBox.CustomMinimumSize = new Vector2(250, 0);
        yearBox.AddChild(Kicker("YEAR OF THE CIVILIZATION"));
        _year = NoWrap(L("", 26));
        _year.Name = "CurrentYear";
        yearBox.AddChild(_year);
        _yearDetail = NoWrap(L("", 11, NativeTheme.Muted));
        yearBox.AddChild(_yearDetail);
        row.AddChild(yearBox);
        var timeline = V(1);
        timeline.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        var legend = H(8);
        legend.AddChild(NoWrap(L("科学 ─", 11, NativeTheme.Science)));
        legend.AddChild(NoWrap(L("神学 ─", 11, NativeTheme.Gold)));
        _observationLabel = NoWrap(L("当前观测", 11, NativeTheme.Muted));
        _observationLabel.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        legend.AddChild(_observationLabel);
        _currentObservation = B("回到当前", () => { _observation = -1; Refresh(); });
        _currentObservation.CustomMinimumSize = new Vector2(86, 28);
        legend.AddChild(_currentObservation);
        timeline.AddChild(legend);
        _chart = new NativeTrendChart { CustomMinimumSize = new Vector2(0, 40), SizeFlagsHorizontal = SizeFlags.ExpandFill, MouseFilter = MouseFilterEnum.Ignore };
        timeline.AddChild(_chart);
        _historySlider = new HSlider { MinValue = 0, Step = 1, CustomMinimumSize = new Vector2(0, 12), Name = "HistoryObservation" };
        _historySlider.ValueChanged += value =>
        {
            if (_refreshing) return;
            var last = Math.Max(0, (N.Arr(View, "metricSamples")?.Count ?? 0) - 1);
            _observation = (int)value >= last ? -1 : (int)value;
            Refresh();
        };
        timeline.AddChild(_historySlider);
        row.AddChild(timeline);
        var actions = V(2);
        actions.CustomMinimumSize = new Vector2(215, 0);
        _annual = B("下达年度决议 →", () =>
        {
            if (HasFinal) OpenEnding();
            else if (Historical) ShowMetrics(true);
            else Navigate(N.Bool(View, "awaitingCivilizationRestart") || N.Obj(View, "endingCandidate") != null ? "facilities" : "development");
        });
        _annual.Name = "AnnualDecision";
        actions.AddChild(_annual);
        actions.AddChild(NoWrap(L("决议推进时间 · 每次一年", 11, NativeTheme.Muted)));
        row.AddChild(actions);
    }

    private bool HasFinal => N.Obj(View, "finalEnding") != null;
    private bool IsNativeSmoke => OS.GetCmdlineUserArgs().Any(arg => arg.StartsWith("--native-smoke=", StringComparison.Ordinal));
    private bool Founding => !N.Bool(View, "setupComplete") && N.Str(View, "setupStage") == "territory";
    private bool Settings => !N.Bool(View, "setupComplete") && N.Str(View, "setupStage") == "settings" && !N.Bool(View, "finished");
    private bool Historical => _observation >= 0 && _observation < Math.Max(0, (N.Arr(View, "metricSamples")?.Count ?? 0) - 1);
    private IEnumerable<JsonObject> Objects(JsonArray? array) => N.Items(array).OfType<JsonObject>();
    private JsonObject? Find(JsonArray? array, string id) => Objects(array).FirstOrDefault(item => N.Str(item, "id") == id);
    private JsonObject? Province => Find(N.Arr(N.Obj(View, "geometry"), "provinces"), N.Str(View, "selectedRegionId"));
    private JsonObject? Region => N.Obj(View, "selectedRegion") ?? Find(N.Arr(View, "regions"), N.Str(View, "selectedRegionId"));
    private string ProvinceName => N.Str(Province, "nameZh", N.Str(Province, "name", N.Str(View, "selectedRegionId")));
    private static string F(double number) => number.ToString("N0", CultureInfo.InvariantCulture);
    private static string Compact(double number) => Math.Abs(number) >= 1000000 ? (number / 1000000).ToString("0.#", CultureInfo.InvariantCulture) + "M" : Math.Abs(number) >= 1000 ? (number / 1000).ToString("0.#", CultureInfo.InvariantCulture) + "K" : F(number);

    public void Refresh()
    {
        if (_session == null || _refreshing) return;
        _refreshing = true;
        try
        {
            foreach (var (key, _) in Metrics) _metricLabels[key].Text = key == "eerfLevel" ? F(N.Num(View, key)) + "/5" : Compact(N.Num(View, key));
            _realm.Text = N.Str(View, "realmName", "尚未命名的世界") + "  ·  第 " + F(N.Num(View, "count", 1)) + " 号文明";
            _map.SetView(View);
            _caption.Text = "SEED " + F(N.Num(View, "seed")).Replace(",", "") + "  ·  " + (N.Arr(N.Obj(View, "geometry"), "provinces")?.Count ?? 0) + " 省份 · " + (N.Arr(View, "entities")?.Count ?? 0) + " 势力";
            foreach (var (id, button) in _navButtons) button.ButtonPressed = id == _active;
            BuildSidebar();
            BuildEvents();
            BuildMapMessage();
            RefreshTimeline();
            var showEnding = HasFinal && !_endingDismissed;
            _shell.Visible = !showEnding;
            _ending.Visible = showEnding;
            if (showEnding) _ending.SetView(View);
            if (N.Bool(View, "autoRunUntilCollapse") && !N.Bool(View, "finished") && !N.Bool(View, "awaitingCivilizationRestart"))
            {
                if (_autoTimer.IsStopped()) _autoTimer.Start();
            }
            else _autoTimer.Stop();
        }
        finally { _refreshing = false; }
        if (Settings && _overlay == null) ShowSetup(false);
    }

    public JsonObject GetLayoutDiagnostics()
    {
        var topbar = (Control)_shell.FindChild("Topbar", false, false);
        var timeline = (Control)_shell.FindChild("Timeline", false, false);
        var wideChildren = new JsonArray();
        foreach (var child in _sidebar.GetChildren().OfType<Control>().Where(child => child.GetCombinedMinimumSize().X > 290))
        {
            wideChildren.Add(new JsonObject { ["type"] = child.GetType().Name, ["name"] = child.Name.ToString(), ["minimumWidth"] = child.GetCombinedMinimumSize().X, ["text"] = child is Button button ? button.Text : child is Label label ? label.Text : "" });
        }
        return new JsonObject
        {
            ["viewportWidth"] = Size.X, ["viewportHeight"] = Size.Y,
            ["topbarHeight"] = topbar.Size.Y, ["mapWidth"] = _map.Size.X, ["mapHeight"] = _map.Size.Y,
            ["timelineHeight"] = timeline.Size.Y, ["timelineBottom"] = timeline.GetGlobalRect().End.Y,
            ["sidebarWidth"] = _sidebar.Size.X, ["sidebarMinimumWidth"] = _sidebar.GetCombinedMinimumSize().X,
            ["wideSidebarChildren"] = wideChildren,
        };
    }

    private void RefreshTimeline()
    {
        var samples = N.Arr(View, "metricSamples");
        var last = Math.Max(0, (samples?.Count ?? 0) - 1);
        var index = _observation < 0 ? last : Math.Min(_observation, last);
        var sample = samples?.ElementAtOrDefault(index) as JsonObject;
        _year.Text = "第 " + F(N.Num(View, "turn")) + " 年";
        _yearDetail.Text = "第 " + F(N.Num(View, "count", 1)) + " 号文明 · " + (N.Bool(View, "autoRunUntilCollapse") ? "文明分裂，时间自动推进" : N.Bool(View, "finished") ? "终局已达成" : "决议推动时间");
        _historySlider.MaxValue = last;
        _historySlider.SetValueNoSignal(index);
        _chart.SetSamples(samples, index);
        _observationLabel.Text = Historical ? "观测第 " + F(N.Num(sample, "civilization")) + " 号 · " + F(N.Num(sample, "turn")) + " 年" : "当前观测";
        _currentObservation.Disabled = !Historical;
        _annual.Text = HasFinal ? "查看结局档案 →" : Historical ? "查看这次观测 →" : N.Obj(View, "endingCandidate") != null ? "前往结算 →" : N.Bool(View, "awaitingCivilizationRestart") ? "查看火种 →" : "下达年度决议 →";
        _annual.Disabled = !HasFinal && !Historical && !N.Bool(View, "setupComplete");
    }

    private void BuildMapMessage()
    {
        Clear(_mapMessage);
        _mapMessage.Visible = Founding || (View["mapUiExpanded"] != null && !N.Bool(View, "mapUiExpanded"));
        if (Founding)
        {
            var row = H(8);
            var text = V(2);
            text.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            text.AddChild(L("选择文明的发源地", 18, NativeTheme.Gold));
            text.AddChild(L("点击一块省份，再确认建立文明。", 12, NativeTheme.Muted));
            row.AddChild(text);
            row.AddChild(B("返回设定", () => Invoke("returnToSettings")));
            var found = B("在 " + ProvinceName + " 建立文明", () => Invoke("completeSetup"), true);
            found.Name = "CompleteSetup";
            row.AddChild(found);
            _mapMessage.AddChild(row);
        }
        else if (_mapMessage.Visible)
        {
            var row = H(8);
            row.AddChild(L("数值文明模式 · 战争与征服暂停", 12, NativeTheme.Muted));
            row.AddChild(B("启用领土玩法", () => Invoke("setMapExpanded", true)));
            _mapMessage.AddChild(row);
        }
    }

    private void BuildEvents()
    {
        Clear(_events);
        foreach (var entry in Objects(N.Arr(View, "log")).Take(2))
        {
            var captured = entry;
            var button = B("", () => ShowEvent(captured));
            button.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            var contents = V(4);
            contents.MouseFilter = MouseFilterEnum.Ignore;
            button.AddChild(contents);
            contents.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
            contents.OffsetLeft = 10; contents.OffsetRight = -10; contents.OffsetTop = 8; contents.OffsetBottom = -8;
            contents.AddChild(L(N.Str(entry, "title"), 15, N.Str(entry, "type") is "disaster" or "collapse" ? NativeTheme.Danger : NativeTheme.Ink));
            var preview = L(N.Str(entry, "text"), 12, NativeTheme.Muted);
            preview.MaxLinesVisible = 2;
            preview.TextOverrunBehavior = TextServer.OverrunBehavior.TrimEllipsis;
            contents.AddChild(preview);
            contents.AddChild(L(Delta(N.Obj(entry, "delta")), 10, NativeTheme.Gold));
            _events.AddChild(button);
        }
        if (_events.GetChildCount() == 0) _events.AddChild(L("文明的第一份编年，等待你的决议。", 13, NativeTheme.Muted));
    }

    private void BuildSidebar()
    {
        var scroll = _sidebarScroll.ScrollVertical;
        Clear(_sidebar);
        _sidebar.AddChild(Kicker("CIVILIZATION " + F(N.Num(View, "count", 1))));
        _sidebar.AddChild(L(N.Str(View, "realmName", "文明摇篮"), 24));
        _sidebar.AddChild(L(N.Str(View, "weather", "文明仍在演化"), 12, NativeTheme.Muted));
        var tabs = H(6);
        tabs.AddChild(B("国度详情", () => Navigate("overview")));
        tabs.AddChild(B("文明决议", () => Navigate("development")));
        _sidebar.AddChild(tabs);
        _sidebar.AddChild(new HSeparator());
        _sidebar.AddChild(L(Founding ? "选择文明发源地" : "选择省份", 12, NativeTheme.Muted));
        var provinces = Objects(N.Arr(N.Obj(View, "geometry"), "provinces")).ToArray();
        var provinceChoice = Choice(provinces, N.Str(View, "selectedRegionId"), item => N.Str(item, "nameZh", N.Str(item, "name")), SelectProvince);
        provinceChoice.Name = "ProvinceSelect";
        _sidebar.AddChild(provinceChoice);
        if (HasFinal)
        {
            _sidebar.AddChild(L("终局 · " + N.Str(N.Obj(View, "finalEnding"), "name"), 17, NativeTheme.Gold));
            _sidebar.AddChild(B("打开结局档案", OpenEnding, true));
        }
        if (N.Obj(View, "specialNotice") is { } special)
        {
            _sidebar.AddChild(Clip(B("SPECIAL · " + N.Str(special, "title"), () => ShowEvent(special))));
        }
        if (N.Bool(View, "awaitingCivilizationRestart"))
        {
            _sidebar.AddChild(L("文明已毁灭，火种仍在", 17, NativeTheme.Danger));
            var pending = N.Obj(View, "pendingRestart");
            _sidebar.AddChild(L("下一代人口 " + F(N.Num(pending, "pop")) + " · SC " + F(N.Num(pending, "sc")) + " · BE " + F(N.Num(pending, "be")), 12));
            var restart = B("重启文明", () => Execute("restartCivilization"), true);
            restart.Disabled = Historical || !string.IsNullOrEmpty(N.Str(Find(N.Arr(View, "actions"), "restartCivilization"), "disabledReason"));
            _sidebar.AddChild(restart);
        }
        if (N.Bool(View, "economicCrisis"))
        {
            _sidebar.AddChild(L("经济危机 · 发展冻结", 16, NativeTheme.Danger));
            _sidebar.AddChild(B("前往设施恢复财政", () => { _selectedAction = "recovery"; _active = "facilities"; Refresh(); }));
        }
        if (_active == "overview") BuildOverview();
        else
        {
            if (_active == "military") BuildMilitary();
            if (_active == "facilities") BuildFacilities();
            BuildDecisions();
        }
        _sidebarScroll.SetDeferred("scroll_vertical", scroll);
    }

    private void BuildOverview()
    {
        _sidebar.AddChild(Kicker("PROVINCE · 选中省份"));
        _sidebar.AddChild(L(ProvinceName, 19));
        var terrain = N.Str(Province, "terrain");
        var entity = Find(N.Arr(View, "entities"), N.Str(Region, "controllerId"));
        _sidebar.AddChild(L((Terrain.GetValueOrDefault(terrain) ?? terrain) + " · " + N.Str(entity, "name", "文明废墟"), 12, NativeTheme.Muted));
        AddPair(_sidebar, "防御工事", F(N.Num(Region, "fortification")));
        AddPair(_sidebar, "补给", F(N.Num(Region, "supply", N.Num(N.Obj(Province, "base"), "supply"))));
        AddPair(_sidebar, "发展", F(N.Num(Region, "development", N.Num(N.Obj(Province, "base"), "development"))));
        AddPair(_sidebar, "相邻省份", F(N.Arr(Region, "neighbors")?.Count ?? 0));
        _sidebar.AddChild(B("查看军队与部署 →", () => Navigate("military")));
        _sidebar.AddChild(new HSeparator());
        _sidebar.AddChild(Kicker("REALMS · 五方势力"));
        foreach (var item in Objects(N.Arr(View, "entities")))
        {
            var id = N.Str(item, "id");
            var button = Clip(B(N.Str(item, "name") + "   " + (N.Bool(item, "eliminated") ? "灭亡" : F(N.Num(item, "territories")) + " 省"), () => Invoke("selectEntity", id)));
            button.ToggleMode = true;
            button.ButtonPressed = id == N.Str(View, "selectedEntityId");
            button.AddThemeColorOverride("font_color", new Color(N.Str(item, "color", "#baa77d")));
            _sidebar.AddChild(button);
        }
        var selected = N.Obj(View, "selectedEntity") ?? Find(N.Arr(View, "entities"), N.Str(View, "selectedEntityId"));
        if (selected != null)
        {
            _sidebar.AddChild(L(N.Str(selected, "name"), 16));
            _sidebar.AddChild(L("发展 " + F(N.Num(selected, "development")) + " · 技术 " + F(N.Num(selected, "technology")) + " · 军力 " + (selected["force"] == null ? "未知" : F(N.Num(selected, "force"))), 12, NativeTheme.Muted));
            _sidebar.AddChild(L("国家战略", 12, NativeTheme.Muted));
            var strategy = Choice(Objects(N.Arr(N.Obj(View, "configs"), "strategies")).ToArray(), N.Str(selected, "strategy", "balanced"), item => N.Str(item, "label"), id => Invoke("setStrategy", id));
            strategy.Disabled = Historical || N.Str(selected, "id") != "player-realm" || !N.Bool(View, "setupComplete") || N.Bool(View, "finished") || N.Bool(View, "awaitingCivilizationRestart") || !N.Bool(View, "mapUiExpanded", true) || N.Bool(selected, "eliminated");
            _sidebar.AddChild(strategy);
            _sidebar.AddChild(L(N.Str(selected, "strategyDescription"), 12, NativeTheme.Muted));
        }
        _sidebar.AddChild(new HSeparator());
        var governor = Find(N.Arr(N.Obj(View, "configs"), "governors"), N.Str(View, "governorId"));
        var row = H(10);
        var portrait = Portrait(N.Str(View, "governorId"), new Vector2(66, 82));
        row.AddChild(portrait);
        var info = V(2);
        info.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        info.AddChild(Kicker("GOVERNOR"));
        info.AddChild(L(N.Str(governor, "label"), 15));
        info.AddChild(L(N.Str(governor, "skill"), 11, NativeTheme.Muted));
        row.AddChild(info);
        _sidebar.AddChild(row);
    }

    private void BuildMilitary()
    {
        _sidebar.AddChild(Kicker("LEGIONS · 可见军队"));
        foreach (var item in Objects(N.Arr(View, "visibleArmies")))
        {
            var id = N.Str(item, "id");
            var button = Clip(B(N.Str(item, "name") + "   " + F(N.Num(item, "force")), () => Invoke("selectArmy", id)));
            button.ToggleMode = true; button.ButtonPressed = id == N.Str(View, "selectedArmyId");
            _sidebar.AddChild(button);
        }
        var army = N.Obj(View, "selectedArmy") ?? Find(N.Arr(View, "visibleArmies"), N.Str(View, "selectedArmyId"));
        if (army != null)
        {
            var stationed = Find(N.Arr(N.Obj(View, "geometry"), "provinces"), N.Str(army, "regionId"));
            _sidebar.AddChild(L(N.Str(army, "name") + " · 驻 " + N.Str(stationed, "nameZh", N.Str(army, "regionId")), 14));
            var stats = N.Obj(army, "stats");
            _sidebar.AddChild(L("攻击 " + F(N.Num(army, "attack", N.Num(stats, "attack"))) + " · 防御 " + F(N.Num(army, "defense", N.Num(stats, "defense"))) + " · 军力 " + F(N.Num(army, "force")), 12, NativeTheme.Muted));
            var deploy = B("部署至 " + ProvinceName, () => Invoke("deployArmy", N.Str(View, "selectedRegionId")), true);
            deploy.Name = "DeployArmy";
            deploy.Disabled = Historical || !string.IsNullOrEmpty(N.Str(View, "deploymentReason")) || N.Str(army, "entityId") != "player-realm" || N.Num(army, "lastMovedTurn", -1) >= N.Num(View, "turn") || !N.Bool(View, "setupComplete") || N.Bool(View, "finished") || N.Bool(View, "awaitingCivilizationRestart") || !N.Bool(View, "mapUiExpanded", true);
            _sidebar.AddChild(deploy);
            var reason = N.Str(View, "deploymentReason");
            _sidebar.AddChild(L(reason.Length == 0 ? "沿相邻道路移动，每支军队每年部署一次。" : reason, 12, NativeTheme.Muted));
        }
        else _sidebar.AddChild(L("军情处于迷雾中。", 12, NativeTheme.Muted));
        _sidebar.AddChild(new HSeparator());
    }

    private void BuildFacilities()
    {
        _sidebar.AddChild(Kicker("THE EMBER · 抵抗设施"));
        _sidebar.AddChild(L("EERF · " + F(N.Num(View, "eerfLevel")) + " / 5", 20, NativeTheme.Gold));
        foreach (var node in N.Items(N.Arr(View, "eerfDetails")))
        {
            if (node is JsonArray pair && pair.Count >= 2) AddPair(_sidebar, pair[0]?.ToString() ?? "", pair[1]?.ToString() ?? "");
        }
        _sidebar.AddChild(new ProgressBar { MinValue = 0, MaxValue = 5, Value = N.Num(View, "eerfLevel"), ShowPercentage = false, CustomMinimumSize = new Vector2(0, 8) });
        _sidebar.AddChild(new HSeparator());
    }

    private void BuildDecisions()
    {
        var group = Groups.GetValueOrDefault(_active) ?? Groups["development"];
        _sidebar.AddChild(Kicker("DECISIONS · " + (Navigation.FirstOrDefault(nav => nav.Id == _active).Label ?? "发展")));
        var actions = Objects(N.Arr(View, "actions")).Where(item => group.Contains(N.Str(item, "id"))).ToArray();
        foreach (var item in actions)
        {
            var id = N.Str(item, "id");
            var reason = N.Str(item, "disabledReason");
            var shortcut = N.Str(item, "shortcut");
            var button = B(N.Str(item, "label") + (shortcut == "" ? "" : "   [" + shortcut + "]"), () => { _selectedAction = id; Refresh(); });
            button.Name = "Decision_" + id;
            button.ToggleMode = true; button.ButtonPressed = id == _selectedAction;
            button.TooltipText = reason == "" ? "可执行 · 推进一年" : reason;
            _sidebar.AddChild(button);
        }
        var action = Find(N.Arr(View, "actions"), _selectedAction) ?? actions.FirstOrDefault();
        if (action == null) return;
        _sidebar.AddChild(new HSeparator());
        _sidebar.AddChild(L(N.Str(action, "label"), 19));
        _sidebar.AddChild(L(N.Str(action, "chronicleText"), 13));
        AddQuotedCopy(_sidebar, N.Str(action, "text"), true);
        _sidebar.AddChild(L(Delta(N.Obj(action, "delta")), 12, NativeTheme.Gold));
        _sidebar.AddChild(L("决议效果仅为行动本身；年度漂移、事件、灾变与战事另行结算。", 11, NativeTheme.Muted));
        var selectedId = N.Str(action, "id");
        var execute = B(selectedId == "restartCivilization" ? "重启文明" : selectedId == "settleEnding" ? "结算终局" : "执行决议 · 推进一年 →", () => Execute(selectedId), true);
        execute.Name = "ExecuteDecision";
        execute.Disabled = Historical || !string.IsNullOrEmpty(N.Str(action, "disabledReason"));
        _sidebar.AddChild(execute);
        if (Historical) _sidebar.AddChild(L("历史观测期间决议暂停，请回到当前。", 12, NativeTheme.Muted));
        else if (N.Str(action, "disabledReason") != "") _sidebar.AddChild(L(N.Str(action, "disabledReason"), 12, NativeTheme.Danger));
    }

    private void Navigate(string id)
    {
        if (id == "records") { ShowRecords(); return; }
        _active = id;
        if (Groups.TryGetValue(id, out var actions)) _selectedAction = actions[0];
        _sidebarScroll.ScrollVertical = 0;
        Refresh();
    }

    private void SelectProvince(string id) => Invoke(Founding ? "selectStartingRegion" : "selectProvince", id);
    private void Execute(string id)
    {
        if (Historical || _overlay != null || _fileDialog.Visible) return;
        Invoke("executeAction", id);
    }

    private JsonObject Invoke(string method, params object?[] args)
    {
        try
        {
            var result = _session.Call(method, args);
            if (result["ok"] != null && !N.Bool(result, "ok")) Notice(N.Str(result, "reason", "现在无法执行这项命令。"));
            else { _notice.Visible = false; }
            Refresh();
            return result;
        }
        catch (Exception error)
        {
            GD.PushError(error.ToString());
            Notice(error.Message);
            return new JsonObject { ["ok"] = false, ["reason"] = error.Message };
        }
    }

    private void Notice(string text)
    {
        _notice.Text = "  " + text;
        _notice.Visible = true;
        _noticeTimer.Start();
    }

    private void OpenEnding()
    {
        CloseModal();
        _endingDismissed = false;
        Refresh();
    }

    public override void _UnhandledKeyInput(InputEvent input)
    {
        if (input is not InputEventKey key || !key.Pressed || key.Echo) return;
        if (key.Keycode == Key.Escape && _overlay != null && _modalClosable) { CloseModal(); GetViewport().SetInputAsHandled(); return; }
        if (_overlay != null || _fileDialog.Visible || Settings || (HasFinal && !_endingDismissed) || Historical || key.CtrlPressed || key.MetaPressed || key.AltPressed) return;
        var focus = GetViewport().GuiGetFocusOwner();
        if (focus is LineEdit or TextEdit or OptionButton or Slider or SpinBox) return;
        var name = key.Unicode > 0 ? char.ConvertFromUtf32((int)key.Unicode).ToLowerInvariant() : key.Keycode.ToString().ToLowerInvariant();
        if (key.ShiftPressed && name == "n") { ShowSetup(true); GetViewport().SetInputAsHandled(); return; }
        if (key.ShiftPressed && name == "l") { Invoke("clearChronicle"); GetViewport().SetInputAsHandled(); return; }
        var shortcut = (key.ShiftPressed ? "shift+" : "") + name;
        var action = Objects(N.Arr(View, "actions")).FirstOrDefault(item => N.Str(item, "shortcut").ToLowerInvariant().Replace(" ", "") == shortcut);
        if (action == null || !string.IsNullOrEmpty(N.Str(action, "disabledReason"))) return;
        Execute(N.Str(action, "id"));
        GetViewport().SetInputAsHandled();
    }

    private void ToggleProjection()
    {
        _relief = !_relief;
        _map.Relief = _relief;
        _projectionButton.Text = _relief ? "立体" : "平面";
        _projectionButton.ButtonPressed = _relief;
        if (IsNativeSmoke) return;
        var config = new ConfigFile();
        config.SetValue("map", "relief", _relief);
        config.Save("user://native-display.cfg");
    }

    private void LoadDisplayPreference()
    {
        var config = new ConfigFile();
        if (config.Load("user://native-display.cfg") == Error.Ok) _relief = config.GetValue("map", "relief", true).AsBool();
    }

    private void ShowSetup(bool existing)
    {
        var body = ShowDialog(existing ? "开启新的世界" : "文明从这里开始", existing, 820);
        body.AddChild(L("三颗太阳下，一片尚未命名的大陆。选择执政官与世界规则，再选定文明的发源地。", 14, NativeTheme.Muted));
        var fields = H(24);
        body.AddChild(fields);
        var form = V(8);
        form.CustomMinimumSize = new Vector2(410, 0);
        form.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        fields.AddChild(form);
        form.AddChild(L("国度名称", 13, NativeTheme.Gold));
        var realmInput = new LineEdit { Name = "RealmNameInput", Text = existing ? "" : N.Str(View, "realmName"), PlaceholderText = "为文明命名", MaxLength = 24 };
        form.AddChild(realmInput);
        form.AddChild(L("世界种子 · 留空随机生成", 13, NativeTheme.Gold));
        var seeds = H(8);
        var seedInput = new LineEdit { Name = "SeedInput", Text = !existing && View["initialSeed"] != null ? N.Num(View, "initialSeed").ToString("0", CultureInfo.InvariantCulture) : "", PlaceholderText = "1–4294967295", SizeFlagsHorizontal = SizeFlags.ExpandFill };
        seeds.AddChild(seedInput);
        seeds.AddChild(B("随机", () => seedInput.Text = ((uint)Random.Shared.NextInt64(1, 4294967296)).ToString(CultureInfo.InvariantCulture)));
        form.AddChild(seeds);
        var config = N.Obj(View, "configs");
        form.AddChild(L("难度", 13, NativeTheme.Gold));
        var difficulty = FormChoice(N.Arr(config, "difficulties"), N.Str(View, "difficulty", "normal"));
        difficulty.Name = "DifficultyInput";
        form.AddChild(difficulty);
        form.AddChild(L("敌对势力", 13, NativeTheme.Gold));
        var aggression = FormChoice(N.Arr(config, "aggressions"), N.Str(View, "aiAggression", "standard"));
        aggression.Name = "AggressionInput";
        form.AddChild(aggression);
        form.AddChild(L("执政官", 13, NativeTheme.Gold));
        var governor = FormChoice(N.Arr(config, "governors"), N.Str(View, "governorId", "east-asian-man"));
        governor.Name = "GovernorInput";
        form.AddChild(governor);
        var territory = new CheckBox { Name = "TerritoryInput", Text = "启用领土、战争与征服玩法", ButtonPressed = N.Bool(View, "mapUiExpanded", true) };
        form.AddChild(territory);
        var errorLabel = L("", 12, NativeTheme.Danger);
        form.AddChild(errorLabel);
        var preview = V(8);
        preview.CustomMinimumSize = new Vector2(260, 0);
        fields.AddChild(preview);
        void UpdateGovernor()
        {
            Clear(preview);
            var id = ChoiceId(governor);
            var data = Find(N.Arr(config, "governors"), id);
            preview.AddChild(Portrait(id, new Vector2(240, 266)));
            preview.AddChild(Kicker("GOVERNOR"));
            preview.AddChild(L(N.Str(data, "label"), 20));
            preview.AddChild(L(N.Str(data, "skill"), 13, NativeTheme.Gold));
            preview.AddChild(L(N.Str(data, "caption"), 12, NativeTheme.Muted));
        }
        governor.ItemSelected += _ => UpdateGovernor();
        UpdateGovernor();
        var generate = B("生成世界 →", () =>
        {
            if (string.IsNullOrWhiteSpace(realmInput.Text)) { errorLabel.Text = "为你的国度起一个名字。"; realmInput.GrabFocus(); return; }
            var options = new JsonObject
            {
                ["realmName"] = realmInput.Text.Trim(), ["difficulty"] = ChoiceId(difficulty),
                ["aiAggression"] = ChoiceId(aggression), ["governorId"] = ChoiceId(governor),
                ["mapUiExpanded"] = territory.ButtonPressed,
            };
            if (!string.IsNullOrWhiteSpace(seedInput.Text))
            {
                if (!uint.TryParse(seedInput.Text.Trim(), out var seed) || seed == 0) { errorLabel.Text = "世界种子应为 1–4294967295 的整数。"; return; }
                options["seed"] = seed;
            }
            try
            {
                var result = _session.Call("createGame", options);
                if (result["ok"] != null && !N.Bool(result, "ok")) { errorLabel.Text = N.Str(result, "reason"); return; }
                CloseModal();
                _endingDismissed = false;
                _observation = -1;
                _active = "overview";
                Refresh();
            }
            catch (Exception error) { errorLabel.Text = error.Message; }
        }, true);
        generate.Name = "GenerateWorld";
        form.AddChild(generate);
        if (existing) form.AddChild(L("新世界会替换当前进度。可先关闭此窗口，导出当前存档。", 11, NativeTheme.Muted));
        else form.AddChild(B("读取已有存档", ShowImport));
        realmInput.CallDeferred(Control.MethodName.GrabFocus);
    }

    private void ShowWorld()
    {
        var body = ShowDialog("世界与存档");
        body.AddChild(L("世界种子 " + N.Num(View, "seed").ToString("0", CultureInfo.InvariantCulture) + " · " + N.Str(View, "realmName") + " · 第 " + F(N.Num(View, "turn")) + " 年", 16));
        body.AddChild(L("当前进度自动保存在本机。Godot 与网页版采用相同 JSON 存档格式，导入会恢复原地图与随机序列。", 13, NativeTheme.Muted));
        if (HasFinal) body.AddChild(B("查看结局档案", OpenEnding, true));
        body.AddChild(B("导出存档", ShowExport));
        body.AddChild(B("导入存档", ShowImport));
        body.AddChild(B("开启随机新世界 →", () => ShowSetup(true), true));
        var territory = new CheckBox { Text = "启用领土、战争与征服玩法", ButtonPressed = N.Bool(View, "mapUiExpanded", true), Disabled = !N.Bool(View, "setupComplete") || N.Bool(View, "finished") };
        territory.Toggled += enabled => Invoke("setMapExpanded", enabled);
        body.AddChild(territory);
    }

    private void ShowImport()
    {
        _fileDialog.FileMode = FileDialog.FileModeEnum.OpenFile;
        _fileDialog.Title = "导入文明存档";
        _fileDialog.PopupCentered(new Vector2I(820, 560));
    }

    private void ShowExport()
    {
        _fileDialog.FileMode = FileDialog.FileModeEnum.SaveFile;
        _fileDialog.Title = "导出文明存档";
        _fileDialog.CurrentFile = "cunabula-" + N.Num(View, "seed").ToString("0", CultureInfo.InvariantCulture) + "-year-" + F(N.Num(View, "turn")).Replace(",", "") + ".json";
        _fileDialog.PopupCentered(new Vector2I(820, 560));
    }

    private void HandleSaveFile(string path)
    {
        try
        {
            if (_fileDialog.FileMode == FileDialog.FileModeEnum.SaveFile)
            {
                File.WriteAllText(path, _session.ExportSave());
                Notice("存档已导出。");
            }
            else
            {
                var file = new FileInfo(path);
                if (file.Length > 5 * 1024 * 1024) throw new InvalidDataException("存档文件过大。上限为 5 MB。");
                var result = _session.Call("importSave", File.ReadAllText(path));
                if (result["ok"] != null && !N.Bool(result, "ok")) throw new InvalidDataException(N.Str(result, "reason", "存档无法载入。"));
                CloseModal();
                _endingDismissed = false;
                _observation = -1;
                Refresh();
                Notice("存档已载入。");
            }
        }
        catch (Exception error) { Notice(error.Message); }
    }

    private void ShowMetrics(bool historical = false)
    {
        var samples = N.Arr(View, "metricSamples");
        var sample = historical && _observation >= 0 ? samples?.ElementAtOrDefault(_observation) as JsonObject : View;
        var body = ShowDialog(historical ? "第 " + F(N.Num(sample, "civilization")) + " 号文明 · 第 " + F(N.Num(sample, "turn")) + " 年观测" : "文明指标");
        foreach (var (key, text) in Metrics) AddPair(body, text, F(N.Num(sample, key == "eerfLevel" && historical ? "eerf" : key)));
        body.AddChild(L("历史观测只供查看。地图保持当前领土与军队状态。", 12, NativeTheme.Muted));
    }

    private void ShowEvent(JsonObject entry)
    {
        var body = ShowDialog(N.Str(entry, "title", "文明的记录"));
        AddQuotedCopy(body, N.Str(entry, "text"));
        body.AddChild(L(Delta(N.Obj(entry, "delta")), 13, NativeTheme.Gold));
    }

    private void ShowRecords()
    {
        var body = ShowDialog("文明的记录", true, 860);
        var tabs = H(8);
        foreach (var (id, text) in new[] { ("log", "编年史"), ("archive", "文明档案"), ("endings", "终局观测") })
        {
            var captured = id;
            var button = B(text, () => { _recordTab = captured; _recordPage = 0; ShowRecords(); });
            button.ToggleMode = true; button.ButtonPressed = id == _recordTab;
            tabs.AddChild(button);
        }
        body.AddChild(tabs);
        if (_recordTab == "log")
        {
            var filter = new OptionButton();
            foreach (var (id, text) in new[] { ("all", "全部"), ("progress", "发展"), ("special", "特殊"), ("disaster", "灾变"), ("collapse", "毁灭") })
            {
                filter.AddItem(text); filter.SetItemMetadata(filter.ItemCount - 1, id);
                if (id == _recordFilter) filter.Selected = filter.ItemCount - 1;
            }
            filter.ItemSelected += _ => { _recordFilter = ChoiceId(filter); _recordPage = 0; ShowRecords(); };
            body.AddChild(filter);
            var logs = Objects(N.Arr(View, "log")).Where(item => _recordFilter == "all" || N.Str(item, "type") == _recordFilter).ToArray();
            var top = H(8);
            var count = L(logs.Length + " 条记录", 12, NativeTheme.Muted); count.SizeFlagsHorizontal = SizeFlags.ExpandFill; top.AddChild(count);
            var clear = B("清空当前编年", () => { Invoke("clearChronicle"); _recordPage = 0; ShowRecords(); });
            clear.Disabled = N.Bool(View, "finished") || logs.Length == 0;
            top.AddChild(clear); body.AddChild(top);
            foreach (var entry in logs.Skip(_recordPage * 20).Take(20))
            {
                var record = V(4);
                record.AddChild(Kicker(N.Str(entry, "type", "CHRONICLE").ToUpperInvariant()));
                record.AddChild(L(N.Str(entry, "title"), 18));
                AddQuotedCopy(record, N.Str(entry, "text"));
                record.AddChild(L(Delta(N.Obj(entry, "delta")), 12, NativeTheme.Gold));
                body.AddChild(record); body.AddChild(new HSeparator());
            }
            if (logs.Length == 0) body.AddChild(L("没有符合筛选的记录。", 13, NativeTheme.Muted));
            AddPagination(body, logs.Length);
        }
        else if (_recordTab == "archive")
        {
            var archives = Objects(N.Arr(View, "history")).ToArray();
            foreach (var entry in archives.Skip(_recordPage * 20).Take(20))
            {
                body.AddChild(Kicker("CIVILIZATION " + F(N.Num(entry, "civilization"))));
                body.AddChild(L("第 " + F(N.Num(entry, "civilization")) + " 号文明 · " + F(N.Num(entry, "turns")) + " 年", 19));
                body.AddChild(L(N.Str(entry, "collapseCause", "未知终止"), 13));
                body.AddChild(L("峰值：科学 " + F(N.Num(entry, "peakSc")) + " · 神学 " + F(N.Num(entry, "peakBe")) + " · 人口 " + F(N.Num(entry, "peakPop")) + " · 经济 " + F(N.Num(entry, "peakEco")), 12, NativeTheme.Muted));
                body.AddChild(L(string.Join("、", N.Items(N.Arr(entry, "specialEvents")).Select(item => item?.ToString())), 12));
                body.AddChild(new HSeparator());
            }
            if (archives.Length == 0) body.AddChild(L("第一份档案会在文明毁灭时生成。", 13, NativeTheme.Muted));
            AddPagination(body, archives.Length);
        }
        else
        {
            body.AddChild(L(N.Str(View, "ending", "文明仍在演化。"), 16, NativeTheme.Gold));
            if (HasFinal) body.AddChild(B("查看结局档案", OpenEnding, true));
            foreach (var item in Objects(N.Arr(View, "endingWatch")))
            {
                body.AddChild(L(N.Str(item, "id") + " · " + N.Str(item, "displayName", "???") + "   " + Math.Round(N.Num(item, "progress") * 100) + "%", 17));
                body.AddChild(new ProgressBar { MinValue = 0, MaxValue = 1, Value = N.Num(item, "progress"), ShowPercentage = false, CustomMinimumSize = new Vector2(0, 8) });
                var missing = N.Arr(item, "missing");
                body.AddChild(L(missing?.Count > 0 ? "还差：" + string.Join("；", N.Items(missing).Select(node => node?.ToString())) : "条件已满足，可在设施面板结算。", 12, NativeTheme.Muted));
                body.AddChild(new HSeparator());
            }
            var stats = N.Obj(View, "endingStats");
            body.AddChild(L("已完成结局次数：" + F(N.Num(stats, "totalCompletions", N.Num(stats, "total"))), 13, NativeTheme.Gold));
        }
    }

    private void AddPagination(VBoxContainer body, int count)
    {
        var row = H(8);
        var previous = B("上一页", () => { _recordPage--; ShowRecords(); });
        previous.Disabled = _recordPage == 0;
        row.AddChild(previous);
        row.AddChild(NoWrap(L((_recordPage + 1) + " / " + Math.Max(1, (int)Math.Ceiling(count / 20.0)), 13)));
        var next = B("下一页", () => { _recordPage++; ShowRecords(); });
        next.Disabled = (_recordPage + 1) * 20 >= count;
        row.AddChild(next);
        body.AddChild(row);
    }

    private void ShowHelp()
    {
        var body = ShowDialog("统治三日世界");
        foreach (var text in new[]
        {
            "每次年度决议推进一年，同时结算经济、人口、科学、神学、随机事件与敌军行动。",
            "地图可拖动平移与滚轮缩放。点击省份查看详情，点击军旗选择军队；军务面板可沿道路部署。未侦察到的敌军不会显示。",
            "EERF 保存灾后的火种。文明毁灭后，可以重启下一代；达到条件后，在设施中结算终局。",
            "底部时间轴查看最近 80 次观测。历史观测期间决议暂停，回到当前即可继续。",
            "立体／平面视角仅影响显示，省份道路、侦察与战斗规则相同。视角会在本机记住。",
            "新世界留空种子即随机生成，重复种子可重现地图；年度结果取决于你的决议。",
            "快捷键与网页一致，参见决议按钮右侧标记。Shift + N 开启新世界，Shift + L 清空编年；输入框与窗口打开时快捷键暂停。",
        }) body.AddChild(L(text, 14));
        body.AddChild(B("开源组件与许可", ShowLicenses));
    }

    private void ShowLicenses()
    {
        var body = ShowDialog("开源组件与许可", true, 860);
        using var file = Godot.FileAccess.Open("res://Native/THIRD_PARTY_NOTICES.txt", Godot.FileAccess.ModeFlags.Read);
        var copy = new TextEdit
        {
            Text = file?.GetAsText() ?? "组件许可文件无法读取。", Editable = false,
            WrapMode = TextEdit.LineWrappingMode.Boundary,
            CustomMinimumSize = new Vector2(0, 430), SizeFlagsHorizontal = SizeFlags.ExpandFill,
        };
        copy.AddThemeFontSizeOverride("font_size", 12);
        body.AddChild(copy);
    }

    private VBoxContainer ShowDialog(string title, bool closable = true, int width = 760)
    {
        CloseModal();
        _modalClosable = closable;
        _overlay = new Control { Name = "ModalOverlay", ZIndex = 20, MouseFilter = MouseFilterEnum.Stop };
        AddChild(_overlay);
        _overlay.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        var shade = new ColorRect { Color = new Color(0, 0, 0, .77f), MouseFilter = MouseFilterEnum.Stop };
        _overlay.AddChild(shade); shade.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        var center = new CenterContainer();
        _overlay.AddChild(center); center.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        var panel = Panel(NativeTheme.Panel, 20);
        panel.CustomMinimumSize = new Vector2(width, 620);
        center.AddChild(panel);
        var frame = V(14);
        panel.AddChild(frame);
        var heading = H(8);
        var label = Kicker("CUNABULA · CIVILITATIS"); label.SizeFlagsHorizontal = SizeFlags.ExpandFill; heading.AddChild(label);
        if (closable) heading.AddChild(B("关闭 ×", CloseModal));
        frame.AddChild(heading);
        frame.AddChild(L(title, 28));
        var scroll = new ScrollContainer { HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled, SizeFlagsVertical = SizeFlags.ExpandFill, CustomMinimumSize = new Vector2(0, 470) };
        frame.AddChild(scroll);
        var body = V(12);
        body.CustomMinimumSize = new Vector2(width - 64, 0);
        body.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        scroll.AddChild(body);
        return body;
    }

    private void CloseModal()
    {
        if (_overlay == null) return;
        RemoveChild(_overlay);
        _overlay.QueueFree();
        _overlay = null;
    }

    private TextureRect Portrait(string id, Vector2 size)
    {
        if (!_portraits.TryGetValue(id, out var texture))
        {
            var path = "res://Native/Art/governor-" + (id == "listener" ? "trisolaran-listener" : id) + ".webp";
            if (ResourceLoader.Exists(path)) texture = GD.Load<Texture2D>(path);
            if (texture != null) _portraits[id] = texture;
        }
        return new TextureRect { Texture = texture, ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize, StretchMode = TextureRect.StretchModeEnum.KeepAspectCovered, CustomMinimumSize = size, MouseFilter = MouseFilterEnum.Ignore };
    }

    private static OptionButton FormChoice(JsonArray? items, string selected)
    {
        var choice = new OptionButton();
        foreach (var item in N.Items(items).OfType<JsonObject>())
        {
            choice.AddItem(N.Str(item, "label"));
            var index = choice.ItemCount - 1;
            choice.SetItemMetadata(index, N.Str(item, "id"));
            if (N.Str(item, "id") == selected) choice.Selected = index;
        }
        return choice;
    }

    private static string ChoiceId(OptionButton choice) => choice.Selected >= 0 ? choice.GetItemMetadata(choice.Selected).AsString() : "";
    private OptionButton Choice(JsonObject[] items, string selected, Func<JsonObject, string> label, Action<string> select)
    {
        var choice = new OptionButton();
        foreach (var item in items)
        {
            choice.AddItem(label(item));
            var index = choice.ItemCount - 1;
            choice.SetItemMetadata(index, N.Str(item, "id"));
            if (N.Str(item, "id") == selected) choice.Selected = index;
        }
        choice.ItemSelected += _ => select(ChoiceId(choice));
        return choice;
    }

    private static string Delta(JsonObject? delta)
    {
        if (delta == null) return "";
        var names = new Dictionary<string, string> { ["sc"] = "科学", ["be"] = "神学", ["pop"] = "人口", ["eco"] = "经济", ["la"] = "记忆", ["stability"] = "秩序", ["eerf"] = "EERF" };
        return string.Join("  ", delta.Where(pair => names.ContainsKey(pair.Key) && N.Num(delta, pair.Key) != 0).Select(pair => names[pair.Key] + " " + (N.Num(delta, pair.Key) > 0 ? "+" : "") + F(N.Num(delta, pair.Key))));
    }

    private static void AddQuotedCopy(VBoxContainer body, string text, bool quoteOnly = false)
    {
        foreach (var block in ParseQuotedText(text))
        {
            body.AddChild(L(block.Text, block.Quote || quoteOnly ? 14 : 13, block.Quote || quoteOnly ? NativeTheme.Gold : NativeTheme.Ink));
            if (!string.IsNullOrEmpty(block.Source)) body.AddChild(L(block.Source, 12, NativeTheme.Muted, HorizontalAlignment.Right));
        }
    }

    private static void AddPair(VBoxContainer body, string title, string value)
    {
        var row = H(12);
        var label = L(title, 13, NativeTheme.Muted); label.SizeFlagsHorizontal = SizeFlags.ExpandFill; row.AddChild(label);
        var valueLabel = NoWrap(L(value, 14, NativeTheme.Ink, HorizontalAlignment.Right));
        valueLabel.CustomMinimumSize = new Vector2(70, 0);
        valueLabel.SizeFlagsHorizontal = SizeFlags.ShrinkEnd;
        row.AddChild(valueLabel);
        body.AddChild(row);
    }

    private static Label Kicker(string text) => NoWrap(L(text, 10, NativeTheme.Gold));
    private static Label NoWrap(Label label) { label.AutowrapMode = TextServer.AutowrapMode.Off; return label; }
    private static Label L(string text, int size = 14, Color? color = null, HorizontalAlignment alignment = HorizontalAlignment.Left)
    {
        var label = new Label { Text = text, AutowrapMode = TextServer.AutowrapMode.WordSmart, HorizontalAlignment = alignment, MouseFilter = MouseFilterEnum.Ignore };
        label.AddThemeFontSizeOverride("font_size", size);
        label.AddThemeColorOverride("font_color", color ?? NativeTheme.Ink);
        return label;
    }

    private static Button B(string text, Action action, bool primary = false)
    {
        var button = new Button { Text = text, Alignment = HorizontalAlignment.Left, FocusMode = FocusModeEnum.All };
        if (primary) button.AddThemeStyleboxOverride("normal", NativeTheme.Box(new Color("#514731"), NativeTheme.Gold, 9));
        button.Pressed += action;
        return button;
    }

    private static Button Clip(Button button)
    {
        button.ClipText = true;
        button.TextOverrunBehavior = TextServer.OverrunBehavior.TrimEllipsis;
        if (button.TooltipText.Length == 0) button.TooltipText = button.Text;
        return button;
    }

    private static VBoxContainer V(int gap = 8) { var box = new VBoxContainer(); box.AddThemeConstantOverride("separation", gap); return box; }
    private static HBoxContainer H(int gap = 8) { var box = new HBoxContainer(); box.AddThemeConstantOverride("separation", gap); return box; }
    private static PanelContainer Panel(Color color, int padding = 12) { var panel = new PanelContainer(); panel.AddThemeStyleboxOverride("panel", NativeTheme.Box(color, NativeTheme.Line, padding)); return panel; }
    private static void Clear(Node node) { foreach (var child in node.GetChildren()) { node.RemoveChild(child); child.QueueFree(); } }
}

/// <summary>Draws only when samples or viewport change; no animated polling.</summary>
public partial class NativeTrendChart : Control
{
    private JsonArray? _samples;
    private int _selected;
    public void SetSamples(JsonArray? samples, int selected) { _samples = samples; _selected = selected; QueueRedraw(); }
    public override void _Notification(int what) { if (what == NotificationResized) QueueRedraw(); }
    public override void _Draw()
    {
        var samples = N.Items(_samples).OfType<JsonObject>().ToArray();
        if (samples.Length == 0 || Size.X < 1 || Size.Y < 1) return;
        for (var y = 8f; y < Size.Y; y += 14) DrawLine(new Vector2(0, y), new Vector2(Size.X, y), NativeTheme.Line, 1);
        foreach (var (key, color) in new[] { ("sc", NativeTheme.Science), ("be", NativeTheme.Gold) })
        {
            var max = Math.Max(500, samples.Max(sample => N.Num(sample, key)));
            Vector2? previous = null;
            for (var i = 0; i < samples.Length; i++)
            {
                var point = new Vector2(samples.Length < 2 ? Size.X / 2 : i * Size.X / (samples.Length - 1), Size.Y - 3 - (float)(N.Num(samples[i], key) / max) * (Size.Y - 7));
                if (previous != null && N.Num(samples[i], "civilization") == N.Num(samples[i - 1], "civilization")) DrawLine(previous.Value, point, color, 1.5f, true);
                previous = point;
            }
        }
        var x = samples.Length < 2 ? Size.X / 2 : _selected * Size.X / (samples.Length - 1);
        DrawLine(new Vector2(x, 0), new Vector2(x, Size.Y), NativeTheme.Ink, 1, true);
    }
}
