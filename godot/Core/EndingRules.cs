using System;
using System.Collections.Generic;

namespace CradlesOfCivilization.Core;

internal static class EndingRules
{
    private static readonly Dictionary<string, string> Names = new()
    {
        ["A"] = "地上天国/Promised Land",
        ["B"] = "人间地狱/Suffer In Hell",
        ["C"] = "都灵之马/The Turin Horse",
        ["D"] = "四海为家/Space Odyssey",
        ["E"] = "唯主是依/In God We Trust",
        ["F"] = "各执一词/Agree to Disagree",
        ["G"] = "如梦方醒/Brave New World",
        ["H"] = "1984/Big Brother",
        ["I"] = "罗马再临/Do As the Romans Do",
        ["J"] = "永志不忘/Here's Looking At You"
    };

    public static bool Evaluate(GameState state, string trigger, bool allowCandidate = true)
    {
        if (state.Finished) return true;
        var current = state.Snapshot();
        var automatic = AutomaticEnding(state, current);
        if (automatic is not null)
        {
            Finish(state, automatic, trigger, current);
            return true;
        }

        if (!allowCandidate || state.AwaitingCivilizationRestart)
        {
            state.EndingCandidate = null;
            UpdateStatus(state);
            return false;
        }

        var candidate = CandidateEnding(state, current);
        state.EndingCandidate = candidate is null
            ? null
            : new EndingCandidate
            {
                Id = candidate,
                Name = Name(candidate),
                Turn = state.Turn,
                Rand = state.LastRand,
                Trigger = trigger,
                Snapshot = current
            };
        UpdateStatus(state);
        return false;
    }

    public static bool Settle(GameState state)
    {
        if (state.Finished || state.AwaitingCivilizationRestart || state.EndingCandidate is null) return false;
        var candidate = state.EndingCandidate;
        Finish(state, candidate.Id, $"手动结算：{candidate.Trigger}", candidate.Snapshot);
        return true;
    }

    public static void Finish(GameState state, string endingId, string trigger, MetricSnapshot snapshot)
    {
        state.Finished = true;
        state.EndingCandidate = null;
        state.FinalEnding = new FinalEnding
        {
            Id = endingId,
            Name = Name(endingId),
            Trigger = trigger,
            Turn = state.Turn,
            Civilization = state.Civilization,
            Rand = state.LastRand,
            Snapshot = snapshot,
            CreatedAt = DateTime.UtcNow
        };
        state.EndingStatus = $"{Name(endingId)}已经抵达";
        state.Chronicle.Insert(0, new ChronicleEntry
        {
            Turn = state.Turn,
            Type = "ending",
            Title = $"{Name(endingId)}｜终局达成",
            Text = trigger
        });
    }

    public static void UpdateStatus(GameState state)
    {
        if (state.Finished && state.FinalEnding is not null)
        {
            state.EndingStatus = $"{state.FinalEnding.Name}已经抵达";
        }
        else if (state.AwaitingCivilizationRestart)
        {
            state.EndingStatus = $"第 {state.Civilization} 号文明毁灭，等待重启";
        }
        else if (state.EndingCandidate is not null)
        {
            state.EndingStatus = $"{state.EndingCandidate.Id}结局可结算；可继续发展";
        }
        else if (state.DoomCountdown > 0)
        {
            state.EndingStatus = $"终极答案倒计时：还剩 {state.DoomCountdown} 次行动";
        }
        else if (state.Economy <= 0)
        {
            state.EndingStatus = "经济危机：正向知识发展冻结";
        }
        else
        {
            state.EndingStatus = "文明的旅程尚未停息。";
        }
    }

    public static string Name(string endingId) => Names.TryGetValue(endingId, out var name) ? name : $"{endingId}结局";

    private static string? CandidateEnding(GameState state, MetricSnapshot current)
    {
        var harmony = CoreRules.KnowledgeHarmony(current.Science, current.Belief);
        if (current.Science >= 16_000 && current.Belief < 9_000 && current.Population >= 10_000 && current.Economy >= 95_000) return "D";
        if (current.Belief >= 16_000 && current.Science < 9_000 && current.Population >= 10_000 && current.Stability >= 58) return "E";
        if (current.Science >= 14_500 && current.Belief >= 14_500 && harmony >= 0.84) return "F";
        if (current.Science is >= 12_500 and < 16_000 && current.Belief <= 7_000 && current.Stability >= 80 && current.Population >= 10_000) return "H";
        // The web version temporarily hides G while the much longer hidden C
        // route is being approached, otherwise the G candidate would reset the
        // stagnation streak and make C unreachable.
        if (state.History.Count >= 7 && state.StagnantCivilizationStreak < 6) return "G";
        return null;
    }

    private static string? AutomaticEnding(GameState state, MetricSnapshot current)
    {
        if (state.LaMemoryCivilizationStreak + (state.CurrentCivilization.HadLaCap || current.LiteratureAndArt >= 18_000 ? 1 : 0) >= 3) return "J";
        if (state.LowOrderCivilizationStreak + (current.Stability < 20 ? 1 : 0) >= 16) return "I";
        if (current.Science >= CoreRules.KnowledgeCap && current.Belief < CoreRules.KnowledgeCap) return "A";
        if (current.Belief >= CoreRules.KnowledgeCap && current.Science < CoreRules.KnowledgeCap) return "B";
        return null;
    }
}
