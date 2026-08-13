using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using CradlesOfCivilization.Core;
using Godot;

namespace CradlesOfCivilization;

public partial class Main : Control
{
    private readonly GameEngine _engine = new();
    private readonly Dictionary<string, Label> _metricValues = new();
    private GameState _state = new();
    private Label _status = null!;
    private LineEdit _seedInput = null!;

    public override void _Ready()
    {
        if (OS.GetCmdlineUserArgs().Contains("--verify-prototype"))
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
        margin.AddThemeConstantOverride("margin_left", 56);
        margin.AddThemeConstantOverride("margin_right", 56);
        margin.AddThemeConstantOverride("margin_top", 42);
        margin.AddThemeConstantOverride("margin_bottom", 42);
        AddChild(margin);

        var page = new VBoxContainer
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            SizeFlagsVertical = SizeFlags.ExpandFill
        };
        page.AddThemeConstantOverride("separation", 18);
        margin.AddChild(page);

        var title = new Label
        {
            Text = "文明摇篮",
            HorizontalAlignment = HorizontalAlignment.Center
        };
        title.AddThemeFontSizeOverride("font_size", 38);
        title.AddThemeColorOverride("font_color", new Color(0.91f, 0.79f, 0.43f));
        page.AddChild(title);

        var subtitle = new Label
        {
            Text = "Godot C# 移植验证 · 确定性种子、普通事件、系统压力与四个核心行动",
            HorizontalAlignment = HorizontalAlignment.Center
        };
        subtitle.AddThemeFontSizeOverride("font_size", 16);
        subtitle.AddThemeColorOverride("font_color", new Color(0.63f, 0.69f, 0.76f));
        page.AddChild(subtitle);

        var metricsPanel = CreatePanel(new Color(0.065f, 0.09f, 0.13f));
        page.AddChild(metricsPanel);
        var metricGrid = new GridContainer { Columns = 7 };
        metricGrid.AddThemeConstantOverride("h_separation", 22);
        metricGrid.AddThemeConstantOverride("v_separation", 8);
        metricsPanel.AddChild(metricGrid);
        AddMetric(metricGrid, "SC", "science");
        AddMetric(metricGrid, "BE", "belief");
        AddMetric(metricGrid, "LA", "literature");
        AddMetric(metricGrid, "POP", "population");
        AddMetric(metricGrid, "ECO", "economy");
        AddMetric(metricGrid, "ORD", "stability");
        AddMetric(metricGrid, "年份", "turn");

        var actionGrid = new GridContainer { Columns = 2 };
        actionGrid.AddThemeConstantOverride("h_separation", 12);
        actionGrid.AddThemeConstantOverride("v_separation", 12);
        page.AddChild(actionGrid);
        foreach (var action in _engine.Actions)
        {
            var actionId = action.Id;
            var button = new Button
            {
                Text = action.Label,
                CustomMinimumSize = new Vector2(0, 52),
                SizeFlagsHorizontal = SizeFlags.ExpandFill
            };
            button.Pressed += () => Advance(actionId);
            actionGrid.AddChild(button);
        }

        _status = new Label
        {
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
            HorizontalAlignment = HorizontalAlignment.Center,
            CustomMinimumSize = new Vector2(0, 54)
        };
        _status.AddThemeFontSizeOverride("font_size", 17);
        _status.AddThemeColorOverride("font_color", new Color(0.76f, 0.82f, 0.88f));
        page.AddChild(_status);

        var resetRow = new HBoxContainer { Alignment = BoxContainer.AlignmentMode.Center };
        resetRow.AddThemeConstantOverride("separation", 10);
        page.AddChild(resetRow);
        resetRow.AddChild(new Label { Text = "Seed" });
        _seedInput = new LineEdit
        {
            Text = GameState.DefaultSeed.ToString(CultureInfo.InvariantCulture),
            CustomMinimumSize = new Vector2(150, 0),
            PlaceholderText = "输入数字种子"
        };
        resetRow.AddChild(_seedInput);
        var resetButton = new Button { Text = "重置世界" };
        resetButton.Pressed += ResetWorld;
        resetRow.AddChild(resetButton);
    }

    private static PanelContainer CreatePanel(Color color)
    {
        var panel = new PanelContainer();
        var style = new StyleBoxFlat
        {
            BgColor = color,
            CornerRadiusTopLeft = 12,
            CornerRadiusTopRight = 12,
            CornerRadiusBottomLeft = 12,
            CornerRadiusBottomRight = 12,
            ContentMarginLeft = 22,
            ContentMarginRight = 22,
            ContentMarginTop = 18,
            ContentMarginBottom = 18
        };
        panel.AddThemeStyleboxOverride("panel", style);
        return panel;
    }

    private void AddMetric(GridContainer grid, string label, string key)
    {
        var column = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        var name = new Label
        {
            Text = label,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        name.AddThemeFontSizeOverride("font_size", 13);
        name.AddThemeColorOverride("font_color", new Color(0.55f, 0.62f, 0.69f));
        var value = new Label
        {
            Text = "—",
            HorizontalAlignment = HorizontalAlignment.Center
        };
        value.AddThemeFontSizeOverride("font_size", 22);
        value.AddThemeColorOverride("font_color", new Color(0.91f, 0.93f, 0.96f));
        column.AddChild(name);
        column.AddChild(value);
        grid.AddChild(column);
        _metricValues[key] = value;
    }

    private void Advance(string actionId)
    {
        var result = _engine.Advance(_state, actionId);
        var locked = result.ActionLocked ? " · 行动受阻" : "";
        _status.Text = $"第 {result.Turn} 年 · {result.EventTitle} · {result.ActionLabel}{locked} · Rand {result.Rand:0000}";
        RenderState();
    }

    private void ResetWorld()
    {
        var seed = long.TryParse(_seedInput.Text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : GameState.DefaultSeed;
        _state.Reset(seed);
        _seedInput.Text = _state.Seed.ToString(CultureInfo.InvariantCulture);
        _status.Text = $"Seed {_state.Seed} 的文明重新苏醒。";
        RenderState();
    }

    private void RenderState()
    {
        _metricValues["science"].Text = FormatNumber(_state.Science);
        _metricValues["belief"].Text = FormatNumber(_state.Belief);
        _metricValues["literature"].Text = FormatNumber(_state.LiteratureAndArt);
        _metricValues["population"].Text = _state.Population.ToString("N0", CultureInfo.InvariantCulture);
        _metricValues["economy"].Text = _state.Economy.ToString("N0", CultureInfo.InvariantCulture);
        _metricValues["stability"].Text = _state.Stability.ToString(CultureInfo.InvariantCulture);
        _metricValues["turn"].Text = _state.Turn.ToString(CultureInfo.InvariantCulture);
        if (string.IsNullOrEmpty(_status.Text))
        {
            _status.Text = $"Seed {_state.Seed} · 请选择第一项行动。";
        }
    }

    private static string FormatNumber(double value)
    {
        return value.ToString(value % 1 == 0 ? "N0" : "N4", CultureInfo.InvariantCulture);
    }

    private void RunVerification()
    {
        var fixturePath = ProjectSettings.GlobalizePath("res://Tests/turn-fixtures.json");
        var report = ParityVerifier.Verify(fixturePath);
        foreach (var error in report.Errors)
        {
            GD.PushError($"PARITY {error}");
        }

        GD.Print($"PROTOTYPE_PARITY cases={report.CaseCount} status={(report.Passed ? "PASS" : "FAIL")}");
        GetTree().Quit(report.Passed ? 0 : 1);
    }
}
