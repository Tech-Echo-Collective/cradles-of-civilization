using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Godot;

namespace CradlesOfCivilization.Native;

/// <summary>
/// Native, event-driven strategic map. The world and military visibility come
/// from the game snapshot; this control never changes the simulation or its RNG.
/// Elevation is a presentation transform, so flat and relief share hit targets.
/// </summary>
public partial class StrategicMap : Control
{
    public event Action<string>? ProvinceSelected;
    public event Action<string>? ArmySelected;
    public int DrawCount { get; private set; }

    private string _layer = "political";
    public string Layer
    {
        get => _layer;
        set { var next = value is "terrain" or "military" ? value : "political";
            if (_layer == next) return; _layer = next; QueueRedraw(); }
    }
    private bool _relief = true;
    public bool Relief
    {
        get => _relief;
        set
        {
            if (_relief == value) return;
            var zoom = _scale / Math.Max(0.001f, _baseScale);
            _relief = value; _baseScale = FitScale(); _scale = _baseScale * zoom;
            Constrain(); ClearHover(); QueueRedraw();
        }
    }
    private bool _showLabels = true;
    public bool ShowLabels
    {
        get => _showLabels;
        set { if (_showLabels == value) return; _showLabels = value; QueueRedraw(); }
    }

    private sealed record Face(Vector2[][] Triangles, Color Color);
    private sealed record Edge(Vector2[] Points, Color Color, float Width);
    private sealed record TerrainFeature(float Bottom, List<Face> Faces, List<Edge> Edges);
    private sealed record Cell(string Id, Vector2[] Points, Vector2[][] PaintPolygons,
        Rect2 Bounds, JsonObject? Province, List<TerrainFeature> Features);
    private sealed record ArmyTarget(string Id, Vector2 Point, JsonObject Army, Color Color);
    private sealed record ProvinceTarget(string Id, Vector2 Point);

    private readonly List<Cell> _cells = new();
    private readonly List<Vector2[]> _land = new();
    private readonly List<Vector2[]> _rivers = new();
    private readonly List<(string A, string B)> _connections = new();
    private readonly Dictionary<string, JsonObject> _provinces = new();
    private readonly Dictionary<string, JsonObject> _regions = new();
    private readonly Dictionary<string, JsonObject> _entities = new();
    private readonly HashSet<string> _available = new();
    private readonly List<JsonObject> _armies = new();
    private readonly List<ArmyTarget> _armyTargets = new();
    private readonly List<ProvinceTarget> _provinceTargets = new();
    private readonly Dictionary<string, Color> _entityColors = new();
    private static readonly string[] EntityPalette = { "#b7955d", "#8384aa", "#b56758", "#a67a4e", "#6c9b91" };
    private static readonly Dictionary<string, Color> TerrainColors = new()
    {
        ["plain"] = C("#bfb38e"), ["basin"] = C("#c5b790"), ["river"] = C("#aeb494"),
        ["coast"] = C("#b3b699"), ["mountain"] = C("#a09b83"), ["canyon"] = C("#ac9b7f"),
        ["tundra"] = C("#b6b8a4"), ["waste"] = C("#baa67f"),
    };
    private string _geometryRevision = "", _geometrySignature = "", _selectedProvince = "", _selectedArmy = "";
    private Rect2 _worldBox = new(0, 0, 1200, 760), _landBounds = new(0, 0, 1200, 760);
    private Vector2 _camera = new(600, 380), _lastSize;
    private float _scale = 1, _baseScale = 1;
    private bool _pressed, _dragged;
    private Vector2 _pressPoint, _lastPoint;
    private int _visibleCells, _featureCount;
    private double _drawMilliseconds;

    public override void _Ready()
    {
        FocusMode = FocusModeEnum.All;
        MouseFilter = MouseFilterEnum.Stop;
        ClipContents = true;
        MouseDefaultCursorShape = CursorShape.Move;
        MouseExited += () => { if (!_pressed) ClearHover(); };
        FocusEntered += QueueRedraw;
        FocusExited += QueueRedraw;
        _lastSize = Size;
        _baseScale = FitScale();
        ResetView();
    }

    public override void _Notification(int what)
    {
        if (what != NotificationResized || Size == _lastSize) return;
        var zoom = _scale / Math.Max(0.001f, _baseScale);
        _lastSize = Size; _baseScale = FitScale(); _scale = _baseScale * zoom;
        Constrain(); QueueRedraw();
    }

    public void SetView(JsonObject view)
    {
        var geometry = Obj(view, "geometry");
        var revision = Str(geometry, "revision", Str(geometry, "signature"));
        if (geometry != null && (revision != _geometryRevision || _cells.Count == 0))
            CompileGeometry(geometry, revision);
        _selectedProvince = Str(view, "selectedRegionId");
        _selectedArmy = Str(view, "selectedArmyId");
        _regions.Clear(); _entities.Clear(); _entityColors.Clear(); _available.Clear(); _armies.Clear();
        foreach (var region in Objects(Arr(view, "regions"))) _regions[Str(region, "id")] = region;
        var entityIndex = 0;
        foreach (var entity in Objects(Arr(view, "entities")))
        {
            var id = Str(entity, "id"); _entities[id] = entity;
            _entityColors[id] = C(Str(entity, "color", EntityPalette[entityIndex++ % EntityPalette.Length]));
        }
        foreach (var id in Arr(view, "availableProvinceIds") ?? new JsonArray())
            if (id != null) _available.Add(id.GetValue<string>());
        // The authoritative engine has already applied military fog.
        _armies.AddRange(Objects(Arr(view, "visibleArmies")).Where(a => Num(a, "force") > 0));
        ClearHover(); QueueRedraw();
    }

    private void CompileGeometry(JsonObject geometry, string revision)
    {
        _geometryRevision = revision; _geometrySignature = Str(geometry, "signature");
        _cells.Clear(); _land.Clear(); _rivers.Clear(); _connections.Clear(); _provinces.Clear();
        var box = Obj(geometry, "viewBox");
        _worldBox = new Rect2((float)Num(box, "x"), (float)Num(box, "y"),
            Math.Max(1, (float)Num(box, "width", 1200)), Math.Max(1, (float)Num(box, "height", 760)));
        foreach (var province in Objects(Arr(geometry, "provinces"))) _provinces[Str(province, "id")] = province;
        var land = Points(Arr(geometry, "landPolygon"));
        if (land.Length >= 3) _land.Add(land);
        else _land.AddRange(ParsePath(Str(geometry, "landPath"), true));
        _landBounds = _land.Count > 0 ? Bounds(_land.SelectMany(p => p).ToArray()) : _worldBox;
        _featureCount = 0;
        foreach (var source in Objects(Arr(geometry, "cells")))
        {
            var points = Points(Arr(source, "points") ?? Arr(source, "polygon"));
            if (points.Length < 3) continue;
            var id = Str(source, "provinceId", Str(source, "id"));
            _provinces.TryGetValue(id, out var province);
            var features = CompileTerrain(province, points);
            _featureCount += features.Count;
            // Fixed, pre-generator saves supply a curved coastline. Clip its
            // rendering once, retaining the snapshot's real movement polygon.
            Vector2[][] paint = new[] { points };
            if (land.Length < 3 && _land.Count > 0)
                paint = _land.SelectMany(outline => Geometry2D.IntersectPolygons(points, outline))
                    .Where(p => p.Length >= 3).ToArray();
            _cells.Add(new Cell(id, points, paint, Bounds(points), province, features));
        }
        foreach (var connection in Objects(Arr(geometry, "connections")))
            _connections.Add((Str(connection, "a"), Str(connection, "b")));
        foreach (var river in Objects(Arr(geometry, "rivers")))
        {
            var riverPoints = Points(Arr(river, "points"));
            if (riverPoints.Length >= 2) _rivers.Add(riverPoints);
            else _rivers.AddRange(ParsePath(Str(river, "path"), false));
        }
        _baseScale = FitScale(); ResetView();
    }

    private Vector2 Origin => new(Size.X / 2, Size.Y / 2 - 5);
    private float Shear => Relief ? 0.18f : 0;
    private float VerticalScale => Relief ? 0.72f : 1;
    private float TopElevation => Relief ? 14 : 0;

    public Vector2 ProjectWorld(Vector2 world, float? elevation = null)
    {
        var local = world - _camera;
        return Origin + new Vector2(local.X + Shear * local.Y,
            VerticalScale * local.Y - (Relief ? elevation ?? TopElevation : 0)) * _scale;
    }

    public Vector2 UnprojectScreen(Vector2 screen)
    {
        var projected = (screen - Origin) / Math.Max(0.001f, _scale);
        var y = (projected.Y + TopElevation) / VerticalScale;
        return _camera + new Vector2(projected.X - Shear * y, y);
    }

    private Vector2 UnprojectDelta(Vector2 screenDelta)
    {
        var y = screenDelta.Y / (_scale * VerticalScale);
        return new Vector2(screenDelta.X / _scale - Shear * y, y);
    }

    private Vector2[] ScreenPolygon(Vector2[] points, float? elevation = null)
        => points.Select(p => ProjectWorld(p, elevation)).ToArray();

    private float FitScale()
    {
        var points = new[] { _landBounds.Position, _landBounds.End,
            new Vector2(_landBounds.End.X, _landBounds.Position.Y),
            new Vector2(_landBounds.Position.X, _landBounds.End.Y) };
        var projected = Bounds(points.Select(p => new Vector2(p.X + Shear * p.Y, p.Y * VerticalScale)).ToArray());
        return Math.Max(0.05f, Math.Min(Math.Max(120, Size.X - 95) / Math.Max(1, projected.Size.X),
            Math.Max(100, Size.Y - 105) / Math.Max(1, projected.Size.Y + (Relief ? 50 : 0))));
    }

    private void Constrain()
    {
        _scale = Math.Clamp(_scale, _baseScale * 0.8f, _baseScale * 5);
        _camera = new Vector2(Math.Clamp(_camera.X, _worldBox.Position.X, _worldBox.End.X),
            Math.Clamp(_camera.Y, _worldBox.Position.Y, _worldBox.End.Y));
    }

    public void Zoom(float factor) => ZoomAt(factor, Origin);
    private void ZoomAt(float factor, Vector2 anchor)
    {
        if (_cells.Count == 0 || !float.IsFinite(factor) || factor <= 0) return;
        var before = UnprojectScreen(anchor);
        _scale = Math.Clamp(_scale * factor, _baseScale * 0.8f, _baseScale * 5);
        _camera += before - UnprojectScreen(anchor);
        Constrain(); ClearHover(); QueueRedraw();
    }

    public void ResetView()
    {
        _camera = _landBounds.GetCenter(); _scale = _baseScale;
        ClearHover(); QueueRedraw();
    }

    public void FocusSelected()
    {
        var selectedArmy = _armies.Find(a => Str(a, "id") == _selectedArmy);
        var id = _selectedProvince.Length > 0 ? _selectedProvince : Str(selectedArmy, "regionId");
        if (!_provinces.TryGetValue(id, out var province)) return;
        _camera = Point(province["center"]); _scale = Math.Max(_scale, _baseScale * 1.6f);
        Constrain(); ClearHover(); QueueRedraw();
    }

    private Rect2 ViewportWorldBounds() => Bounds(new[] {
        UnprojectScreen(new Vector2(-35, -35)), UnprojectScreen(new Vector2(Size.X + 35, -35)),
        UnprojectScreen(Size + new Vector2(35, 35)), UnprojectScreen(new Vector2(-35, Size.Y + 35)) });
    private bool InViewport(Vector2 p, float padding = 20) => p.X >= -padding && p.Y >= -padding
        && p.X <= Size.X + padding && p.Y <= Size.Y + padding;

    public override void _Draw()
    {
        var clock = Stopwatch.StartNew();
        DrawCount++;
        for (var band = 0; band < 18; band++)
            DrawRect(new Rect2(0, band * Size.Y / 18, Size.X, Size.Y / 18 + 1),
                C("#344841").Lerp(C("#253a36"), band / 17f));
        _armyTargets.Clear(); _provinceTargets.Clear();
        if (_cells.Count == 0 || Size.X < 2 || Size.Y < 2)
        {
            DrawString(GetThemeFont("font"), Origin - new Vector2(80, 0), "正在展开世界地图…",
                fontSize: 16, modulate: C("#dbcca6"));
            _drawMilliseconds = clock.Elapsed.TotalMilliseconds;
            return;
        }
        var viewport = ViewportWorldBounds();
        var visible = _cells.Where(c => c.Bounds.Intersects(viewport, true)).ToArray();
        _visibleCells = visible.Length;
        PaintLand();
        foreach (var cell in visible)
        {
            var terrain = Str(cell.Province, "terrain", "plain");
            var fill = TerrainColors.GetValueOrDefault(terrain, TerrainColors["plain"]);
            foreach (var polygon in cell.PaintPolygons) DrawColoredPolygon(ScreenPolygon(polygon), fill);
        }
        foreach (var cell in visible.OrderBy(c => c.Bounds.End.Y)) PaintTerrain(cell);
        foreach (var river in _rivers)
        {
            var screen = ScreenPolygon(river);
            DrawPolyline(screen, C("#e1d2a6ae"), 4, true);
            DrawPolyline(screen, C("#6b8d838c"), 1.8f, true);
        }
        PaintOwnership(visible);
        PaintRoads();
        PaintSelections(visible);
        PaintMarkers(visible);
        PaintCompass();
        DrawRect(new Rect2(Vector2.Zero, Size), C(HasFocus() ? "#d9bd748f" : "#96805670"), false, HasFocus() ? 2 : 1);
        _drawMilliseconds = clock.Elapsed.TotalMilliseconds;
    }

    private void PaintLand()
    {
        if (Relief)
        {
            foreach (var land in _land)
            {
                var floor = ScreenPolygon(land, 0);
                DrawColoredPolygon(floor.Select(p => p + new Vector2(6, 8)).ToArray(), C("#152d2970"));
                DrawColoredPolygon(floor, C("#2a3830"));
                var sides = land.Select((a, i) => (A: a, B: land[(i + 1) % land.Length]))
                    .OrderBy(side => side.A.Y + side.B.Y);
                foreach (var side in sides)
                    DrawPrimitive(new[] { ProjectWorld(side.A, 0), ProjectWorld(side.B, 0),
                        ProjectWorld(side.B), ProjectWorld(side.A) }, new[] {
                        side.B.X + Shear * side.B.Y > side.A.X + Shear * side.A.Y ? C("#8a7b59") : C("#625d46") },
                        Array.Empty<Vector2>());
            }
        }
        foreach (var land in _land)
        {
            var screen = ScreenPolygon(land);
            Outline(screen, C("#cfc39425"), 9); Outline(screen, C("#ccb98670"), 3);
            DrawColoredPolygon(screen, C("#bcb18b"));
        }
    }

    private void PaintTerrain(Cell cell)
    {
        if (Relief)
        {
            foreach (var feature in cell.Features)
            {
                foreach (var face in feature.Faces)
                    foreach (var triangle in face.Triangles)
                    {
                        var screen = ScreenPolygon(triangle);
                        if (Math.Abs(Cross(screen[1] - screen[0], screen[2] - screen[0])) <= 0.0001f) continue;
                        // Triangulation and degeneracy checks happen once when
                        // geometry is compiled, never in the render server.
                        DrawPrimitive(screen, new[] { face.Color }, Array.Empty<Vector2>());
                    }
                foreach (var edge in feature.Edges)
                    DrawPolyline(ScreenPolygon(edge.Points), edge.Color, edge.Width, true);
            }
        }
        else if (Str(cell.Province, "terrain") is "mountain" or "canyon")
        {
            var center = Point(cell.Province?["center"]);
            for (var index = 0; index < 3; index++)
            {
                var p = center + new Vector2((index - 1) * 17, (index % 2) * 9);
                var line = new[] { p + new Vector2(-10, 8), p + new Vector2(0, -12), p + new Vector2(11, 8) };
                if (line.All(x => Inside(x, cell.Points))) DrawPolyline(ScreenPolygon(line), C("#675d4060"), 0.85f, true);
            }
        }
    }

    private Color EntityColor(string id) => _entityColors.GetValueOrDefault(id, C("#655850"));
    private void PaintOwnership(Cell[] visible)
    {
        var selectedArmy = _armies.Find(a => Str(a, "id") == _selectedArmy);
        foreach (var cell in visible)
        {
            _regions.TryGetValue(cell.Id, out var region);
            var owner = Str(region, "controllerId");
            var tint = EntityColor(owner);
            tint.A = Layer == "military" ? (owner == Str(selectedArmy, "entityId") ? 0.37f : 0.19f) : 0.31f;
            foreach (var polygon in cell.PaintPolygons)
            {
                var screen = ScreenPolygon(polygon);
                if (Layer != "terrain") DrawColoredPolygon(screen, tint);
                Outline(screen, C("#5c593774"), 0.65f);
            }
        }
        foreach (var land in _land) Outline(ScreenPolygon(land), C("#7b704e"), 0.7f);
    }

    private void PaintRoads()
    {
        var army = _armies.Find(a => Str(a, "id") == _selectedArmy);
        foreach (var road in _connections)
        {
            if (!_provinces.TryGetValue(road.A, out var a) || !_provinces.TryGetValue(road.B, out var b)) continue;
            var start = ProjectWorld(Point(a["center"])); var end = ProjectWorld(Point(b["center"]));
            if (!Bounds(new[] { start, end }).Intersects(new Rect2(-20, -20, Size.X + 40, Size.Y + 40), true)) continue;
            DrawDashedLine(start, end, C("#56472e68"), 0.8f, 4, true);
            if (army == null) continue;
            var source = Str(army, "regionId");
            var target = road.A == source ? road.B : road.B == source ? road.A : "";
            if (_available.Contains(target)) DrawLine(start, end, C("#efd191"), 2, true);
        }
    }

    private void PaintSelections(Cell[] visible)
    {
        foreach (var cell in visible)
            foreach (var polygon in cell.PaintPolygons)
            {
                var screen = ScreenPolygon(polygon);
                if (_available.Contains(cell.Id)) Outline(screen, C("#d9bd748f"), 1.5f);
                if (cell.Id != _selectedProvince) continue;
                DrawColoredPolygon(screen, C("#fff0b921"));
                Outline(screen, C("#4d3d25b0"), 4); Outline(screen, C("#ffe4a0"), 2);
            }
    }

    private void PaintMarkers(Cell[] visible)
    {
        var occupied = new List<Rect2>();
        var stacks = new Dictionary<string, int>();
        foreach (var army in _armies)
        {
            var regionId = Str(army, "regionId");
            if (!_provinces.TryGetValue(regionId, out var province)) continue;
            var stack = stacks.GetValueOrDefault(regionId); stacks[regionId] = stack + 1;
            var anchor = ProjectWorld(Point(province["center"]));
            var position = anchor + new Vector2((stack % 3) * 23, -18 - (stack / 3) * 29);
            if (!InViewport(position, 0)) continue;
            _armyTargets.Add(new ArmyTarget(Str(army, "id"), position, army, EntityColor(Str(army, "entityId"))));
            occupied.Add(new Rect2(position - new Vector2(19, 18), new Vector2(38, 38)));
        }
        var font = GetThemeFont("font");
        foreach (var cell in visible.OrderByDescending(c => c.Id == _selectedProvince))
        {
            if (cell.Province == null) continue;
            var point = ProjectWorld(Point(cell.Province["label"] ?? cell.Province["center"]));
            if (!InViewport(point, 0)) continue;
            _provinceTargets.Add(new ProvinceTarget(cell.Id, point));
            var selected = cell.Id == _selectedProvince;
            DrawCircle(point, selected ? 3.2f : 1.8f, C("#645032"));
            if (!ShowLabels) continue;
            _regions.TryGetValue(cell.Id, out var region);
            var text = Label(region ?? cell.Province);
            var fontSize = selected ? 12 : 10;
            var width = font.GetStringSize(text, fontSize: fontSize).X;
            var candidates = new[] { point + new Vector2(-width / 2, 15),
                point + new Vector2(-width / 2, -9), point + new Vector2(7, 4) };
            foreach (var candidate in candidates)
            {
                var rect = new Rect2(candidate - new Vector2(3, 12), new Vector2(width + 6, 16));
                if (rect.Position.X < 4 || rect.End.X > Size.X - 4 || rect.Position.Y < 0 || rect.End.Y > Size.Y
                    || occupied.Any(other => other.Intersects(rect, true))) continue;
                occupied.Add(rect);
                DrawStringOutline(font, candidate, text, fontSize: fontSize, size: 3, modulate: C("#c6ba93ed"));
                DrawString(font, candidate, text, fontSize: fontSize, modulate: C(selected ? "#3d3525" : "#4d4735"));
                break;
            }
        }
        foreach (var target in _armyTargets)
        {
            var selected = target.Id == _selectedArmy;
            var p = target.Point;
            var shield = new[] { p + new Vector2(-13, -14), p + new Vector2(13, -14),
                p + new Vector2(11, 7), p + new Vector2(0, 15), p + new Vector2(-11, 7) };
            DrawColoredPolygon(shield, C(selected ? "#263a2b" : "#354238"));
            Outline(shield, selected ? C("#ffe1a0") : target.Color, selected ? 2 : 1.4f);
            DrawLine(p + new Vector2(-4, -9), p + new Vector2(4, -2), C("#dbc595"), 1.1f, true);
            DrawLine(p + new Vector2(4, -9), p + new Vector2(-4, -2), C("#dbc595"), 1.1f, true);
            var force = CompactForce(Num(target.Army, "force"));
            var width = font.GetStringSize(force, fontSize: 8).X;
            DrawString(font, p + new Vector2(-width / 2, 8), force, fontSize: 8, modulate: C("#f0dfb8"));
        }
    }

    private void PaintCompass()
    {
        var center = new Vector2(42, Size.Y - 50);
        var north = new Vector2(-Shear, -VerticalScale).Normalized();
        var east = new Vector2(-north.Y, north.X);
        DrawArc(center, 16, 0, Mathf.Tau, 40, C("#bfaf7b80"), 0.8f, true);
        DrawColoredPolygon(new[] { center + north * 24, center - north * 7 + east * 5,
            center - north * 3, center - north * 7 - east * 5 }, C("#d0bc8a"));
        DrawString(GetThemeFont("font"), center + north * 30 - new Vector2(3, 0), "N", fontSize: 9, modulate: C("#d0bc8a"));
    }

    private void Outline(Vector2[] points, Color color, float width)
    {
        if (points.Length < 2) return;
        var closed = new Vector2[points.Length + 1]; Array.Copy(points, closed, points.Length);
        closed[^1] = points[0]; DrawPolyline(closed, color, width, true);
    }

    public string? HitTestProvince(Vector2 screen)
    {
        if (!new Rect2(Vector2.Zero, Size).HasPoint(screen)) return null;
        var world = UnprojectScreen(screen);
        return _cells.FirstOrDefault(c => c.Bounds.Grow(0.001f).HasPoint(world) && Inside(world, c.Points))?.Id;
    }
    private ArmyTarget? HitArmy(Vector2 point) => _armyTargets.LastOrDefault(a =>
        Math.Abs(a.Point.X - point.X) <= 17 && Math.Abs(a.Point.Y - point.Y) <= 18);

    public override void _GuiInput(InputEvent input)
    {
        if (input is InputEventMouseButton button)
        {
            if (button.Pressed && button.ButtonIndex is MouseButton.WheelUp or MouseButton.WheelDown)
            {
                ZoomAt(button.ButtonIndex == MouseButton.WheelUp ? 1.15f : 1 / 1.15f, button.Position);
                AcceptEvent(); return;
            }
            if (button.ButtonIndex != MouseButton.Left) return;
            if (button.Pressed)
            {
                GrabFocus(); _pressed = true; _dragged = false; _pressPoint = _lastPoint = button.Position;
                MouseDefaultCursorShape = CursorShape.Drag; TooltipText = "";
            }
            else if (_pressed)
            {
                _pressed = false;
                if (!_dragged)
                {
                    var army = HitArmy(button.Position);
                    if (army != null) ArmySelected?.Invoke(army.Id);
                    else { var province = HitTestProvince(button.Position); if (province != null) ProvinceSelected?.Invoke(province); }
                }
                MouseDefaultCursorShape = CursorShape.Move;
            }
            AcceptEvent(); return;
        }
        if (input is InputEventMouseMotion motion)
        {
            if (_pressed)
            {
                if (motion.Position.DistanceTo(_pressPoint) > 4) _dragged = true;
                if (_dragged) { _camera -= UnprojectDelta(motion.Position - _lastPoint); Constrain(); QueueRedraw(); }
                _lastPoint = motion.Position;
            }
            else
            {
                var army = HitArmy(motion.Position);
                var provinceId = army == null ? HitTestProvince(motion.Position) : null;
                MouseDefaultCursorShape = army != null || provinceId != null ? CursorShape.PointingHand : CursorShape.Move;
                if (army != null)
                {
                    _entities.TryGetValue(Str(army.Army, "entityId"), out var entity);
                    TooltipText = $"{Label(army.Army)}\n{Label(entity)} · {CompactForce(Num(army.Army, "force"))}";
                }
                else if (provinceId != null)
                {
                    _regions.TryGetValue(provinceId, out var region);
                    _provinces.TryGetValue(provinceId, out var province);
                    _entities.TryGetValue(Str(region, "controllerId"), out var entity);
                    TooltipText = $"{Label(region ?? province)}\n{Label(entity)} · {Num(region, "fortification")} 工事";
                }
                else TooltipText = "";
            }
            AcceptEvent(); return;
        }
        if (input is not InputEventKey key || !key.Pressed) return;
        var code = key.Keycode;
        var delta = code switch { Key.Left => new Vector2(-60, 0), Key.Right => new Vector2(60, 0),
            Key.Up => new Vector2(0, -60), Key.Down => new Vector2(0, 60), _ => Vector2.Zero };
        if (delta != Vector2.Zero) { _camera += UnprojectDelta(delta); Constrain(); ClearHover(); QueueRedraw(); }
        else if (code is Key.Plus or Key.Equal or Key.KpAdd) Zoom(1.2f);
        else if (code is Key.Minus or Key.KpSubtract) Zoom(1 / 1.2f);
        else if (code is Key.Home or Key.Key0) ResetView();
        else if (code == Key.F) FocusSelected();
        else return;
        AcceptEvent();
    }

    private void ClearHover() { TooltipText = ""; if (!_pressed) MouseDefaultCursorShape = CursorShape.Move; }

    public JsonObject GetDiagnostics()
    {
        var provincePositions = new JsonArray();
        foreach (var target in _provinceTargets) provincePositions.Add(new JsonObject { ["id"] = target.Id, ["x"] = target.Point.X, ["y"] = target.Point.Y });
        var armyPositions = new JsonArray();
        foreach (var target in _armyTargets) armyPositions.Add(new JsonObject { ["id"] = target.Id, ["x"] = target.Point.X, ["y"] = target.Point.Y });
        return new JsonObject {
            ["renderer"] = "Godot native CanvasItem", ["projection"] = Relief ? "relief" : "flat",
            ["drawCount"] = DrawCount, ["drawMs"] = Math.Round(_drawMilliseconds, 2),
            ["viewportPixels"] = (long)Math.Ceiling(Size.X * Size.Y), ["offscreenPixels"] = 0,
            ["visibleMarkers"] = _provinceTargets.Count + _armyTargets.Count,
            ["totalMarkers"] = _cells.Count + _armies.Count, ["visibleProvinces"] = _visibleCells,
            ["provinceCount"] = _cells.Count, ["terrainFeatures"] = Relief ? _featureCount : 0,
            ["terrainTriangles"] = Relief ? _cells.Sum(cell => cell.Features.Sum(feature => feature.Faces.Sum(face => face.Triangles.Length))) : 0,
            ["geometryRevision"] = _geometryRevision, ["geometrySignature"] = _geometrySignature,
            ["zoom"] = _scale / Math.Max(0.001f, _baseScale), ["centerX"] = _camera.X, ["centerY"] = _camera.Y,
            ["provincePositions"] = provincePositions, ["armyPositions"] = armyPositions,
        };
    }

    private static List<TerrainFeature> CompileTerrain(JsonObject? province, Vector2[] clip)
    {
        var result = new List<TerrainFeature>();
        if (province == null) return result;
        var center = Point(province["center"]); var terrain = Str(province, "terrain");
        var key = $"{Str(province, "id")}:{center.X.ToString(CultureInfo.InvariantCulture)}:{center.Y.ToString(CultureInfo.InvariantCulture)}:{terrain}";
        float Sample(int index) => Hash($"{key}:{index}") / 4294967296f;
        var kind = terrain == "mountain" ? "mountain" : terrain == "canyon" ? "canyon" : "hill";
        var count = terrain == "mountain" ? 3 + (int)(Sample(0) * 2)
            : terrain == "canyon" ? 3 : terrain is "plain" or "basin" ? (int)(Sample(0) * 3)
            : terrain is "river" or "coast" or "tundra" or "waste" ? (int)(Sample(0) * 2) : 0;
        for (var index = 0; index < count; index++)
        {
            var offset = index * 7 + 1;
            var p = center + new Vector2((index - (count - 1) / 2f) * 21 + (Sample(offset) - 0.5f) * 8,
                (Sample(offset + 1) - 0.5f) * 24);
            var width = (kind == "hill" ? 18 : 20) + Sample(offset + 2) * 10;
            var depth = (kind == "hill" ? 8 : 12) + Sample(offset + 3) * 8;
            var height = kind == "mountain" ? 14 + Sample(offset + 4) * 12
                : kind == "canyon" ? 5 + Sample(offset + 4) * 5 : 3 + Sample(offset + 4) * 4;
            var faces = new List<Face>(); var edges = new List<Edge>();
            Vector2 At(float x, float y) => p + new Vector2(x * width, y * depth);
            Vector2 Lift(Vector2 point, float z) => point + new Vector2(0.18f * z / 0.72f, -z / 0.72f);
            void Face(string color, params Vector2[] polygon)
            {
                var triangles = SafeTriangles(ClipConvex(polygon, clip));
                if (triangles.Length > 0) faces.Add(new Face(triangles, C(color)));
            }
            void Edge(string color, float weight, params Vector2[] points)
            {
                for (var i = 0; i < points.Length - 1; i++)
                {
                    var line = ClipLine(points[i], points[i + 1], clip);
                    if (line != null && line[0].DistanceSquaredTo(line[1]) > 0.000001f)
                        edges.Add(new Edge(line, C(color), weight));
                }
            }
            if (kind == "canyon")
            {
                var bank = new[] { At(-0.5f, -0.24f), At(-0.18f, -0.4f), At(0.08f, -0.18f), At(0.32f, -0.32f), At(0.5f, -0.12f) };
                var front = bank.Select((point, i) => point + new Vector2(i % 2 == 1 ? 1.3f : -0.8f, depth * 0.48f)).ToArray();
                var backFloor = bank.Select(point => Lift(point, -height * 0.4f)).ToArray();
                var frontFloor = front.Select(point => Lift(point, -height * 0.24f)).ToArray();
                Face("#71604a", bank.Concat(front.AsEnumerable().Reverse()).ToArray());
                Face("#5d513f", backFloor.Concat(frontFloor.AsEnumerable().Reverse()).ToArray());
                Face("#c3ad83", bank.Concat(backFloor.AsEnumerable().Reverse()).ToArray());
                Face("#8a7153", frontFloor.Concat(front.AsEnumerable().Reverse()).ToArray());
                Edge("#ded0a16e", 0.7f, bank); Edge("#5a4c36a8", 0.6f, front);
            }
            else
            {
                var north = At(-0.06f, -0.5f); var east = At(0.5f, 0);
                var south = At(0.04f, 0.5f); var west = At(-0.5f, 0);
                var summit = Lift(At(kind == "hill" ? -0.04f : -0.1f, -0.04f), height);
                Face("#5b503125", At(-0.32f, 0.24f), At(0.12f, -0.02f), At(0.69f, 0.32f), At(0.48f, 0.72f), At(-0.17f, 0.62f));
                var colors = kind == "mountain" ? new[] { "#c6bea0", "#a59f8a", "#797963", "#b9ae88" }
                    : new[] { "#cbbf93", "#b7ac83", "#968e6d", "#beb38c" };
                Face(colors[0], west, north, summit); Face(colors[1], north, east, summit);
                Face(colors[2], east, south, summit); Face(colors[3], south, west, summit);
                if (kind == "mountain" && height > 18)
                {
                    Vector2 Cap(Vector2 point) => summit.Lerp(point, 0.24f);
                    Face("#c7c8b9", summit, Cap(east), Cap(south)); Face("#e0deca", summit, Cap(south), Cap(west));
                    Edge("#ece7ca7a", 0.55f, Cap(west), summit, Cap(east));
                }
                Edge(kind == "mountain" ? "#dfd6ab88" : "#d8ca9b50", 0.65f, west, summit);
                Edge(kind == "mountain" ? "#68664faa" : "#83795b64", 0.65f, summit, south, east);
            }
            if (faces.Count > 0 || edges.Count > 0) result.Add(new TerrainFeature(p.Y + depth / 2, faces, edges));
        }
        return result.OrderBy(feature => feature.Bottom).ToList();
    }

    private static Vector2[] ClipConvex(Vector2[] polygon, Vector2[] clip)
    {
        var output = polygon.ToList(); var sign = Math.Sign(SignedArea(clip));
        if (sign == 0) return Array.Empty<Vector2>();
        for (var i = 0; i < clip.Length && output.Count > 0; i++)
        {
            var a = clip[i]; var b = clip[(i + 1) % clip.Length];
            var input = output; output = new List<Vector2>(); var previous = input[^1];
            var previousDistance = Cross(b - a, previous - a) * sign;
            foreach (var current in input)
            {
                var distance = Cross(b - a, current - a) * sign;
                if ((distance >= 0) != (previousDistance >= 0))
                    output.Add(previous.Lerp(current, previousDistance / (previousDistance - distance)));
                if (distance >= 0) output.Add(current);
                previous = current; previousDistance = distance;
            }
        }
        return output.ToArray();
    }

    /// <summary>
    /// Convex clipping may repeat intersection vertices or leave tiny edges.
    /// Clean those once and triangulate in stable double precision relative to
    /// an origin. Invalid or self-crossing decorations are discarded rather
    /// than handing malformed polygons to Godot's frame-time triangulator.
    /// </summary>
    private static Vector2[][] SafeTriangles(Vector2[] source)
    {
        const double epsilon = 0.00001;
        var polygon = new List<Vector2>();
        foreach (var point in source)
        {
            if (!float.IsFinite(point.X) || !float.IsFinite(point.Y)) return Array.Empty<Vector2[]>();
            if (polygon.All(previous => previous.DistanceSquaredTo(point) > 0.000001f)) polygon.Add(point);
        }
        if (polygon.Count < 3) return Array.Empty<Vector2[]>();
        static double Turn(Vector2 a, Vector2 b, Vector2 c) =>
            ((double)b.X - a.X) * ((double)c.Y - a.Y) - ((double)b.Y - a.Y) * ((double)c.X - a.X);
        var removed = true;
        while (removed && polygon.Count >= 3)
        {
            removed = false;
            for (var i = 0; i < polygon.Count; i++)
            {
                var previous = polygon[(i + polygon.Count - 1) % polygon.Count];
                var next = polygon[(i + 1) % polygon.Count];
                if (Math.Abs(Turn(previous, polygon[i], next)) > epsilon) continue;
                polygon.RemoveAt(i); removed = true; break;
            }
        }
        if (polygon.Count < 3) return Array.Empty<Vector2[]>();
        for (var i = 0; i < polygon.Count; i++)
            for (var j = i + 1; j < polygon.Count; j++)
            {
                var nextI = (i + 1) % polygon.Count; var nextJ = (j + 1) % polygon.Count;
                if (i == nextJ || j == nextI) continue;
                var a = polygon[i]; var b = polygon[nextI]; var c = polygon[j]; var d = polygon[nextJ];
                if (Turn(a, b, c) * Turn(a, b, d) < -epsilon && Turn(c, d, a) * Turn(c, d, b) < -epsilon)
                    return Array.Empty<Vector2[]>();
            }
        var area = 0d;
        for (var i = 1; i < polygon.Count - 1; i++) area += Turn(polygon[0], polygon[i], polygon[i + 1]);
        if (Math.Abs(area) <= 0.0001) return Array.Empty<Vector2[]>();
        if (area < 0) polygon.Reverse();
        var triangles = new List<Vector2[]>();
        while (polygon.Count > 3)
        {
            var found = false;
            for (var i = 0; i < polygon.Count; i++)
            {
                var previousIndex = (i + polygon.Count - 1) % polygon.Count; var nextIndex = (i + 1) % polygon.Count;
                var a = polygon[previousIndex]; var b = polygon[i]; var c = polygon[nextIndex];
                if (Turn(a, b, c) <= epsilon) continue;
                var occupied = false;
                for (var j = 0; j < polygon.Count; j++)
                {
                    if (j == previousIndex || j == i || j == nextIndex) continue;
                    var p = polygon[j];
                    if (Turn(a, b, p) >= -epsilon && Turn(b, c, p) >= -epsilon && Turn(c, a, p) >= -epsilon)
                    { occupied = true; break; }
                }
                if (occupied) continue;
                triangles.Add(new[] { a, b, c }); polygon.RemoveAt(i); found = true; break;
            }
            if (!found) return Array.Empty<Vector2[]>();
        }
        if (Turn(polygon[0], polygon[1], polygon[2]) > epsilon) triangles.Add(polygon.ToArray());
        return triangles.ToArray();
    }

    private static Vector2[]? ClipLine(Vector2 from, Vector2 to, Vector2[] polygon)
    {
        var sign = Math.Sign(SignedArea(polygon)); var minimum = 0f; var maximum = 1f;
        for (var i = 0; i < polygon.Length; i++)
        {
            var a = polygon[i]; var b = polygon[(i + 1) % polygon.Length];
            var start = Cross(b - a, from - a) * sign; var end = Cross(b - a, to - a) * sign;
            if (start < 0 && end < 0) return null;
            if ((start < 0) == (end < 0)) continue;
            var ratio = start / (start - end);
            if (start < 0) minimum = Math.Max(minimum, ratio); else maximum = Math.Min(maximum, ratio);
        }
        return minimum <= maximum ? new[] { from.Lerp(to, minimum), from.Lerp(to, maximum) } : null;
    }

    private static float Cross(Vector2 a, Vector2 b) => a.X * b.Y - a.Y * b.X;
    private static float SignedArea(Vector2[] polygon) => polygon.Select((p, i) => Cross(p, polygon[(i + 1) % polygon.Length])).Sum() / 2;
    private static bool Inside(Vector2 point, Vector2[] polygon)
    {
        var inside = false;
        for (int i = 0, j = polygon.Length - 1; i < polygon.Length; j = i++)
        {
            var a = polygon[i]; var b = polygon[j];
            if ((a.Y > point.Y) != (b.Y > point.Y) && point.X < (b.X - a.X) * (point.Y - a.Y) / (b.Y - a.Y) + a.X) inside = !inside;
        }
        return inside;
    }
    private static Rect2 Bounds(Vector2[] points)
    {
        if (points.Length == 0) return new Rect2();
        var min = points[0]; var max = points[0];
        foreach (var p in points) { min = min.Min(p); max = max.Max(p); }
        return new Rect2(min, max - min);
    }

    // The bundled geography uses only M/L/C/Q/Z. Flattening those small paths
    // once supports original saved maps without raster assets or a browser.
    private static List<Vector2[]> ParsePath(string path, bool closed)
    {
        var result = new List<Vector2[]>();
        var tokens = Regex.Matches(path, "[MLCQZmlcqz]|[-+]?(?:[0-9]*\\.)?[0-9]+(?:[eE][-+]?[0-9]+)?")
            .Select(match => match.Value).ToArray();
        var points = new List<Vector2>(); var position = Vector2.Zero; var start = Vector2.Zero;
        var index = 0; var command = 'M';
        bool IsCommand(string text) => text.Length == 1 && char.IsLetter(text[0]);
        float Number() => float.Parse(tokens[index++], CultureInfo.InvariantCulture);
        Vector2 Read() => new(Number(), Number());
        void Finish()
        {
            var clean = new List<Vector2>();
            foreach (var p in points)
                if (clean.Count == 0 || clean[^1].DistanceSquaredTo(p) > 0.000001f) clean.Add(p);
            if (closed && clean.Count > 1 && clean[0].DistanceSquaredTo(clean[^1]) <= 0.000001f) clean.RemoveAt(clean.Count - 1);
            if (clean.Count >= (closed ? 3 : 2)) result.Add(clean.ToArray());
            points = new List<Vector2>();
        }
        while (index < tokens.Length)
        {
            if (IsCommand(tokens[index])) command = tokens[index++][0];
            var relative = char.IsLower(command); var kind = char.ToUpperInvariant(command);
            if (kind == 'Z') { position = start; Finish(); command = 'M'; continue; }
            var count = kind == 'C' ? 6 : kind == 'Q' ? 4 : 2;
            if (index + count > tokens.Length || IsCommand(tokens[index])) break;
            var a = Read(); if (relative) a += position;
            if (kind == 'M') { Finish(); position = start = a; points.Add(a); command = relative ? 'l' : 'L'; }
            else if (kind == 'L') { position = a; points.Add(a); }
            else if (kind == 'C')
            {
                var b = Read(); var end = Read(); if (relative) { b += position; end += position; }
                var origin = position;
                for (var step = 1; step <= 14; step++)
                {
                    var t = step / 14f; var u = 1 - t;
                    points.Add(u * u * u * origin + 3 * u * u * t * a + 3 * u * t * t * b + t * t * t * end);
                }
                position = end;
            }
            else if (kind == 'Q')
            {
                var end = Read(); if (relative) end += position; var origin = position;
                for (var step = 1; step <= 12; step++) { var t = step / 12f; var u = 1 - t; points.Add(u * u * origin + 2 * u * t * a + t * t * end); }
                position = end;
            }
        }
        Finish(); return result;
    }

    private static uint Hash(string text)
    {
        unchecked
        {
            uint hash = 2166136261;
            foreach (var character in text) hash = (hash ^ character) * 16777619;
            hash = (hash ^ (hash >> 16)) * 0x85ebca6b;
            hash = (hash ^ (hash >> 13)) * 0xc2b2ae35;
            return hash ^ (hash >> 16);
        }
    }
    private static Color C(string text) => Color.FromHtml(text);
    private static JsonObject? Obj(JsonNode? node, string key) => (node as JsonObject)?[key] as JsonObject;
    private static JsonArray? Arr(JsonNode? node, string key) => (node as JsonObject)?[key] as JsonArray;
    private static IEnumerable<JsonObject> Objects(JsonArray? array) => array?.OfType<JsonObject>() ?? Enumerable.Empty<JsonObject>();
    private static string Str(JsonNode? node, string key, string fallback = "") => (node as JsonObject)?[key]?.GetValue<string>() ?? fallback;
    private static double Num(JsonNode? node, string key, double fallback = 0)
        => double.TryParse((node as JsonObject)?[key]?.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) ? value : fallback;
    private static Vector2 Point(JsonNode? node)
    {
        if (node is JsonArray a && a.Count >= 2)
            return new Vector2((float)double.Parse(a[0]!.ToJsonString(), CultureInfo.InvariantCulture), (float)double.Parse(a[1]!.ToJsonString(), CultureInfo.InvariantCulture));
        return new Vector2((float)Num(node, "x"), (float)Num(node, "y"));
    }
    private static Vector2[] Points(JsonArray? array) => array?.Where(p => p != null).Select(Point).ToArray() ?? Array.Empty<Vector2>();
    private static string Label(JsonObject? record) => Str(record, "name", Str(record, "nameZh", Str(record, "nameEn", Str(record, "id"))));
    private static string CompactForce(double value) => value >= 10000 ? Math.Round(value / 1000).ToString(CultureInfo.InvariantCulture) + "k"
        : value >= 1000 ? (value / 1000).ToString("0.0", CultureInfo.InvariantCulture) + "k" : Math.Max(0, Math.Round(value)).ToString(CultureInfo.InvariantCulture);
}
