using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.Json.Nodes;

namespace CradlesOfCivilization.Native;

/// <summary>Replays legal fresh campaigns against fixtures independently executed in Node.js.</summary>
public static class NativeVerifier
{
    public static int Run()
    {
        try {
            var timer = Stopwatch.StartNew();
            var fixtures = JsonNode.Parse(GameSession.ReadResource("Tests.native-fixtures.json"))!.AsObject();
            var commands = 0;
            var checkpoints = 0;
            foreach (var item in N.Items(N.Arr(fixtures, "cases")))
            {
                var id = N.Str(item, "id");
                using var session = new GameSession(false);
                var proof = N.Obj(item, "proof")!;
                Require(session.Call("createGame", proof["config"]!.DeepClone()), "new game " + id);
                Require(session.Call("completeSetup"), "founding " + id);
                Compare(item!["geometry"], session.View["geometry"], "geometry " + id);
                var checks = N.Items(N.Arr(item, "checkpoints")).ToDictionary(node => (int)N.Num(node, "after"));
                Checkpoint(0);
                var index = 0;
                foreach (var command in N.Items(N.Arr(proof, "commands")))
                {
                    var array = command!.AsArray();
                    Require(session.Call(array[0]!.ToString(), array.Skip(1).Select(node => (object?)node?.DeepClone()).ToArray()), $"{id} command {index}");
                    commands++; index++; Checkpoint(index);
                }
                Equal(N.Str(N.Obj(session.View, "finalEnding"), "id"), id, "final ending");
                Compare(item!["snapshot"], session.View["finalEnding"]!["snapshot"], "final snapshot " + id);
                Equal((int)N.Num(session.View, "turn"), (int)N.Num(proof, "years"), "years " + id);
                var storage = session.ExportStorage();
                if (storage.ContainsKey("three-sun-chronicle:v1")) throw new Exception("Finished campaign retained active save");
                using var restored = new GameSession(false, storage);
                Equal(N.Str(N.Obj(restored.View, "finalEnding"), "id"), id, "reload ending " + id);
                Compare(session.View["finalEnding"], restored.View["finalEnding"], "read-only result restore " + id);
                Compare(JsonSerializerNode(storage), JsonSerializerNode(restored.ExportStorage()), "restore changed storage " + id);
                using var imported = new GameSession(false);
                Require(imported.Call("importSave", session.ExportSave()), "finished save import " + id);
                Equal(N.Str(N.Obj(imported.View, "finalEnding"), "id"), id, "finished import " + id);
                Console.WriteLine($"PASS ending {id}: {index} legal commands; native/Node checkpoints, restore and import agree ({timer.Elapsed.TotalSeconds:F1}s)");
                void Checkpoint(int after) {
                    if (!checks.TryGetValue(after, out var check)) return;
                    var expected = N.Obj(check, "view")!;
                    foreach (var pair in expected) Compare(pair.Value, session.View[pair.Key], $"{id}/{after}/{pair.Key}");
                    checkpoints++;
                }
            }
            VerifyInteractiveCommands();
            VerifyRecoveredPersistence();
            Console.WriteLine($"NATIVE VERIFICATION PASSED: 12 endings, {commands} legal commands, {checkpoints} independent parity checkpoints, geometry/fog/battle, persistence/import validation. {timer.Elapsed.TotalSeconds:F1}s");
            return 0;
        } catch (Exception error) { Console.Error.WriteLine("NATIVE VERIFICATION FAILED: " + error); return 1; }
    }

    private static void VerifyInteractiveCommands()
    {
        using var game = new GameSession(false);
        var config = new { seed = 246810, realmName = "Native QA", difficulty = "easy", aiAggression = "restrained", governorId = "listener", mapUiExpanded = true };
        Require(game.Call("createGame", config), "setup");
        Require(game.Call("selectStartingRegion", N.Str(N.Arr(game.View, "regions")![10], "id")), "choose province");
        Require(game.Call("completeSetup"), "complete setup");
        Equal(N.Arr(game.View, "actions")!.Count, 21, "action count");
        Equal(N.Arr(game.View, "regions")!.Count, 64, "province count");
        Equal(N.Arr(game.View, "visibleMilitaryRegionIds")!.Count, 64, "listener full intelligence");
        foreach (var strategy in new[] { "balanced", "science", "fortress", "expansion", "trade", "faith" }) Require(game.Call("setStrategy", strategy), "strategy " + strategy);
        var roster = N.Arr(game.View, "visibleArmies")!;
        var army = roster.First(node => N.Str(node, "entityId") == "player-realm")!;
        Require(game.Call("selectArmy", N.Str(army, "id")), "army selection");
        var target = N.Arr(game.View, "availableProvinceIds")?.FirstOrDefault();
        if (target == null) throw new Exception("Initial army has no legal movement");
        Require(game.Call("deployArmy", target.ToString()), "army movement/battle");
        Require(game.Call("selectEntity", "solar-court"), "inspect rival");
        if (N.Bool(game.Call("setStrategy", "trade"), "ok")) throw new Exception("Rival strategy was writable");
        Require(game.Call("selectEntity", "player-realm"), "inspect player");
        Require(game.Call("setMapExpanded", false), "classic rules");
        Require(game.Call("setMapExpanded", true), "strategic rules");
        var before = game.ExportSave();
        var storageBefore = JsonSerializerNode(game.ExportStorage());
        if (N.Bool(game.Call("importSave", "{\"saveVersion\":999}"), "ok")) throw new Exception("Invalid save accepted");
        Equal(game.ExportSave(), before, "invalid import mutated state");
        Compare(storageBefore, JsonSerializerNode(game.ExportStorage()), "invalid import mutated persistence");
        using var imported = new GameSession(false);
        Require(imported.Call("importSave", before), "active save import");
        Compare(game.View["regions"], imported.View["regions"], "import map");
        Compare(game.View["visibleArmies"], imported.View["visibleArmies"], "import armies");
        Require(game.Call("executeAction", "science"), "round after import");
        Require(imported.Call("executeAction", "science"), "round after import");
        foreach (var key in new[] { "rngState", "turn", "sc", "be", "pop", "eco", "regions", "visibleArmies" }) Compare(game.View[key], imported.View[key], "save continuation " + key);
        using var repeat = new GameSession(false);
        Require(repeat.Call("createGame", config), "seed repeat");
        Compare(game.View["geometry"], repeat.View["geometry"], "same seed geography");
        Require(repeat.Call("createGame", new { seed = 246811 }), "different seed");
        if (N.Str(N.Obj(game.View, "geometry"), "signature") == N.Str(N.Obj(repeat.View, "geometry"), "signature")) throw new Exception("Different seed did not change geography");
        Console.WriteLine("PASS native interactions: founding, 6 strategies, fog, deployment, rival read-only, active save continuation, atomic invalid import, seed reproducibility");
    }

    private static JsonNode? JsonSerializerNode(object value) => JsonNode.Parse(System.Text.Json.JsonSerializer.Serialize(value));
    private static void VerifyRecoveredPersistence()
    {
        var folder = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "cunabula-persistence-" + Guid.NewGuid().ToString("N"));
        System.IO.Directory.CreateDirectory(folder);
        var original = System.IO.Path.Combine(folder, "native-v11-storage.json");
        var previous = GameSession.PersistentPathOverride;
        try {
            System.IO.File.WriteAllText(original, "broken original");
            GameSession.PersistentPathOverride = original;
            using (var first = new GameSession()) {
                Require(first.Call("createGame", new { realmName="恢复进度", seed=7733 }), "recovered new game");
                Require(first.Call("completeSetup"), "recovered founding");
                Require(first.Call("executeAction", "science"), "recovered round");
            }
            Equal(System.IO.File.ReadAllText(original), "broken original", "corrupt original preserved");
            var recovered = System.IO.File.ReadAllText(original + ".recovered");
            using (var second = new GameSession()) {
                Equal((int)N.Num(second.View, "turn"), 1, "recovered progress on next startup");
                Equal(N.Str(second.View, "realmName"), "恢复进度", "recovered realm");
            }
            Equal(System.IO.File.ReadAllText(original + ".recovered"), recovered, "read-only recovered startup");
            Console.WriteLine("PASS persistence: corrupt original preserved, recovered save survives second startup without rewrite");
        } finally { GameSession.PersistentPathOverride = previous; System.IO.Directory.Delete(folder, true); }
    }
    private static void Require(JsonObject result, string context) { if (!N.Bool(result, "ok")) throw new Exception(context + ": " + N.Str(result, "reason")); }
    private static void Equal<T>(T actual, T expected, string context) { if (!EqualityComparer<T>.Default.Equals(actual, expected)) throw new Exception($"{context}: expected {expected}, got {actual}"); }
    private static void Compare(JsonNode? expected, JsonNode? actual, string context)
    {
        if (expected == null || actual == null) { if (expected != null || actual != null) throw new Exception(context + ": null mismatch"); return; }
        if (expected is JsonObject expectedObject && actual is JsonObject actualObject) {
            Equal(actualObject.Count, expectedObject.Count, context + " keys");
            foreach (var pair in expectedObject) Compare(pair.Value, actualObject[pair.Key], context + "/" + pair.Key);
        } else if (expected is JsonArray expectedArray && actual is JsonArray actualArray) {
            Equal(actualArray.Count, expectedArray.Count, context + " length");
            for (var index = 0; index < expectedArray.Count; index++) Compare(expectedArray[index], actualArray[index], context + "/" + index);
        } else if (expected is JsonValue ev && actual is JsonValue av && ev.TryGetValue<double>(out var e) && av.TryGetValue<double>(out var a)) {
            if (Math.Abs(e-a) > 1e-8 * Math.Max(1,Math.Abs(e))) throw new Exception($"{context}: expected {e:R}, got {a:R}");
        } else Equal(actual.ToJsonString(), expected.ToJsonString(), context);
    }
}
