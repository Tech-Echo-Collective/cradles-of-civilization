using System;

namespace CradlesOfCivilization.Core;

internal static class KnowledgeTrends
{
    public static void Update(
        GameState state,
        EventDefinition primaryEvent,
        EventDefinition? specialEvent,
        string actionId,
        bool actionLocked,
        StatDelta actionDelta,
        StatDelta pressure,
        int rand)
    {
        var snapshot = state.Snapshot();
        state.ScienceTrend = Evolve(
            state,
            "science",
            state.ScienceTrend,
            snapshot,
            primaryEvent.Delta,
            specialEvent?.Delta,
            actionId,
            actionLocked,
            actionDelta,
            pressure,
            rand);
        state.BeliefTrend = Evolve(
            state,
            "belief",
            state.BeliefTrend,
            snapshot,
            primaryEvent.Delta,
            specialEvent?.Delta,
            actionId,
            actionLocked,
            actionDelta,
            pressure,
            rand);
    }

    private static int Evolve(
        GameState state,
        string key,
        int previous,
        MetricSnapshot current,
        StatDelta eventDelta,
        StatDelta? specialDelta,
        string actionId,
        bool actionLocked,
        StatDelta actionDelta,
        StatDelta pressure,
        int rand)
    {
        var target = Target(key, current);
        var eventImpulse = Impulse(eventDelta, key, 0.06, 18) +
                           Impulse(specialDelta ?? new StatDelta(), key, 0.05, 32) +
                           Impulse(pressure, key, 0.08, 12);
        var actionImpulse = actionLocked
            ? 0
            : ActionShift(actionId, key) + Impulse(actionDelta, key, 0.04, 16);
        var offset = key == "science" ? 37 : 83;
        var noise = ((rand + offset) / 13 % 5 - 2) * 2;
        var crisisDrag = current.Economy <= 0 ? -28 : 0;
        var next = previous * 0.68 + target * 0.22 + eventImpulse + actionImpulse + noise + crisisDrag;
        return (int)CoreRules.JsRound(CoreRules.Clamp(next, CoreRules.KnowledgeTrendMinimum, CoreRules.KnowledgeTrendMaximum));
    }

    private static double Target(string key, MetricSnapshot current)
    {
        var scienceRatio = current.Science / CoreRules.KnowledgeCap;
        var beliefRatio = current.Belief / CoreRules.KnowledgeCap;
        var harmony = CoreRules.KnowledgeHarmony(current.Science, current.Belief);
        var rivalry = 1 - harmony;
        var economyIndex = current.Economy <= 0 ? 0 : CoreRules.Clamp(Math.Log10(current.Economy + 10) / 6, 0, 1);
        var populationIndex = CoreRules.Clamp(Math.Sqrt(Math.Max(0, current.Population)) / 430, 0, 1.35);
        var orderRatio = CoreRules.Clamp(current.Stability, 0, 100) / 100.0;
        var crisisPenalty = current.Economy <= 0 ? 86 : 0;

        if (key == "science")
        {
            return CoreRules.Clamp(
                8 + Math.Sqrt(scienceRatio) * 54 + economyIndex * 34 + populationIndex * 18 +
                (orderRatio - 0.44) * 38 + harmony * 16 - beliefRatio * 52 - rivalry * 12 - crisisPenalty,
                -125,
                150);
        }

        var anxietyLift = current.Economy > 0 && current.Economy < current.Population * 0.28 ? 18 : 0;
        return CoreRules.Clamp(
            10 + Math.Sqrt(beliefRatio) * 50 + populationIndex * 22 + orderRatio * 40 + harmony * 14 +
            anxietyLift - scienceRatio * 58 - rivalry * 10 - crisisPenalty * 0.8,
            -125,
            150);
    }

    private static double Impulse(StatDelta delta, string key, double scale, double limit)
    {
        var value = key == "science" ? delta.Science : delta.Belief;
        return CoreRules.Clamp(value * scale, -limit, limit);
    }

    private static int ActionShift(string actionId, string key)
    {
        var science = key == "science";
        return actionId switch
        {
            "science" => science ? 18 : -8,
            "belief" => science ? -7 : 20,
            "balance" => 12,
            "order" => science ? 7 : 13,
            "suppressBelief" => science ? 22 : -30,
            "suppressScience" => science ? -32 : 24,
            "hibernate" => 10,
            "arts" => science ? 4 : 6,
            "economy" => science ? 7 : 4,
            "population" => science ? 3 : 6,
            "buildEerf" => science ? -12 : -10,
            "upgradeEerf" => science ? -10 : -8,
            "recovery" => science ? -14 : -9,
            _ => 0
        };
    }
}
