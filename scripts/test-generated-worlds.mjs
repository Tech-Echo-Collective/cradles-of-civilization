import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
  URL, Intl
});
context.window = context;
context.addEventListener = () => {};
for (const filename of ["endings.js", "balance-model.js", "map-lab/map-data.js", "map-lab/map-model.js", "map-lab/map-generator.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, filename), "utf8"), context, { filename });
}

const report = vm.runInContext(`(() => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), message);
  const geography = () => JSON.stringify({
    revision: STRATEGIC_MAP_DATA.geometryRevision,
    signature: STRATEGIC_GEOGRAPHY.signature,
    blueprint: ACTIVE_MAP_BLUEPRINT
  });
  const controllers = () => state.map.regions.map((region) => [region.id, region.controllerId, region.fortification]);
  const armiesSnapshot = () => state.military.armies.map((army) => [army.id, army.entityId, army.regionId, army.force]);
  const metrics = () => [state.sc, state.be, state.la, state.pop, state.eco, state.stability, state.count, state.turn, state.eerfLevel, state.rngState];
  const beginWorld = (seed, geometryOptions) => {
    state = createNewState(seed, geometryOptions);
    state.realmName = "地图存档回归国";
    state.setupComplete = true;
    state.setupStage = "complete";
    alignArmiesWithEntityTerritories();
    return state;
  };

  const fixedGeography = geography();
  check(STRATEGIC_GEOGRAPHY.signature === "342bf330", "loading scripts must retain the reviewed fixed map as the legacy baseline");
  beginWorld(1058);
  check(state.geometryVersion === CRADLES_MAP_GENERATOR.VERSION && state.geometrySeed === 1058, "new worlds must explicitly record generator version and geometry seed");
  check(state.rngState === 1058, "generating geography must not consume gameplay randomness");
  const generatedGeography = geography();
  check(generatedGeography !== fixedGeography, "a new seeded world must not silently use the old fixed continent");
  beginWorld(1058);
  equal(geography(), generatedGeography, "the same world seed must recreate identical geographic data and roads");
  beginWorld(271828);
  check(geography() !== generatedGeography, "a different seed must create different geographic data");

  beginWorld(1058);
  const originalRender = render;
  render = () => {};
  try {
    for (const province of MAP_REGIONS) {
      state.setupComplete = false;
      state.setupStage = "territory";
      state.startingRegionId = province.id;
      rebuildFoundingPreview();
      check(primaryPlayerArmy()?.regionId === province.id, "the founding preview must place the first legion in the selected capital: " + province.id);
      const previewControllers = controllers();
      completeWorldSetup();
      check(primaryPlayerArmy()?.regionId === province.id, "confirming the capital must preserve the first legion's starting position: " + province.id);
      equal(controllers(), previewControllers, "capital confirmation must preserve the previewed territory");
      check(state.turn === 0 && state.rngState === 1058, "capital selection must not advance time or consume gameplay randomness");
    }
  } finally {
    render = originalRender;
  }

  const stabilityLossOnDefeat = (provinceId) => {
    beginWorld(1058);
    state.startingRegionId = "cb01";
    rebuildFoundingPreview();
    const target = mapStateRegion(provinceId);
    check(target.controllerId === PLAYER_ENTITY_ID, "the capital-loss fixture must start in player territory");
    const playerArmy = primaryPlayerArmy();
    playerArmy.regionId = entityRegions(PLAYER_ENTITY_ID).find((region) => region.id !== provinceId).id;
    const attacker = entityArmies(RIVAL_ENTITY_ID)[0];
    attacker.force = 50000;
    target.fortification = 5;
    const before = state.stability;
    const report = resolveRegionBattle(attacker, target, 1058, 999);
    check(report.attackerWon, "the capital-loss fixture must actually lose the target province");
    return before - state.stability;
  };
  check(stabilityLossOnDefeat("cb01") === 12, "losing the selected capital must apply the capital's order penalty");
  check(stabilityLossOnDefeat("cb05") === 5, "the old default capital must count as an ordinary province after selecting another capital");

  beginWorld(1058);
  Object.assign(state, { sc: 731, be: 623, la: 417, pop: 12000, eco: 81000, stability: 57, turn: 17, eerfLevel: 1, rngState: 98765 });
  const captured = state.map.regions.find((region) => region.controllerId !== PLAYER_ENTITY_ID);
  setRegionController(captured, PLAYER_ENTITY_ID);
  captured.fortification = 51;
  primaryPlayerArmy().force = 3456;
  const deployedProvince = entityRegions(PLAYER_ENTITY_ID).find((region) => region.id !== state.startingRegionId);
  primaryPlayerArmy().regionId = deployedProvince.id;
  alignArmiesWithEntityTerritories();
  check(primaryPlayerArmy().regionId === deployedProvince.id, "normal army alignment must not teleport an already deployed legion back to the capital");
  const originalControllers = controllers();
  const originalArmies = armiesSnapshot();
  const originalMetrics = metrics();
  saveState();
  const generatedSave = localStorage.getItem(STORE_KEY);
  const stored = JSON.parse(generatedSave);
  equal([stored.geometryVersion, stored.geometrySeed], [CRADLES_MAP_GENERATOR.VERSION, 1058], "saved games must carry a stable generator identity");
  check(!Object.hasOwn(stored.map, "layout") && !Object.hasOwn(stored.map, "roads"), "saves must not serialize bulky generated render geometry");
  beginWorld(42);
  state = loadState();
  check(Boolean(state), "a generated save must remain loadable after another world's geography has been active");
  equal(geography(), generatedGeography, "loading must restore the saved continent, not the currently active map");
  equal(controllers(), originalControllers, "loading must preserve conquered provinces and fortifications");
  equal(armiesSnapshot(), originalArmies, "loading must preserve army identities, positions, and casualties");
  equal(metrics(), originalMetrics, "loading must preserve civilization metrics, time, and gameplay RNG");
  check(!state.log.some((entry) => entry.title === "战略地图升级"), "a valid generated save must not trigger old-map remigration");

  const preCollapseTerritory = state.map.regions.map((region) => [region.id, region.controllerId]);
  collapseCivilization({ title: "测试恒星灾变", text: "回归测试的文明灾变。" }, snapshot(), 1058);
  check(state.awaitingCivilizationRestart && state.pendingRestart, "the regression fixture must actually enter civilization restart");
  saveState();
  const pendingSave = localStorage.getItem(STORE_KEY);
  beginWorld(314159);
  localStorage.setItem(STORE_KEY, pendingSave);
  state = loadState();
  check(state?.awaitingCivilizationRestart, "a pending civilization restart must survive loading");
  equal(geography(), generatedGeography, "pending restart must preserve the current world's continent");
  check(restartCivilizationFromPending(), "the loaded civilization must successfully restart");
  equal(geography(), generatedGeography, "civilization restart must not reroll physical geography");
  equal(state.map.regions.map((region) => [region.id, region.controllerId]), preCollapseTerritory, "civilization restart must retain its inherited territorial partition");
  equal([state.geometryVersion, state.geometrySeed], [CRADLES_MAP_GENERATOR.VERSION, 1058], "civilization restart must retain generator metadata");

  for (const capitalLost of [false, true]) {
    beginWorld(1058);
    state.startingRegionId = "cb01";
    rebuildFoundingPreview();
    if (capitalLost) setRegionController(mapStateRegion(state.startingRegionId), RIVAL_ENTITY_ID);
    const inheritedTerritory = state.map.regions.map((region) => [region.id, region.controllerId]);
    collapseCivilization({ title: "测试首都重启", text: "验证新军团的重建位置。" }, snapshot(), 1058);
    check(state.awaitingCivilizationRestart && state.pendingRestart, "the selected-capital fixture must enter civilization restart");
    saveState();
    const capitalRestartSave = localStorage.getItem(STORE_KEY);
    beginWorld(42);
    localStorage.setItem(STORE_KEY, capitalRestartSave);
    state = loadState();
    check(restartCivilizationFromPending(), "the selected-capital fixture must restart after reloading");
    const rebuiltLegion = primaryPlayerArmy();
    check(Boolean(rebuiltLegion), "a surviving realm must receive its rebuilt first legion");
    if (capitalLost) {
      check(rebuiltLegion.regionId !== state.startingRegionId, "rebuilding must not place the first legion in a lost capital");
      check(mapStateRegion(rebuiltLegion.regionId)?.controllerId === PLAYER_ENTITY_ID, "a lost capital must fall back to surviving player territory");
    } else {
      check(rebuiltLegion.regionId === state.startingRegionId, "a civilization restart must rebuild its first legion in the selected capital, not the default province");
    }
    equal(state.map.regions.map((region) => [region.id, region.controllerId]), inheritedTerritory, "rebuilding the first legion must not change inherited borders");
  }

  beginWorld(314159, { geometryVersion: null });
  equal(geography(), fixedGeography, "explicit legacy worlds must retain the original fixed geography");
  Object.assign(state, { sc: 840, be: 710, la: 90, pop: 13000, eco: 92000, turn: 31, eerfLevel: 1, rngState: 43210 });
  primaryPlayerArmy().force = 2987;
  const legacyProvince = state.map.regions.find((region) => region.controllerId !== PLAYER_ENTITY_ID);
  setRegionController(legacyProvince, PLAYER_ENTITY_ID);
  legacyProvince.fortification = 63;
  const legacyControllers = controllers();
  const legacyArmies = armiesSnapshot();
  const legacyMetrics = metrics();
  const legacySave = JSON.parse(JSON.stringify(state));
  delete legacySave.geometryVersion;
  delete legacySave.geometrySeed;
  beginWorld(20260912);
  localStorage.setItem(STORE_KEY, JSON.stringify(legacySave));
  state = loadState();
  check(Boolean(state), "pre-generator saves must remain loadable");
  equal(geography(), fixedGeography, "a legacy save without geometryVersion must never be converted into a random continent");
  check(!state.geometryVersion, "the migrated legacy save must keep an explicit fixed-map identity");
  equal(controllers(), legacyControllers, "legacy loading must not redraw political borders or reset fortifications");
  equal(armiesSnapshot(), legacyArmies, "legacy loading must retain all existing army locations and strengths");
  equal(metrics(), legacyMetrics, "legacy loading must retain all civilization metrics and time");
  saveState();
  const migratedLegacySave = localStorage.getItem(STORE_KEY);
  beginWorld(1058);
  localStorage.setItem(STORE_KEY, migratedLegacySave);
  state = loadState();
  equal(geography(), fixedGeography, "saving and reloading a migrated legacy world must keep its fixed continent");

  return [
    "new-world geometry is seeded, versioned, and independent of gameplay RNG",
    "all 64 starting capitals host the first legion in preview and the confirmed world",
    "capital-loss order penalties follow the selected capital, not the former default province",
    "generated saves restore exact geography, territory, fortifications, and army state",
    "civilization collapse, reload, and restart preserve the current continent",
    "rebuilt legions return to the selected capital or surviving player territory when that capital is lost",
    "pre-generator saves keep the fixed continent and all gameplay progress",
    "switching between saved worlds clears stale geographic context"
  ];
})()`, context, { filename: "generated-world-regression" });

console.log("Generated-world integration checks passed:");
for (const item of report) console.log(`- ${item}`);
