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

    private const int ActionGridColumns = 4;
    private const float ActionCardSize = 220f;
    private const float ActionGridGap = 10f;
    private const float ActionGridWidth = ActionGridColumns * ActionCardSize + (ActionGridColumns - 1) * ActionGridGap;

    private static readonly string[] Difficulties = ["easy", "normal", "hard", "ultimate"];
    private static readonly string[] Governors = ["east-asian-man", "white-woman", "black-man", "listener"];
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
    private readonly Dictionary<string, Button> _difficultyButtons = new();
    private readonly Dictionary<string, Button> _governorButtons = new();

    private GameState _state = new();
    private EndingStats _endingStats = new();
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
    private Label _specialDelta = null!;
    private Label _status = null!;
    private Label _systemEnding = null!;
    private Label _eerfSummary = null!;
    private Label _civilizationHistory = null!;
    private Label _endingStatsSummary = null!;
    private RichTextLabel _chronicle = null!;
    private ScrollContainer _pageScroll = null!;
    private ScrollContainer _setupScroll = null!;
    private Control _endingOverlay = null!;
    private Label _endingOverlayKicker = null!;
    private Label _endingOverlayTitle = null!;
    private RichTextLabel _endingOverlayBody = null!;
    private Label _endingOverlayQuote = null!;
    private Label _endingOverlayRecap = null!;
    private Control _setupNameStage = null!;
    private Control _setupDifficultyStage = null!;
    private Control _setupGovernorStage = null!;
    private Label _setupRealmPreview = null!;
    private Label _setupStatus = null!;
    private LineEdit _setupRealmInput = null!;
    private LineEdit _setupSeedInput = null!;
    private LineEdit _seedInput = null!;
    private LineEdit _realmInput = null!;
    private OptionButton _difficultyInput = null!;
    private OptionButton _governorInput = null!;
    private string _lastSpecialTitle = "";
    private string _chronicleFilter = "all";
    private int? _previewScroll;
    private string? _screenshotPath;
    private int _screenshotFrames;
    private double _autoRunElapsed;
    private string SavePath => ProjectSettings.GlobalizePath("user://civilization-save.json");
    private string EndingStatsPath => ProjectSettings.GlobalizePath("user://ending-stats.json");

    public override void _Ready()
    {
        var userArgs = OS.GetCmdlineUserArgs();
        var languageIndex = Array.IndexOf(userArgs, "--ui-language");
        if (languageIndex >= 0 && languageIndex + 1 < userArgs.Length && userArgs[languageIndex + 1] is "zh" or "en")
            _state.UiLanguage = userArgs[languageIndex + 1];
        if (_state.UiLanguage == "en" && !_state.SetupComplete && _state.RealmName == "长生军")
            _state.RealmName = "Longevity Army";
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
        _endingStats = EndingStatsStore.Load(EndingStatsPath);
        GetWindow().MinSize = new Vector2I(1024, 720);
        BuildInterface();
        var setupPreviewIndex = Array.IndexOf(userArgs, "--ui-setup-stage");
        if (setupPreviewIndex >= 0 && setupPreviewIndex + 1 < userArgs.Length &&
            userArgs[setupPreviewIndex + 1] is "name" or "difficulty" or "governor")
        {
            _state.SetupStage = userArgs[setupPreviewIndex + 1];
            _state.RealmName = T("长生军", "Longevity Army");
        }
        if (userArgs.Contains("--ui-preview-game"))
        {
            _state.SetupComplete = true;
            _state.SetupStage = "complete";
            _state.RealmName = T("长生军", "Longevity Army");
        }
        var endingPreviewIndex = Array.IndexOf(userArgs, "--ui-preview-ending");
        if (endingPreviewIndex >= 0 && endingPreviewIndex + 1 < userArgs.Length &&
            userArgs[endingPreviewIndex + 1] is "A" or "B" or "C" or "D" or "E" or "F" or "G" or "H" or "I" or "J")
        {
            _state.SetupComplete = true;
            _state.SetupStage = "complete";
            _state.RealmName = T("长生军", "Longevity Army");
            EndingRules.Finish(_state, userArgs[endingPreviewIndex + 1], "UI preview", _state.Snapshot());
        }
        SyncSetupInputs();
        SetChronicleFilter("all");
        RenderState();
        if (userArgs.Contains("--verify-localization"))
        {
            RunUiLocalizationVerification();
            return;
        }
        var previewIndex = Array.IndexOf(userArgs, "--ui-scroll");
        if (previewIndex >= 0 && previewIndex + 1 < userArgs.Length && int.TryParse(userArgs[previewIndex + 1], out var previewScroll))
            _previewScroll = previewScroll;
        var screenshotIndex = Array.IndexOf(userArgs, "--ui-screenshot");
        if (screenshotIndex >= 0 && screenshotIndex + 1 < userArgs.Length)
            _screenshotPath = userArgs[screenshotIndex + 1];
    }

    public override void _Process(double delta)
    {
        if (_state.AutoRunUntilCollapse && !_state.Finished && !_state.AwaitingCivilizationRestart)
        {
            _autoRunElapsed += delta;
            if (_autoRunElapsed >= 0.18)
            {
                _autoRunElapsed = 0;
                Advance("balance");
            }
        }
        else
        {
            _autoRunElapsed = 0;
        }
        if (_previewScroll.HasValue && _pageScroll.Visible) _pageScroll.ScrollVertical = _previewScroll.Value;
        if (_screenshotPath is null || ++_screenshotFrames < 3) return;
        var path = _screenshotPath;
        _screenshotPath = null;
        var error = GetViewport().GetTexture().GetImage().SavePng(path);
        GD.Print($"UI_SCREENSHOT path={path} status={(error == Error.Ok ? "PASS" : error.ToString())}");
        GetTree().Quit(error == Error.Ok ? 0 : 1);
    }

    public override void _UnhandledKeyInput(InputEvent @event)
    {
        if (@event is not InputEventKey { Pressed: true, Echo: false } keyEvent) return;
        if (GetViewport().GuiGetFocusOwner() is LineEdit) return;
        var key = char.ToLowerInvariant((char)keyEvent.Unicode);

        if (keyEvent.ShiftPressed && key == 'l')
        {
            ClearChronicle();
            GetViewport().SetInputAsHandled();
            return;
        }
        if (keyEvent.ShiftPressed && key == 'n')
        {
            ResetWorld();
            GetViewport().SetInputAsHandled();
            return;
        }
        if (!_state.SetupComplete) return;

        var actionId = (key, keyEvent.ShiftPressed) switch
        {
            ('b', true) => "balance",
            ('s', false) => "science",
            ('b', false) => "belief",
            ('p', false) => "population",
            ('z', false) => "order",
            ('1', false) => "suppressBelief",
            ('2', false) => "suppressScience",
            ('h', false) => "hibernate",
            ('l', false) => "arts",
            ('e', false) => "economy",
            ('f', false) => "buildEerf",
            ('u', false) => "upgradeEerf",
            ('o', false) => "recovery",
            ('r', false) => "restartCivilization",
            ('t', false) => "settleEnding",
            _ => null
        };
        if (actionId is null) return;
        Advance(actionId);
        GetViewport().SetInputAsHandled();
    }

    private void BuildInterface()
    {
        RenderingServer.SetDefaultClearColor(Background);
        Theme = BuildTypographyTheme();
        var background = new ColorRect { Color = Background, MouseFilter = MouseFilterEnum.Ignore };
        background.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        AddChild(background);

        _setupScroll = BuildSetupInterface();
        _setupScroll.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        AddChild(_setupScroll);

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
            CustomMinimumSize = new Vector2(980, 0),
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

        _endingOverlay = BuildEndingOverlay();
        _endingOverlay.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        AddChild(_endingOverlay);
    }

    private Control BuildEndingOverlay()
    {
        var overlay = new Control { Visible = false, MouseFilter = MouseFilterEnum.Stop };
        var shade = new ColorRect { Color = new Color(0.008f, 0.014f, 0.024f, 0.97f), MouseFilter = MouseFilterEnum.Ignore };
        shade.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        overlay.AddChild(shade);

        var center = new CenterContainer();
        center.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        overlay.AddChild(center);
        var panel = CreatePanel(Panel, 34, 30, new Color(Science.R, Science.G, Science.B, 0.45f), 8, Science, 2);
        panel.CustomMinimumSize = new Vector2(820, 650);
        center.AddChild(panel);
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 16);
        panel.AddChild(layout);
        _endingOverlayKicker = TextLabel("ENDING A", 13, Science);
        layout.AddChild(_endingOverlayKicker);
        _endingOverlayTitle = TextLabel("—", 42, Ink);
        layout.AddChild(_endingOverlayTitle);
        _endingOverlayBody = new RichTextLabel
        {
            BbcodeEnabled = true,
            FitContent = false,
            CustomMinimumSize = new Vector2(0, 250),
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        _endingOverlayBody.AddThemeFontSizeOverride("normal_font_size", 18);
        _endingOverlayBody.AddThemeColorOverride("default_color", new Color(0.84f, 0.88f, 0.92f));
        layout.AddChild(_endingOverlayBody);
        _endingOverlayQuote = TextLabel("", 16, Belief);
        _endingOverlayQuote.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        _endingOverlayQuote.AddThemeStyleboxOverride("normal", FlatBox(new Color(0.09f, 0.07f, 0.04f), 5, new Color(Belief.R, Belief.G, Belief.B, 0.35f), 1, 16, 12));
        layout.AddChild(_endingOverlayQuote);
        _endingOverlayRecap = TextLabel("", 13, Muted);
        _endingOverlayRecap.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        layout.AddChild(_endingOverlayRecap);
        var buttons = new HBoxContainer { Alignment = BoxContainer.AlignmentMode.End };
        buttons.AddThemeConstantOverride("separation", 10);
        buttons.AddChild(CompactButton(T("复制种子", "Copy Seed"), CopyEndingSeed));
        buttons.AddChild(CompactButton(T("新世界", "New World"), ResetWorld));
        layout.AddChild(buttons);
        return overlay;
    }

    private ScrollContainer BuildSetupInterface()
    {
        var scroll = new ScrollContainer
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill,
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled
        };
        var outer = new MarginContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        outer.AddThemeConstantOverride("margin_left", 24);
        outer.AddThemeConstantOverride("margin_right", 24);
        outer.AddThemeConstantOverride("margin_top", 28);
        outer.AddThemeConstantOverride("margin_bottom", 28);
        scroll.AddChild(outer);

        var page = new HBoxContainer
        {
            CustomMinimumSize = new Vector2(960, 680),
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.Fill,
            Alignment = BoxContainer.AlignmentMode.Center
        };
        page.AddThemeConstantOverride("separation", 42);
        outer.AddChild(page);

        var identity = new VBoxContainer
        {
            CustomMinimumSize = new Vector2(340, 0),
            SizeFlagsHorizontal = SizeFlags.Fill,
            Alignment = BoxContainer.AlignmentMode.Center
        };
        identity.AddThemeConstantOverride("separation", 12);
        var identityHead = new HBoxContainer();
        var identityKicker = TextLabel("CRADLES OF CIVILIZATION", 13, new Color(0.66f, 0.8f, 0.89f));
        identityKicker.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        identityHead.AddChild(identityKicker);
        var language = CompactButton(IsEnglish ? "中文" : "EN", ToggleLanguage);
        language.CustomMinimumSize = new Vector2(70, 34);
        identityHead.AddChild(language);
        identity.AddChild(identityHead);
        identity.AddChild(TextLabel(T("文明摇篮", "CRADLES OF CIVILIZATION"), 56, Ink));
        identity.AddChild(TextLabel(T("原创企划 / Original concept: Noah Walker", "Original concept: Noah Walker"), 12, Muted));
        var quote = TextLabel(T("人类从历史中学到的唯一教训，\n就是人类从未从历史中学到任何教训。", "The only thing we learn from history is\nthat we learn nothing from history."), 17, new Color(0.82f, 0.86f, 0.91f));
        quote.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        identity.AddChild(quote);
        var citation = TextLabel(T("——格奥尔格·威廉·弗里德里希·黑格尔，1837年", "—Georg Wilhelm Friedrich Hegel, 1837"), 13, new Color(0.72f, 0.77f, 0.84f));
        citation.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        identity.AddChild(citation);
        page.AddChild(identity);

        var setupPanel = CreatePanel(PanelSoft, 28, 26, new Color(Science.R, Science.G, Science.B, 0.28f), 8, Science);
        setupPanel.CustomMinimumSize = new Vector2(560, 0);
        setupPanel.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        var setupLayout = new VBoxContainer { SizeFlagsVertical = SizeFlags.Fill };
        setupLayout.AddThemeConstantOverride("separation", 18);
        setupPanel.AddChild(setupLayout);
        setupLayout.AddChild(TextLabel(T("建立文明 // INITIALIZE", "INITIALIZE CIVILIZATION"), 11, Science));
        setupLayout.AddChild(HorizontalRule());

        _setupNameStage = BuildNameStage();
        _setupDifficultyStage = BuildDifficultyStage();
        _setupGovernorStage = BuildGovernorStage();
        setupLayout.AddChild(_setupNameStage);
        setupLayout.AddChild(_setupDifficultyStage);
        setupLayout.AddChild(_setupGovernorStage);
        _setupStatus = TextLabel("", 12, Belief);
        _setupStatus.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        _setupStatus.CustomMinimumSize = new Vector2(0, 28);
        setupLayout.AddChild(_setupStatus);
        page.AddChild(setupPanel);
        return scroll;
    }

    private Control BuildNameStage()
    {
        var layout = SetupStage(T("01 / 国度命名", "01 / NAME THE REALM"), T("你的国度", "Your Realm"), T("一切文明，始于一个被共同记住的名字。", "Every civilization begins with a name remembered in common."));
        _setupRealmInput = StyledInput(T("输入国名", "Enter realm name"), 0);
        _setupRealmInput.MaxLength = 24;
        _setupRealmInput.TextSubmitted += _ => ConfirmSetupName();
        layout.AddChild(_setupRealmInput);
        layout.AddChild(TextLabel(T("世界种子", "World Seed"), 13, Ink));
        var seedRow = new HBoxContainer();
        seedRow.AddThemeConstantOverride("separation", 10);
        _setupSeedInput = StyledInput(T("输入种子，例如 1058", "Enter a seed, e.g. 1058"), 0);
        seedRow.AddChild(_setupSeedInput);
        var random = CompactButton(T("随机世界", "Random World"), RandomizeSetupSeed);
        random.CustomMinimumSize = new Vector2(130, 40);
        seedRow.AddChild(random);
        layout.AddChild(seedRow);
        var note = TextLabel(T("同一种子会生成相同的地块、道路与随机序列。地图将在后续版本接回；当前种子仍决定全部随机序列。", "The same seed produces the same terrain, roads, and random sequence. The map returns in a later version; for now, the seed still controls every random roll."), 11, Muted);
        note.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        layout.AddChild(note);
        layout.AddChild(PrimaryButton(T("确认国名", "Confirm Realm Name"), ConfirmSetupName));
        return layout;
    }

    private Control BuildDifficultyStage()
    {
        var layout = SetupStage(T("02 / 难度选择", "02 / SELECT DIFFICULTY"), T("选择演化压力", "Choose Evolutionary Pressure"), T("当前难度只影响灾变强度；地图与军事参数将在对应系统迁回时恢复。", "Difficulty currently affects disaster intensity only. Map and military parameters return with those systems."));
        _setupRealmPreview = TextLabel(T("无名国度", "Unnamed Realm"), 27, Ink);
        layout.AddChild(_setupRealmPreview);
        var grid = new GridContainer { Columns = 2, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 10);
        grid.AddThemeConstantOverride("v_separation", 10);
        string[] descriptions = IsEnglish
            ?
            [
                "Weaker disasters; suitable for learning the civilization cycle",
                "Standard disaster pressure and civilization pace",
                "More frequent disasters with less room for error",
                "Fully intensified disasters with minimal tolerance"
            ]
            :
        [
            "灾变较弱，适合熟悉文明循环",
            "标准灾变压力与文明节奏",
            "灾变更频繁，容错更低",
            "灾变全面强化，容错极低"
        ];
        for (var i = 0; i < Difficulties.Length; i++)
        {
            var index = i;
            var button = SetupChoiceButton(DifficultyLabel(i), descriptions[i], 92, () => SelectDifficulty(index));
            _difficultyButtons[Difficulties[i]] = button;
            grid.AddChild(button);
        }
        layout.AddChild(grid);
        layout.AddChild(SetupNavigation(T("返回命名", "Back to Name"), BackToName, T("选择执政官", "Choose Governor"), ContinueToGovernor));
        return layout;
    }

    private Control BuildGovernorStage()
    {
        var layout = SetupStage(T("03 / 执政官", "03 / GOVERNOR"), T("选择初始执政官", "Choose the First Governor"), T("人物与数值规则沿用网页版；涉及地图与军事的技能部分暂不生效。", "Characters and numerical rules match the web version. Skills tied to map and military systems are temporarily inactive."));
        var grid = new GridContainer { Columns = 2, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 10);
        grid.AddThemeConstantOverride("v_separation", 10);
        string[] names = IsEnglish
            ? ["Yang Weiping", "Claire Ingrid MacLeod", "Lattel ‘Ram’ Cervantes III", "Trisolaran Listener"]
            :
        [
            "杨卫平",
            "克莱尔·英格丽德·麦克劳德",
            "拉特尔·‘公羊’·塞万提斯三世",
            "三体监听员"
        ];
        string[] captions = IsEnglish
            ?
            [
                "Of Han Chinese heritage.\nHe believes empty talk ruins a nation and practical work makes it prosper.\nHe also believes every invader ultimately meets defeat.",
                "Of Norse-Celtic heritage.\nCertainly, she could be an excellent governor.\nBut she would rather become a Valkyrie.",
                "Of Latin American–African heritage.\nHe has dreams of his own—for example, that colonizers might one day stop plundering his homeland.\nOf course, it is only a dream.",
                "A listener from Trisolaris.\nYou have seen more than enough battles.\nYou think Trisolaris was poorly run; now it is yours to build."
            ]
            :
        [
            "汉人血统。\n他坚信空谈误国，实干兴邦。\n他也坚信：历来强盗要侵入，最终必送命。",
            "维京-凯尔特血统。\n当然，她可以是一位优秀的执政官。\n但她更想成为一位女武神。",
            "拉美-非洲混血。\n他有自己的梦想，比如有一天，殖民者能停止掠夺他的家乡。\n当然，只是个梦想。",
            "三体世界的监听员。\n你已经是身经百战见得多了。\n你觉得三体世界不好，现在，你来建设它。"
        ];
        string[] skills = IsEnglish
            ?
            [
                "People's Lifeline | Positive population growth +8%.",
                "Valkyrie | Positive theology growth +8%.",
                "The Ram's Dream | Positive economic growth +10%.",
                "Listener | Global intelligence effect awaits the map system."
            ]
            :
        [
            "民生防线｜人口正增长 +8%。",
            "女武神｜神学正增长 +8%。",
            "公羊之梦｜经济正增长 +10%。",
            "监听者｜全图情报效果待地图系统迁回。"
        ];
        for (var i = 0; i < Governors.Length; i++)
        {
            var index = i;
            var button = GovernorChoiceButton(index, names[i], captions[i], skills[i], () => SelectGovernor(index));
            _governorButtons[Governors[i]] = button;
            grid.AddChild(button);
        }
        layout.AddChild(grid);
        layout.AddChild(SetupNavigation(T("返回难度", "Back to Difficulty"), BackToDifficulty, T("开始演化", "Begin Evolution"), CompleteSetup));
        return layout;
    }

    private static VBoxContainer SetupStage(string index, string title, string description)
    {
        var layout = new VBoxContainer { SizeFlagsVertical = SizeFlags.Fill };
        layout.AddThemeConstantOverride("separation", 13);
        layout.AddChild(TextLabel(index, 11, Science));
        layout.AddChild(TextLabel(title, 24, Ink));
        var copy = TextLabel(description, 12, Muted);
        copy.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        layout.AddChild(copy);
        return layout;
    }

    private static HSeparator HorizontalRule()
    {
        var rule = new HSeparator();
        rule.AddThemeStyleboxOverride("separator", FlatBox(Line, 0));
        return rule;
    }

    private static Button SetupChoiceButton(string title, string description, float height, Action handler)
    {
        var button = new Button { Text = "", CustomMinimumSize = new Vector2(0, height), SizeFlagsHorizontal = SizeFlags.ExpandFill };
        button.AddThemeStyleboxOverride("normal", ButtonBox(Terminal, new Color(Science.R, Science.G, Science.B, 0.22f), 1));
        button.AddThemeStyleboxOverride("hover", ButtonBox(new Color(0.06f, 0.1f, 0.15f), Science, 3));
        button.AddThemeStyleboxOverride("pressed", ButtonBox(new Color(0.04f, 0.075f, 0.11f), Science, 4));
        button.Pressed += handler;
        var margin = FillMargin(14, 12);
        button.AddChild(margin);
        var copy = new VBoxContainer { Alignment = BoxContainer.AlignmentMode.Center };
        copy.AddThemeConstantOverride("separation", 5);
        copy.AddChild(TextLabel(title, 16, Ink));
        var detail = TextLabel(description, 11, Muted);
        detail.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        copy.AddChild(detail);
        margin.AddChild(copy);
        IgnoreMouse(margin);
        return button;
    }

    private Button GovernorChoiceButton(int index, string name, string caption, string skill, Action handler)
    {
        var button = new Button { Text = "", CustomMinimumSize = new Vector2(0, 270), SizeFlagsHorizontal = SizeFlags.ExpandFill, ClipContents = true };
        button.AddThemeStyleboxOverride("normal", ButtonBox(Terminal, new Color(Science.R, Science.G, Science.B, 0.18f), 1));
        button.AddThemeStyleboxOverride("hover", ButtonBox(new Color(0.06f, 0.1f, 0.15f), Science, 3));
        button.AddThemeStyleboxOverride("pressed", ButtonBox(new Color(0.04f, 0.075f, 0.11f), Science, 4));
        button.Pressed += handler;
        var margin = FillMargin(12, 10);
        button.AddChild(margin);
        var copy = new VBoxContainer();
        copy.AddThemeConstantOverride("separation", 6);
        var portrait = new TextureRect
        {
            Texture = LoadGovernorTexture(index),
            CustomMinimumSize = new Vector2(0, 96),
            ExpandMode = TextureRect.ExpandModeEnum.IgnoreSize,
            StretchMode = TextureRect.StretchModeEnum.KeepAspectCentered
        };
        copy.AddChild(portrait);
        var nameLabel = TextLabel(name, 13, Ink);
        nameLabel.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        nameLabel.HorizontalAlignment = HorizontalAlignment.Center;
        copy.AddChild(nameLabel);
        var captionLabel = TextLabel(caption, 10, Muted);
        captionLabel.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        captionLabel.HorizontalAlignment = HorizontalAlignment.Center;
        copy.AddChild(captionLabel);
        var skillLabel = TextLabel(skill, 10, Belief);
        skillLabel.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        skillLabel.HorizontalAlignment = HorizontalAlignment.Center;
        copy.AddChild(skillLabel);
        margin.AddChild(copy);
        IgnoreMouse(margin);
        return button;
    }

    private static Control SetupNavigation(string backText, Action back, string nextText, Action next)
    {
        var row = new HBoxContainer();
        row.AddThemeConstantOverride("separation", 10);
        var backButton = CompactButton(backText, back);
        backButton.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        backButton.CustomMinimumSize = new Vector2(0, 42);
        var nextButton = PrimaryButton(nextText, next);
        nextButton.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        row.AddChild(backButton);
        row.AddChild(nextButton);
        return row;
    }

    private static Button PrimaryButton(string text, Action handler)
    {
        var button = new Button { Text = text, CustomMinimumSize = new Vector2(0, 44), SizeFlagsHorizontal = SizeFlags.ExpandFill };
        button.AddThemeFontSizeOverride("font_size", 13);
        button.AddThemeColorOverride("font_color", Background);
        button.AddThemeStyleboxOverride("normal", FlatBox(Science, 5, Science, 1, 12, 7));
        button.AddThemeStyleboxOverride("hover", FlatBox(new Color(0.52f, 0.9f, 1f), 5, Colors.White, 1, 12, 7));
        button.AddThemeStyleboxOverride("pressed", FlatBox(new Color(0.26f, 0.72f, 0.88f), 5, Science, 1, 12, 7));
        button.Pressed += handler;
        return button;
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
        var brandHead = new HBoxContainer();
        var brandKicker = TextLabel("CRADLES OF CIVILIZATION", 12, new Color(0.66f, 0.8f, 0.89f));
        brandKicker.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        brandHead.AddChild(brandKicker);
        var language = CompactButton(IsEnglish ? "中文" : "EN", ToggleLanguage);
        language.CustomMinimumSize = new Vector2(70, 30);
        brandHead.AddChild(language);
        brand.AddChild(brandHead);
        var title = TextLabel(T("文明摇篮", "CRADLES OF CIVILIZATION"), 46, Ink);
        title.AddThemeConstantOverride("outline_size", 2);
        title.AddThemeColorOverride("font_outline_color", new Color(0, 0, 0, 0.7f));
        brand.AddChild(title);
        _headerRealm = TextLabel(T("长生军｜普通｜无地图版", "Longevity Army | Normal | Mapless Build"), 12, new Color(0.72f, 0.84f, 0.91f));
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
        governorCopy.AddChild(TextLabel(T("执政官", "GOVERNOR"), 11, Muted));
        _governorName = TextLabel(GovernorLabel(0), 16, Ink);
        governorCopy.AddChild(_governorName);
        governor.AddChild(governorCopy);
        row.AddChild(governor);

        var turnBoard = new GridContainer { Columns = 3, CustomMinimumSize = new Vector2(390, 0) };
        turnBoard.AddThemeConstantOverride("h_separation", 10);
        _headerCivilization = AddTurnCell(turnBoard, T("文明", "CIVILIZATION"));
        _headerTurn = AddTurnCell(turnBoard, T("年份", "YEAR"));
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
        var restart = CreateTerminalButton("restartCivilization", "GOVERNANCE FEED", T("三恒星危机管制台 / 重启文明", "TRISOLAR CRISIS CONTROL / RESTART"), Science, out _weatherLabel);
        var ending = CreateTerminalButton("settleEnding", "ENDING VECTOR", T("终局判定 / 脱离苦海", "ENDING CHECK / SETTLE"), Belief, out _endingTerminalLabel);
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
        var shortcutLabel = TextLabel(actionId == "settleEnding" ? "T" : "R", 10, Muted);
        shortcutLabel.CustomMinimumSize = new Vector2(28, 0);
        shortcutLabel.HorizontalAlignment = HorizontalAlignment.Right;
        head.AddChild(shortcutLabel);
        copy.AddChild(head);
        readout = TextLabel(T("等待第一年观测", "Awaiting the first year's observation"), 21, accent);
        readout.SizeFlagsVertical = SizeFlags.ExpandFill;
        readout.VerticalAlignment = VerticalAlignment.Bottom;
        readout.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        copy.AddChild(readout);
        var reason = TextLabel("", 10, Belief);
        reason.Visible = false;
        reason.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        copy.AddChild(reason);
        _actionReasons[actionId] = reason;
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
        heading.AddChild(TextLabel(T("特殊事件", "SPECIAL EVENT"), 11, Belief));
        _specialTitle = TextLabel(T("SPEC ----｜无特殊事件", "SPEC ---- | NO SPECIAL EVENT"), 16, new Color(1f, 0.97f, 0.87f));
        _specialTitle.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        heading.AddChild(_specialTitle);
        row.AddChild(heading);
        var notice = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        notice.AddThemeConstantOverride("separation", 6);
        _specialText = TextLabel(T("日光之下，并无新事。", "There is nothing new under the sun."), 14, new Color(0.94f, 0.91f, 0.78f));
        _specialText.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        _specialText.VerticalAlignment = VerticalAlignment.Center;
        _specialText.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        notice.AddChild(_specialText);
        _specialDelta = TextLabel("", 11, Ink);
        _specialDelta.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        notice.AddChild(_specialDelta);
        row.AddChild(notice);
        return panel;
    }

    private Control BuildDashboard()
    {
        var panel = CreatePanel(PanelSoft, 14, 14, Line, 8);
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 12);
        panel.AddChild(layout);
        layout.AddChild(SectionTitle(T("状态仪表", "STATUS METERS")));

        var grid = new GridContainer { Columns = 3, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 14);
        grid.AddThemeConstantOverride("v_separation", 14);
        grid.AddChild(CreateMetricCard("science", T("SC 科学", "SC SCIENCE"), Science));
        grid.AddChild(CreateMetricCard("belief", T("BE 神学", "BE THEOLOGY"), Belief));
        grid.AddChild(CreateMetricCard("population", T("POP 人口", "POP POPULATION"), People));
        grid.AddChild(CreateMetricCard("economy", T("ECO 经济", "ECO ECONOMY"), Economy));
        grid.AddChild(CreateMetricCard("eerf", T("EERF 极端环境抵抗设施", "EERF EXTREME ENVIRONMENT RESISTANCE FACILITY"), Eerf));
        grid.AddChild(CreateMetricCard("literature", T("LA 文学艺术", "LA ARTS & LETTERS"), Arts));
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

        var trend = TextLabel(T("0/年                                      平稳", "0/year                                      Stable"), 11, Ink);
        trend.AddThemeStyleboxOverride("normal", FlatBox(new Color(0.02f, 0.033f, 0.05f), 3, new Color(1, 1, 1, 0.05f), 1, 8, 5));
        _metricTrends[key] = trend;
        layout.AddChild(trend);
        return card;
    }

    private Control BuildActionGroups()
    {
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 18);
        layout.AddChild(BuildActionGroup(T("基础操作", "BASIC ACTIONS"), ["science", "belief", "population", "economy", "arts", "hibernate"]));
        layout.AddChild(BuildActionGroup(T("战略干预", "STRATEGIC INTERVENTION"), ["balance", "suppressBelief", "order", "suppressScience"]));
        layout.AddChild(BuildActionGroup(T("特殊设施建设", "SPECIAL FACILITIES"), ["buildEerf", "upgradeEerf", "recovery"]));
        return layout;
    }

    private Control BuildActionGroup(string title, string[] actionIds)
    {
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 10);
        layout.AddChild(SectionTitle(title));
        var grid = new GridContainer
        {
            Columns = ActionGridColumns,
            CustomMinimumSize = new Vector2(ActionGridWidth, 0),
            SizeFlagsHorizontal = SizeFlags.ShrinkCenter
        };
        grid.AddThemeConstantOverride("h_separation", (int)ActionGridGap);
        grid.AddThemeConstantOverride("v_separation", (int)ActionGridGap);
        foreach (var actionId in actionIds) grid.AddChild(CreateActionCard(actionId));
        var fillerCount = (ActionGridColumns - actionIds.Length % ActionGridColumns) % ActionGridColumns;
        for (var i = 0; i < fillerCount; i++)
        {
            grid.AddChild(new Control
            {
                CustomMinimumSize = new Vector2(ActionCardSize, 0),
                MouseFilter = MouseFilterEnum.Ignore
            });
        }
        layout.AddChild(grid);
        return layout;
    }

    private Control CreateActionCard(string actionId)
    {
        var action = _actionsById[actionId];
        var presentation = Presentation(actionId);
        // A plain clipped slot prevents the GridContainer from stretching a card
        // to the wrapped copy's minimum height. The player-facing action surface
        // therefore remains a true square at every supported window size.
        var slot = new Control
        {
            CustomMinimumSize = new Vector2(ActionCardSize, ActionCardSize),
            ClipContents = true,
            MouseFilter = MouseFilterEnum.Ignore
        };
        var button = new Button
        {
            Text = "",
            ClipContents = true,
            TooltipText = ActionTooltip(actionId)
        };
        button.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        slot.AddChild(button);
        button.AddThemeStyleboxOverride("normal", ButtonBox(PanelSoft, new Color(presentation.Accent.R, presentation.Accent.G, presentation.Accent.B, 0.36f), 1));
        button.AddThemeStyleboxOverride("hover", ButtonBox(new Color(0.09f, 0.14f, 0.19f), new Color(presentation.Accent.R, presentation.Accent.G, presentation.Accent.B, 0.75f), 1));
        button.AddThemeStyleboxOverride("pressed", ButtonBox(new Color(0.055f, 0.085f, 0.12f), presentation.Accent, 1));
        button.AddThemeStyleboxOverride("disabled", ButtonBox(new Color(0.047f, 0.067f, 0.09f), new Color(0.12f, 0.16f, 0.21f), 1));
        button.Pressed += () => Advance(actionId);
        _actionButtons[actionId] = button;

        var margin = FillMargin(14, 13);
        button.AddChild(margin);
        var copy = new VBoxContainer();
        copy.AddThemeConstantOverride("separation", 8);
        margin.AddChild(copy);

        var cardHead = new HBoxContainer();
        cardHead.AddThemeConstantOverride("separation", 10);
        var markPanel = CreatePanel(presentation.Accent, 0, 0, presentation.Accent, 4);
        markPanel.CustomMinimumSize = new Vector2(42, 38);
        var mark = TextLabel(presentation.Mark, 11, Background);
        mark.HorizontalAlignment = HorizontalAlignment.Center;
        mark.VerticalAlignment = VerticalAlignment.Center;
        markPanel.AddChild(mark);
        cardHead.AddChild(markPanel);
        cardHead.AddChild(new Control { SizeFlagsHorizontal = SizeFlags.ExpandFill });
        var shortcut = TextLabel(presentation.Shortcut, 10, Muted);
        shortcut.VerticalAlignment = VerticalAlignment.Top;
        cardHead.AddChild(shortcut);
        copy.AddChild(cardHead);

        copy.AddChild(TextLabel(ActionLabel(actionId), 15, Ink));
        var description = TextLabel(presentation.Description, 11, new Color(0.71f, 0.76f, 0.81f));
        description.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        description.SizeFlagsVertical = SizeFlags.ExpandFill;
        copy.AddChild(description);
        var reason = TextLabel("", 10, Belief);
        reason.Visible = false;
        reason.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        copy.AddChild(reason);
        _actionReasons[actionId] = reason;
        IgnoreMouse(margin);
        return slot;
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
        panel.CustomMinimumSize = new Vector2(620, 620);
        panel.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 10);
        panel.AddChild(layout);
        var head = new HBoxContainer();
        var title = SectionTitle(T("编年史", "CHRONICLE"));
        title.SizeFlagsHorizontal = SizeFlags.ExpandFill;
        head.AddChild(title);
        head.AddChild(CompactButton(T("清空", "Clear"), ClearChronicle));
        layout.AddChild(head);
        var filters = new GridContainer { Columns = 4 };
        filters.AddThemeConstantOverride("h_separation", 6);
        foreach (var (id, label) in IsEnglish
                     ? new[] { ("all", "All"), ("disaster", "Disasters"), ("special", "Special"), ("progress", "Progress") }
                     : new[] { ("all", "全部"), ("disaster", "灾变"), ("special", "特殊"), ("progress", "发展") })
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
        panel.CustomMinimumSize = new Vector2(340, 620);
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 12);
        panel.AddChild(layout);
        layout.AddChild(SectionTitle(T("文明系统", "CIVILIZATION SYSTEM")));
        layout.AddChild(TextLabel(T("终局观测", "ENDING WATCH"), 13, Ink));
        _systemEnding = InfoBox(T("文明的旅程尚未停息。", "Civilization's journey continues."), Science);
        layout.AddChild(_systemEnding);
        layout.AddChild(TextLabel(T("EERF 火种预估", "EERF SEEDBANK ESTIMATE"), 13, Ink));
        _eerfSummary = InfoBox(T("当前等级 0/5\n毁灭后人口 2,600\n下一代 EERF 0/5", "Current level 0/5\nPost-collapse population 2,600\nNext-generation EERF 0/5"), Eerf);
        layout.AddChild(_eerfSummary);
        layout.AddChild(TextLabel(T("文明档案", "CIVILIZATION ARCHIVE"), 13, Ink));
        _civilizationHistory = InfoBox(T("尚无毁灭记录。\n第一份档案会在文明归零时生成。", "No collapse has been recorded.\nThe first archive entry is created when a civilization falls."), Muted);
        layout.AddChild(_civilizationHistory);
        layout.AddChild(TextLabel(T("终局统计", "ENDING STATISTICS"), 13, Ink));
        _endingStatsSummary = InfoBox(T("已达成 0/10 种｜总计 0 次｜最近 尚无", "Reached 0/10 endings | Total 0 | Latest none"), Muted);
        layout.AddChild(_endingStatsSummary);
        layout.AddChild(TextLabel(T("世界存档", "WORLD SAVE"), 13, Ink));

        var realmRow = new HBoxContainer();
        realmRow.AddThemeConstantOverride("separation", 6);
        _realmInput = StyledInput(T("国名", "Realm name"), 150);
        _seedInput = StyledInput("Seed", 140);
        realmRow.AddChild(_realmInput);
        realmRow.AddChild(_seedInput);
        layout.AddChild(realmRow);

        var optionRow = new HBoxContainer();
        optionRow.AddThemeConstantOverride("separation", 6);
        _difficultyInput = StyledOption();
        for (var i = 0; i < Difficulties.Length; i++) _difficultyInput.AddItem(DifficultyLabel(i));
        _governorInput = StyledOption();
        for (var i = 0; i < Governors.Length; i++) _governorInput.AddItem(GovernorLabel(i));
        optionRow.AddChild(_difficultyInput);
        optionRow.AddChild(_governorInput);
        layout.AddChild(optionRow);

        var buttons = new GridContainer { Columns = 3 };
        buttons.AddThemeConstantOverride("h_separation", 6);
        var newWorld = CompactButton(T("新世界", "New World"), ResetWorld);
        var save = CompactButton(T("保存", "Save"), SaveGame);
        var load = CompactButton(T("读取", "Load"), LoadGame);
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
        if (!_state.SetupComplete) return;
        var disabledReason = _engine.DisabledReason(_state, actionId);
        if (disabledReason is not null)
        {
            _status.Text = LocalizeCoreText(disabledReason);
            RenderState();
            return;
        }
        var result = _engine.Advance(_state, actionId);
        RecordEndingIfNeeded();
        _lastSpecialTitle = result.SpecialEventTitle;
        var special = string.IsNullOrEmpty(result.SpecialEventTitle) ? "" : $" · {LocalizeEvent(result.SpecialEventTitle)}";
        var collapse = result.CivilizationCollapsed ? T(" · 文明毁灭", " · CIVILIZATION COLLAPSED") : "";
        _status.Text = result.Turn == 0
            ? LocalizeCoreText(result.Message)
            : IsEnglish
                ? $"Year {result.Turn} · {LocalizeEvent(result.EventTitle)}{special} · {LocalizeCoreText(result.ActionLabel)}{collapse} · Rand {result.Rand:0000} · {LocalizeCoreText(result.Message)}"
                : $"第 {result.Turn} 年 · {result.EventTitle}{special} · {result.ActionLabel}{collapse} · Rand {result.Rand:0000} · {result.Message}";
        AutoSave();
        RenderState();
    }

    private void RecordEndingIfNeeded()
    {
        if (!_state.Finished || _state.FinalEnding is null || _state.EndingRecorded) return;
        EndingStatsStore.Record(_endingStats, _state.FinalEnding.Id, EndingStatsPath);
        _state.EndingRecorded = true;
    }

    private void CopyEndingSeed()
    {
        DisplayServer.ClipboardSet(_state.Seed.ToString(CultureInfo.InvariantCulture));
        _endingOverlayRecap.Text = T($"世界种子 {_state.Seed} 已复制。", $"World seed {_state.Seed} copied.");
    }

    private void ResetWorld()
    {
        var seed = long.TryParse(_seedInput.Text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _state = new GameState(seed)
        {
            RealmName = string.IsNullOrWhiteSpace(_realmInput.Text) ? T("长生军", "Longevity Army") : _realmInput.Text.Trim(),
            Difficulty = Difficulties[(int)_difficultyInput.Selected],
            GovernorId = Governors[(int)_governorInput.Selected],
            UiLanguage = _state.UiLanguage,
            SetupComplete = false,
            SetupStage = "name"
        };
        _lastSpecialTitle = "";
        _setupStatus.Text = T("新世界已准备，请重新确认建国信息。", "The new world is ready. Please confirm the founding details again.");
        SyncSetupInputs();
        AutoSave();
        RenderState();
    }

    private void RandomizeSetupSeed()
    {
        var randomized = new GameState(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _setupSeedInput.Text = randomized.Seed.ToString(CultureInfo.InvariantCulture);
        _setupStatus.Text = T($"已生成世界种子 {randomized.Seed}。", $"Generated world seed {randomized.Seed}.");
    }

    private void ConfirmSetupName()
    {
        var realm = _setupRealmInput.Text.Trim();
        if (string.IsNullOrWhiteSpace(realm))
        {
            _setupStatus.Text = T("请先输入国名。", "Enter a realm name first.");
            _setupRealmInput.GrabFocus();
            return;
        }
        var seed = long.TryParse(_setupSeedInput.Text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var difficulty = Difficulties.Contains(_state.Difficulty) ? _state.Difficulty : "normal";
        var governor = Governors.Contains(_state.GovernorId) ? _state.GovernorId : "east-asian-man";
        _state = new GameState(seed)
        {
            RealmName = realm,
            Difficulty = difficulty,
            GovernorId = governor,
            UiLanguage = _state.UiLanguage,
            SetupComplete = false,
            SetupStage = "difficulty"
        };
        _setupStatus.Text = T($"国度“{realm}”已命名。", $"The realm has been named “{realm}”.");
        SyncSetupInputs();
        AutoSave();
        RenderSetup();
    }

    private void SelectDifficulty(int index)
    {
        _state.Difficulty = Difficulties[Math.Clamp(index, 0, Difficulties.Length - 1)];
        _setupStatus.Text = T($"已选择{DifficultyLabel(index)}难度。", $"{DifficultyLabel(index)} difficulty selected.");
        AutoSave();
        RenderSetup();
    }

    private void BackToName()
    {
        _state.SetupStage = "name";
        _setupStatus.Text = T("可以修改国名或世界种子。", "You may change the realm name or world seed.");
        AutoSave();
        RenderSetup();
    }

    private void ContinueToGovernor()
    {
        _state.SetupStage = "governor";
        _setupStatus.Text = T("选择一位初始执政官。", "Choose the first governor.");
        AutoSave();
        RenderSetup();
    }

    private void BackToDifficulty()
    {
        _state.SetupStage = "difficulty";
        _setupStatus.Text = T("可以重新选择演化压力。", "You may choose a different evolutionary pressure.");
        AutoSave();
        RenderSetup();
    }

    private void SelectGovernor(int index)
    {
        _state.GovernorId = Governors[Math.Clamp(index, 0, Governors.Length - 1)];
        _setupStatus.Text = T($"已选择{GovernorLabel(index)}。", $"{GovernorLabel(index)} selected.");
        AutoSave();
        RenderSetup();
    }

    private void CompleteSetup()
    {
        _state.SetupComplete = true;
        _state.SetupStage = "complete";
        _state.Weather = $"{_state.RealmName}开始文明演化";
        _lastSpecialTitle = "";
        _status.Text = T($"{_state.RealmName}建立完成 · 请选择第一年的决策。", $"{_state.RealmName} has been founded · Choose the first year's decision.");
        SyncSetupInputs();
        AutoSave();
        RenderState();
        _pageScroll.ScrollVertical = 0;
    }

    private void SaveGame()
    {
        SaveStore.Save(_state, SavePath);
        _status.Text = T("游戏已保存。", "Game saved.");
    }

    private void AutoSave() => SaveStore.Save(_state, SavePath);

    private void LoadGame()
    {
        var loaded = SaveStore.Load(SavePath);
        if (loaded is null)
        {
            _status.Text = T("没有找到存档。", "No save file was found.");
            return;
        }
        var selectedLanguage = _state.UiLanguage;
        _state = loaded;
        _state.UiLanguage = selectedLanguage;
        _lastSpecialTitle = "";
        RebuildInterface();
        if (_state.SetupComplete)
            _status.Text = T($"已读取第 {_state.Civilization} 号文明，第 {_state.Turn} 年。", $"Loaded Civilization {_state.Civilization}, Year {_state.Turn}.");
        else
            _setupStatus.Text = T("已读取尚未完成的建国流程。", "Loaded an unfinished founding sequence.");
        RenderState();
    }

    private void ClearChronicle()
    {
        _state.Chronicle.Clear();
        _status.Text = T("本地纪事显示已清空。", "The local chronicle display has been cleared.");
        AutoSave();
        RenderChronicle();
    }

    private void SyncSetupInputs()
    {
        _realmInput.Text = _state.RealmName;
        _seedInput.Text = _state.Seed.ToString(CultureInfo.InvariantCulture);
        _setupRealmInput.Text = _state.RealmName;
        _setupSeedInput.Text = _state.Seed.ToString(CultureInfo.InvariantCulture);
        _difficultyInput.Selected = Math.Max(0, Array.IndexOf(Difficulties, _state.Difficulty));
        _governorInput.Selected = Math.Max(0, Array.IndexOf(Governors, _state.GovernorId));
    }

    private void RenderState()
    {
        _setupScroll.Visible = !_state.SetupComplete;
        _pageScroll.Visible = _state.SetupComplete;
        _endingOverlay.Visible = _state.SetupComplete && _state.Finished && _state.FinalEnding is not null;
        if (!_state.SetupComplete)
        {
            RenderSetup();
            return;
        }
        var difficultyIndex = Math.Max(0, Array.IndexOf(Difficulties, _state.Difficulty));
        var governorIndex = Math.Max(0, Array.IndexOf(Governors, _state.GovernorId));
        _headerRealm.Text = T($"{_state.RealmName}｜{DifficultyLabel(difficultyIndex)}｜无地图版", $"{_state.RealmName} | {DifficultyLabel(difficultyIndex)} | Mapless Build");
        _governorName.Text = GovernorLabel(governorIndex);
        LoadGovernorPortrait(governorIndex);
        _headerCivilization.Text = _state.Civilization.ToString(CultureInfo.InvariantCulture);
        _headerTurn.Text = _state.Turn.ToString(CultureInfo.InvariantCulture);
        _headerRand.Text = _state.Turn == 0 ? "0000" : _state.LastRand.ToString("0000", CultureInfo.InvariantCulture);
        _weatherLabel.Text = _state.Turn == 0 ? T("等待第一年观测", "Awaiting the first year's observation") : $"{LocalizeEvent(_state.LastEvent)} / {LocalizeCoreText(_state.LastAction)}";
        _endingTerminalLabel.Text = LocalizeCoreText(_state.EndingStatus);

        _specialTitle.Text = string.IsNullOrEmpty(_state.LastSpecialTitle)
            ? T($"SPEC {(_state.LastSpec == 0 ? "----" : _state.LastSpec.ToString("0000", CultureInfo.InvariantCulture))}｜无特殊事件", $"SPEC {(_state.LastSpec == 0 ? "----" : _state.LastSpec.ToString("0000", CultureInfo.InvariantCulture))} | NO SPECIAL EVENT")
            : T($"{_state.LastSpecialTitle}｜SPEC {_state.LastSpec:0000}", $"{LocalizeEvent(_state.LastSpecialTitle)} | SPEC {_state.LastSpec:0000}");
        _specialText.Text = string.IsNullOrEmpty(_state.LastSpecialTitle)
            ? T("日光之下，并无新事。", "There is nothing new under the sun.")
            : IsEnglish ? _state.LastSpecialTextEn : _state.LastSpecialText;
        _specialDelta.Text = string.IsNullOrEmpty(_state.LastSpecialTitle) ? "" : FormatDelta(_state.LastSpecialDelta);

        SetMetric("science", FormatNumber(_state.Science), ScienceEra(_state.Science), _state.ScienceTrend, _state.Science / 200);
        SetMetric("belief", FormatNumber(_state.Belief), BeliefEra(_state.Belief), _state.BeliefTrend, _state.Belief / 200);
        SetMetric("population", _state.Population.ToString("N0", CultureInfo.InvariantCulture), T($"秩序 {_state.Stability}｜{OrderName(_state.Stability)}", $"Order {_state.Stability} | {OrderName(_state.Stability)}"), 0, Math.Min(100, _state.Population / 1_000.0), T("平稳", "Stable"));
        SetMetric("economy", _state.Economy.ToString("N0", CultureInfo.InvariantCulture), _state.Economy <= 0 ? T("经济危机｜正向知识冻结", "Economic crisis | Positive knowledge frozen") : T("预算、产业与粮仓", "Budget, industry, and granaries"), 0, Math.Min(100, _state.Economy / 1_000.0), T("平稳", "Stable"));
        var restartPopulation = EstimateRestartPopulation(_state);
        SetMetric("eerf", $"{_state.EerfLevel}/5", _state.EerfLevel == 0 ? T($"尚未修建EERF；下一代初始人口 {restartPopulation:N0}", $"EERF not built; next generation starts with {restartPopulation:N0} people") : T($"火种运转中；下一代人口约 {restartPopulation:N0}", $"Seedbank active; next generation population ≈ {restartPopulation:N0}"), 0, _state.EerfLevel * 20, T("平稳", "Stable"));
        var cultureRate = Math.Clamp(_state.LiteratureAndArt / 20_000.0 * 50, 0, 50);
        SetMetric("literature", FormatNumber(_state.LiteratureAndArt), T($"EERF 线性保存增幅 {cultureRate:0.#}%", $"EERF linear retention bonus {cultureRate:0.#}%"), 0, _state.LiteratureAndArt / 200, T("平稳", "Stable"));

        foreach (var (actionId, button) in _actionButtons)
        {
            var reason = _engine.DisabledReason(_state, actionId);
            button.Disabled = reason is not null;
            button.TooltipText = reason is null ? ActionTooltip(actionId) : LocalizeCoreText(reason);
            if (_actionReasons.TryGetValue(actionId, out var reasonLabel))
            {
                reasonLabel.Visible = reason is not null;
                reasonLabel.Text = reason is null ? "" : LocalizeCoreText(reason);
            }
        }

        _systemEnding.Text = BuildEndingWatchText();
        _eerfSummary.Text = T($"当前等级　{_state.EerfLevel}/5\n毁灭后人口　{restartPopulation:N0}\n当前趋势　SC {_state.ScienceTrend:+0;-0;0}/年 · BE {_state.BeliefTrend:+0;-0;0}/年\n下一代 EERF　{Math.Max(0, _state.EerfLevel - 1)}/5", $"Current level  {_state.EerfLevel}/5\nPost-collapse population  {restartPopulation:N0}\nCurrent trends  SC {_state.ScienceTrend:+0;-0;0}/year · BE {_state.BeliefTrend:+0;-0;0}/year\nNext-generation EERF  {Math.Max(0, _state.EerfLevel - 1)}/5");
        _civilizationHistory.Text = _state.History.Count == 0
            ? T("尚无毁灭记录。\n第一份档案会在文明归零时生成。", "No collapse has been recorded.\nThe first archive entry is created when a civilization falls.")
            : string.Join("\n", _state.History.Take(3).Select(record => IsEnglish ? $"Civilization {record.Civilization} | {record.Turns} years | {LocalizeEvent(record.CollapseCause)}" : $"第 {record.Civilization} 号文明｜{record.Turns} 年｜{record.CollapseCause}"));
        RenderEndingStats();
        if (string.IsNullOrEmpty(_status.Text)) _status.Text = T($"{_state.RealmName} · 请选择年度决策。", $"{_state.RealmName} · Choose this year's decision.");
        RenderChronicle();
        RenderEndingOverlay();
    }

    private void RenderEndingStats()
    {
        var validIds = new HashSet<string>(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
        var achieved = _endingStats.Counts.Count(pair => pair.Value > 0 && validIds.Contains(pair.Key));
        var recent = string.IsNullOrEmpty(_endingStats.Recent)
            ? T("尚无", "none")
            : IsEnglish ? EndingCatalog.Get(_endingStats.Recent).NameEn : EndingCatalog.Get(_endingStats.Recent).NameZh;
        var reached = string.Join(" · ", _endingStats.Counts
            .Where(pair => pair.Value > 0 && validIds.Contains(pair.Key))
            .OrderBy(pair => pair.Key)
            .Select(pair => $"{pair.Key} ×{pair.Value}"));
        _endingStatsSummary.Text = IsEnglish
            ? $"Reached {achieved}/10 endings | Total {_endingStats.Total} | Latest {recent}{(string.IsNullOrEmpty(reached) ? "" : $"\n{reached}")}"
            : $"已达成 {achieved}/10 种｜总计 {_endingStats.Total} 次｜最近 {recent}{(string.IsNullOrEmpty(reached) ? "" : $"\n{reached}")}";
    }

    private sealed record EndingWatchItem(string Id, double Progress, List<string> Missing);

    private string BuildEndingWatchText()
    {
        var harmony = CoreRules.KnowledgeHarmony(_state.Science, _state.Belief);
        var collapseCount = _state.History.Count + (_state.AwaitingCivilizationRestart ? 1 : 0);
        (bool Met, double Progress, string Missing) Min(string label, double value, double target)
            => (value >= target, Math.Clamp(value / Math.Max(target, 0.0001), 0, 1), T($"{label} 还差 {Math.Max(0, target - value):N0}", $"{label} needs {Math.Max(0, target - value):N0} more"));
        (bool Met, double Progress, string Missing) Max(string label, double value, double target)
            => (value <= target, value <= target ? 1 : Math.Clamp(target / Math.Max(value, 1), 0, 1), T($"{label} 需降至 {target:N0} 以下", $"{label} must fall to {target:N0} or below"));
        (bool Met, double Progress, string Missing) Single(string primary, double value, string companion, double companionValue)
            => (value >= CoreRules.KnowledgeCap && companionValue < CoreRules.KnowledgeCap,
                companionValue >= CoreRules.KnowledgeCap ? 0.96 : Math.Clamp(value / CoreRules.KnowledgeCap, 0, 1),
                companionValue >= CoreRules.KnowledgeCap ? T($"{companion} 已同步封顶，转入双相判断", $"{companion} is also capped; dual-phase judgment applies") : T($"{primary} 还差 {Math.Max(0, CoreRules.KnowledgeCap - value):N0}", $"{primary} needs {Math.Max(0, CoreRules.KnowledgeCap - value):N0} more"));

        EndingWatchItem Item(string id, params (bool Met, double Progress, string Missing)[] requirements)
            => new(id, requirements.Average(requirement => requirement.Progress), requirements.Where(requirement => !requirement.Met).Select(requirement => requirement.Missing).ToList());

        var items = new List<EndingWatchItem>
        {
            Item("A", Single("SC", _state.Science, "BE", _state.Belief)),
            Item("B", Single("BE", _state.Belief, "SC", _state.Science)),
            Item("D", Min("SC", _state.Science, 16_000), Max("BE", _state.Belief, 8_999), Min("POP", _state.Population, 10_000), Min("ECO", _state.Economy, 95_000)),
            Item("E", Min("BE", _state.Belief, 16_000), Max("SC", _state.Science, 8_999), Min("POP", _state.Population, 10_000), Min(T("秩序", "ORDER"), _state.Stability, 58)),
            Item("F", Min("SC", _state.Science, 14_500), Min("BE", _state.Belief, 14_500), Min(T("均衡度", "HARMONY"), harmony, 0.84)),
            Item("G", Min(T("毁灭次数", "COLLAPSES"), collapseCount, 7)),
            Item("H", Min("SC", _state.Science, 12_500), Max("SC", _state.Science, 15_999), Max("BE", _state.Belief, 7_000), Min(T("秩序", "ORDER"), _state.Stability, 80), Min("POP", _state.Population, 10_000)),
            Item("I", Max(T("当前秩序", "CURRENT ORDER"), _state.Stability, 19), Min(T("低秩序文明连败", "LOW-ORDER STREAK"), _state.LowOrderCivilizationStreak + (_state.Stability < 20 ? 1 : 0), 16)),
            Item("J", Min(T("本代 LA", "CURRENT LA"), _state.LiteratureAndArt, 18_000), Min(T("记忆文明连胜", "MEMORY STREAK"), _state.LaMemoryCivilizationStreak + (_state.CurrentCivilization.HadLaCap || _state.LiteratureAndArt >= 18_000 ? 1 : 0), 3))
        };
        items = items
            .OrderByDescending(item => _state.EndingCandidate?.Id == item.Id)
            .ThenByDescending(item => item.Progress)
            .Take(3)
            .ToList();

        return string.Join("\n\n", items.Select(item =>
        {
            var unlocked = _endingStats.Counts.GetValueOrDefault(item.Id) > 0;
            var name = unlocked ? (IsEnglish ? EndingCatalog.Get(item.Id).NameEn : EndingCatalog.Get(item.Id).NameZh) : "???";
            var detail = item.Missing.Count == 0
                ? T("条件已满足，可结算。", "Conditions met; ready to settle.")
                : T($"还差：{string.Join("；", item.Missing)}", $"Missing: {string.Join("; ", item.Missing)}");
            return $"{item.Id}｜{name}｜{item.Progress:P0}\n{detail}";
        }));
    }

    private void RenderEndingOverlay()
    {
        if (!_endingOverlay.Visible || _state.FinalEnding is null) return;
        var ending = _state.FinalEnding;
        var copy = EndingCatalog.Get(ending.Id);
        _endingOverlayKicker.Text = $"ENDING {ending.Id}";
        _endingOverlayTitle.Text = IsEnglish ? copy.NameEn : copy.NameZh;
        var paragraphs = IsEnglish ? copy.ParagraphsEn : copy.ParagraphsZh;
        _endingOverlayBody.Text = string.Join("\n\n", paragraphs);
        _endingOverlayQuote.Text = IsEnglish ? copy.QuoteEn : copy.QuoteZh;
        _endingOverlayRecap.Text = IsEnglish
            ? $"{_state.RealmName} · Civilization {ending.Civilization} · Year {ending.Turn} · Rand {ending.Rand:0000} · Seed {_state.Seed}"
            : $"{_state.RealmName}｜第 {ending.Civilization} 号文明｜第 {ending.Turn} 年｜Rand {ending.Rand:0000}｜种子 {_state.Seed}";
    }

    private void RenderSetup()
    {
        var stage = _state.SetupStage is "difficulty" or "governor" ? _state.SetupStage : "name";
        _setupNameStage.Visible = stage == "name";
        _setupDifficultyStage.Visible = stage == "difficulty";
        _setupGovernorStage.Visible = stage == "governor";
        _setupRealmPreview.Text = _state.RealmName;
        foreach (var (id, button) in _difficultyButtons)
            button.Modulate = id == _state.Difficulty ? Colors.White : new Color(0.58f, 0.62f, 0.68f);
        foreach (var (id, button) in _governorButtons)
            button.Modulate = id == _state.GovernorId ? Colors.White : new Color(0.58f, 0.62f, 0.68f);
        _setupScroll.ScrollVertical = 0;
    }

    private void SetMetric(string key, string value, string detail, int trend, double meter, string? stage = null)
    {
        _metricValues[key].Text = value;
        _metricDetails[key].Text = detail;
        _metricMeters[key].Value = Math.Clamp(meter, 0, 100);
        _metricTrends[key].Text = IsEnglish
            ? $"{trend:+0;-0;0}/year                                      {stage ?? TrendStage(trend)}"
            : $"{trend:+0;-0;0}/年                                      {stage ?? TrendStage(trend)}";
    }

    private void RenderChronicle()
    {
        if (_state.Chronicle.Count == 0)
        {
            _chronicle.Text = T("[color=#7f8b99][b]编年史空白[/b]\n下一年行动会写入新的记录。[/color]", "[color=#7f8b99][b]The chronicle is blank[/b]\nThe next action will write a new record.[/color]");
            return;
        }
        var entries = _chronicleFilter == "all"
            ? _state.Chronicle
            : _state.Chronicle.Where(entry => entry.Type == _chronicleFilter).ToList();
        if (entries.Count == 0)
        {
            _chronicle.Text = T("[color=#7f8b99][b]没有符合筛选的记录[/b]\n切回全部即可查看完整编年史。[/color]", "[color=#7f8b99][b]No records match this filter[/b]\nSwitch back to All to view the complete chronicle.[/color]");
            return;
        }
        _chronicle.Text = string.Join(
            "\n\n",
            entries.Take(40).Select(entry =>
            {
                var color = entry.Type switch { "disaster" => "#ff6b6b", "special" => "#ffd166", _ => "#54d8ff" };
                var delta = FormatDelta(entry.Delta);
                var deltaLine = string.IsNullOrEmpty(delta) ? "" : $"\n[color=#91a4b8] {EscapeBbcode(delta)} [/color]";
                return $"[bgcolor=#0b121c][color={color}][b] {EscapeBbcode(LocalizeCoreText(entry.Title))} [/b][/color]\n[color=#c8d2de] {EscapeBbcode(LocalizeCoreText(entry.Text))} [/color]{deltaLine}[/bgcolor]";
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
        _governorPortrait.Texture = LoadGovernorTexture(index);
    }

    private static Texture2D? LoadGovernorTexture(int index)
    {
        var path = ProjectSettings.GlobalizePath($"res://../assets/{GovernorPortraits[index]}");
        if (!System.IO.File.Exists(path)) return null;
        var image = Image.LoadFromFile(path);
        return image.IsEmpty() ? null : ImageTexture.CreateFromImage(image);
    }

    private static long EstimateRestartPopulation(GameState state)
    {
        if (state.EerfLevel <= 0) return 2_600;
        double[] rates = [0, 0.045, 0.085, 0.13, 0.19, 0.28];
        var result = 2_600 + state.EerfLevel * 1_450 + Math.Round(state.Population * rates[state.EerfLevel], MidpointRounding.AwayFromZero);
        return (long)Math.Clamp(result, 2_600, 95_000);
    }

    private string ScienceEra(double value)
    {
        string[] eras = IsEnglish
            ? ["Stone Age", "Chalcolithic Age", "Bronze Age", "Iron Age", "Classical Mechanics", "Steam Age", "Electrical Age", "Atomic Age", "Information Age", "Space Age", "Interstellar Age", "Cosmic Engineering Age", "Dyson Sphere Age"]
            : ["石器时代", "铜石并用时代", "青铜时代", "铁器时代", "古典机械时代", "蒸汽时代", "电气时代", "原子时代", "信息时代", "太空时代", "星际航行时代", "宇宙工程时代", "戴森球时代"];
        return eras[Math.Min(eras.Length - 1, CoreRules.EraIndexFor(value))];
    }

    private string BeliefEra(double value)
    {
        string[] eras = IsEnglish
            ? ["Shamanic Beginnings", "Totem Priests", "Ancestral City-States", "Theocratic Law", "Scholastic Theology", "Holy City System", "Canonical Church", "Trinity", "Papal Election", "Nicene Creed", "Inquisition", "God Alone", "Kingdom of Heaven"]
            : ["巫祝萌芽", "图腾祭司", "祖灵城邦", "神权律法", "经院神学", "圣城体系", "正典教会", "三位一体", "教皇选举", "尼西亚信经", "异端审判", "唯有上帝", "天国王朝"];
        return eras[Math.Min(eras.Length - 1, CoreRules.EraIndexFor(value))];
    }

    private string OrderName(int value) => (value, IsEnglish) switch
    {
        (< 20, false) => "无政府", (< 20, true) => "Anarchy",
        (< 40, false) => "城邦割据", (< 40, true) => "Divided City-States",
        (< 58, false) => "君主立宪", (< 58, true) => "Constitutional Monarchy",
        (< 80, false) => "中央集权", (< 80, true) => "Centralized Authority",
        (_, false) => "严密秩序", _ => "Strict Order"
    };

    private string TrendStage(int value) => (value, IsEnglish) switch
    {
        (<= -50, false) => "衰退", (<= -50, true) => "Decline",
        (< 8, false) => "停滞", (< 8, true) => "Stagnant",
        (< 45, false) => "萌芽", (< 45, true) => "Budding",
        (< 90, false) => "增长", (< 90, true) => "Growth",
        (_, false) => "跃迁", _ => "Breakthrough"
    };

    private string FormatDelta(StatDelta delta)
    {
        var parts = new List<string>();
        void Add(string key, double value)
        {
            if (Math.Abs(value) >= 0.0001) parts.Add($"{key} {value:+0.##;-0.##;0}");
        }
        Add("SC", delta.Science);
        Add("BE", delta.Belief);
        Add("LA", delta.LiteratureAndArt);
        Add("POP", delta.Population);
        Add("ECO", delta.Economy);
        Add(IsEnglish ? "ORDER" : "秩序", delta.Stability);
        return string.Join("   ", parts);
    }

    private ActionPresentation Presentation(string actionId) => actionId switch
    {
        "science" => new("SC", "S", ActionQuote(actionId), Science),
        "belief" => new("BE", "B", ActionQuote(actionId), Belief),
        "population" => new("POP", "P", ActionQuote(actionId), People),
        "economy" => new("EC", "E", ActionQuote(actionId), Economy),
        "arts" => new("LA", "L", ActionQuote(actionId), Arts),
        "hibernate" => new("HY", "H", ActionQuote(actionId), Eerf),
        "balance" => new("EQ", "⇧B", ActionQuote(actionId), Science),
        "suppressBelief" => new("-BE", "1", ActionQuote(actionId), Danger),
        "order" => new("OR", "Z", ActionQuote(actionId), People),
        "suppressScience" => new("-SC", "2", ActionQuote(actionId), Danger),
        "buildEerf" => new("EF", "F", ActionQuote(actionId), Eerf),
        "upgradeEerf" => new("UP", "U", ActionQuote(actionId), Eerf),
        "recovery" => new("ECO", "O", ActionQuote(actionId), Economy),
        _ => new("—", "", "", Ink)
    };

    private static Theme BuildTypographyTheme()
    {
        // A single composite font keeps Latin and CJK glyphs on the same
        // nominal size and baseline. Times handles Latin; the Kai families
        // provide macOS and Windows Chinese fallbacks.
        var font = new SystemFont
        {
            FontNames = ["Times New Roman", "Kaiti SC", "STKaiti", "KaiTi", "楷体"]
        };
        return new Theme
        {
            DefaultFont = font,
            DefaultFontSize = 14
        };
    }

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
