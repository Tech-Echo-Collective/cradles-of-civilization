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
        return JsonSerializer.Deserialize<GameState>(File.ReadAllText(path), Options);
    }

    public static void Delete(string path)
    {
        if (File.Exists(path)) File.Delete(path);
    }
}
