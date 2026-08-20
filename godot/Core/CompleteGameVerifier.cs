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
        VerifySetupStateAndSave(errors);
        VerifyEerfAndChronicle(engine, errors);
        VerifyCollapseRestartAndSave(engine, errors);
        VerifyCandidateAndAutomaticEndings(engine, errors);
        VerifyHiddenStagnationEnding(engine, errors);

        return new ParityReport(6, errors);
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

    private static void VerifySetupStateAndSave(List<string> errors)
    {
        var state = new GameState(1_058)
        {
            RealmName = "测试国度",
            Difficulty = "hard",
            GovernorId = "black-man",
            SetupComplete = false,
            SetupStage = "governor"
        };
        if (new GameState().SetupComplete || new GameState().SetupStage != "name")
            errors.Add("setup: a new world did not begin at the naming stage");

        var path = Path.Combine(Path.GetTempPath(), $"cradles-setup-{Guid.NewGuid():N}.json");
        try
        {
            SaveStore.Save(state, path);
            var loaded = SaveStore.Load(path);
            if (loaded is null || loaded.SetupComplete || loaded.SetupStage != "governor" ||
                loaded.RealmName != "测试国度" || loaded.Difficulty != "hard" || loaded.GovernorId != "black-man")
                errors.Add("setup: an unfinished setup did not survive save/load");

            File.WriteAllText(path, "{\"seed\":1058,\"realmName\":\"旧存档\"}");
            var legacy = SaveStore.Load(path);
            if (legacy is null || !legacy.SetupComplete || legacy.SetupStage != "complete")
                errors.Add("setup: a legacy running save was sent back to naming");
        }
        catch (Exception exception)
        {
            errors.Add($"setup save: {exception.GetType().Name}: {exception.Message}");
        }
        finally
        {
            SaveStore.Delete(path);
        }
    }

    private static void VerifyEerfAndChronicle(GameEngine engine, List<string> errors)
    {
        var state = new GameState(1_058) { Population = 22_000, Economy = 200_000 };
        var initial = state.Chronicle[0];
        if (!initial.Text.Contains("这是一个文明的新生", StringComparison.Ordinal) ||
            initial.Delta.Population != 7_600 || initial.Delta.Economy != 50_000)
            errors.Add("chronicle: the v0.2 opening prose or initial delta is missing");

        var result = engine.Advance(state, "buildEerf");
        if (result.ActionLocked || state.EerfLevel != 1)
            errors.Add("EERF: the initial facility could not be built exactly once");
        if (engine.DisabledReason(state, "buildEerf") != "EERF 已经存在")
            errors.Add("EERF: the build action was not locked after level 1 was established");
        if (state.Chronicle.Count < 2 ||
            !state.Chronicle[0].Text.Contains("极端环境抵抗设施在地下开工", StringComparison.Ordinal) ||
            state.Chronicle[0].Delta.Equals(default(StatDelta)))
            errors.Add("chronicle: action prose or yearly delta was not recorded");
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
