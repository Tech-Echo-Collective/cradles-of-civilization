using System;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Godot;

namespace CradlesOfCivilization.Native;

public partial class NativeMain
{
    private async void StartNativeSmokeIfRequested()
    {
        var argument = OS.GetCmdlineUserArgs().FirstOrDefault(value => value.StartsWith("--native-smoke="));
        if (argument == null) return;
        var output = argument["--native-smoke=".Length..];
        try {
            Directory.CreateDirectory(output);
            await Frames(5);
            await Capture("setup");
            ((LineEdit)FindChild("RealmNameInput", true, false)).Text = "长生军";
            ((LineEdit)FindChild("SeedInput", true, false)).Text = "246810";
            var governor = (OptionButton)FindChild("GovernorInput", true, false);
            governor.Select(3);
            ((Button)FindChild("GenerateWorld", true, false)).EmitSignal(Button.SignalName.Pressed);
            await Frames(5);
            if (N.Str(View, "setupStage") != "territory") throw new Exception("Setup button did not generate territory preview");
            await Capture("founding");
            ((Button)FindChild("CompleteSetup", true, false)).EmitSignal(Button.SignalName.Pressed);
            await Frames(5);
            if (!N.Bool(View, "setupComplete")) throw new Exception("Founding button did not establish civilization");
            await NativeMapVerifier.Verify(_map, View, GetTree());
            _map.Relief = true; _map.Layer = "political"; _map.ResetView();
            Navigate("overview"); await Capture("map-relief");
            var layout = GetLayoutDiagnostics();
            File.WriteAllText(Path.Combine(output, "layout.json"), layout.ToJsonString());
            if (N.Num(layout,"topbarHeight") > 120 || N.Num(layout,"mapHeight") < 350
                || N.Num(layout,"timelineBottom") > N.Num(layout,"viewportHeight") + 1)
                throw new Exception("Desktop layout crowded the map or clipped the timeline: " + layout);
            _projectionButton.EmitSignal(Button.SignalName.Pressed); await Capture("map-flat");
            _projectionButton.EmitSignal(Button.SignalName.Pressed);
            foreach (var id in new[] { "development", "governance", "military", "facilities" }) {
                Navigate(id); await Capture(id);
                if (!_navButtons[id].ButtonPressed) throw new Exception("Navigation did not select " + id);
            }
            Navigate("development");
            Execute("science");
            if (N.Num(View, "turn") != 1) throw new Exception("UI decision did not advance one round");
            await Capture("event");
            ShowMetrics(); await Capture("metrics"); CloseModal();
            ShowRecords(); await Capture("records"); CloseModal();
            var fixtures = JsonNode.Parse(GameSession.ReadResource("Tests.native-fixtures.json"))!;
            foreach (var item in N.Items(N.Arr(fixtures, "cases"))) {
                var save = item!["terminalSave"]!;
                var result = _session.Call("importSave", save is JsonValue value && value.TryGetValue<string>(out var raw) ? raw : save.ToJsonString());
                if (!N.Bool(result, "ok")) throw new Exception("UI ending import failed: " + N.Str(result, "reason"));
                _endingDismissed = false; Refresh();
                if (!_ending.Visible || _shell.Visible) throw new Exception("Ending did not replace shell");
                await Capture("ending-" + N.Str(item, "id"));
                var before = _session.ExportStorage();
                FindButton(_ending, "返回").EmitSignal(Button.SignalName.Pressed);
                await Frames(3);
                if (_ending.Visible || !_shell.Visible) throw new Exception("Return from ending failed");
                if (!System.Text.Json.JsonSerializer.Serialize(before).Equals(System.Text.Json.JsonSerializer.Serialize(_session.ExportStorage()))) throw new Exception("Reading ending changed archive");
            }
            File.WriteAllText(Path.Combine(output, "diagnostics.json"), _map.GetDiagnostics().ToJsonString());
            GD.Print("NATIVE UI SMOKE PASSED: actual setup/founding controls, 6 pages, decision/event, metrics/records, 12 ending views, return to map, native map inverse/culling/idle checks.");
            GetTree().Quit(0);
        } catch (Exception error) { GD.PrintErr("NATIVE UI SMOKE FAILED: " + error); GetTree().Quit(1); }
        async Task Frames(int count) { for (var index=0; index<count; index++) await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame); }
        async Task Capture(string name) {
            await Frames(4);
            File.WriteAllText(Path.Combine(output, name + "-layout.json"), GetLayoutDiagnostics().ToJsonString());
            if (DisplayServer.GetName() == "headless") return;
            var texture = GetViewport().GetTexture();
            var picture = texture.GetImage();
            var result = picture.SavePng(Path.Combine(output, name + ".png"));
            if (result != Error.Ok) throw new Exception("Cannot save screenshot: " + result);
        }
    }

    private static Button FindButton(Node parent, string prefix) {
        foreach (var child in parent.GetChildren()) {
            if (child is Button button && button.Text.Contains(prefix)) return button;
            try { return FindButton(child, prefix); } catch (InvalidOperationException) { }
        }
        throw new InvalidOperationException("Missing UI button: " + prefix);
    }
}
