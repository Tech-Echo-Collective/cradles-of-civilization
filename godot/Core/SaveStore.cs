using System.IO;
using System.Text.Json;

namespace CradlesOfCivilization.Core;

public static class SaveStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static void Save(GameState state, string path)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        File.WriteAllText(path, JsonSerializer.Serialize(state, Options));
    }

    public static GameState? Load(string path)
    {
        if (!File.Exists(path)) return null;
        var json = File.ReadAllText(path);
        var state = JsonSerializer.Deserialize<GameState>(json, Options);
        if (state is null) return null;

        // Saves created before the setup flow already represent a running
        // civilization. Keep them playable instead of sending them back to
        // naming, where confirming would reset their progress.
        using var document = JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("setupComplete", out _))
        {
            state.SetupComplete = true;
            state.SetupStage = "complete";
        }
        if (state.ControlLocked && !state.Finished && !state.AwaitingCivilizationRestart)
            state.AutoRunUntilCollapse = true;
        return state;
    }

    public static void Delete(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }
}
