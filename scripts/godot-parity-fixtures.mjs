import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const verifyIndex = process.argv.indexOf("--verify");
const verifyPath = verifyIndex >= 0 ? process.argv[verifyIndex + 1] : null;
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
    removeItem(key) { memoryStore.delete(key); },
    clear() { memoryStore.clear(); }
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

for (const filename of ["endings.js", "balance-model.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, filename), "utf8"), context, { filename });
}

const scenarios = [
  { id: "initial-science", seed: 1058, action: "science", overrides: {} },
  { id: "initial-belief", seed: 314159, action: "belief", overrides: {} },
  { id: "initial-population", seed: 271828, action: "population", overrides: {} },
  { id: "science-context", seed: 424242, action: "balance", overrides: { sc: 6500, be: 2000, pop: 20000, eco: 90000, stability: 55 } },
  { id: "belief-context", seed: 777777, action: "science", overrides: { sc: 2000, be: 6500, pop: 18000, eco: 85000, stability: 58 } },
  { id: "harmony-context", seed: 888888, action: "balance", overrides: { sc: 7000, be: 7000, pop: 26000, eco: 110000, stability: 64 } },
  { id: "stressed-context", seed: 999999, action: "belief", overrides: { sc: 1000, be: 1500, pop: 65000, eco: 30000, stability: 25 } },
  { id: "advanced-context", seed: 123456, action: "population", overrides: { sc: 13000, be: 12500, la: 3200, pop: 30000, eco: 160000, stability: 72 } },
  { id: "economic-crisis", seed: 654321, action: "science", overrides: { sc: 1800, be: 1600, pop: 8000, eco: 0, stability: 40 } }
];

function computeScenario(scenario) {
  return vm.runInContext(`(() => {
    const scenario = ${JSON.stringify(scenario)};
    state = createNewState(scenario.seed);
    Object.assign(state, scenario.overrides);
    const crisisAtRoundStart = isEconomicCrisis();
    const rng = new Lcg(state.rngState);
    const rand = rng.nextInt(10000);
    const spec = rng.nextInt(SPEC_MAX) + 1;
    state.turn += 1;
    const before = snapshot();
    const contextual = contextualEventFor(rand, before);
    const event = contextual && rand % 4 !== 1 ? contextual : baseEvent(rand);
    applyDelta(computeDrift(rand, before), { freezeKnowledge: crisisAtRoundStart, protectPopulationFloor: true });
    applyDelta(event.delta, { freezeKnowledge: crisisAtRoundStart, protectPopulationFloor: true });
    const action = ACTIONS[scenario.action];
    const rawActionDelta = typeof action.delta === "function" ? action.delta(state) : action.delta;
    const actionResult = prepareActionDelta(action, rawActionDelta, crisisAtRoundStart);
    applyDelta(actionResult.delta, { freezeKnowledge: crisisAtRoundStart });
    const pressure = applyDelta(computeSystemPressure(snapshot()), { freezeKnowledge: crisisAtRoundStart });
    return {
      ...scenario,
      expected: {
        turn: state.turn,
        rand,
        spec,
        rngState: rng.state,
        eventTitle: event.title,
        actionLocked: actionResult.locked,
        pressure: {
          science: pressure.sc || 0,
          belief: pressure.be || 0,
          population: pressure.pop || 0,
          economy: pressure.eco || 0,
          stability: pressure.stability || 0
        },
        state: {
          science: state.sc,
          belief: state.be,
          literatureAndArt: state.la,
          population: state.pop,
          economy: state.eco,
          stability: state.stability
        }
      }
    };
  })()`, context);
}

const output = {
  version: 1,
  scope: "drift + ordinary event + core action + system pressure",
  fixtures: scenarios.map(computeScenario)
};

if (!verifyPath) {
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(path.resolve(projectRoot, verifyPath), "utf8"));
if (JSON.stringify(output) !== JSON.stringify(expected)) {
  console.error(`Godot parity fixtures are stale: ${verifyPath}`);
  process.exit(1);
}

console.log(`Web fixtures verified: ${output.fixtures.length} cases`);
