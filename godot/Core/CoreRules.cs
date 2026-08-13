using System;

namespace CradlesOfCivilization.Core;

internal static class CoreRules
{
    public const double KnowledgeCap = 20_000;
    public const int KnowledgeTrendMinimum = -180;
    public const int KnowledgeTrendMaximum = 240;

    private static readonly int[] EraThresholds =
    [
        0, 500, 1_200, 2_500, 4_000, 6_000, 8_000,
        10_000, 12_000, 14_000, 16_000, 18_000, 20_000
    ];

    public static double JsRound(double value) => Math.Floor(value + 0.5);

    public static double JsRound4(double value) => JsRound(value * 10_000) / 10_000;

    public static int Clamp(int value, int minimum, int maximum) => Math.Min(maximum, Math.Max(minimum, value));

    public static double Clamp(double value, double minimum, double maximum) => Math.Min(maximum, Math.Max(minimum, value));

    public static int EraIndexFor(double value)
    {
        var index = 0;
        for (var cursor = 0; cursor < EraThresholds.Length; cursor += 1)
        {
            if (value >= EraThresholds[cursor])
            {
                index = cursor;
            }
        }

        return index;
    }

    public static double KnowledgeHarmony(double science, double belief)
    {
        var logGap = Math.Abs(Math.Log((science + 600) / (belief + 600)));
        return Clamp(1 - logGap / Math.Log(2.25), 0, 1);
    }
}
