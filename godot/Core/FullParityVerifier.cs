using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace CradlesOfCivilization.Core;

public static class FullParityVerifier
{
    public static ParityReport Verify(string scenarioPath)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(scenarioPath));
        var scenarios = document.RootElement.GetProperty("scenarios");
        var errors = new List<string>();
        var engine = new GameEngine();

        foreach (var scenario in scenarios.EnumerateArray())
        {
            var id = scenario.GetProperty("id").GetString() ?? "unnamed";
            var state = new GameState(scenario.GetProperty("seed").GetInt64());
            if (scenario.TryGetProperty("rngState", out var rngState)) state.RngState = rngState.GetInt64();
            ApplyOverrides(state, scenario.GetProperty("overrides"));
            var result = engine.Advance(state, scenario.GetProperty("action").GetString() ?? "balance");
            if (scenario.TryGetProperty("followupAction", out var followupAction))
            {
                engine.Advance(state, followupAction.GetString() ?? "restartCivilization");
            }
            var expected = scenario.GetProperty("expected");

            Check(errors, id, "eventTitle", result.EventTitle, Text(expected, "eventTitle"));
            Check(errors, id, "eventText", result.EventText, Text(expected, "eventText"));
            Check(errors, id, "specialEventTitle", result.SpecialEventTitle, Text(expected, "specialEventTitle"));
            Check(errors, id, "specialEventText", result.SpecialEventText, Text(expected, "specialEventText"));
            Check(errors, id, "actionLocked", result.ActionLocked, expected.GetProperty("actionLocked").GetBoolean());
            if (expected.TryGetProperty("civilizationCollapsed", out var civilizationCollapsed))
                Check(errors, id, "civilizationCollapsed", result.CivilizationCollapsed, civilizationCollapsed.GetBoolean());
            Check(errors, id, "rngState", state.RngState, expected.GetProperty("rngState").GetInt64());

            var expectedPressure = expected.GetProperty("pressure");
            Check(errors, id, "pressure.science", result.Pressure.Science, Number(expectedPressure, "science"));
            Check(errors, id, "pressure.belief", result.Pressure.Belief, Number(expectedPressure, "belief"));
            Check(errors, id, "pressure.population", result.Pressure.Population, Number(expectedPressure, "population"));
            Check(errors, id, "pressure.economy", result.Pressure.Economy, Number(expectedPressure, "economy"));
            Check(errors, id, "pressure.stability", result.Pressure.Stability, Number(expectedPressure, "stability"));

            var expectedState = expected.GetProperty("state");
            Check(errors, id, "state.science", state.Science, Number(expectedState, "science"));
            Check(errors, id, "state.belief", state.Belief, Number(expectedState, "belief"));
            Check(errors, id, "state.literatureAndArt", state.LiteratureAndArt, Number(expectedState, "literatureAndArt"));
            Check(errors, id, "state.population", state.Population, expectedState.GetProperty("population").GetInt64());
            Check(errors, id, "state.economy", state.Economy, expectedState.GetProperty("economy").GetInt64());
            Check(errors, id, "state.stability", state.Stability, expectedState.GetProperty("stability").GetInt32());
            Check(errors, id, "state.eerfLevel", state.EerfLevel, expectedState.GetProperty("eerfLevel").GetInt32());
            Check(errors, id, "state.scienceTrend", state.ScienceTrend, expectedState.GetProperty("scienceTrend").GetInt32());
            Check(errors, id, "state.beliefTrend", state.BeliefTrend, expectedState.GetProperty("beliefTrend").GetInt32());
            Check(errors, id, "state.populationGrowthMultiplier", state.PopulationGrowthMultiplier, Number(expectedState, "populationGrowthMultiplier"));
            Check(errors, id, "state.knowledgeGrowthMultiplier", state.KnowledgeGrowthMultiplier, Number(expectedState, "knowledgeGrowthMultiplier"));
            Check(errors, id, "state.controlEfficiencyMultiplier", state.ControlEfficiencyMultiplier, Number(expectedState, "controlEfficiencyMultiplier"));
            Check(errors, id, "state.controlLocked", state.ControlLocked, expectedState.GetProperty("controlLocked").GetBoolean());
            Check(errors, id, "state.populationLockTurns", state.PopulationLockTurns, expectedState.GetProperty("populationLockTurns").GetInt32());
            Check(errors, id, "state.civilization", state.Civilization, expectedState.GetProperty("civilization").GetInt32());
            Check(errors, id, "state.awaitingCivilizationRestart", state.AwaitingCivilizationRestart, expectedState.GetProperty("awaitingCivilizationRestart").GetBoolean());
            Check(errors, id, "state.historyCount", state.History.Count, expectedState.GetProperty("historyCount").GetInt32());
            CheckPendingRestart(errors, id, state.PendingRestart, expectedState.GetProperty("pendingRestart"));
        }

        return new ParityReport(scenarios.GetArrayLength(), errors);
    }

    private static void CheckPendingRestart(List<string> errors, string id, RestartState? actual, JsonElement expected)
    {
        if (expected.ValueKind == JsonValueKind.Null)
        {
            if (actual is not null) errors.Add($"{id}.state.pendingRestart: expected null");
            return;
        }
        if (actual is null)
        {
            errors.Add($"{id}.state.pendingRestart: expected restart data, got null");
            return;
        }
        Check(errors, id, "pendingRestart.science", actual.Science, Number(expected, "science"));
        Check(errors, id, "pendingRestart.belief", actual.Belief, Number(expected, "belief"));
        Check(errors, id, "pendingRestart.scienceTrend", actual.ScienceTrend, expected.GetProperty("scienceTrend").GetInt32());
        Check(errors, id, "pendingRestart.beliefTrend", actual.BeliefTrend, expected.GetProperty("beliefTrend").GetInt32());
        Check(errors, id, "pendingRestart.population", actual.Population, expected.GetProperty("population").GetInt64());
        Check(errors, id, "pendingRestart.economy", actual.Economy, expected.GetProperty("economy").GetInt64());
        Check(errors, id, "pendingRestart.stability", actual.Stability, expected.GetProperty("stability").GetInt32());
        Check(errors, id, "pendingRestart.eerfLevel", actual.EerfLevel, expected.GetProperty("eerfLevel").GetInt32());
        Check(errors, id, "pendingRestart.nextCivilization", actual.NextCivilization, expected.GetProperty("nextCivilization").GetInt32());
    }

    private static void ApplyOverrides(GameState state, JsonElement overrides)
    {
        if (overrides.TryGetProperty("sc", out var science)) state.Science = science.GetDouble();
        if (overrides.TryGetProperty("be", out var belief)) state.Belief = belief.GetDouble();
        if (overrides.TryGetProperty("la", out var literature)) state.LiteratureAndArt = literature.GetDouble();
        if (overrides.TryGetProperty("pop", out var population)) state.Population = population.GetInt64();
        if (overrides.TryGetProperty("eco", out var economy)) state.Economy = economy.GetInt64();
        if (overrides.TryGetProperty("stability", out var stability)) state.Stability = stability.GetInt32();
        if (overrides.TryGetProperty("eerfLevel", out var eerf)) state.EerfLevel = eerf.GetInt32();
        if (overrides.TryGetProperty("scTrend", out var scienceTrend)) state.ScienceTrend = scienceTrend.GetInt32();
        if (overrides.TryGetProperty("beTrend", out var beliefTrend)) state.BeliefTrend = beliefTrend.GetInt32();
        if (overrides.TryGetProperty("populationGrowthMultiplier", out var populationMultiplier)) state.PopulationGrowthMultiplier = populationMultiplier.GetDouble();
        if (overrides.TryGetProperty("knowledgeGrowthMultiplier", out var knowledgeMultiplier)) state.KnowledgeGrowthMultiplier = knowledgeMultiplier.GetDouble();
        if (overrides.TryGetProperty("controlEfficiencyMultiplier", out var controlMultiplier)) state.ControlEfficiencyMultiplier = controlMultiplier.GetDouble();
        if (overrides.TryGetProperty("controlLocked", out var controlLocked)) state.ControlLocked = controlLocked.GetBoolean();
        if (overrides.TryGetProperty("populationLockTurns", out var populationLockTurns)) state.PopulationLockTurns = populationLockTurns.GetInt32();
        if (overrides.TryGetProperty("lockedPopulation", out var lockedPopulation)) state.LockedPopulation = lockedPopulation.ValueKind == JsonValueKind.Null ? null : lockedPopulation.GetInt64();
        if (overrides.TryGetProperty("governorId", out var governor)) state.GovernorId = governor.GetString() ?? state.GovernorId;
    }

    private static string Text(JsonElement parent, string property)
    {
        return parent.TryGetProperty(property, out var value) ? value.GetString() ?? "" : "";
    }

    private static double Number(JsonElement parent, string property) => parent.GetProperty(property).GetDouble();

    private static void Check(List<string> errors, string id, string field, double actual, double expected)
    {
        if (Math.Abs(actual - expected) > 0.000_001) errors.Add($"{id}.{field}: expected {expected}, got {actual}");
    }

    private static void Check<T>(List<string> errors, string id, string field, T actual, T expected)
        where T : IEquatable<T>
    {
        if (!actual.Equals(expected)) errors.Add($"{id}.{field}: expected {expected}, got {actual}");
    }
}
