namespace CradlesOfCivilization.Core;

public sealed class Lcg
{
    public const long Modulus = 2_147_483_647;
    public const long Multiplier = 48_271;

    public long State { get; private set; }

    public Lcg(long seed)
    {
        State = NormalizeSeed(seed);
    }

    public double Next()
    {
        State = State * Multiplier % Modulus;
        return (double)State / Modulus;
    }

    public int NextInt(int maximum)
    {
        return (int)System.Math.Floor(Next() * maximum);
    }

    public static long NormalizeSeed(long value)
    {
        var seed = value % Modulus;
        if (seed < 0)
        {
            seed = -seed;
        }

        return seed > 0 ? seed : 1;
    }
}
