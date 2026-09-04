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
vm.runInContext(fs.readFileSync(path.join(projectRoot, "map-lab/map-data.js"), "utf8"), context, { filename: "map-data.js" });
vm.runInContext(fs.readFileSync(path.join(projectRoot, "map-lab/map-model.js"), "utf8"), context, { filename: "map-model.js" });
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
  const controllerSignature = (mapState) => mapState.regions
    .map((region) => region.id + ":" + (region.controllerId || "none"))
    .sort()
    .join("|");
  const checkTerritoryPartition = (mapState, label) => {
    const ids = mapState.regions.map((region) => region.id);
    check(ids.length === 64 && new Set(ids).size === 64, label + " must cover all 64 provinces exactly once");
    check(ids.every((id) => STRATEGIC_GEOGRAPHY.provinceById[id]), label + " must only contain fixed-map province ids");
    check(mapState.regions.every((region) => POLITICAL_ENTITY_IDS.includes(region.controllerId)), label + " must assign every province to a political entity");
    const territoryCounts = POLITICAL_ENTITY_IDS.map((entityId) => {
      const controlled = mapState.regions.filter((region) => region.controllerId === entityId).map((region) => region.id);
      check(STRATEGIC_MAP_MODEL.isConnectedSubset(controlled, STRATEGIC_GEOGRAPHY.neighbors), label + " must keep " + entityId + " contiguous");
      return controlled.length;
    });
    check(territoryCounts.join(",") === "13,13,13,13,12", label + " must split provinces 13/13/13/13/12 in political-entity order");
  };
  const armyRosterPaths = (value, prefix = "") => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) => {
      const path = prefix ? prefix + "." + key : key;
      if (key === "armies" && Array.isArray(child)) return [path];
      return armyRosterPaths(child, path);
    });
  };

  const firstMap = generateMapBlueprint(314159);
  const sameMap = generateMapBlueprint(314159);
  const secondMap = generateMapBlueprint(271828);
  check(MAP_REGIONS.length === 64, "the formal game must use all 64 fixed provinces");
  check(STRATEGIC_GEOGRAPHY.signature === "342bf330", "the formal game must use the reviewed fixed geography revision");
  check(STRATEGIC_GEOGRAPHY.sharedEdges.length === 167, "the fixed geography must retain exactly 167 adjacencies");
  check(firstMap.roads.length === 167, "the formal blueprint must expose every fixed adjacency");
  check(connectedRegionCount(firstMap) === MAP_REGIONS.length, "all regions must be reachable by road");
  check(JSON.stringify(firstMap) === JSON.stringify(sameMap), "the same seed must reproduce the same map");
  check(JSON.stringify(firstMap) === JSON.stringify(secondMap), "different seeds must not change fixed geography");

  const defaultOpeningMap = createInitialMapState({}, {
    seed: 314159,
    realmName: "默认起点测试国",
    difficulty: "normal",
    startingRegionId: "cb05"
  });
  const secondOpeningMap = createInitialMapState({}, {
    seed: 271828,
    realmName: "异种子测试国",
    difficulty: "normal",
    startingRegionId: "cb05"
  });
  const alternateOpeningMap = createInitialMapState({}, {
    seed: 314159,
    realmName: "异起点测试国",
    difficulty: "normal",
    startingRegionId: "ld05"
  });
  checkTerritoryPartition(defaultOpeningMap, "default opening");
  checkTerritoryPartition(secondOpeningMap, "second-seed opening");
  checkTerritoryPartition(alternateOpeningMap, "alternate-capital opening");
  check(controllerSignature(defaultOpeningMap) !== controllerSignature(secondOpeningMap), "different seeds must be able to change political controllers");
  check(defaultOpeningMap.startingRegionId === "cb05", "the default formal starting province must be cb05");
  check(defaultOpeningMap.regions.find((region) => region.id === "cb05")?.controllerId === PLAYER_ENTITY_ID, "cb05 must belong to the player when chosen");
  check(alternateOpeningMap.regions.find((region) => region.id === "ld05")?.controllerId === PLAYER_ENTITY_ID, "an alternate province must belong to the player when chosen");
  check(defaultOpeningMap.regions.filter((region) => region.controllerId === PLAYER_ENTITY_ID).length === 13, "the player must open with 13 provinces");
  check(alternateOpeningMap.regions.filter((region) => region.controllerId === PLAYER_ENTITY_ID).length === 13, "an alternate capital must also open with 13 provinces");

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
  check(entityRegions(PLAYER_ENTITY_ID).length === 13, "the chosen capital must generate thirteen connected starting provinces");
  check(mapStateRegion("cb05").controllerId === PLAYER_ENTITY_ID, "the chosen starting province must belong to the player");
  check(armyRosterPaths(state).join(",") === "military.armies", "formal state must contain exactly one army roster at military.armies");
  const openingTerritoryEffects = territoryDevelopmentEffects();
  const legacyFiveTerritoryEffects = BALANCE_MODEL.territoryDevelopmentEffects(5);
  check(JSON.stringify(openingTerritoryEffects) === JSON.stringify(legacyFiveTerritoryEffects), "thirteen opening provinces must retain the old five-territory balance baseline");
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
  check(!Object.prototype.hasOwnProperty.call(inheritedSnapshot, "layout"), "civilization inheritance must not persist fixed map layout");
  check(!Object.prototype.hasOwnProperty.call(inheritedSnapshot, "roads"), "civilization inheritance must not persist fixed map roads");
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
  const strategicBusinessSnapshot = JSON.stringify({
    turn: state.turn,
    map: state.map,
    military: state.military,
    specialDecisionState: state.specialDecisionState,
    selectedRegionId: state.selectedRegionId,
    selectedArmyId: state.selectedArmyId
  });
  setStrategicMapViewMode("terrain");
  toggleStrategicMapRelief();
  toggleStrategicMapRelief();
  resetStrategicMapCamera(false);
  setStrategicMapViewMode("political");
  check(
    JSON.stringify({
      turn: state.turn,
      map: state.map,
      military: state.military,
      specialDecisionState: state.specialDecisionState,
      selectedRegionId: state.selectedRegionId,
      selectedArmyId: state.selectedArmyId
    }) === strategicBusinessSnapshot,
    "map layer, relief, and camera controls must not mutate formal game state"
  );
  check(!Object.prototype.hasOwnProperty.call(state, "strategicMapView"), "view-only map state must never enter the formal save object");

  const fakeMapTarget = (kind, id) => ({
    closest(selector) {
      if (kind === "army" && selector === "[data-army]") return { dataset: { army: id } };
      if (kind === "region" && selector === "[data-region]") return { dataset: { region: id } };
      return null;
    }
  });
  dom.strategicMapSvg = {
    setPointerCapture() {},
    classList: { add() {}, remove() {} }
  };
  dom.actionButtons = [];
  const tapRegionId = MAP_REGIONS.find((region) => region.id !== state.selectedRegionId).id;
  const duplicateClickRegionId = MAP_REGIONS.find((region) => region.id !== tapRegionId).id;
  handleStrategicMapPointerDown({
    pointerType: "mouse",
    button: 0,
    pointerId: 1,
    clientX: 100,
    clientY: 100,
    target: fakeMapTarget("region", tapRegionId)
  });
  finishStrategicMapPointer({ type: "pointerup", pointerId: 1 });
  check(state.selectedRegionId === tapRegionId, "a captured pointer tap must select its pointerdown province");
  check(strategicMapView.suppressClick, "a captured pointer tap must suppress its synthetic follow-up click");
  handleMapInteraction({ target: fakeMapTarget("region", duplicateClickRegionId) });
  check(state.selectedRegionId === tapRegionId, "the suppressed follow-up click must not activate a second province");

  strategicMapView.suppressClick = false;
  handleStrategicMapPointerDown({
    pointerType: "mouse",
    button: 0,
    pointerId: 2,
    clientX: 120,
    clientY: 120,
    target: fakeMapTarget("region", duplicateClickRegionId)
  });
  strategicMapView.dragState.total = 6;
  finishStrategicMapPointer({ type: "pointerup", pointerId: 2 });
  check(state.selectedRegionId === tapRegionId, "dragging farther than five pixels must never activate a province");

  strategicMapView.suppressClick = false;
  const tapArmy = armies().find((army) => army.id !== state.selectedArmyId);
  handleStrategicMapPointerDown({
    pointerType: "touch",
    button: 0,
    pointerId: 3,
    clientX: 140,
    clientY: 140,
    target: fakeMapTarget("army", tapArmy.id)
  });
  finishStrategicMapPointer({ type: "pointerup", pointerId: 3 });
  check(state.selectedArmyId === tapArmy.id, "a captured touch tap must select its pointerdown army");
  check(state.selectedRegionId === tapArmy.regionId, "selecting an army must select its formal stationed province");
  strategicMapView.suppressClick = false;
  dom.strategicMapSvg = null;
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

  const legacyBase = createNewState(1058);
  const legacyHistory = [{
    civilization: 2,
    turns: 19,
    startTurn: 7,
    collapseCause: "旧日测试风暴",
    finalSnapshot: { sc: 3100, be: 2900, la: 400, pop: 18000, eco: 81000, stability: 31 }
  }];
  const legacyRegionIds = Object.keys(LEGACY_REGION_ID_MAP);
  const legacySave = {
    ...legacyBase,
    saveVersion: 10,
    setupComplete: true,
    setupStage: "complete",
    realmName: "旧存档测试国",
    startingRegionId: "capital",
    selectedRegionId: "capital",
    sc: 4321.25,
    be: 3456.75,
    pop: 54321,
    eco: 123456,
    history: legacyHistory,
    log: [{ type: "progress", title: "旧档事件", text: "这条既有记录必须保留。" }],
    map: {
      seed: 1058,
      difficulty: "normal",
      startingRegionId: "capital",
      entities: legacyBase.map.entities,
      layout: { capital: { points: [{ x: 0, y: 0 }] } },
      roads: [{ id: "legacy-road", a: "capital", b: "westernMarch" }],
      regions: legacyRegionIds.map((id, index) => ({
        id,
        owner: index < 5 ? MAP_OWNER_PLAYER : MAP_OWNER_NEUTRAL,
        controllerId: index < 5 ? PLAYER_ENTITY_ID : NEUTRAL_ENTITY_ID,
        fortification: 40 + index
      }))
    }
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(legacySave));
  const migrated = loadState();
  check(Boolean(migrated), "a v10 save must migrate instead of being discarded");
  check(migrated.saveVersion === SAVE_VERSION, "a v10 save must upgrade to the current save version");
  check(migrated.sc === legacySave.sc && migrated.be === legacySave.be, "save migration must preserve SC and BE exactly");
  check(migrated.pop === legacySave.pop && migrated.eco === legacySave.eco, "save migration must preserve population and economy exactly");
  check(
    migrated.history.length === 1 &&
      migrated.history[0].collapseCause === legacyHistory[0].collapseCause &&
      migrated.history[0].turns === legacyHistory[0].turns &&
      migrated.history[0].startTurn === legacyHistory[0].startTurn &&
      JSON.stringify(migrated.history[0].finalSnapshot) === JSON.stringify(legacyHistory[0].finalSnapshot),
    "save migration must preserve civilization history"
  );
  check(migrated.startingRegionId === "cb05", "the legacy capital id must migrate to cb05");
  checkTerritoryPartition(migrated.map, "migrated v10 map");
  check(!Object.prototype.hasOwnProperty.call(migrated.map, "layout"), "migrated strategic state must rebuild rather than retain legacy layout");
  check(!Object.prototype.hasOwnProperty.call(migrated.map, "roads"), "migrated strategic state must derive rather than retain legacy roads");
  const upgradeLogEntries = (source) => source.log.filter((entry) => {
    const copy = (entry?.title || "") + " " + (entry?.text || "");
    return /战略地图/u.test(copy) && /(?:64|六十四)/u.test(copy);
  });
  check(upgradeLogEntries(migrated).length === 1, "v10 migration must append exactly one 64-province strategic-map upgrade log");
  check(armyRosterPaths(migrated).join(",") === "military.armies", "migrated formal state must retain only one army roster");

  state = migrated;
  saveState();
  const persisted = JSON.parse(localStorage.getItem(STORE_KEY));
  check(!Object.prototype.hasOwnProperty.call(persisted.map, "layout"), "saved state must not persist fixed province layout");
  check(!Object.prototype.hasOwnProperty.call(persisted.map, "roads"), "saved state must not persist fixed roads");
  check(armyRosterPaths(persisted).join(",") === "military.armies", "serialized formal state must contain exactly one army roster");
  const reloadedMigration = loadState();
  check(upgradeLogEntries(reloadedMigration).length === 1, "loading an upgraded save again must not duplicate the migration log");
  check(reloadedMigration.sc === legacySave.sc && reloadedMigration.be === legacySave.be, "a second load must retain migrated knowledge metrics");
  check(reloadedMigration.pop === legacySave.pop && reloadedMigration.eco === legacySave.eco, "a second load must retain migrated population and economy");

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
