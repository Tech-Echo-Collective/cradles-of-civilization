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
  check(MAP_REGIONS.length === 16, "map must contain 16 regions");
  check(firstMap.roads.length >= 15, "map must contain a spanning road network");
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

  const migrated = createInitialMapState({
    seed: 1058,
    regions: [{ id: "capital", owner: MAP_OWNER_PLAYER, fortification: 66 }]
  }, { seed: 1058, realmName: "旧存档", difficulty: "normal" });
  check(migrated.regions.length === 16, "old saves must expand to the v0.3.2 region set");
  check(migrated.roads.length >= 15, "old saves must receive a connected seeded road network");

  return {
    regions: MAP_REGIONS.length,
    roads: firstMap.roads.length,
    connectedRegions: connectedRegionCount(firstMap),
    eliminatedEntity: eliminated.find((entity) => entity.id === NEUTRAL_ENTITY_ID)?.name,
    technologyBonus: [lowTechnologyBonus, highTechnologyBonus]
  };
})()`, context, { filename: "engine-regression.js" });

console.log(JSON.stringify(report, null, 2));
