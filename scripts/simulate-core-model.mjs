import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = { console };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "balance-model.js"), "utf8"), context, { filename: "balance-model.js" });

const model = context.CRADLES_BALANCE;
const trials = Math.max(1000, Math.round(Number(process.argv[2]) || 20000));

function winRate(terrain, governorId) {
  let wins = 0;
  const profile = model.terrainProfile(terrain, governorId);
  for (let seed = 1; seed <= trials; seed += 1) {
    const result = model.resolveDecisiveBattle({
      attackerForce: 7000,
      defenderForce: 5200,
      garrisonForce: 1750,
      attackRating: 34,
      defenseRating: 38,
      terrainAttack: profile.attack,
      terrainDefense: model.terrainProfile(terrain).defense,
      seed
    });
    if (result.attackerWon) wins += 1;
  }
  return Math.round(wins / trials * 1000) / 10;
}

function expectedStreakCivilizations(successChance, streak) {
  const p = Math.max(0.0001, Math.min(0.9999, successChance));
  return (1 - Math.pow(p, streak)) / ((1 - p) * Math.pow(p, streak));
}

const terrainRates = Object.keys(model.TERRAIN_EFFECTS).map((terrain) => ({
  terrain,
  normal: winRate(terrain, "east-asian-man"),
  terrainMaster: winRate(terrain, "black-man")
}));

const territoryCurve = [5, 10, 15, 20, 25].map((territories) => ({
  territories,
  ...model.territoryDevelopmentEffects(territories)
}));

const memoryStreak = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75].map((chance) => ({
  perCivilizationChance: `${Math.round(chance * 100)}%`,
  expectedCivilizationsForJ: Math.round(expectedStreakCivilizations(chance, 3) * 10) / 10
}));

console.log(JSON.stringify({
  trials,
  assumptions: {
    battle: "7000 attackers versus 5200 defenders plus 1750 garrison",
    jEnding: "three consecutive civilizations reach LA 18000"
  },
  terrainWinRatesPercent: terrainRates,
  territoryCurve,
  memoryStreak
}, null, 2));
