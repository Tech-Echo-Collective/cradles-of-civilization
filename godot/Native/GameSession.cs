using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Jint;

namespace CradlesOfCivilization.Native;

/// <summary>Native presentation adapter for the pinned, verified rule core. No DOM or CLR access is exposed.</summary>
public sealed class GameSession : IDisposable
{
    public const string Version = "0.5.0-alpha.5-godot.1";
    public const string SourceCommit = "96b05e39429a500ddfce2b160466a87ed75b2d4f";
    private readonly Engine _engine;
    private readonly Dictionary<string, string> _storage = new();
    private readonly string? _storagePath;
    private string _lastPersisted = "";
    private readonly JsonObject _catalog;
    public JsonObject View { get; private set; } = new();
    public bool IsFinished => N.Bool(View, "finished");
    public double LastCommandMilliseconds { get; private set; }
    public static string? PersistentPathOverride { get; set; }
    private static readonly HashSet<string> Commands = new(StringComparer.Ordinal) {
        "createGame", "executeAction", "selectStartingRegion", "completeSetup", "selectProvince", "selectArmy",
        "selectEntity", "deployArmy", "setStrategy", "setMapExpanded", "returnToSettings", "tickAutoRun",
        "clearChronicle", "importSave"
    };

    public GameSession(bool persistent = true, IReadOnlyDictionary<string, string>? initialStorage = null)
    {
        if (persistent)
        {
            _storagePath = PersistentPathOverride ?? Godot.ProjectSettings.GlobalizePath("user://native-v11-storage.json");
            var recovery = 0;
            while (File.Exists(_storagePath))
            {
                try {
                    var loaded = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(_storagePath));
                    if (loaded == null) throw new JsonException("Native storage must be a JSON object");
                    foreach (var item in loaded) if (item.Value != null) _storage[item.Key] = item.Value;
                    break;
                } catch (Exception error) when (error is IOException or JsonException) {
                    Console.Error.WriteLine($"Preserving unreadable native storage: {error.Message}");
                    // Keep every unreadable file and load the first valid recovered sibling on subsequent starts.
                    recovery++;
                    var original = PersistentPathOverride ?? Godot.ProjectSettings.GlobalizePath("user://native-v11-storage.json");
                    _storagePath = original + ".recovered" + (recovery == 1 ? "" : "." + recovery);
                }
            }
        }
        if (initialStorage != null) foreach (var item in initialStorage) _storage[item.Key] = item.Value;
        _lastPersisted = JsonSerializer.Serialize(_storage);
        _engine = new Engine(options => options.TimeoutInterval(TimeSpan.FromSeconds(30)).LimitRecursion(256));
        _engine.SetValue("nativeGet", new Func<string, string?>(key => _storage.GetValueOrDefault(key)));
        _engine.SetValue("nativeSet", new Action<string, string>((key, value) => _storage[key] = value));
        _engine.SetValue("nativeRemove", new Action<string>(key => _storage.Remove(key)));
        _engine.SetValue("nativeLog", new Action<string>(Console.Error.WriteLine));
        _engine.Execute("""
            var window = globalThis;
            var CRADLES_GAME_HOST = {};
            var localStorage = { getItem: key => nativeGet(String(key)), setItem: (key,value) => nativeSet(String(key),String(value)), removeItem: key => nativeRemove(String(key)) };
            var document = { addEventListener() { throw new Error('Native rules touched DOM'); }, querySelector() { throw new Error('Native rules touched DOM'); }, querySelectorAll() { throw new Error('Native rules touched DOM'); } };
            var location = { href: 'http://localhost/index.html' };
            var history = { replaceState() {} };
            var performance = { now: () => 0 };
            var console = { log: (...args) => nativeLog(args.join(' ')), warn: (...args) => nativeLog(args.join(' ')), error: (...args) => nativeLog(args.join(' ')) };
            function setTimeout() { return 0; }
            function clearTimeout() {}
            function requestAnimationFrame() { return 0; }
            function cancelAnimationFrame() {}
            function confirm() { return true; }
            function addEventListener() { throw new Error('Native rules touched DOM'); }
            """);
        foreach (var file in new[] { "endings.js", "balance-model.js", "map-data.js", "map-model.js", "map-generator.js", "game.js" })
            _engine.Execute(ReadResource("Rules." + file), file);
        _catalog = ParseObject(_engine.Evaluate("JSON.stringify(THREE_SUN_ENDINGS)").AsString());
        _engine.Execute("CRADLES_GAME_ENGINE.initialize()");
        ReloadView();
    }

    public JsonObject Call(string method, params object?[] arguments)
    {
        if (!Commands.Contains(method)) throw new ArgumentException("Unknown native game command", nameof(method));
        var clock = System.Diagnostics.Stopwatch.StartNew();
        _engine.SetValue("nativeArgumentsJson", JsonSerializer.Serialize(arguments));
        var result = ParseObject(_engine.Evaluate($"JSON.stringify(CRADLES_GAME_ENGINE.{method}(...JSON.parse(nativeArgumentsJson)))").AsString());
        if (N.Bool(result, "ok")) { ReloadView(); SavePersistent(); }
        LastCommandMilliseconds = clock.Elapsed.TotalMilliseconds;
        return result;
    }

    public string ExportSave() => _engine.Evaluate("CRADLES_GAME_ENGINE.exportSave()").AsString();
    public void ReloadView()
    {
        View = ParseObject(_engine.Evaluate("JSON.stringify(CRADLES_GAME_ENGINE.getView())").AsString());
        View["endingCatalog"] = _catalog.DeepClone();
    }
    public Dictionary<string, string> ExportStorage() => new(_storage);
    public void SavePersistent()
    {
        if (_storagePath == null) return;
        var serialized = JsonSerializer.Serialize(_storage);
        if (serialized == _lastPersisted) return;
        Directory.CreateDirectory(Path.GetDirectoryName(_storagePath)!);
        File.WriteAllText(_storagePath + ".tmp", serialized);
        File.Move(_storagePath + ".tmp", _storagePath, true);
        _lastPersisted = serialized;
    }
    public void Dispose() { /* The session owns no external runtime, thread, browser, or open file. */ }
    public static string ReadResource(string name)
    {
        using var stream = typeof(GameSession).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException("Missing native resource: " + name);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
    private static JsonObject ParseObject(string json) => JsonNode.Parse(json) as JsonObject
        ?? throw new InvalidOperationException("Rule adapter returned a non-object snapshot");
}
