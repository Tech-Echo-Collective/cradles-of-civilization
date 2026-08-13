using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace CradlesOfCivilization.Core;

public sealed record ParityReport(int CaseCount, IReadOnlyList<string> Errors)
{
    public bool Passed => Errors.Count == 0;
}

public static class ParityVerifier
{
    public static ParityReport Verify(string fixturePath)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(fixturePath));
        var fixtures = document.RootElement.GetProperty("fixtures");
        var engine = new GameEngine();
        var errors = new List<string>();

        foreach (var fixture in fixtures.EnumerateArray())
        {
            var id = fixture.GetProperty("id").GetString() ?? "unnamed";
            var state = new GameState(fixture.GetProperty("seed").GetInt64());
            ApplyOverrides(state, fixture.GetProperty("overrides"));
            var result = engine.Advance(state, fixture.GetProperty("action").GetString() ?? "science");
            var expected = fixture.GetProperty("expected");

            Check(errors, id, "turn", result.Turn, expected.GetProperty("turn").GetInt32());
            Check(errors, id, "rand", result.Rand, expected.GetProperty("rand").GetInt32());
            Check(errors, id, "spec", result.Spec, expected.GetProperty("spec").GetInt32());
            Check(errors, id, "rngState", result.RngState, expected.GetProperty("rngState").GetInt64());
            Check(errors, id, "eventTitle", result.EventTitle, expected.GetProperty("eventTitle").GetString() ?? "");
            Check(errors, id, "actionLocked", result.ActionLocked, expected.GetProperty("actionLocked").GetBoolean());

            var pressure = expected.GetProperty("pressure");
            Check(errors, id, "pressure.science", result.Pressure.Science, Number(pressure, "science"));
            Check(errors, id, "pressure.belief", result.Pressure.Belief, Number(pressure, "belief"));
            Check(errors, id, "pressure.population", result.Pressure.Population, Number(pressure, "population"));
            Check(errors, id, "pressure.economy", result.Pressure.Economy, Number(pressure, "economy"));
            Check(errors, id, "pressure.stability", result.Pressure.Stability, Number(pressure, "stability"));

            var expectedState = expected.GetProperty("state");
            Check(errors, id, "state.science", state.Science, Number(expectedState, "science"));
            Check(errors, id, "state.belief", state.Belief, Number(expectedState, "belief"));
            Check(errors, id, "state.literatureAndArt", state.LiteratureAndArt, Number(expectedState, "literatureAndArt"));
            Check(errors, id, "state.population", state.Population, expectedState.GetProperty("population").GetInt64());
            Check(errors, id, "state.economy", state.Economy, expectedState.GetProperty("economy").GetInt64());
            Check(errors, id, "state.stability", state.Stability, expectedState.GetProperty("stability").GetInt32());
        }

        return new ParityReport(fixtures.GetArrayLength(), errors);
    }

    private static void ApplyOverrides(GameState state, JsonElement overrides)
    {
        if (overrides.TryGetProperty("sc", out var science)) state.Science = science.GetDouble();
        if (overrides.TryGetProperty("be", out var belief)) state.Belief = belief.GetDouble();
        if (overrides.TryGetProperty("la", out var literatureAndArt)) state.LiteratureAndArt = literatureAndArt.GetDouble();
        if (overrides.TryGetProperty("pop", out var population)) state.Population = population.GetInt64();
        if (overrides.TryGetProperty("eco", out var economy)) state.Economy = economy.GetInt64();
        if (overrides.TryGetProperty("stability", out var stability)) state.Stability = stability.GetInt32();
    }

    private static double Number(JsonElement parent, string property)
    {
        return parent.GetProperty(property).GetDouble();
    }

    private static void Check(List<string> errors, string id, string field, double actual, double expected)
    {
        if (Math.Abs(actual - expected) > 0.000_001)
        {
            errors.Add($"{id}.{field}: expected {expected}, got {actual}");
        }
    }

    private static void Check<T>(List<string> errors, string id, string field, T actual, T expected)
        where T : IEquatable<T>
    {
        if (!actual.Equals(expected))
        {
            errors.Add($"{id}.{field}: expected {expected}, got {actual}");
        }
    }
}
