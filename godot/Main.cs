using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using CradlesOfCivilization.Core;
using Godot;

namespace CradlesOfCivilization;

public partial class Main : Control
{
    private sealed record ActionPresentation(string Mark, string Shortcut, string Description, Color Accent);

    private static readonly string[] Difficulties = ["easy", "normal", "hard", "ultimate"];
    private static readonly string[] DifficultyLabels = ["简单", "普通", "困难", "终极困难"];
    private static readonly string[] Governors = ["east-asian-man", "white-woman", "black-man", "listener"];
    private static readonly string[] GovernorLabels = ["杨卫平", "麦克劳德", "塞万提斯", "监听员"];
    private static readonly string[] GovernorPortraits =
    [
        "governor-east-asian-man.png",
        "governor-white-woman.png",
        "governor-black-man.png",
        "governor-trisolaran-listener.png"
    ];

    private static readonly Color Background = new(0.027f, 0.039f, 0.059f);
    private static readonly Color Panel = new(0.051f, 0.075f, 0.11f);
    private static readonly Color PanelSoft = new(0.067f, 0.102f, 0.145f);
    private static readonly Color Terminal = new(0.035f, 0.055f, 0.082f);
    private static readonly Color Ink = new(0.933f, 0.961f, 0.984f);
    private static readonly Color Muted = new(0.557f, 0.635f, 0.722f);
    private static readonly Color Line = new(0.153f, 0.208f, 0.282f);
    private static readonly Color Science = new(0.329f, 0.847f, 1f);
    private static readonly Color Belief = new(1f, 0.82f, 0.4f);
    private static readonly Color People = new(0.455f, 0.878f, 0.659f);
    private static readonly Color Economy = new(0.773f, 0.937f, 0.498f);
    private static readonly Color Eerf = new(0.741f, 0.784f, 1f);
    private static readonly Color Arts = new(0.957f, 0.655f, 0.847f);
    private static readonly Color Danger = new(1f, 0.42f, 0.42f);

    private readonly GameEngine _engine = new();
    private readonly Dictionary<string, Label> _metricValues = new();
    private readonly Dictionary<string, Label> _metricDetails = new();
    private readonly Dictionary<string, Label> _metricTrends = new();
    private readonly Dictionary<string, ProgressBar> _metricMeters = new();
    private readonly Dictionary<string, Button> _actionButtons = new();
    private readonly Dictionary<string, Label> _actionReasons = new();
    private readonly Dictionary<string, Button> _chronicleFilterButtons = new();
    private readonly Dictionary<string, ActionDefinition> _actionsById = new();

    private GameState _state = new();
    private Label _headerRealm = null!;
    private Label _governorName = null!;
    private TextureRect _governorPortrait = null!;
    private Label _headerCivilization = null!;
    private Label _headerTurn = null!;
    private Label _headerRand = null!;
    private Label _weatherLabel = null!;
    private Label _endingTerminalLabel = null!;
    private Label _specialTitle = null!;
    private Label _specialText = null!;
    private Label _status = null!;
    private Label _systemEnding = null!;
    private Label _eerfSummary = null!;
    private Label _civilizationHistory = null!;
    private RichTextLabel _chronicle = null!;
    private ScrollContainer _pageScroll = null!;
    private LineEdit _seedInput = null!;
    private LineEdit _realmInput = null!;
    private OptionButton _difficultyInput = null!;
    private OptionButton _governorInput = null!;
    private string _lastSpecialTitle = "";
    private string _chronicleFilter = "all";
    private int? _previewScroll;
    private string SavePath => ProjectSettings.GlobalizePath("user://civilization-save.json");

    public override void _Ready()
    {
        var userArgs = OS.GetCmdlineUserArgs();
        if (userArgs.Contains("--verify-complete"))
        {
            RunCompleteVerification();
            return;
        }

        if (userArgs.Contains("--verify-full"))
        {
            var index = Array.IndexOf(userArgs, "--verify-full");
            RunFullVerification(index >= 0 && index + 1 < userArgs.Length ? userArgs[index + 1] : "");
            return;
        }

        if (userArgs.Contains("--verify-prototype"))
        {
            RunVerification();
            return;
        }

        foreach (var action in _engine.Actions) _actionsById[action.Id] = action;
        BuildInterface();
        SyncSetupInputs();
        RenderState();
        SetChronicleFilter("all");
        var previewIndex = Array.IndexOf(userArgs, "--ui-scroll");
        if (previewIndex >= 0 && previewIndex + 1 < userArgs.Length && int.TryParse(userArgs[previewIndex + 1], out var previewScroll))
            _previewScroll = previewScroll;
    }

    public override void _Process(double delta)
    {
        if (_previewScroll.HasValue) _pageScroll.ScrollVertical = _previewScroll.Value;
    }

    private void BuildInterface()
    {
        RenderingServer.SetDefaultClearColor(Background);
        var background = new ColorRect { Color = Background, MouseFilter = MouseFilterEnum.Ignore };
        background.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        AddChild(background);

        _pageScroll = new ScrollContainer
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill,
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled
        };
        _pageScroll.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        AddChild(_pageScroll);

        var outer = new MarginContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        outer.AddThemeConstantOverride("margin_left", 18);
        outer.AddThemeConstantOverride("margin_right", 18);
        outer.AddThemeConstantOverride("margin_top", 18);
        outer.AddThemeConstantOverride("margin_bottom", 30);
        _pageScroll.AddChild(outer);

        var page = new VBoxContainer
        {
            CustomMinimumSize = new Vector2(1160, 0),
            SizeFlagsHorizontal = SizeFlags.ExpandFill
        };
        page.AddThemeConstantOverride("separation", 18);
        outer.AddChild(page);

        page.AddChild(BuildTopbar());
        page.AddChild(BuildCommandDeck());
        page.AddChild(BuildSpecialBanner());
        page.AddChild(BuildDashboard());
        page.AddChild(BuildActionGroups());

        _status = new Label
        {
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
            HorizontalAlignment = HorizontalAlignment.Center,
            CustomMinimumSize = new Vector2(0, 34)
        };
        _status.AddThemeFontSizeOverride("font_size", 13);
        _status.AddThemeColorOverride("font_color", Muted);
        page.AddChild(_status);
        page.AddChild(BuildLowerGrid());
    }

    private Control BuildTopbar()
    {
        var panel = CreatePanel(PanelSoft, 20, 18, Line, 8);
        panel.CustomMinimumSize = new Vector2(0, 126);
        var row = new HBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        row.AddThemeConstantOverride("separation", 28);
        panel.AddChild(row);

        var brand = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill, SizeFlagsStretchRatio = 1.1f };
        brand.AddThemeConstantOverride("separation", 3);
        brand.AddChild(TextLabel("CRADLES OF CIVILIZATION", 12, new Color(0.66f, 0.8f, 0.89f)));
        var title = TextLabel("文明摇篮", 46, Ink);
        title.AddThemeConstantOverride("outline_size", 2);
        title.AddThemeColorOverride("font_outline_color", new Color(0, 0, 0, 0.7f));
        brand.AddChild(title);
        _headerRealm = TextLabel("长生军｜普通｜无地图版", 12, new Color(0.72f, 0.84f, 0.91f));
        brand.AddChild(_headerRealm);
        row.AddChild(brand);

        var governor = new HBoxContainer
        {
            CustomMinimumSize = new Vector2(280, 0),
            Alignment = BoxContainer.AlignmentMode.Center
        };
        governor.AddThemeConstantOverride("separation", 12);
        _governorPortrait = new TextureRect
        {
            CustomMinimumSize = new Vector2(62, 62),
            ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize,
            StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered
        };
        governor.AddChild(_governorPortrait);
        var governorCopy = new VBoxContainer { Alignment = BoxContainer.AlignmentMode.Center };
        governorCopy.AddChild(TextLabel("执政官", 11, Muted));
        _governorName = TextLabel("杨卫平", 16, Ink);
        governorCopy.AddChild(_governorName);
        governor.AddChild(governorCopy);
        row.AddChild(governor);

        var turnBoard = new GridContainer { Columns = 3, CustomMinimumSize = new Vector2(390, 0) };
        turnBoard.AddThemeConstantOverride("h_separation", 10);
        _headerCivilization = AddTurnCell(turnBoard, "文明");
        _headerTurn = AddTurnCell(turnBoard, "年份");
        _headerRand = AddTurnCell(turnBoard, "Rand");
        row.AddChild(turnBoard);
        return panel;
    }

    private Control BuildCommandDeck()
    {
        var panel = CreatePanel(PanelSoft, 16, 16, Line, 8);
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 14);
        panel.AddChild(layout);

        var grid = new GridContainer { Columns = 2, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 12);
        var restart = CreateTerminalButton("restartCivilization", "GOVERNANCE FEED", "三恒星危机管制台 / 重启文明", Science, out _weatherLabel);
        var ending = CreateTerminalButton("settleEnding", "ENDING VECTOR", "终局判定 / 脱离苦海", Belief, out _endingTerminalLabel);
        grid.AddChild(restart);
        grid.AddChild(ending);
        layout.AddChild(grid);

        var systems = new GridContainer { Columns = 4, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        systems.AddThemeConstantOverride("h_separation", 8);
        foreach (var name in new[] { "■  STAR PRESSURE", "■  CIVIL ORDER", "■  EERF SEEDBANK", "■  RAND STREAM" })
        {
            var box = CreatePanel(new Color(0.02f, 0.033f, 0.051f), 10, 8, new Color(1, 1, 1, 0.07f), 4);
            box.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            box.AddChild(TextLabel(name, 10, new Color(0.71f, 0.78f, 0.85f)));
            systems.AddChild(box);
        }
        layout.AddChild(systems);
        return panel;
    }

    private Button CreateTerminalButton(string actionId, string kicker, string heading, Color accent, out Label readout)
    {
        var button = new Button
        {
            Text = "",
            CustomMinimumSize = new Vector2(0, 118),
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            ClipContents = true
        };
        button.AddThemeStyleboxOverride("normal", ButtonBox(Terminal, accent, 4));
        button.AddThemeStyleboxOverride("hover", ButtonBox(new Color(0.055f, 0.09f, 0.13f), accent, 4));
        button.AddThemeStyleboxOverride("pressed", ButtonBox(new Color(0.03f, 0.05f, 0.075f), accent, 4));
        button.AddThemeStyleboxOverride("disabled", ButtonBox(Terminal, new Color(accent.R, accent.G, accent.B, 0.42f), 4));
        button.Pressed += () => Advance(actionId);
        _actionButtons[actionId] = button;

        var margin = FillMargin(14, 12);
        IgnoreMouse(margin);
        button.AddChild(margin);
        var copy = new VBoxContainer();
        copy.AddThemeConstantOverride("separation", 10);
        margin.AddChild(copy);
        var head = new HBoxContainer();
        var kickerLabel = TextLabel(kicker, 10, new Color(0.55f, 0.72f, 0.83f));
        kickerLabel.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        head.AddChild(kickerLabel);
        var headingLabel = TextLabel(heading, 13, Ink);
        headingLabel.HorizontalAlignment = HorizontalAlignment.Right;
        head.AddChild(headingLabel);
        copy.AddChild(head);
        readout = TextLabel("等待第一年观测", 21, accent);
        readout.SizeFlagsVertical = SizeFlags.ExpandFill;
        readout.VerticalAlignment = VerticalAlignment.Bottom;
        readout.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        copy.AddChild(readout);
        IgnoreMouse(copy);
        return button;
    }

    private Control BuildSpecialBanner()
    {
        var panel = CreatePanel(new Color(0.105f, 0.075f, 0.055f), 16, 14, new Color(Belief.R, Belief.G, Belief.B, 0.42f), 8, Belief);
        panel.CustomMinimumSize = new Vector2(0, 88);
        var row = new HBoxContainer();
        row.AddThemeConstantOverride("separation", 18);
        panel.AddChild(row);
        var heading = new VBoxContainer { CustomMinimumSize = new Vector2(255, 0) };
        heading.AddChild(TextLabel("特殊事件", 11, Belief));
        _specialTitle = TextLabel("SPEC ----｜无特殊事件", 16, new Color(1f, 0.97f, 0.87f));
        _specialTitle.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        heading.AddChild(_specialTitle);
        row.AddChild(heading);
        _specialText = TextLabel("日光之下，并无新事。", 14, new Color(0.94f, 0.91f, 0.78f));
        _specialText.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        _specialText.VerticalAlignment = VerticalAlignment.Center;
        _specialText.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        row.AddChild(_specialText);
        return panel;
    }

    private Control BuildDashboard()
    {
        var panel = CreatePanel(PanelSoft, 14, 14, Line, 8);
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 12);
        panel.AddChild(layout);
        layout.AddChild(SectionTitle("状态仪表"));

        var grid = new GridContainer { Columns = 3, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 14);
        grid.AddThemeConstantOverride("v_separation", 14);
        grid.AddChild(CreateMetricCard("science", "SC 科学", Science));
        grid.AddChild(CreateMetricCard("belief", "BE 神学", Belief));
        grid.AddChild(CreateMetricCard("population", "POP 人口", People));
        grid.AddChild(CreateMetricCard("economy", "ECO 经济", Economy));
        grid.AddChild(CreateMetricCard("eerf", "EERF 极端环境抵抗设施", Eerf));
        grid.AddChild(CreateMetricCard("literature", "LA 文学艺术", Arts));
        layout.AddChild(grid);
        return panel;
    }

    private Control CreateMetricCard(string key, string title, Color accent)
    {
        var card = CreatePanel(new Color(0.047f, 0.073f, 0.106f), 16, 14, new Color(Line.R, Line.G, Line.B, 0.9f), 6, accent, 3);
        card.CustomMinimumSize = new Vector2(0, 145);
        card.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 9);
        card.AddChild(layout);
        var head = new HBoxContainer();
        var name = TextLabel(title, 12, Muted);
        name.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        head.AddChild(name);
        var value = TextLabel("0", 30, Ink);
        value.HorizontalAlignment = HorizontalAlignment.Right;
        head.AddChild(value);
        _metricValues[key] = value;
        layout.AddChild(head);

        var meter = new ProgressBar { MinValue = 0, MaxValue = 100, ShowPercentage = false, CustomMinimumSize = new Vector2(0, 8) };
        meter.AddThemeStyleboxOverride("background", FlatBox(new Color(0.015f, 0.027f, 0.043f), 3));
        meter.AddThemeStyleboxOverride("fill", FlatBox(accent, 3));
        _metricMeters[key] = meter;
        layout.AddChild(meter);

        var detail = TextLabel("—", 13, Ink);
        detail.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        detail.SizeFlagsVertical = SizeFlags.ExpandFill;
        _metricDetails[key] = detail;
        layout.AddChild(detail);

        var trend = TextLabel("0/年                                      平稳", 11, Ink);
        trend.AddThemeStyleboxOverride("normal", FlatBox(new Color(0.02f, 0.033f, 0.05f), 3, new Color(1, 1, 1, 0.05f), 1, 8, 5));
        _metricTrends[key] = trend;
        layout.AddChild(trend);
        return card;
    }

    private Control BuildActionGroups()
    {
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 18);
        layout.AddChild(BuildActionGroup("基础操作", ["science", "belief", "population", "economy", "arts", "hibernate"], 3));
        layout.AddChild(BuildActionGroup("战略干预", ["balance", "suppressBelief", "order", "suppressScience"], 4));
        layout.AddChild(BuildActionGroup("特殊设施建设", ["buildEerf", "upgradeEerf", "recovery"], 3));
        return layout;
    }

    private Control BuildActionGroup(string title, string[] actionIds, int columns)
    {
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 10);
        layout.AddChild(SectionTitle(title));
        var grid = new GridContainer { Columns = columns, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 10);
        grid.AddThemeConstantOverride("v_separation", 10);
        foreach (var actionId in actionIds) grid.AddChild(CreateActionCard(actionId));
        layout.AddChild(grid);
        return layout;
    }

    private Button CreateActionCard(string actionId)
    {
        var action = _actionsById[actionId];
        var presentation = Presentation(actionId);
        var button = new Button
        {
            Text = "",
            CustomMinimumSize = new Vector2(0, 104),
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            ClipContents = true,
            TooltipText = action.Description
        };
        button.AddThemeStyleboxOverride("normal", ButtonBox(PanelSoft, new Color(presentation.Accent.R, presentation.Accent.G, presentation.Accent.B, 0.36f), 1));
        button.AddThemeStyleboxOverride("hover", ButtonBox(new Color(0.09f, 0.14f, 0.19f), new Color(presentation.Accent.R, presentation.Accent.G, presentation.Accent.B, 0.75f), 1));
        button.AddThemeStyleboxOverride("pressed", ButtonBox(new Color(0.055f, 0.085f, 0.12f), presentation.Accent, 1));
        button.AddThemeStyleboxOverride("disabled", ButtonBox(new Color(0.047f, 0.067f, 0.09f), new Color(0.12f, 0.16f, 0.21f), 1));
        button.Pressed += () => Advance(actionId);
        _actionButtons[actionId] = button;

        var margin = FillMargin(12, 11);
        button.AddChild(margin);
        var row = new HBoxContainer();
        row.AddThemeConstantOverride("separation", 10);
        margin.AddChild(row);
        var markPanel = CreatePanel(presentation.Accent, 0, 0, presentation.Accent, 4);
        markPanel.CustomMinimumSize = new Vector2(42, 38);
        var mark = TextLabel(presentation.Mark, 11, Background);
        mark.HorizontalAlignment = HorizontalAlignment.Center;
        mark.VerticalAlignment = VerticalAlignment.Center;
        markPanel.AddChild(mark);
        row.AddChild(markPanel);

        var copy = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        copy.AddThemeConstantOverride("separation", 3);
        copy.AddChild(TextLabel(action.Label, 15, Ink));
        var description = TextLabel(presentation.Description, 11, new Color(0.71f, 0.76f, 0.81f));
        description.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        description.SizeFlagsVertical = SizeFlags.ExpandFill;
        copy.AddChild(description);
        var reason = TextLabel("", 10, Belief);
        reason.Visible = false;
        reason.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        copy.AddChild(reason);
        _actionReasons[actionId] = reason;
        row.AddChild(copy);
        var shortcut = TextLabel(presentation.Shortcut, 10, Muted);
        shortcut.VerticalAlignment = VerticalAlignment.Top;
        row.AddChild(shortcut);
        IgnoreMouse(margin);
        return button;
    }

    private Control BuildLowerGrid()
    {
        var grid = new GridContainer { Columns = 2, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 14);
        grid.AddChild(BuildChroniclePanel());
        grid.AddChild(BuildSystemPanel());
        return grid;
    }

    private Control BuildChroniclePanel()
    {
        var panel = CreatePanel(PanelSoft, 16, 16, Line, 6);
        panel.CustomMinimumSize = new Vector2(760, 620);
        panel.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 10);
        panel.AddChild(layout);
        var head = new HBoxContainer();
        var title = SectionTitle("编年史");
        title.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        head.AddChild(title);
        head.AddChild(CompactButton("清空", ClearChronicle));
        layout.AddChild(head);
        var filters = new GridContainer { Columns = 4 };
        filters.AddThemeConstantOverride("h_separation", 6);
        foreach (var (id, label) in new[] { ("all", "全部"), ("disaster", "灾变"), ("special", "特殊"), ("progress", "发展") })
        {
            var filterId = id;
            var filter = CompactButton(label, () => SetChronicleFilter(filterId));
            filter.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            _chronicleFilterButtons[filterId] = filter;
            filters.AddChild(filter);
        }
        layout.AddChild(filters);
        _chronicle = new RichTextLabel
        {
            BbcodeEnabled = true,
            FitContent = false,
            ScrollActive = true,
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        _chronicle.AddThemeFontSizeOverride("normal_font_size", 13);
        _chronicle.AddThemeColorOverride("default_color", new Color(0.78f, 0.82f, 0.87f));
        layout.AddChild(_chronicle);
        return panel;
    }

    private Control BuildSystemPanel()
    {
        var panel = CreatePanel(PanelSoft, 16, 16, Line, 6);
        panel.CustomMinimumSize = new Vector2(370, 620);
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 12);
        panel.AddChild(layout);
        layout.AddChild(SectionTitle("文明系统"));
        layout.AddChild(TextLabel("终局观测", 13, Ink));
        _systemEnding = InfoBox("文明的旅程尚未停息。", Science);
        layout.AddChild(_systemEnding);
        layout.AddChild(TextLabel("EERF 火种预估", 13, Ink));
        _eerfSummary = InfoBox("当前等级 0/5\n毁灭后人口 2,600\n下一代 EERF 0/5", Eerf);
        layout.AddChild(_eerfSummary);
        layout.AddChild(TextLabel("文明档案", 13, Ink));
        _civilizationHistory = InfoBox("尚无毁灭记录。\n第一份档案会在文明归零时生成。", Muted);
        layout.AddChild(_civilizationHistory);
        layout.AddChild(TextLabel("世界存档", 13, Ink));

        var realmRow = new HBoxContainer();
        realmRow.AddThemeConstantOverride("separation", 6);
        _realmInput = StyledInput("国名", 150);
        _seedInput = StyledInput("Seed", 140);
        realmRow.AddChild(_realmInput);
        realmRow.AddChild(_seedInput);
        layout.AddChild(realmRow);

        var optionRow = new HBoxContainer();
        optionRow.AddThemeConstantOverride("separation", 6);
        _difficultyInput = StyledOption();
        foreach (var label in DifficultyLabels) _difficultyInput.AddItem(label);
        _governorInput = StyledOption();
        foreach (var label in GovernorLabels) _governorInput.AddItem(label);
        optionRow.AddChild(_difficultyInput);
        optionRow.AddChild(_governorInput);
        layout.AddChild(optionRow);

        var buttons = new GridContainer { Columns = 3 };
        buttons.AddThemeConstantOverride("h_separation", 6);
        var newWorld = CompactButton("新世界", ResetWorld);
        var save = CompactButton("保存", SaveGame);
        var load = CompactButton("读取", LoadGame);
        foreach (var button in new[] { newWorld, save, load })
        {
            button.SizeFlagsHorizontal = SizeFlags.ExpandFill;
            buttons.AddChild(button);
        }
        layout.AddChild(buttons);
        return panel;
    }

    private void Advance(string actionId)
    {
        var result = _engine.Advance(_state, actionId);
        _lastSpecialTitle = result.SpecialEventTitle;
        var special = string.IsNullOrEmpty(result.SpecialEventTitle) ? "" : $" · {result.SpecialEventTitle}";
        var collapse = result.CivilizationCollapsed ? " · 文明毁灭" : "";
        _status.Text = result.Turn == 0
            ? result.Message
            : $"第 {result.Turn} 年 · {result.EventTitle}{special} · {result.ActionLabel}{collapse} · Rand {result.Rand:0000} · {result.Message}";
        AutoSave();
        RenderState();
    }

    private void ResetWorld()
    {
        var seed = long.TryParse(_seedInput.Text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _state = new GameState(seed)
        {
            RealmName = string.IsNullOrWhiteSpace(_realmInput.Text) ? "长生军" : _realmInput.Text.Trim(),
            Difficulty = Difficulties[(int)_difficultyInput.Selected],
            GovernorId = Governors[(int)_governorInput.Selected]
        };
        _lastSpecialTitle = "";
        _status.Text = $"Seed {_state.Seed} 的第 1 号文明苏醒。";
        SyncSetupInputs();
        AutoSave();
        RenderState();
    }

    private void SaveGame()
    {
        SaveStore.Save(_state, SavePath);
        _status.Text = "游戏已保存。";
    }

    private void AutoSave() => SaveStore.Save(_state, SavePath);

    private void LoadGame()
    {
        var loaded = SaveStore.Load(SavePath);
        if (loaded is null)
        {
            _status.Text = "没有找到存档。";
            return;
        }
        _state = loaded;
        _lastSpecialTitle = "";
        SyncSetupInputs();
        _status.Text = $"已读取第 {_state.Civilization} 号文明，第 {_state.Turn} 年。";
        RenderState();
    }

    private void ClearChronicle()
    {
        _state.Chronicle.Clear();
        _status.Text = "本地纪事显示已清空。";
        AutoSave();
        RenderChronicle();
    }

    private void SyncSetupInputs()
    {
        _realmInput.Text = _state.RealmName;
        _seedInput.Text = _state.Seed.ToString(CultureInfo.InvariantCulture);
        _difficultyInput.Selected = Math.Max(0, Array.IndexOf(Difficulties, _state.Difficulty));
        _governorInput.Selected = Math.Max(0, Array.IndexOf(Governors, _state.GovernorId));
    }

    private void RenderState()
    {
        var difficultyIndex = Math.Max(0, Array.IndexOf(Difficulties, _state.Difficulty));
        var governorIndex = Math.Max(0, Array.IndexOf(Governors, _state.GovernorId));
        _headerRealm.Text = $"{_state.RealmName}｜{DifficultyLabels[difficultyIndex]}｜无地图版";
        _governorName.Text = GovernorLabels[governorIndex];
        LoadGovernorPortrait(governorIndex);
        _headerCivilization.Text = _state.Civilization.ToString(CultureInfo.InvariantCulture);
        _headerTurn.Text = _state.Turn.ToString(CultureInfo.InvariantCulture);
        _headerRand.Text = _state.Turn == 0 ? "0000" : _state.LastRand.ToString("0000", CultureInfo.InvariantCulture);
        _weatherLabel.Text = _state.Turn == 0 ? "等待第一年观测" : $"{_state.LastEvent} / {_state.LastAction}";
        _endingTerminalLabel.Text = _state.EndingStatus;

        _specialTitle.Text = string.IsNullOrEmpty(_lastSpecialTitle)
            ? $"SPEC {(_state.LastSpec == 0 ? "----" : _state.LastSpec.ToString("0000", CultureInfo.InvariantCulture))}｜无特殊事件"
            : $"SPEC {_state.LastSpec:0000}｜{_lastSpecialTitle}";
        _specialText.Text = string.IsNullOrEmpty(_lastSpecialTitle)
            ? "日光之下，并无新事。"
            : "异常信号已写入文明纪事，其影响已经计入本年度结算。";

        SetMetric("science", FormatNumber(_state.Science), ScienceEra(_state.Science), _state.ScienceTrend, _state.Science / 200);
        SetMetric("belief", FormatNumber(_state.Belief), BeliefEra(_state.Belief), _state.BeliefTrend, _state.Belief / 200);
        SetMetric("population", _state.Population.ToString("N0", CultureInfo.InvariantCulture), $"秩序 {_state.Stability}｜{OrderName(_state.Stability)}", 0, Math.Min(100, _state.Population / 1_000.0), "平稳");
        SetMetric("economy", _state.Economy.ToString("N0", CultureInfo.InvariantCulture), _state.Economy <= 0 ? "经济危机｜正向知识冻结" : "预算、产业与粮仓", 0, Math.Min(100, _state.Economy / 1_000.0), "平稳");
        var restartPopulation = EstimateRestartPopulation(_state);
        SetMetric("eerf", $"{_state.EerfLevel}/5", _state.EerfLevel == 0 ? $"尚未修建EERF；下一代初始人口 {restartPopulation:N0}" : $"火种运转中；下一代人口约 {restartPopulation:N0}", 0, _state.EerfLevel * 20, "平稳");
        var cultureRate = Math.Clamp(_state.LiteratureAndArt / 20_000.0 * 50, 0, 50);
        SetMetric("literature", FormatNumber(_state.LiteratureAndArt), $"EERF 线性保存增幅 {cultureRate:0.#}%", 0, _state.LiteratureAndArt / 200, "平稳");

        foreach (var (actionId, button) in _actionButtons)
        {
            var reason = _engine.DisabledReason(_state, actionId);
            button.Disabled = reason is not null;
            button.TooltipText = reason ?? _actionsById[actionId].Description;
            if (_actionReasons.TryGetValue(actionId, out var reasonLabel))
            {
                reasonLabel.Visible = reason is not null;
                reasonLabel.Text = reason ?? "";
            }
        }

        _systemEnding.Text = _state.EndingCandidate is null
            ? _state.EndingStatus
            : $"{_state.EndingCandidate.Id}｜{_state.EndingCandidate.Name}\n可继续发展，或点击“脱离苦海”。";
        _eerfSummary.Text = $"当前等级　{_state.EerfLevel}/5\n毁灭后人口　{restartPopulation:N0}\n当前趋势　SC {_state.ScienceTrend:+0;-0;0}/年 · BE {_state.BeliefTrend:+0;-0;0}/年\n下一代 EERF　{Math.Max(0, _state.EerfLevel - 1)}/5";
        _civilizationHistory.Text = _state.History.Count == 0
            ? "尚无毁灭记录。\n第一份档案会在文明归零时生成。"
            : string.Join("\n", _state.History.Take(3).Select(record => $"第 {record.Civilization} 号文明｜{record.Turns} 年｜{record.CollapseCause}"));
        if (string.IsNullOrEmpty(_status.Text)) _status.Text = $"{_state.RealmName} · 请选择年度决策。";
        RenderChronicle();
    }

    private void SetMetric(string key, string value, string detail, int trend, double meter, string? stage = null)
    {
        _metricValues[key].Text = value;
        _metricDetails[key].Text = detail;
        _metricMeters[key].Value = Math.Clamp(meter, 0, 100);
        _metricTrends[key].Text = $"{trend:+0;-0;0}/年                                      {stage ?? TrendStage(trend)}";
    }

    private void RenderChronicle()
    {
        if (_state.Chronicle.Count == 0)
        {
            _chronicle.Text = "[color=#7f8b99]纪事已经清空。下一年将重新开始记录。[/color]";
            return;
        }
        var entries = _chronicleFilter == "all"
            ? _state.Chronicle
            : _state.Chronicle.Where(entry => entry.Type == _chronicleFilter).ToList();
        if (entries.Count == 0)
        {
            _chronicle.Text = "[color=#7f8b99]当前筛选下没有纪事。[/color]";
            return;
        }
        _chronicle.Text = string.Join(
            "\n\n",
            entries.Take(40).Select(entry =>
            {
                var color = entry.Type switch { "disaster" => "#ff6b6b", "special" => "#ffd166", _ => "#54d8ff" };
                return $"[bgcolor=#0b121c][color={color}][b] {EscapeBbcode(entry.Title)} [/b][/color]\n[color=#c8d2de] {EscapeBbcode(entry.Text)} [/color][/bgcolor]";
            }));
    }

    private void SetChronicleFilter(string filter)
    {
        _chronicleFilter = filter;
        foreach (var (id, button) in _chronicleFilterButtons)
        {
            button.Modulate = id == filter ? Colors.White : new Color(0.58f, 0.62f, 0.68f);
        }
        RenderChronicle();
    }

    private void LoadGovernorPortrait(int index)
    {
        var path = ProjectSettings.GlobalizePath($"res://../assets/{GovernorPortraits[index]}");
        if (!System.IO.File.Exists(path)) return;
        var image = Image.LoadFromFile(path);
        if (image.IsEmpty()) return;
        _governorPortrait.Texture = ImageTexture.CreateFromImage(image);
    }

    private static long EstimateRestartPopulation(GameState state)
    {
        if (state.EerfLevel <= 0) return 2_600;
        double[] rates = [0, 0.045, 0.085, 0.13, 0.19, 0.28];
        var result = 2_600 + state.EerfLevel * 1_450 + Math.Round(state.Population * rates[state.EerfLevel], MidpointRounding.AwayFromZero);
        return (long)Math.Clamp(result, 2_600, 95_000);
    }

    private static string ScienceEra(double value)
    {
        string[] eras = ["石器时代", "农业萌芽", "青铜技术", "古典科学", "机械雏形", "蒸汽时代", "电气时代", "原子时代", "信息时代", "航天时代", "星际文明"];
        return eras[Math.Min(eras.Length - 1, (int)(value / 2_000))];
    }

    private static string BeliefEra(double value)
    {
        string[] eras = ["巫祝萌芽", "祖灵崇拜", "神庙礼制", "经典神学", "普世教会", "经院传统", "宗教改革", "启示时代", "末世信仰", "唯有上帝", "天国王朝"];
        return eras[Math.Min(eras.Length - 1, (int)(value / 2_000))];
    }

    private static string OrderName(int value) => value switch
    {
        < 20 => "无政府",
        < 40 => "城邦割据",
        < 58 => "君主立宪",
        < 80 => "中央集权",
        _ => "严密秩序"
    };

    private static string TrendStage(int value) => value switch
    {
        <= -50 => "衰退",
        < 8 => "停滞",
        < 45 => "萌芽",
        < 90 => "增长",
        _ => "跃迁"
    };

    private static ActionPresentation Presentation(string actionId) => actionId switch
    {
        "science" => new("SC", "S", "我们必须知道；我们必将知道。——希尔伯特，1930年", Science),
        "belief" => new("BE", "B", "万物非主，唯有真主。", Belief),
        "population" => new("POP", "P", "居者有其屋，耕者有其田。", People),
        "economy" => new("EC", "E", "牛奶会有的，面包也会有的。一切都会有的！", Economy),
        "arts" => new("LA", "L", "真正的艺术，是不显得像艺术。", Arts),
        "hibernate" => new("HY", "H", "脱水！脱水！！！", Eerf),
        "balance" => new("EQ", "⇧B", "政治是妥协的艺术。百花齐放，百家争鸣。", Science),
        "suppressBelief" => new("-BE", "1", "陛下，我不需要上帝这个假设。", Danger),
        "order" => new("OR", "Z", "先让街灯亮起来，再争论谁拥有星空。", People),
        "suppressScience" => new("-SC", "2", "不管怎么说，它依然在转动！", Danger),
        "buildEerf" => new("EF", "F", "极端环境抵抗设施在地下开工。", Eerf),
        "upgradeEerf" => new("UP", "U", "更深的门、更厚的隔热层、更长的冬眠协议。", Eerf),
        "recovery" => new("ECO", "O", "我想花几分钟，向人民谈谈银行的情况。", Economy),
        _ => new("—", "", "", Ink)
    };

    private static PanelContainer CreatePanel(Color color, float horizontalMargin, float verticalMargin, Color border, int radius, Color? leftAccent = null, int topBorder = 1)
    {
        var panel = new PanelContainer();
        var style = FlatBox(color, radius, border, 1, horizontalMargin, verticalMargin);
        style.BorderWidthTop = topBorder;
        if (leftAccent.HasValue)
        {
            style.BorderWidthLeft = 4;
            style.BorderColor = leftAccent.Value;
        }
        panel.AddThemeStyleboxOverride("panel", style);
        return panel;
    }

    private static StyleBoxFlat FlatBox(Color color, int radius, Color? border = null, int borderWidth = 0, float horizontalMargin = 0, float verticalMargin = 0)
    {
        var style = new StyleBoxFlat
        {
            BgColor = color,
            CornerRadiusTopLeft = radius,
            CornerRadiusTopRight = radius,
            CornerRadiusBottomLeft = radius,
            CornerRadiusBottomRight = radius,
            ContentMarginLeft = horizontalMargin,
            ContentMarginRight = horizontalMargin,
            ContentMarginTop = verticalMargin,
            ContentMarginBottom = verticalMargin
        };
        if (border.HasValue)
        {
            style.BorderColor = border.Value;
            style.BorderWidthLeft = borderWidth;
            style.BorderWidthRight = borderWidth;
            style.BorderWidthTop = borderWidth;
            style.BorderWidthBottom = borderWidth;
        }
        return style;
    }

    private static StyleBoxFlat ButtonBox(Color color, Color border, int leftWidth)
    {
        var style = FlatBox(color, 6, border, 1);
        style.BorderWidthLeft = leftWidth;
        return style;
    }

    private static Label TextLabel(string text, int size, Color color)
    {
        var label = new Label { Text = text };
        label.AddThemeFontSizeOverride("font_size", size);
        label.AddThemeColorOverride("font_color", color);
        return label;
    }

    private static Label SectionTitle(string text)
    {
        var label = TextLabel(text, 13, new Color(0.78f, 0.84f, 0.91f));
        label.AddThemeConstantOverride("outline_size", 1);
        label.AddThemeColorOverride("font_outline_color", new Color(0, 0, 0, 0.5f));
        return label;
    }

    private static Label InfoBox(string text, Color accent)
    {
        var label = TextLabel(text, 12, new Color(0.82f, 0.86f, 0.91f));
        label.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        label.CustomMinimumSize = new Vector2(0, 58);
        label.AddThemeStyleboxOverride("normal", FlatBox(new Color(0.043f, 0.071f, 0.11f), 5, new Color(accent.R, accent.G, accent.B, 0.3f), 1, 10, 9));
        return label;
    }

    private static Label AddTurnCell(GridContainer grid, string title)
    {
        var panel = CreatePanel(Terminal, 12, 10, new Color(Science.R, Science.G, Science.B, 0.2f), 6);
        panel.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        var copy = new VBoxContainer();
        panel.AddChild(copy);
        copy.AddChild(TextLabel(title, 11, Muted));
        var value = TextLabel("0", 22, Ink);
        copy.AddChild(value);
        grid.AddChild(panel);
        return value;
    }

    private static MarginContainer FillMargin(int horizontal, int vertical)
    {
        var margin = new MarginContainer();
        margin.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        margin.AddThemeConstantOverride("margin_left", horizontal);
        margin.AddThemeConstantOverride("margin_right", horizontal);
        margin.AddThemeConstantOverride("margin_top", vertical);
        margin.AddThemeConstantOverride("margin_bottom", vertical);
        return margin;
    }

    private static Button CompactButton(string text, Action handler)
    {
        var button = new Button { Text = text, CustomMinimumSize = new Vector2(0, 34) };
        button.AddThemeFontSizeOverride("font_size", 12);
        button.AddThemeColorOverride("font_color", Ink);
        button.AddThemeStyleboxOverride("normal", ButtonBox(new Color(0.063f, 0.094f, 0.137f), new Color(Science.R, Science.G, Science.B, 0.2f), 1));
        button.AddThemeStyleboxOverride("hover", ButtonBox(new Color(0.09f, 0.137f, 0.204f), new Color(Science.R, Science.G, Science.B, 0.52f), 1));
        button.Pressed += handler;
        return button;
    }

    private static LineEdit StyledInput(string placeholder, float width)
    {
        var input = new LineEdit { PlaceholderText = placeholder, CustomMinimumSize = new Vector2(width, 34), SizeFlagsHorizontal = SizeFlags.ExpandFill };
        input.AddThemeFontSizeOverride("font_size", 12);
        input.AddThemeColorOverride("font_color", Ink);
        input.AddThemeStyleboxOverride("normal", FlatBox(new Color(0.027f, 0.051f, 0.078f), 4, new Color(Science.R, Science.G, Science.B, 0.2f), 1, 8, 4));
        return input;
    }

    private static OptionButton StyledOption()
    {
        var option = new OptionButton { CustomMinimumSize = new Vector2(0, 34), SizeFlagsHorizontal = SizeFlags.ExpandFill };
        option.AddThemeFontSizeOverride("font_size", 12);
        option.AddThemeColorOverride("font_color", Ink);
        return option;
    }

    private static void IgnoreMouse(Control control)
    {
        control.MouseFilter = MouseFilterEnum.Ignore;
        foreach (var child in control.GetChildren())
        {
            if (child is Control nested) IgnoreMouse(nested);
        }
    }

    private static string EscapeBbcode(string value) => value.Replace("[", "［").Replace("]", "］");

    private static string FormatNumber(double value) => value.ToString(value % 1 == 0 ? "N0" : "N2", CultureInfo.InvariantCulture);

    private void RunVerification()
    {
        var fixturePath = ProjectSettings.GlobalizePath("res://Tests/turn-fixtures.json");
        var report = ParityVerifier.Verify(fixturePath);
        foreach (var error in report.Errors) GD.PushError($"PARITY {error}");
        GD.Print($"PROTOTYPE_PARITY cases={report.CaseCount} status={(report.Passed ? "PASS" : "FAIL")}");
        GetTree().Quit(report.Passed ? 0 : 1);
    }

    private void RunFullVerification(string scenarioPath)
    {
        if (string.IsNullOrWhiteSpace(scenarioPath))
        {
            GD.PushError("FULL_PARITY missing scenario path");
            GetTree().Quit(1);
            return;
        }
        var report = FullParityVerifier.Verify(scenarioPath);
        foreach (var error in report.Errors) GD.PushError($"FULL_PARITY {error}");
        GD.Print($"FULL_PARITY cases={report.CaseCount} status={(report.Passed ? "PASS" : "FAIL")}");
        GetTree().Quit(report.Passed ? 0 : 1);
    }

    private void RunCompleteVerification()
    {
        var report = CompleteGameVerifier.Verify();
        foreach (var error in report.Errors) GD.PushError($"COMPLETE_GAME {error}");
        GD.Print($"COMPLETE_GAME checks={report.CaseCount} status={(report.Passed ? "PASS" : "FAIL")}");
        GetTree().Quit(report.Passed ? 0 : 1);
    }
}
