using System;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Godot;

namespace CradlesOfCivilization.Native;

/// <summary>Integration checks against the live, laid-out native map.</summary>
public static class NativeMapVerifier
{
    public static async Task Verify(StrategicMap map, JsonObject view, SceneTree tree)
    {
        var geometry = view["geometry"] as JsonObject ?? throw new InvalidOperationException("Map snapshot has no geometry.");
        var provinces = (geometry["provinces"] as JsonArray)?.OfType<JsonObject>().ToArray()
            ?? throw new InvalidOperationException("Map snapshot has no provinces.");
        Require(provinces.Length == 64, $"Expected 64 provinces; received {provinces.Length}.");
        Require(map.Size.X >= 200 && map.Size.Y >= 200, "Map has not been laid out before verification.");
        map.SetView(view);
        map.ShowLabels = true;
        map.Layer = "political";
        var roundTrips = 0;
        foreach (var relief in new[] { false, true })
        {
            map.Relief = relief;
            map.ResetView();
            await Frames(tree, 2);
            foreach (var province in provinces)
            {
                var id = province["id"]!.GetValue<string>();
                var world = Point(province["center"]);
                var screen = map.ProjectWorld(world);
                Require(new Rect2(Vector2.Zero, map.Size).HasPoint(screen), $"{id} is outside the fitted {Mode(relief)} map.");
                var restored = map.UnprojectScreen(screen);
                Require(world.DistanceTo(restored) < 0.01f, $"Projection inverse differs at {id} in {Mode(relief)}.");
                Require(map.HitTestProvince(screen) == id, $"Polygon selection differs at {id} in {Mode(relief)}.");
                roundTrips++;
            }
            CheckMarkerViewport(map);
        }
        Require(map.HitTestProvince(new Vector2(-50, -50)) == null, "Offscreen position is selectable.");
        var initial = map.GetDiagnostics();
        var fullMarkers = Int(initial, "visibleMarkers");
        Require(Int(initial, "provinceCount") == 64, "Native geometry lost a province.");
        Require(Int(initial, "visibleProvinces") == 64, "Fitted map does not show all provinces.");
        Require(Int(initial, "terrainFeatures") > 0, "Relief did not compile terrain features.");
        Require(Int(initial, "terrainTriangles") > 0, "Relief has no validated terrain triangles.");
        Require(Int(initial, "offscreenPixels") == 0, "Native map allocated an unnecessary offscreen surface.");
        map.Zoom(4);
        await Frames(tree, 2);
        var zoomed = map.GetDiagnostics();
        Require(Number(zoomed, "zoom") > 3.9, "Zoom factor was not applied.");
        Require(Int(zoomed, "visibleMarkers") < fullMarkers, "Zoomed map retained offscreen markers.");
        Require(Int(zoomed, "visibleProvinces") < 64, "Zoomed map did not cull offscreen provinces.");
        CheckMarkerViewport(map);
        var selectedId = view["selectedRegionId"]?.GetValue<string>() ?? "";
        var selected = provinces.FirstOrDefault(p => p["id"]?.GetValue<string>() == selectedId);
        map.FocusSelected();
        await Frames(tree, 2);
        if (selected != null)
        {
            var focused = map.GetDiagnostics(); var center = Point(selected["center"]);
            Require(Math.Abs(Number(focused, "centerX") - center.X) < 0.01
                && Math.Abs(Number(focused, "centerY") - center.Y) < 0.01, "Focus did not center the selected province.");
            Require(map.HitTestProvince(map.ProjectWorld(center)) == selectedId, "Focused province is not selectable.");
        }
        CheckMarkerViewport(map);
        map.Zoom(float.NaN); map.Zoom(0); map.Zoom(-1);
        map.Layer = "military";
        map.ShowLabels = false;
        map.ResetView();
        await Frames(tree, 2);
        Require(Math.Abs(Number(map.GetDiagnostics(), "zoom") - 1) < 0.001, "Reset did not return to fitted zoom.");
        map.Layer = "terrain";
        map.Relief = false;
        await Frames(tree, 2);
        Require(Int(map.GetDiagnostics(), "terrainFeatures") == 0, "Flat view reports relief geometry.");
        map.Relief = true;
        map.Layer = "political";
        map.ShowLabels = true;
        map.ResetView();
        map.QueueRedraw();
        await Frames(tree, 3);
        var idleStart = map.DrawCount;
        await Frames(tree, 20);
        Require(map.DrawCount == idleStart, "Idle native map redraws without changes.");
        GD.Print($"Native map verified: {roundTrips} projection/polygon checks, flat/relief, zoom/focus/reset, viewport culling, 20 idle frames without redraw.");
    }

    private static void CheckMarkerViewport(StrategicMap map)
    {
        var diagnostics = map.GetDiagnostics();
        foreach (var key in new[] { "provincePositions", "armyPositions" })
        {
            foreach (var point in (diagnostics[key] as JsonArray)?.OfType<JsonObject>() ?? Enumerable.Empty<JsonObject>())
            {
                var x = Number(point, "x"); var y = Number(point, "y");
                Require(x >= 0 && y >= 0 && x <= map.Size.X && y <= map.Size.Y,
                    $"{key} contains an offscreen marker {point["id"]}.");
            }
        }
    }
    private static async Task Frames(SceneTree tree, int count)
    {
        for (var frame = 0; frame < count; frame++) await tree.ToSignal(tree, SceneTree.SignalName.ProcessFrame);
    }
    private static Vector2 Point(JsonNode? node)
    {
        if (node is JsonArray array) return new Vector2((float)Number(array[0]), (float)Number(array[1]));
        var point = node as JsonObject;
        return new Vector2((float)Number(point, "x"), (float)Number(point, "y"));
    }
    private static string Mode(bool relief) => relief ? "relief" : "flat";
    private static int Int(JsonObject value, string key) => (int)Number(value, key);
    private static double Number(JsonObject? value, string key) => Number(value?[key]);
    private static double Number(JsonNode? value) => double.Parse(value?.ToJsonString() ?? "0", CultureInfo.InvariantCulture);
    private static void Require(bool condition, string message) { if (!condition) throw new InvalidOperationException(message); }
}
