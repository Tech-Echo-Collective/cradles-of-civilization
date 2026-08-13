using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CradlesOfCivilization.Core;

public static class CompleteGameVerifier
{
    public static ParityReport Verify()
    {
        var errors = new List<string>();
        var engine = new GameEngine();

        VerifyActionSurface(engine, errors);
        VerifyCollapseRestartAndSave(engine, errors);
        VerifyCandidateAndAutomaticEndings(engine, errors);
        VerifyHiddenStagnationEnding(engine, errors);

        return new ParityReport(4, errors);
    }

    private static void VerifyActionSurface(GameEngine engine, List<string> errors)
    {
        var ids = engine.Actions.Select(action => action.Id).ToArray();
        string[] expected =
        [
            "science", "belief", "population", "balance", "order", "suppressBelief", "suppressScience",
            "hibernate", "arts", "economy", "buildEerf", "upgradeEerf", "recovery",
            "restartCivilization", "settleEnding"
        ];
        if (!ids.SequenceEqual(expected)) errors.Add($"actions: expected {string.Join(',', expected)}, got {string.Join(',', ids)}");
        if (ids.Any(id => id.Contains("military", StringComparison.OrdinalIgnoreCase))) errors.Add("actions: military action leaked into the non-military build");
    }

    private static void VerifyCollapseRestartAndSave(GameEngine engine, List<string> errors)
    {
        var state = new GameState(1)
        {
            RngState = 1,
            Science = 8_000,
            Belief = 7_000,
            LiteratureAndArt = 10_000,
            ScienceTrend = 80,
            BeliefTrend = 70,
            Population = 100_000,
            Economy = 200_000,
            Stability = 70,
            EerfLevel = 3
        };
        state.CurrentCivilization = CivilizationRecord.Create(1, 0, state.Snapshot());
        var collapse = engine.Advance(state, "balance");
        if (!collapse.CivilizationCollapsed || !state.AwaitingCivilizationRestart || state.PendingRestart is null)
        {
            errors.Add("collapse: destructive primary event did not create a restart state");
            return;
        }
        if (state.PendingRestart.Population <= 2_600 || state.PendingRestart.Science <= 0 || state.PendingRestart.EerfLevel != 2)
        {
            errors.Add("collapse: EERF inheritance was not preserved");
        }

        engine.Advance(state, "restartCivilization");
        if (state.Civilization != 2 || state.AwaitingCivilizationRestart || state.Population <= 0)
        {
            errors.Add("restart: the next civilization did not awaken");
        }

        var path = Path.Combine(Path.GetTempPath(), $"cradles-complete-{Guid.NewGuid():N}.json");
        try
        {
            SaveStore.Save(state, path);
            var loaded = SaveStore.Load(path);
            if (loaded is null || loaded.Civilization != state.Civilization || loaded.RngState != state.RngState ||
                loaded.Population != state.Population || loaded.History.Count != state.History.Count)
            {
                errors.Add("save: save/load round trip changed the game state");
            }
        }
        catch (Exception exception)
        {
            errors.Add($"save: {exception.GetType().Name}: {exception.Message}");
        }
        finally
        {
            SaveStore.Delete(path);
        }
    }

    private static void VerifyCandidateAndAutomaticEndings(GameEngine engine, List<string> errors)
    {
        var candidateD = new GameState(19)
        {
            Science = 16_000,
            Belief = 8_000,
            Population = 10_000,
            Economy = 95_000,
            Stability = 60
        };
        VerifyCandidate(engine, candidateD, "D", errors);

        var candidateE = new GameState(20) { Science = 8_000, Belief = 16_000, Population = 10_000, Stability = 58 };
        VerifyCandidate(engine, candidateE, "E", errors);

        var candidateF = new GameState(21) { Science = 14_500, Belief = 14_500 };
        VerifyCandidate(engine, candidateF, "F", errors);

        var candidateH = new GameState(22) { Science = 12_500, Belief = 7_000, Population = 10_000, Stability = 80 };
        VerifyCandidate(engine, candidateH, "H", errors);

        var candidateG = new GameState(23);
        candidateG.History.AddRange(Enumerable.Range(1, 7).Select(index => new CivilizationRecord { Civilization = index }));
        VerifyCandidate(engine, candidateG, "G", errors);

        var automaticA = new GameState(24) { Science = 20_000, Belief = 9_000 };
        EndingRules.Evaluate(automaticA, "ending smoke");
        if (!automaticA.Finished || automaticA.FinalEnding?.Id != "A") errors.Add("ending: A did not settle automatically");

        var automaticB = new GameState(25) { Science = 9_000, Belief = 20_000 };
        EndingRules.Evaluate(automaticB, "ending smoke");
        if (!automaticB.Finished || automaticB.FinalEnding?.Id != "B") errors.Add("ending: B did not settle automatically");

        var automaticI = new GameState(29) { LowOrderCivilizationStreak = 15, Stability = 19 };
        EndingRules.Evaluate(automaticI, "ending smoke");
        if (!automaticI.Finished || automaticI.FinalEnding?.Id != "I") errors.Add("ending: I streak did not settle automatically");

        var automaticJ = new GameState(31) { LaMemoryCivilizationStreak = 2, LiteratureAndArt = 18_000 };
        EndingRules.Evaluate(automaticJ, "ending smoke");
        if (!automaticJ.Finished || automaticJ.FinalEnding?.Id != "J") errors.Add("ending: J streak did not settle automatically");
    }

    private static void VerifyCandidate(GameEngine engine, GameState state, string expectedId, List<string> errors)
    {
        EndingRules.Evaluate(state, "ending smoke");
        if (state.EndingCandidate?.Id != expectedId)
        {
            errors.Add($"ending: {expectedId} was not offered as a candidate");
            return;
        }
        engine.Advance(state, "settleEnding");
        if (!state.Finished || state.FinalEnding?.Id != expectedId)
        {
            errors.Add($"ending: {expectedId} candidate could not be settled");
        }
    }

    private static void VerifyHiddenStagnationEnding(GameEngine engine, List<string> errors)
    {
        var state = new GameState(1);
        for (var civilization = 0; civilization < 18 && !state.Finished; civilization += 1)
        {
            state.RngState = 1;
            var result = engine.Advance(state, "balance");
            if (!result.CivilizationCollapsed && !state.Finished)
            {
                errors.Add($"ending C: civilization {civilization + 1} did not collapse");
                return;
            }
            if (!state.Finished) engine.Advance(state, "restartCivilization");
        }
        if (!state.Finished || state.FinalEnding?.Id != "C")
        {
            errors.Add("ending C: 18 stagnant civilizations did not reach the hidden ending");
        }
    }
}
