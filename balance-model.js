"use strict";

(function exposeCradlesBalance(root) {
  const TERRAIN_EFFECTS = Object.freeze({
    tundra: { label: "冻原", attack: -3, defense: 3, attrition: 1.05 },
    coast: { label: "海岸", attack: -2, defense: 3, attrition: 1.02 },
    mountain: { label: "山地", attack: -5, defense: 6, attrition: 1.1 },
    plain: { label: "平原", attack: 4, defense: -2, attrition: 0.98 },
    basin: { label: "盆地", attack: 1, defense: 1, attrition: 1 },
    urban: { label: "城邦", attack: -4, defense: 6, attrition: 1.05 },
    salt: { label: "盐碱地", attack: 3, defense: -3, attrition: 1.07 },
    river: { label: "河谷", attack: -4, defense: 5, attrition: 1.06 },
    waste: { label: "荒原", attack: 2, defense: -3, attrition: 1.08 },
    canyon: { label: "峡谷", attack: -5, defense: 7, attrition: 1.08 }
  });

  const GOVERNOR_EFFECTS = Object.freeze({
    "east-asian-man": { populationGrowth: 1.08, defense: 6, beliefGrowth: 1, economyGrowth: 1, terrainMastery: 1, fullIntel: false },
    "white-woman": { populationGrowth: 1, defense: 0, attack: 6, beliefGrowth: 1.08, economyGrowth: 1, terrainMastery: 1, fullIntel: false },
    "black-man": { populationGrowth: 1, defense: 0, attack: 0, beliefGrowth: 1, economyGrowth: 1.1, terrainMastery: 1.35, fullIntel: false },
    listener: { populationGrowth: 1, defense: 0, attack: 0, beliefGrowth: 1, economyGrowth: 1, terrainMastery: 1, fullIntel: true }
  });

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function governorEffects(governorId) {
    return GOVERNOR_EFFECTS[governorId] || GOVERNOR_EFFECTS["east-asian-man"];
  }

  function terrainProfile(terrainId, governorId = null) {
    const base = TERRAIN_EFFECTS[terrainId] || TERRAIN_EFFECTS.plain;
    const mastery = governorEffects(governorId).terrainMastery || 1;
    const master = (value) => value >= 0 ? value * mastery : value / mastery;
    return {
      ...base,
      attack: Math.round(master(base.attack)),
      defense: Math.round(master(base.defense)),
      attrition: 1 + (base.attrition - 1) / mastery
    };
  }

  function resolveDecisiveBattle(input = {}) {
    const attackerForce = Math.max(0, Math.round(Number(input.attackerForce) || 0));
    const defenderForce = Math.max(0, Math.round(Number(input.defenderForce) || 0));
    const garrisonForce = Math.max(0, Math.round(Number(input.garrisonForce) || 0));
    const seed = Math.abs(Math.round(Number(input.seed) || 1));
    const swing = 0.92 + (seed % 1601) / 10000;
    const attackEfficiency = clamp(
      (1 + (Number(input.attackRating) || 0) / 180) * (1 + (Number(input.terrainAttack) || 0) / 100) * swing,
      0.35,
      2.2
    );
    const defenseEfficiency = clamp(
      (1 + (Number(input.defenseRating) || 0) / 180) * (1 + (Number(input.terrainDefense) || 0) / 100) / swing,
      0.35,
      2.35
    );
    const attackPower = attackerForce * attackEfficiency;
    const defenseBase = defenderForce + garrisonForce;
    const defensePower = defenseBase * defenseEfficiency;
    const attackerWon = attackPower >= defensePower && attackerForce > 0;
    const engaged = attackerForce + defenderForce + garrisonForce;

    if (attackerWon) {
      const ratio = attackPower > 0 ? clamp(defensePower / attackPower, 0, 0.9999) : 1;
      const survivors = Math.max(1, Math.round(attackerForce * Math.sqrt(1 - ratio * ratio) * 0.94));
      return {
        attackerWon: true,
        attackerSurvivors: survivors,
        defenderSurvivors: 0,
        attackerCasualties: attackerForce - survivors,
        defenderCasualties: defenderForce,
        engaged,
        scale: engaged >= 20000 ? "bloodbath" : "battle"
      };
    }

    const ratio = defensePower > 0 ? clamp(attackPower / defensePower, 0, 0.9999) : 1;
    const combinedSurvivors = Math.max(1, Math.round(defenseBase * Math.sqrt(1 - ratio * ratio) * 0.94));
    const defenderShare = defenseBase > 0 ? defenderForce / defenseBase : 0;
    const defenderSurvivors = Math.max(0, Math.round(combinedSurvivors * defenderShare));
    return {
      attackerWon: false,
      attackerSurvivors: 0,
      defenderSurvivors,
      attackerCasualties: attackerForce,
      defenderCasualties: Math.max(0, defenderForce - defenderSurvivors),
      engaged,
      scale: engaged >= 20000 ? "bloodbath" : "battle"
    };
  }

  function territoryDevelopmentEffects(territoryCount) {
    const count = clamp(Math.round(Number(territoryCount) || 0), 0, 25);
    const expansion = Math.max(0, count - 5);
    return {
      carryingCapacity: expansion * 2200,
      outputMultiplier: 1 + Math.min(0.14, Math.sqrt(expansion) * 0.032),
      administrationCost: Math.round(Math.pow(expansion, 1.24) * 520),
      orderDrag: Math.round(Math.pow(Math.max(0, count - 8), 1.16) * 0.72)
    };
  }

  root.CRADLES_BALANCE = Object.freeze({
    TERRAIN_EFFECTS,
    GOVERNOR_EFFECTS,
    governorEffects,
    terrainProfile,
    resolveDecisiveBattle,
    territoryDevelopmentEffects
  });
})(typeof window !== "undefined" ? window : globalThis);
