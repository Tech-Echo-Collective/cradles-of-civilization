namespace CradlesOfCivilization.Core;

public sealed class GameState
{
    public const long DefaultSeed = 1_058;

    public long Seed { get; private set; }
    public long RngState { get; set; }
    public int Turn { get; set; }
    public double Science { get; set; }
    public double Belief { get; set; }
    public double LiteratureAndArt { get; set; }
    public long Population { get; set; }
    public long Economy { get; set; }
    public int Stability { get; set; }
    public int ScienceTrend { get; set; }
    public int BeliefTrend { get; set; }
    public int LastRand { get; set; }
    public int LastSpec { get; set; }
    public int EerfLevel { get; set; }
    public int TerritoryCount { get; set; }
    public string LastAction { get; set; } = "文明苏醒";
    public string LastEvent { get; set; } = "等待观测";

    public GameState(long seed = DefaultSeed)
    {
        Reset(seed);
    }

    public void Reset(long seed)
    {
        Seed = Lcg.NormalizeSeed(seed);
        RngState = Seed;
        Turn = 0;
        Science = 240;
        Belief = 360;
        LiteratureAndArt = 0;
        Population = 7_600;
        Economy = 50_000;
        Stability = 52;
        ScienceTrend = 12;
        BeliefTrend = 16;
        LastRand = 0;
        LastSpec = 0;
        EerfLevel = 0;
        TerritoryCount = 5;
        LastAction = "文明苏醒";
        LastEvent = "等待观测";
    }
}
