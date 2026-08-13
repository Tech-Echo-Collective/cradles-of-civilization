using System;
using System.Collections.Generic;

namespace CradlesOfCivilization.Core;

public sealed class GameState
{
    public const long DefaultSeed = 1_058;

    public int SaveVersion { get; set; } = 1;
    public long Seed { get; set; }
    public long RngState { get; set; }
    public string RealmName { get; set; } = "长生军";
    public string Difficulty { get; set; } = "normal";
    public string GovernorId { get; set; } = "east-asian-man";
    public bool SetupComplete { get; set; }
    public string SetupStage { get; set; } = "name";
    public int Turn { get; set; }
    public int Civilization { get; set; } = 1;
    public double Science { get; set; }
    public double Belief { get; set; }
    public double LiteratureAndArt { get; set; }
    public long Population { get; set; }
    public long Economy { get; set; }
    public int Stability { get; set; }
    public int ScienceTrend { get; set; }
    public int BeliefTrend { get; set; }
    public double PopulationGrowthMultiplier { get; set; } = 1;
    public double KnowledgeGrowthMultiplier { get; set; } = 1;
    public double ControlEfficiencyMultiplier { get; set; } = 1;
    public bool ControlLocked { get; set; }
    public int PopulationLockTurns { get; set; }
    public int DoomCountdown { get; set; }
    public long? LockedPopulation { get; set; }
    public int EerfLevel { get; set; }
    public int TerritoryCount { get; set; } = 5;
    public int LastRand { get; set; }
    public int LastSpec { get; set; }
    public string LastAction { get; set; } = "文明苏醒";
    public string LastEvent { get; set; } = "等待观测";
    public string Weather { get; set; } = "等待观测";
    public string EndingStatus { get; set; } = "文明的旅程尚未停息。";
    public bool AwaitingCivilizationRestart { get; set; }
    public RestartState? PendingRestart { get; set; }
    public EndingCandidate? EndingCandidate { get; set; }
    public bool Finished { get; set; }
    public FinalEnding? FinalEnding { get; set; }
    public int StagnantCivilizationStreak { get; set; }
    public int LowOrderCivilizationStreak { get; set; }
    public int LaMemoryCivilizationStreak { get; set; }
    public CivilizationRecord CurrentCivilization { get; set; } = new();
    public List<CivilizationRecord> History { get; set; } = [];
    public List<ChronicleEntry> Chronicle { get; set; } = [];

    public GameState(long seed = DefaultSeed)
    {
        Reset(seed);
    }

    public void Reset(long seed)
    {
        Seed = Lcg.NormalizeSeed(seed);
        RngState = Seed;
        Turn = 0;
        Civilization = 1;
        SetupComplete = false;
        SetupStage = "name";
        Science = 240;
        Belief = 360;
        LiteratureAndArt = 0;
        Population = 7_600;
        Economy = 50_000;
        Stability = 52;
        ScienceTrend = 12;
        BeliefTrend = 16;
        PopulationGrowthMultiplier = 1;
        KnowledgeGrowthMultiplier = 1;
        ControlEfficiencyMultiplier = 1;
        ControlLocked = false;
        PopulationLockTurns = 0;
        DoomCountdown = 0;
        LockedPopulation = null;
        EerfLevel = 0;
        TerritoryCount = 5;
        LastRand = 0;
        LastSpec = 0;
        LastAction = "文明苏醒";
        LastEvent = "等待观测";
        Weather = "等待观测";
        EndingStatus = "文明的旅程尚未停息。";
        AwaitingCivilizationRestart = false;
        PendingRestart = null;
        EndingCandidate = null;
        Finished = false;
        FinalEnding = null;
        StagnantCivilizationStreak = 0;
        LowOrderCivilizationStreak = 0;
        LaMemoryCivilizationStreak = 0;
        CurrentCivilization = CivilizationRecord.Create(1, 0, Snapshot());
        History = [];
        Chronicle =
        [
            new ChronicleEntry
            {
                Turn = 0,
                Type = "progress",
                Title = "第 1 号文明苏醒",
                Text = "三颗恒星在天幕上留下互相矛盾的轨迹。"
            }
        ];
    }

    public MetricSnapshot Snapshot()
    {
        return new MetricSnapshot(Science, Belief, LiteratureAndArt, Population, Economy, Stability, EerfLevel);
    }
}

public readonly record struct MetricSnapshot(
    double Science,
    double Belief,
    double LiteratureAndArt,
    long Population,
    long Economy,
    int Stability,
    int EerfLevel);

public sealed class RestartState
{
    public int NextCivilization { get; set; }
    public double Science { get; set; }
    public double Belief { get; set; }
    public int ScienceTrend { get; set; }
    public int BeliefTrend { get; set; }
    public long Population { get; set; }
    public long Economy { get; set; }
    public int Stability { get; set; }
    public int EerfLevel { get; set; }
    public string CollapseCause { get; set; } = "未知灾变";
}

public sealed class EndingCandidate
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int Turn { get; set; }
    public int Rand { get; set; }
    public string Trigger { get; set; } = "";
    public MetricSnapshot Snapshot { get; set; }
}

public sealed class FinalEnding
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Trigger { get; set; } = "";
    public int Turn { get; set; }
    public int Civilization { get; set; }
    public int Rand { get; set; }
    public MetricSnapshot Snapshot { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class CivilizationRecord
{
    public int Civilization { get; set; }
    public int StartTurn { get; set; }
    public int Turns { get; set; }
    public double PeakScience { get; set; }
    public double PeakBelief { get; set; }
    public double PeakLiteratureAndArt { get; set; }
    public long PeakPopulation { get; set; }
    public long PeakEconomy { get; set; }
    public int PeakEerf { get; set; }
    public int PeakStability { get; set; }
    public int MinimumStability { get; set; }
    public bool HadLaCap { get; set; }
    public bool HadLowOrder { get; set; }
    public string CollapseCause { get; set; } = "";
    public MetricSnapshot FinalSnapshot { get; set; }

    public static CivilizationRecord Create(int civilization, int startTurn, MetricSnapshot snapshot)
    {
        return new CivilizationRecord
        {
            Civilization = civilization,
            StartTurn = startTurn,
            PeakScience = snapshot.Science,
            PeakBelief = snapshot.Belief,
            PeakLiteratureAndArt = snapshot.LiteratureAndArt,
            PeakPopulation = snapshot.Population,
            PeakEconomy = snapshot.Economy,
            PeakEerf = snapshot.EerfLevel,
            PeakStability = snapshot.Stability,
            MinimumStability = snapshot.Stability,
            FinalSnapshot = snapshot
        };
    }

    public void Observe(MetricSnapshot snapshot, int turn)
    {
        Turns = Math.Max(1, turn - StartTurn);
        PeakScience = Math.Max(PeakScience, snapshot.Science);
        PeakBelief = Math.Max(PeakBelief, snapshot.Belief);
        PeakLiteratureAndArt = Math.Max(PeakLiteratureAndArt, snapshot.LiteratureAndArt);
        PeakPopulation = Math.Max(PeakPopulation, snapshot.Population);
        PeakEconomy = Math.Max(PeakEconomy, snapshot.Economy);
        PeakEerf = Math.Max(PeakEerf, snapshot.EerfLevel);
        PeakStability = Math.Max(PeakStability, snapshot.Stability);
        MinimumStability = Math.Min(MinimumStability, snapshot.Stability);
        HadLaCap |= snapshot.LiteratureAndArt >= 18_000;
        HadLowOrder |= snapshot.Stability < 20;
        FinalSnapshot = snapshot;
    }
}

public sealed class ChronicleEntry
{
    public int Turn { get; set; }
    public string Type { get; set; } = "progress";
    public string Title { get; set; } = "";
    public string Text { get; set; } = "";
}
