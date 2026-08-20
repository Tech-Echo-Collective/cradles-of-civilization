using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace CradlesOfCivilization.Core;

public sealed class EndingStats
{
    public Dictionary<string, int> Counts { get; set; } = [];
    public int Total { get; set; }
    public string Recent { get; set; } = "";
}

public static class EndingStatsStore
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static EndingStats Load(string path)
    {
        if (!File.Exists(path)) return new EndingStats();
        try
        {
            return JsonSerializer.Deserialize<EndingStats>(File.ReadAllText(path), Options) ?? new EndingStats();
        }
        catch
        {
            return new EndingStats();
        }
    }

    public static void Record(EndingStats stats, string endingId, string path)
    {
        stats.Counts[endingId] = stats.Counts.GetValueOrDefault(endingId) + 1;
        stats.Total += 1;
        stats.Recent = endingId;
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        File.WriteAllText(path, JsonSerializer.Serialize(stats, Options));
    }
}
