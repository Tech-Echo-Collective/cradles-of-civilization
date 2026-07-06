use serde::Serialize;

const CAP: u32 = 20_000;
const C_STAGNANT_CIVILIZATION_STREAK: u8 = 5;
const C_EARLY_ERA_BREAKTHROUGH: u32 = 1_100;
const RNG_MOD: u64 = 2_147_483_647;

#[derive(Serialize)]
pub struct BuildInfo {
    product: &'static str,
    version: &'static str,
    channel: &'static str,
    rules_cap: u32,
    c_stagnant_generations: u8,
    c_breakthrough: u32,
    author: &'static str,
}

#[derive(Serialize)]
pub struct SeedInfo {
    seed: u64,
}

pub fn build_info() -> BuildInfo {
    BuildInfo {
        product: "Cradles Of Civilization",
        version: env!("CARGO_PKG_VERSION"),
        channel: "windows-desktop",
        rules_cap: CAP,
        c_stagnant_generations: C_STAGNANT_CIVILIZATION_STREAK,
        c_breakthrough: C_EARLY_ERA_BREAKTHROUGH,
        author: "Noah Walker",
    }
}

pub fn normalize_seed(seed: Option<String>) -> SeedInfo {
    let parsed = seed
        .and_then(|value| value.trim().parse::<i128>().ok())
        .map(i128::abs)
        .unwrap_or(1);
    let normalized = (parsed as u128 % RNG_MOD as u128) as u64;

    SeedInfo {
        seed: if normalized > 0 { normalized } else { 1 },
    }
}
