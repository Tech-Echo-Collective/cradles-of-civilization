import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const memoryStore = new Map();
const context = vm.createContext({
  console,
  document: {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    documentElement: {},
    body: {}
  },
  localStorage: {
    getItem(key) { return memoryStore.get(key) ?? null; },
    setItem(key, value) { memoryStore.set(key, String(value)); },
    removeItem(key) { memoryStore.delete(key); }
  },
  location: { href: "http://localhost/index.html" },
  history: { replaceState() {} },
  performance: { now: () => 0 },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  setTimeout: () => 0,
  clearTimeout() {},
  confirm: () => true,
  URL,
  Intl
});
context.window = context;
context.window.addEventListener = () => {};
context.window.history = context.history;
context.window.location = context.location;

vm.runInContext(fs.readFileSync(path.join(projectRoot, "endings.js"), "utf8"), context, { filename: "endings.js" });
vm.runInContext(fs.readFileSync(path.join(projectRoot, "balance-model.js"), "utf8"), context, { filename: "balance-model.js" });
vm.runInContext(fs.readFileSync(path.join(projectRoot, "game.js"), "utf8"), context, { filename: "game.js" });

const report = vm.runInContext(`(() => {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const connectedRegionCount = (blueprint) => {
    const visited = new Set([MAP_REGIONS[0].id]);
    const queue = [MAP_REGIONS[0].id];
    while (queue.length) {
      const current = queue.shift();
      blueprint.roads.forEach((road) => {
        const next = road.a === current ? road.b : road.b === current ? road.a : null;
        if (next && !visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      });
    }
    return visited.size;
  };

  const firstMap = generateMapBlueprint(314159);
  const sameMap = generateMapBlueprint(314159);
  const secondMap = generateMapBlueprint(271828);
  check(MAP_REGIONS.length === 25, "map must contain 25 regions");
  check(firstMap.roads.length >= 24, "map must contain a spanning road network");
  check(connectedRegionCount(firstMap) === MAP_REGIONS.length, "all regions must be reachable by road");
  check(JSON.stringify(firstMap) === JSON.stringify(sameMap), "the same seed must reproduce the same map");
  check(JSON.stringify(firstMap) !== JSON.stringify(secondMap), "different seeds must change the map");

  state = createNewState(314159);
  state.realmName = "回归测试国";
  state.setupComplete = true;
  state.map = createInitialMapState({}, {
    seed: state.seed,
    realmName: state.realmName,
    difficulty: state.difficulty
  });
  state.military = createInitialMilitaryState(snapshot(), { difficulty: state.difficulty });
  alignArmiesWithEntityTerritories();
  check(entityRegions(PLAYER_ENTITY_ID).length === 5, "the chosen capital must generate five starting territories");
  check(mapStateRegion("capital").controllerId === PLAYER_ENTITY_ID, "the chosen starting region must belong to the player");
  const levyRegion = mapStateRegion(primaryPlayerArmy().regionId);
  state.selectedRegionId = levyRegion.id;
  state.selectedArmyId = primaryPlayerArmy().id;
  const levyArmyCount = entityArmies(PLAYER_ENTITY_ID).length;
  const levyForceBefore = primaryPlayerArmy().force;
  applyMilitaryPolicy(SPECIAL_DECISIONS.levyHost);
  check(entityArmies(PLAYER_ENTITY_ID).length === levyArmyCount, "levying on an occupied region must merge into its army");
  check(primaryPlayerArmy().force > levyForceBefore, "a merged levy must increase the stationed army force");
  const emptyLevyRegion = entityRegions(PLAYER_ENTITY_ID).find((region) => !armiesAtRegion(region.id).some((army) => army.entityId === PLAYER_ENTITY_ID));
  state.selectedRegionId = emptyLevyRegion.id;
  applyMilitaryPolicy(SPECIAL_DECISIONS.levyHost);
  const fieldArmy = entityArmies(PLAYER_ENTITY_ID).find((army) => army.regionId === emptyLevyRegion.id);
  check(Boolean(fieldArmy), "levying on an empty controlled region must create a field army");
  state.military = normalizeMilitaryState(state.military, state);
  check(Boolean(armyById(fieldArmy.id)), "custom field armies must survive save normalization");
  const inheritedSnapshot = createTerritoryInheritanceSnapshot();
  check(
    inheritedSnapshot.regions.every((region) => !Object.prototype.hasOwnProperty.call(region, "fortification")),
    "civilization inheritance must preserve borders without military fortifications"
  );
  const inheritedMap = createInitialMapState(inheritedSnapshot, {
    seed: state.seed,
    realmName: state.realmName,
    difficulty: state.difficulty,
    startingRegionId: state.startingRegionId
  });
  check(
    inheritedMap.regions.every((region) => region.controllerId === state.map.regions.find((current) => current.id === region.id)?.controllerId),
    "civilization restart must preserve every territorial controller"
  );

  state.mapUiExpanded = false;
  for (let year = 1; year <= 180; year += 1) {
    state.turn = year;
    resolveAbstractStrategicYear((year * 7919) % 10000);
  }
  check(
    politicalEntities().every((entity) => entityRegions(entity.id).length >= 4),
    "collapsed map simulation must preserve every political entity"
  );

  state.map.regions
    .filter((region) => region.controllerId === NEUTRAL_ENTITY_ID)
    .forEach((region) => setRegionController(region, PLAYER_ENTITY_ID));
  const eliminated = eliminateDefeatedEntities();
  check(eliminated.some((entity) => entity.id === NEUTRAL_ENTITY_ID), "territory loss must eliminate the political entity");
  check(!armies().some((army) => army.entityId === NEUTRAL_ENTITY_ID), "elimination must remove every military unit");

  state.sc = 0;
  const lowTechnologyBonus = militaryTechnologyBonus(primaryPlayerArmy());
  state.sc = CAP;
  const highTechnologyBonus = militaryTechnologyBonus(primaryPlayerArmy());
  check(highTechnologyBonus > lowTechnologyBonus, "science must increase military technology bonus");

  const casualtyBattle = BALANCE_MODEL.resolveBattleCasualties({
    attackerForce: 9000,
    defenderForce: 8200,
    combatDifference: 24,
    technologyGap: 1,
    seed: 1058
  });
  check(
    casualtyBattle.attackerCasualtyRate >= 0.05 && casualtyBattle.attackerCasualtyRate <= 0.95 &&
      casualtyBattle.defenderCasualtyRate >= 0.05 && casualtyBattle.defenderCasualtyRate <= 0.95,
    "an era-advantaged battle must keep casualty rates within 5%-95%"
  );
  check(casualtyBattle.attackerSurvivors > 0 && casualtyBattle.defenderSurvivors > 0, "surviving armies must be able to retreat");
  const battleScales = new Set();
  for (let roll = 1; roll <= 10000; roll += 1) {
    const sample = BALANCE_MODEL.resolveBattleCasualties({
      attackerForce: 8000,
      defenderForce: 8000,
      combatDifference: (roll % 3 - 1) * 48,
      technologyGap: roll % 2,
      seed: roll
    });
    battleScales.add(sample.scale);
  }
  check(["conflict", "battle", "bloodbath"].every((scale) => battleScales.has(scale)), "the casualty model must produce conflicts, battles, and bloodbaths");
  const destroyedRoster = { ...state.military, armies: armies().filter((army) => army.entityId !== PLAYER_ENTITY_ID) };
  state.military = normalizeMilitaryState(destroyedRoster, state);
  check(!primaryPlayerArmy(), "loading a save must not resurrect a destroyed player army");
  state.military = createInitialMilitaryState(snapshot(), { difficulty: state.difficulty });
  alignArmiesWithEntityTerritories();
  check(Boolean(primaryPlayerArmy()), "a new civilization must begin with a fresh army");
  state.governorId = DEFAULT_GOVERNOR_ID;
  const foggedRegions = visibleMilitaryRegionIds().size;
  state.governorId = "listener";
  check(visibleMilitaryRegionIds().size === MAP_REGIONS.length, "the listener must remove the fog of war");
  check(foggedRegions < MAP_REGIONS.length, "ordinary governors must retain fog of war");
  const collapsedMap = collapseMapState("测试灾变");
  check(
    collapsedMap.regions.every((region) => region.owner === MAP_OWNER_RUINS && region.controllerId === null),
    "civilization collapse must create red ruins without granting the map to a rival state"
  );

  const disasterRates = {};
  ["easy", "normal", "hard", "ultimate"].forEach((difficulty) => {
    state.difficulty = difficulty;
    let disasters = 0;
    for (let roll = 0; roll < 10000; roll += 1) {
      state.turn = roll;
      if (doomEvent(roll, snapshot())) disasters += 1;
    }
    disasterRates[difficulty] = disasters / 10000;
  });
  check(disasterRates.easy < disasterRates.normal, "easy difficulty must reduce disaster frequency");
  check(disasterRates.normal < disasterRates.hard, "hard difficulty must increase disaster frequency");
  check(disasterRates.hard < disasterRates.ultimate, "ultimate difficulty must have the highest disaster frequency");

  const migrated = createInitialMapState({
    seed: 1058,
    regions: [{ id: "capital", owner: MAP_OWNER_PLAYER, fortification: 66 }]
  }, { seed: 1058, realmName: "旧存档", difficulty: "normal" });
  check(migrated.regions.length === 25, "old saves must expand to the v0.3.3 region set");
  check(migrated.roads.length >= 24, "old saves must receive a connected seeded road network");

  const alternateStart = createInitialMapState({}, {
    seed: 314159,
    realmName: "选地测试国",
    difficulty: "normal",
    startingRegionId: "lastLight"
  });
  check(alternateStart.regions.find((region) => region.id === "lastLight")?.controllerId === PLAYER_ENTITY_ID, "the player must be able to choose another capital");

  return {
    regions: MAP_REGIONS.length,
    roads: firstMap.roads.length,
    connectedRegions: connectedRegionCount(firstMap),
    eliminatedEntity: eliminated.find((entity) => entity.id === NEUTRAL_ENTITY_ID)?.name,
    technologyBonus: [lowTechnologyBonus, highTechnologyBonus],
    casualtyBattle,
    foggedRegions,
    disasterRates
  };
})()`, context, { filename: "engine-regression.js" });

console.log(JSON.stringify(report, null, 2));
