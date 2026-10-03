using System;
using System.Collections.Generic;
using System.Text.Json.Nodes;

namespace CradlesOfCivilization.Native;

public static class N
{
    public static JsonObject? Obj(JsonNode? node, string key) => node?[key] as JsonObject;
    public static JsonArray? Arr(JsonNode? node, string key) => node?[key] as JsonArray;
    public static string Str(JsonNode? node, string key, string fallback = "") => node?[key]?.ToString() ?? fallback;
    public static double Num(JsonNode? node, string key, double fallback = 0) =>
        double.TryParse(node?[key]?.ToString(), System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture, out var value) && double.IsFinite(value) ? value : fallback;
    public static bool Bool(JsonNode? node, string key, bool fallback = false) =>
        bool.TryParse(node?[key]?.ToString(), out var value) ? value : fallback;
    public static IEnumerable<JsonNode?> Items(JsonArray? array) => array ?? (IEnumerable<JsonNode?>)Array.Empty<JsonNode?>();
}
