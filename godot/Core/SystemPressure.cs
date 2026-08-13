using System;

namespace CradlesOfCivilization.Core;

internal readonly record struct TerritoryDevelopment(
    double CarryingCapacity,
    double OutputMultiplier,
    double AdministrationCost,
    double OrderDrag);

internal static class SystemPressure
{
    public static StatDelta Calculate(GameState current)
    {
        var scienceRatio = current.Science / CoreRules.KnowledgeCap;
        var beliefRatio = current.Belief / CoreRules.KnowledgeCap;
        var scienceEraLevel = CoreRules.EraIndexFor(current.Science);
        var beliefEraLevel = CoreRules.EraIndexFor(current.Belief);
        var harmony = CoreRules.KnowledgeHarmony(current.Science, current.Belief);
        var rivalry = 1 - harmony;
        var sciencePressure = Math.Max(0, scienceEraLevel - 2) * (1 - harmony * 0.88);
        var beliefPressure = Math.Max(0, beliefEraLevel - 2) * (1 - harmony * 0.88);
        var harmonyLift = harmony > 0.72 ? CoreRules.JsRound((harmony - 0.72) * 46) : 0;
        var orderRatio = CoreRules.Clamp(current.Stability, 0, 100) / 100.0;
        var orderScienceLift = Math.Max(0, CoreRules.JsRound((orderRatio - 0.44) * 30));
        var beliefSuppression = CoreRules.JsRound(beliefPressure * (2.4 + beliefRatio * 9) * (1 - orderRatio * 0.28));
        var scienceDelta = CoreRules.Clamp(harmonyLift + orderScienceLift - beliefSuppression, -95, 34);
        var scienceSuppression = CoreRules.JsRound(sciencePressure * (3 + scienceRatio * 14) + scienceRatio * orderRatio * 12);
        var beliefDelta = CoreRules.Clamp(harmonyLift - scienceSuppression, -95, 18);

        var carryingCapacity = CivilizationCarryingCapacity(current);
        var populationRatio = carryingCapacity > 0 ? current.Population / carryingCapacity : 1;
        var economyFactor = current.Economy <= 0
            ? 0.72
            : 0.82 + CoreRules.Clamp(Math.Log10(current.Economy + 10) / 6, 0, 1) * 0.24;
        var knowledgePopulationLift = 1 + scienceRatio * 0.18 + beliefRatio * 0.16 + harmony * 0.08;
        var orderPopulationLift = 0.9 + CoreRules.Clamp(current.Stability, 0, 100) / 500.0;
        var logisticRate = 0.012 * economyFactor * knowledgePopulationLift * orderPopulationLift;
        var logisticPopulation = current.Population * logisticRate * (1 - populationRatio);
        var povertyPenalty = current.Economy < current.Population * 0.22
            ? current.Population * (0.0028 + rivalry * 0.0024)
            : 0;
        var populationDelta = CoreRules.Clamp(CoreRules.JsRound(logisticPopulation - povertyPenalty), -45_000, 9_000);

        var economyDelta = ComputeSolowEconomyPressure(current, carryingCapacity, harmony, rivalry);
        var stabilityDelta = ComputeOrderPressure(current, carryingCapacity, harmony, rivalry);

        return new StatDelta(
            Science: scienceDelta,
            Belief: beliefDelta,
            Population: populationDelta,
            Economy: economyDelta,
            Stability: stabilityDelta);
    }

    private static double CivilizationCarryingCapacity(GameState current)
    {
        var scienceRatio = current.Science / CoreRules.KnowledgeCap;
        var beliefRatio = current.Belief / CoreRules.KnowledgeCap;
        var economySupport = Math.Sqrt(Math.Max(0, current.Economy)) * 145;
        var eerfShelter = current.EerfLevel * 6_500;
        var territory = TerritoryDevelopmentEffects(current);
        return CoreRules.JsRound(
            9_000 +
            current.Science * 4.6 +
            current.Belief * 2.35 +
            economySupport +
            eerfShelter +
            (scienceRatio + beliefRatio) * 18_000 +
            territory.CarryingCapacity);
    }

    private static double ComputeOrderPressure(GameState current, double carryingCapacity, double harmony, double rivalry)
    {
        var scienceRatio = current.Science / CoreRules.KnowledgeCap;
        var beliefRatio = current.Belief / CoreRules.KnowledgeCap;
        var literatureRatio = current.LiteratureAndArt / CoreRules.KnowledgeCap;
        var overloadPenalty = Math.Max(0, current.Population - carryingCapacity) / 42_000;
        var povertyPenalty = current.Economy < current.Population * 0.22 ? 5 : 0;
        var territory = TerritoryDevelopmentEffects(current);
        var doctrineOrderTarget = 42 + beliefRatio * 58 + harmony * 12 + literatureRatio * 7 -
                                  scienceRatio * 14 - rivalry * 6 - overloadPenalty - povertyPenalty - territory.OrderDrag;
        return CoreRules.Clamp(CoreRules.JsRound((doctrineOrderTarget - current.Stability) / 10), -8, 9);
    }

    private static double ComputeSolowEconomyPressure(
        GameState current,
        double carryingCapacity,
        double harmony,
        double rivalry)
    {
        var scienceRatio = current.Science / CoreRules.KnowledgeCap;
        var beliefRatio = current.Belief / CoreRules.KnowledgeCap;
        var literatureRatio = current.LiteratureAndArt / CoreRules.KnowledgeCap;
        var labor = Math.Max(1, current.Population);
        var capital = Math.Max(1, current.Economy) + 24_000;
        var laborIndex = labor / 7_600.0;
        var capitalIndex = capital / 74_000.0;
        var scienceProductivity = 1 + scienceRatio * 1.35 + Math.Sqrt(scienceRatio) * 0.16;
        var orderProductivity = 0.94 + CoreRules.Clamp(current.Stability, 0, 100) / 500.0 + harmony * 0.08;
        var doctrineFriction = CoreRules.Clamp(
            1 - beliefRatio * 0.26 - Math.Max(0, beliefRatio - scienceRatio) * 0.09 + harmony * 0.04,
            0.62,
            1.04);
        var culturalCoordination = 1 + literatureRatio * 0.04;
        var totalFactorProductivity = scienceProductivity * orderProductivity * doctrineFriction * culturalCoordination;
        var territory = TerritoryDevelopmentEffects(current);
        var grossOutput = 15_500 *
                          totalFactorProductivity *
                          Math.Pow(capitalIndex, 0.34) *
                          Math.Pow(laborIndex, 0.62) *
                          territory.OutputMultiplier;
        var savingsRate = CoreRules.Clamp(
            0.34 + scienceRatio * 0.08 - beliefRatio * 0.09 +
            CoreRules.Clamp(current.Stability, 0, 100) / 1_000.0 + harmony * 0.04,
            0.24,
            0.52);
        var productiveInvestment = grossOutput * savingsRate;
        var depreciation = current.Economy * 0.023;
        var laborMaintenance = current.Population * (0.033 + beliefRatio * 0.004);
        var knowledgeAdministration = (current.Science + current.Belief) * 0.12;
        var eerfUpkeep = current.EerfLevel * 2_800;
        var rivalryCost = rivalry * (1_450 + (current.Science + current.Belief) * 0.055);
        var overloadCost = current.Population > carryingCapacity
            ? (current.Population - carryingCapacity) * 0.048
            : 0;
        var lowCapitalRebuild = current.Economy is > 0 and < 60_000
            ? (60_000 - current.Economy) * 0.055
            : 0;
        var treasuryDrag = current.Economy > 280_000
            ? Math.Pow((current.Economy - 280_000) / 100_000.0, 1.22) * 12_000
            : 0;

        return CoreRules.Clamp(
            CoreRules.JsRound(
                productiveInvestment +
                lowCapitalRebuild -
                depreciation -
                laborMaintenance -
                knowledgeAdministration -
                eerfUpkeep -
                rivalryCost -
                overloadCost -
                territory.AdministrationCost -
                treasuryDrag),
            -90_000,
            110_000);
    }

    private static TerritoryDevelopment TerritoryDevelopmentEffects(GameState current)
    {
        var territoryCount = current.TerritoryCount <= 0 ? 5 : current.TerritoryCount;
        var count = CoreRules.Clamp((int)CoreRules.JsRound(territoryCount), 0, 25);
        var expansion = Math.Max(0, count - 5);
        return new TerritoryDevelopment(
            CarryingCapacity: expansion * 2_200,
            OutputMultiplier: 1 + Math.Min(0.14, Math.Sqrt(expansion) * 0.032),
            AdministrationCost: CoreRules.JsRound(Math.Pow(expansion, 1.24) * 520),
            OrderDrag: CoreRules.JsRound(Math.Pow(Math.Max(0, count - 8), 1.16) * 0.72));
    }
}
