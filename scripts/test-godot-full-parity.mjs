import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

for (const filename of [
  "endings.js",
  "balance-model.js",
  "map-lab/map-data.js",
  "map-lab/map-model.js",
  "game.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, filename), "utf8"), context, { filename });
}

const annualActions = [
  "science",
  "belief",
  "population",
  "balance",
  "order",
  "suppressBelief",
  "suppressScience",
  "hibernate",
  "arts",
  "economy",
  "buildEerf",
  "upgradeEerf",
  "recovery"
];

const actionScenarios = annualActions.map((action) => {
  const overrides = {};
  if (action === "buildEerf") Object.assign(overrides, { pop: 22000, eco: 200000 });
  if (action === "upgradeEerf") Object.assign(overrides, { sc: 5000, pop: 22000, eco: 300000, eerfLevel: 1 });
  if (action === "recovery") Object.assign(overrides, { pop: 8000, eco: 0 });
  return { id: `action-${action}`, seed: 1058, action, overrides };
});

const boundaryScenarios = [
  { id: "locked-economic-crisis", seed: 1058, action: "science", overrides: { eco: 0 } },
  { id: "locked-insufficient-economy", seed: 1058, action: "science", overrides: { eco: 1000 } },
  { id: "locked-build-existing", seed: 1058, action: "buildEerf", overrides: { eerfLevel: 1, pop: 22000, eco: 200000 } },
  { id: "locked-upgrade-unbuilt", seed: 1058, action: "upgradeEerf", overrides: { eerfLevel: 0, sc: 5000, pop: 22000, eco: 300000 } },
  { id: "locked-upgrade-science", seed: 1058, action: "upgradeEerf", overrides: { eerfLevel: 1, sc: 1000, pop: 22000, eco: 300000 } },
  { id: "locked-upgrade-max", seed: 1058, action: "upgradeEerf", overrides: { eerfLevel: 5, sc: 19000, pop: 22000, eco: 300000 } },
  { id: "locked-population-floor", seed: 1058, action: "hibernate", overrides: { pop: 1250, eco: 50000 } },
  { id: "governor-belief", seed: 1058, action: "belief", overrides: { governorId: "white-woman" } },
  { id: "governor-economy", seed: 1058, action: "economy", overrides: { governorId: "black-man" } },
  { id: "governor-listener", seed: 1058, action: "balance", overrides: { governorId: "listener" } }
];

// Each state below makes the second LCG roll hit one of the hand-authored SPEC events.
// The first roll is deliberately outside every destructive primary-event band.
const specialRngStates = new Map([
  [1, 4316], [38, 3928], [42, 3340], [213, 1153], [404, 636], [476, 4470],
  [1453, 1250], [1611, 2838], [1776, 7860], [1800, 2615], [1861, 1298],
  [1922, 6602], [1937, 6849], [1945, 3662], [1991, 2098], [2006, 2345],
  [2020, 581], [2718, 7039], [3141, 713], [3332, 6817], [3688, 4701]
]);

const specialScenarios = [...specialRngStates].map(([spec, rngState]) => ({
  id: `special-${spec}`,
  seed: 900000 + spec,
  rngState,
  action: "balance",
  overrides: {
    sc: 5000,
    be: 5000,
    la: 1000,
    pop: 1000000,
    eco: 1000000,
    stability: 60
  }
}));

const disasterScenarios = [
  {
    id: "disaster-pending-eerf",
    seed: 1,
    rngState: 1,
    action: "balance",
    overrides: { sc: 8000, be: 7000, la: 10000, scTrend: 80, beTrend: 70, pop: 100000, eco: 200000, stability: 70, eerfLevel: 3 }
  },
  {
    id: "disaster-restart-eerf",
    seed: 1,
    rngState: 1,
    action: "balance",
    followupAction: "restartCivilization",
    overrides: { sc: 8000, be: 7000, la: 10000, scTrend: 80, beTrend: 70, pop: 100000, eco: 200000, stability: 70, eerfLevel: 3 }
  },
  {
    id: "disaster-build-eerf",
    seed: 1,
    rngState: 1,
    action: "buildEerf",
    followupAction: "restartCivilization",
    overrides: { sc: 5000, be: 5000, pop: 100000, eco: 200000, stability: 60, eerfLevel: 0 }
  }
];

function computeScenario(scenario) {
  return vm.runInContext(`(() => {
    const scenario = ${JSON.stringify(scenario)};
    state = createNewState(scenario.seed);
    state.mapUiExpanded = false;
    Object.assign(state, scenario.overrides);
    if (scenario.rngState) state.rngState = scenario.rngState;

    const crisisAtRoundStart = isEconomicCrisis();
    const rng = new Lcg(state.rngState);
    const rand = rng.nextInt(10000);
    const spec = rng.nextInt(SPEC_MAX) + 1;
    state.rngState = rng.state;
    state.turn += 1;
    state.lastRand = rand;
    state.lastSpec = spec;

    const before = snapshot();
    const drift = computeDrift(rand, before);
    const event = eventFor(rand, before);
    const action = ACTIONS[scenario.action];

    const stateResult = () => ({
      science: state.sc,
      belief: state.be,
      literatureAndArt: state.la,
      population: state.pop,
      economy: state.eco,
      stability: state.stability,
      eerfLevel: state.eerfLevel,
      scienceTrend: state.scTrend,
      beliefTrend: state.beTrend,
      populationGrowthMultiplier: state.populationGrowthMultiplier,
      knowledgeGrowthMultiplier: state.knowledgeGrowthMultiplier,
      controlEfficiencyMultiplier: state.controlEfficiencyMultiplier,
      controlLocked: state.controlLocked,
      populationLockTurns: state.populationLockTurns,
      civilization: state.count,
      awaitingCivilizationRestart: state.awaitingCivilizationRestart,
      historyCount: state.history.length,
      pendingRestart: state.pendingRestart ? {
        science: state.pendingRestart.sc,
        belief: state.pendingRestart.be,
        scienceTrend: state.pendingRestart.scTrend,
        beliefTrend: state.pendingRestart.beTrend,
        population: state.pendingRestart.pop,
        economy: state.pendingRestart.eco,
        stability: state.pendingRestart.stability,
        eerfLevel: state.pendingRestart.eerfLevel,
        nextCivilization: state.pendingRestart.nextCount
      } : null
    });

    if (event.destroy) {
      const completedEerf = completeEerfActionBeforeDisaster(action, crisisAtRoundStart);
      const collapseSnapshot = completedEerf?.snapshot || before;
      collapseCivilization(event, collapseSnapshot, rand, {
        minimumRestartEerfLevel: completedEerf?.minimumRestartEerfLevel || 0
      });
      if (scenario.followupAction === "restartCivilization") restartCivilizationFromPending();
      return {
        ...scenario,
        expected: {
          eventTitle: event.title,
          eventText: event.text || "",
          specialEventTitle: "",
          specialEventText: "",
          actionLocked: true,
          civilizationCollapsed: true,
          rngState: state.rngState,
          pressure: { science: 0, belief: 0, population: 0, economy: 0, stability: 0 },
          state: stateResult()
        }
      };
    }

    applyDelta(drift, { freezeKnowledge: crisisAtRoundStart, protectPopulationFloor: true });
    applyDelta(event.delta, { freezeKnowledge: crisisAtRoundStart, protectPopulationFloor: true });
    const specialEvent = specialEventFor(spec, rng);
    if (specialEvent) {
      applySpecialEvent(specialEvent, {
        freezeKnowledge: crisisAtRoundStart,
        protectPopulationFloor: !specialEvent.piercesPopulationProtection
      });
    }

    enforcePopulationLock();
    const rawActionDelta = typeof action.delta === "function" ? action.delta(state) : action.delta;
    const actionResult = prepareActionDelta(action, rawActionDelta, crisisAtRoundStart);
    applyDelta(actionResult.delta, { freezeKnowledge: crisisAtRoundStart });
    if (!actionResult.locked && typeof action.effect === "function") action.effect();
    const pressure = applyDelta(computeSystemPressure(snapshot()), { freezeKnowledge: crisisAtRoundStart });
    enforcePopulationLock();
    const timerDisaster = tickCivilizationTimers();
    if (timerDisaster) throw new Error(scenario.id + " unexpectedly hit a countdown disaster");
    updateKnowledgeTrends({ event, specialEvent, action, actionResult, pressureDelta: pressure, rand });
    state.rngState = rng.state;

    return {
      ...scenario,
      expected: {
        eventTitle: event.title,
        eventText: event.text || "",
        specialEventTitle: specialEvent?.title || "",
        specialEventText: specialEvent?.text || "",
        actionLocked: actionResult.locked,
        rngState: state.rngState,
        pressure: {
          science: pressure.sc || 0,
          belief: pressure.be || 0,
          population: pressure.pop || 0,
          economy: pressure.eco || 0,
          stability: pressure.stability || 0
        },
        state: stateResult()
      }
    };
  })()`, context);
}

const scenarios = [...actionScenarios, ...boundaryScenarios, ...specialScenarios, ...disasterScenarios].map(computeScenario);
const scenarioPath = path.join(os.tmpdir(), `cradles-godot-full-parity-${process.pid}.json`);
const logPath = path.join(os.tmpdir(), `cradles-godot-full-parity-${process.pid}.log`);
fs.writeFileSync(scenarioPath, JSON.stringify({ version: 1, scenarios }));

const godotBinary = process.env.GODOT_BIN || (process.platform === "win32" ? "godot" : "godot-mono");
const environment = { ...process.env };
if (process.platform === "darwin" && !environment.DOTNET_ROOT) {
  environment.DOTNET_ROOT = "/opt/homebrew/opt/dotnet/libexec";
}

try {
  const result = spawnSync(
    godotBinary,
    ["--headless", "--log-file", logPath, "--path", path.join(projectRoot, "godot"), "--", "--verify-full", scenarioPath],
    { cwd: projectRoot, env: environment, encoding: "utf8", timeout: 120000 }
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  fs.rmSync(scenarioPath, { force: true });
  fs.rmSync(logPath, { force: true });
}
