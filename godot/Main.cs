using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using CradlesOfCivilization.Core;
using Godot;

namespace CradlesOfCivilization;

public partial class Main : Control
{
    private static readonly string[] Difficulties = ["easy", "normal", "hard", "ultimate"];
    private static readonly string[] Governors = ["east-asian-man", "white-woman", "black-man", "listener"];
    private readonly GameEngine _engine = new();
    private readonly Dictionary<string, Label> _metricValues = new();
    private readonly Dictionary<string, Button> _actionButtons = new();
    private GameState _state = new();
    private Label _status = null!;
    private Label _endingStatus = null!;
    private Label _trendStatus = null!;
    private RichTextLabel _chronicle = null!;
    private LineEdit _seedInput = null!;
    private LineEdit _realmInput = null!;
    private OptionButton _difficultyInput = null!;
    private OptionButton _governorInput = null!;
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

        BuildInterface();
        RenderState();
    }

    private void BuildInterface()
    {
        var margin = new MarginContainer();
        margin.SetAnchorsAndOffsetsPreset(LayoutPreset.FullRect);
        margin.AddThemeConstantOverride("margin_left", 34);
        margin.AddThemeConstantOverride("margin_right", 34);
        margin.AddThemeConstantOverride("margin_top", 24);
        margin.AddThemeConstantOverride("margin_bottom", 24);
        AddChild(margin);

        var page = new VBoxContainer
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        page.AddThemeConstantOverride("separation", 12);
        margin.AddChild(page);

        var title = new Label { Text = "文明摇篮", HorizontalAlignment = HorizontalAlignment.Center };
        title.AddThemeFontSizeOverride("font_size", 34);
        title.AddThemeColorOverride("font_color", new Color(0.91f, 0.79f, 0.43f));
        page.AddChild(title);

        var subtitle = new Label
        {
            Text = "Godot C# 无地图版 · 完整文明循环",
            HorizontalAlignment = HorizontalAlignment.Center
        };
        subtitle.AddThemeFontSizeOverride("font_size", 14);
        subtitle.AddThemeColorOverride("font_color", new Color(0.63f, 0.69f, 0.76f));
        page.AddChild(subtitle);

        page.AddChild(BuildSetupRow());
        page.AddChild(BuildMetricPanel());

        var content = new HSplitContainer
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        page.AddChild(content);
        content.AddChild(BuildActionArea());
        content.AddChild(BuildChronicleArea());

        _status = new Label
        {
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
            HorizontalAlignment = HorizontalAlignment.Center,
            CustomMinimumSize = new Vector2(0, 42)
        };
        _status.AddThemeFontSizeOverride("font_size", 15);
        _status.AddThemeColorOverride("font_color", new Color(0.76f, 0.82f, 0.88f));
        page.AddChild(_status);
    }

    private Control BuildSetupRow()
    {
        var panel = CreatePanel(new Color(0.05f, 0.07f, 0.10f), 12, 9);
        var row = new HBoxContainer { Alignment = BoxContainer.AlignmentMode.Center };
        row.AddThemeConstantOverride("separation", 8);
        panel.AddChild(row);

        row.AddChild(new Label { Text = "国名" });
        _realmInput = new LineEdit { Text = _state.RealmName, CustomMinimumSize = new Vector2(130, 0) };
        row.AddChild(_realmInput);
        row.AddChild(new Label { Text = "Seed" });
        _seedInput = new LineEdit
        {
            Text = _state.Seed.ToString(CultureInfo.InvariantCulture),
            CustomMinimumSize = new Vector2(110, 0)
        };
        row.AddChild(_seedInput);

        _difficultyInput = new OptionButton { CustomMinimumSize = new Vector2(104, 0) };
        foreach (var label in new[] { "简单", "普通", "困难", "终极" }) _difficultyInput.AddItem(label);
        _difficultyInput.Selected = 1;
        row.AddChild(_difficultyInput);

        _governorInput = new OptionButton { CustomMinimumSize = new Vector2(122, 0) };
        foreach (var label in new[] { "杨卫平", "麦克劳德", "塞万提斯", "监听员" }) _governorInput.AddItem(label);
        row.AddChild(_governorInput);

        row.AddChild(ActionButton("新世界", ResetWorld));
        row.AddChild(ActionButton("保存", SaveGame));
        row.AddChild(ActionButton("读取", LoadGame));
        row.AddChild(ActionButton("清空纪事", ClearChronicle));
        return panel;
    }

    private Control BuildMetricPanel()
    {
        var panel = CreatePanel(new Color(0.065f, 0.09f, 0.13f), 16, 12);
        var layout = new VBoxContainer();
        layout.AddThemeConstantOverride("separation", 8);
        panel.AddChild(layout);

        var metricGrid = new GridContainer { Columns = 9 };
        metricGrid.AddThemeConstantOverride("h_separation", 14);
        layout.AddChild(metricGrid);
        AddMetric(metricGrid, "SC", "science");
        AddMetric(metricGrid, "BE", "belief");
        AddMetric(metricGrid, "LA", "literature");
        AddMetric(metricGrid, "POP", "population");
        AddMetric(metricGrid, "ECO", "economy");
        AddMetric(metricGrid, "ORD", "stability");
        AddMetric(metricGrid, "EERF", "eerf");
        AddMetric(metricGrid, "文明", "civilization");
        AddMetric(metricGrid, "年份", "turn");

        var footer = new HBoxContainer();
        _trendStatus = new Label { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        _trendStatus.AddThemeColorOverride("font_color", new Color(0.62f, 0.71f, 0.80f));
        _endingStatus = new Label
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            HorizontalAlignment = HorizontalAlignment.Right
        };
        _endingStatus.AddThemeColorOverride("font_color", new Color(0.86f, 0.74f, 0.42f));
        footer.AddChild(_trendStatus);
        footer.AddChild(_endingStatus);
        layout.AddChild(footer);
        return panel;
    }

    private Control BuildActionArea()
    {
        var panel = CreatePanel(new Color(0.045f, 0.06f, 0.085f), 16, 14);
        panel.CustomMinimumSize = new Vector2(690, 0);
        var layout = new VBoxContainer { SizeFlagsVertical = SizeFlags.ExpandFill };
        layout.AddThemeConstantOverride("separation", 8);
        panel.AddChild(layout);

        var heading = new Label { Text = "年度决策" };
        heading.AddThemeFontSizeOverride("font_size", 18);
        heading.AddThemeColorOverride("font_color", new Color(0.9f, 0.82f, 0.62f));
        layout.AddChild(heading);

        var scroll = new ScrollContainer
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        layout.AddChild(scroll);
        var grid = new GridContainer { Columns = 3, SizeFlagsHorizontal = SizeFlags.ExpandFill };
        grid.AddThemeConstantOverride("h_separation", 8);
        grid.AddThemeConstantOverride("v_separation", 8);
        scroll.AddChild(grid);

        foreach (var action in _engine.Actions)
        {
            var actionId = action.Id;
            var button = new Button
            {
                Text = action.Label,
                TooltipText = action.Description,
                CustomMinimumSize = new Vector2(0, 46),
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            button.Pressed += () => Advance(actionId);
            grid.AddChild(button);
            _actionButtons[actionId] = button;
        }

        var explanation = new Label
        {
            Text = "结局 D/E/F/G/H 满足后可继续发展，也可“脱离苦海”；A/B/C/I/J 自动结算。",
            AutowrapMode = TextServer.AutowrapMode.WordSmart
        };
        explanation.AddThemeFontSizeOverride("font_size", 12);
        explanation.AddThemeColorOverride("font_color", new Color(0.53f, 0.59f, 0.66f));
        layout.AddChild(explanation);
        return panel;
    }

    private Control BuildChronicleArea()
    {
        var panel = CreatePanel(new Color(0.045f, 0.06f, 0.085f), 16, 14);
        panel.CustomMinimumSize = new Vector2(390, 0);
        var layout = new VBoxContainer { SizeFlagsVertical = SizeFlags.ExpandFill };
        layout.AddThemeConstantOverride("separation", 8);
        panel.AddChild(layout);
        var heading = new Label { Text = "文明纪事" };
        heading.AddThemeFontSizeOverride("font_size", 18);
        heading.AddThemeColorOverride("font_color", new Color(0.9f, 0.82f, 0.62f));
        layout.AddChild(heading);
        _chronicle = new RichTextLabel
        {
            BbcodeEnabled = true,
            FitContent = false,
            ScrollActive = true,
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        _chronicle.AddThemeFontSizeOverride("normal_font_size", 13);
        layout.AddChild(_chronicle);
        return panel;
    }

    private static PanelContainer CreatePanel(Color color, float horizontalMargin, float verticalMargin)
    {
        var panel = new PanelContainer();
        var style = new StyleBoxFlat
        {
            BgColor = color,
            CornerRadiusTopLeft = 10,
            CornerRadiusTopRight = 10,
            CornerRadiusBottomLeft = 10,
            CornerRadiusBottomRight = 10,
            ContentMarginLeft = horizontalMargin,
            ContentMarginRight = horizontalMargin,
            ContentMarginTop = verticalMargin,
            ContentMarginBottom = verticalMargin
        };
        panel.AddThemeStyleboxOverride("panel", style);
        return panel;
    }

    private static Button ActionButton(string text, Action handler)
    {
        var button = new Button { Text = text };
        button.Pressed += handler;
        return button;
    }

    private void AddMetric(GridContainer grid, string label, string key)
    {
        var column = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        var name = new Label { Text = label, HorizontalAlignment = HorizontalAlignment.Center };
        name.AddThemeFontSizeOverride("font_size", 12);
        name.AddThemeColorOverride("font_color", new Color(0.55f, 0.62f, 0.69f));
        var value = new Label { Text = "—", HorizontalAlignment = HorizontalAlignment.Center };
        value.AddThemeFontSizeOverride("font_size", 19);
        value.AddThemeColorOverride("font_color", new Color(0.91f, 0.93f, 0.96f));
        column.AddChild(name);
        column.AddChild(value);
        grid.AddChild(column);
        _metricValues[key] = value;
    }

    private void Advance(string actionId)
    {
        var result = _engine.Advance(_state, actionId);
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
        _seedInput.Text = _state.Seed.ToString(CultureInfo.InvariantCulture);
        _status.Text = $"Seed {_state.Seed} 的第 1 号文明苏醒。";
        AutoSave();
        RenderState();
    }

    private void SaveGame()
    {
        SaveStore.Save(_state, SavePath);
        _status.Text = "游戏已保存。";
    }

    private void AutoSave()
    {
        SaveStore.Save(_state, SavePath);
    }

    private void LoadGame()
    {
        var loaded = SaveStore.Load(SavePath);
        if (loaded is null)
        {
            _status.Text = "没有找到存档。";
            return;
        }

        _state = loaded;
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
        _metricValues["science"].Text = FormatNumber(_state.Science);
        _metricValues["belief"].Text = FormatNumber(_state.Belief);
        _metricValues["literature"].Text = FormatNumber(_state.LiteratureAndArt);
        _metricValues["population"].Text = _state.Population.ToString("N0", CultureInfo.InvariantCulture);
        _metricValues["economy"].Text = _state.Economy.ToString("N0", CultureInfo.InvariantCulture);
        _metricValues["stability"].Text = _state.Stability.ToString(CultureInfo.InvariantCulture);
        _metricValues["eerf"].Text = $"{_state.EerfLevel}/5";
        _metricValues["civilization"].Text = _state.Civilization.ToString(CultureInfo.InvariantCulture);
        _metricValues["turn"].Text = _state.Turn.ToString(CultureInfo.InvariantCulture);
        _trendStatus.Text = $"趋势 SC {_state.ScienceTrend:+0;-0;0} · BE {_state.BeliefTrend:+0;-0;0} · Seed {_state.Seed}";
        _endingStatus.Text = _state.EndingStatus;

        foreach (var (actionId, button) in _actionButtons)
        {
            var reason = _engine.DisabledReason(_state, actionId);
            button.Disabled = reason is not null;
            button.TooltipText = reason ?? _engine.Actions.First(action => action.Id == actionId).Description;
        }

        if (string.IsNullOrEmpty(_status.Text)) _status.Text = $"{_state.RealmName} · 请选择年度决策。";
        RenderChronicle();
    }

    private void RenderChronicle()
    {
        if (_state.Chronicle.Count == 0)
        {
            _chronicle.Text = "[color=#7f8b99]纪事已经清空。下一年将重新开始记录。[/color]";
            return;
        }

        _chronicle.Text = string.Join(
            "\n\n",
            _state.Chronicle.Take(30).Select(entry =>
                $"[color=#d8bd72][b]{EscapeBbcode(entry.Title)}[/b][/color]\n{EscapeBbcode(entry.Text)}"));
    }

    private static string EscapeBbcode(string value) => value.Replace("[", "［").Replace("]", "］");

    private static string FormatNumber(double value)
    {
        return value.ToString(value % 1 == 0 ? "N0" : "N2", CultureInfo.InvariantCulture);
    }

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
