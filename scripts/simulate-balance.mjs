import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sampleCount = Math.max(1, Number.parseInt(process.argv[2] || "80", 10));
const maxYears = Math.max(80, Number.parseInt(process.argv[3] || "720", 10));
const requestedDifficulty = process.argv[4] || "normal";
const requestedStrategy = process.argv[5] || "all";
const requestedAggression = process.argv[6] || "standard";
const difficulties = requestedDifficulty === "all"
  ? ["easy", "normal", "hard", "ultimate"]
  : [requestedDifficulty];

const memoryStore = new Map();
const documentStub = {
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  documentElement: {},
  body: {}
};
const context = vm.createContext({
  console: { log() {}, warn() {}, error() {} },
  document: documentStub,
  localStorage: {
    getItem(key) { return memoryStore.has(key) ? memoryStore.get(key) : null; },
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

vm.runInContext(fs.readFileSync(path.join(projectRoot, "endings.js"), "utf8"), context, { filename: "endings.js" });
vm.runInContext(fs.readFileSync(path.join(projectRoot, "game.js"), "utf8"), context, { filename: "game.js" });

vm.runInContext(`
  render = () => {};
  saveState = () => {};
  saveFinalEnding = () => {};
  goToEndingPage = () => {};
  cancelAutoRun = () => {};
  scheduleAutoRunIfNeeded = () => {};

  function __canAction(actionId) {
    const action = ACTIONS[actionId];
    return Boolean(action && !actionDisabledReason(action));
  }

  function __firstAction(actionIds) {
    return actionIds.find((actionId) => __canAction(actionId)) || null;
  }

  function __prepareSimulation(seed, difficulty, aggression) {
    localStorage.clear();
    state = createNewState(seed);
    state.realmName = "模拟国度";
    state.difficulty = normalizeDifficulty(difficulty);
    state.aiAggression = normalizeAiAggression(aggression);
    state.setupComplete = true;
    state.setupStage = "complete";
    state.map = createInitialMapState({}, {
      seed: state.seed,
      realmName: state.realmName,
      difficulty: state.difficulty
    });
    state.military = createInitialMilitaryState(snapshot(), { difficulty: state.difficulty });
    state.selectedArmyId = PLAYER_ARMY_ID;
    state.log = [];
  }

  function __maintainCivilization(preferredAction) {
    if (state.eco <= 0) return __firstAction(["recovery"]);
    if (state.eco < 68000) return __firstAction(["economy", "balance", preferredAction]);
    if (state.pop < 8500) return __firstAction(["population", "balance", preferredAction]);
    if (state.stability < 28) return __firstAction(["order", "balance", preferredAction]);
    if (state.eerfLevel <= 0 && state.eco > 135000 && __canAction("buildEerf")) return "buildEerf";
    if (state.eerfLevel > 0 && state.eerfLevel < EERF_MAX_LEVEL && state.eco > 155000 && __canAction("upgradeEerf")) return "upgradeEerf";
    return __firstAction([preferredAction, "balance", "economy", "population", "hibernate"]);
  }

  function __strategicEerfAction() {
    if (state.eerfLevel <= 0 && state.eco > 135000 && __canAction("buildEerf")) return "buildEerf";
    if (state.eerfLevel > 0 && state.eerfLevel < EERF_MAX_LEVEL && state.eco > 165000 && __canAction("upgradeEerf")) return "upgradeEerf";
    return null;
  }

  function __chooseSimulationAction(strategy) {
    if (state.eco <= 0) return __firstAction(["recovery"]);
    if (strategy === "science") {
      if (state.be > 7600 && __canAction("suppressBelief")) return "suppressBelief";
      return __maintainCivilization("science");
    }
    if (strategy === "belief") {
      if (state.sc > 7600 && __canAction("suppressScience")) return "suppressScience";
      return __maintainCivilization("belief");
    }
    if (strategy === "exodus-science") {
      const eerfAction = __strategicEerfAction();
      if (eerfAction) return eerfAction;
      if (state.pop < 10500) return __firstAction(["population", "balance", "economy"]);
      if (state.eco < 110000) return __firstAction(["economy", "balance", "science"]);
      if (state.be > 8200) return __firstAction(["suppressBelief", "science"]);
      return __firstAction(["science", "balance", "economy"]);
    }
    if (strategy === "exodus-belief") {
      const eerfAction = __strategicEerfAction();
      if (eerfAction) return eerfAction;
      if (state.pop < 10500) return __firstAction(["population", "balance", "economy"]);
      if (state.stability < 62) return __firstAction(["order", "belief", "balance"]);
      if (state.sc > 8200) return __firstAction(["suppressScience", "belief"]);
      return __firstAction(["belief", "balance", "economy"]);
    }
    if (strategy === "balance") return __maintainCivilization("balance");
    if (strategy === "authority") {
      const eerfAction = __strategicEerfAction();
      if (eerfAction) return eerfAction;
      if (state.pop < 10500) return __firstAction(["population", "balance", "economy"]);
      if (state.stability < 82) return __firstAction(["order", "balance", "science"]);
      if (state.be > 6500) return __firstAction(["suppressBelief", "science"]);
      if (state.sc >= 15000) return __firstAction(["order", "economy", "population"]);
      return __firstAction(["science", "order", "economy"]);
    }
    if (strategy === "conquest") {
      if (state.military.force < 9000) return __firstAction(["levyHost", "economy", "balance"]);
      if (state.sc < 4200) return __maintainCivilization("science");
      if (__canAction("trainLegion")) return "trainLegion";
      if (state.eco < 80000) return __firstAction(["economy", "balance"]);
      return __firstAction(["secureFrontier", "balance", "economy", "population"]);
    }
    if (strategy === "collapse") return __firstAction(["balance", "economy", "hibernate"]);
    if (strategy === "stagnation") {
      if (state.sc > 900) return __firstAction(["belief", "suppressScience", "hibernate"]);
      return __firstAction(["belief", "hibernate", "economy"]);
    }
    if (strategy === "anarchy") return __firstAction(["suppressBelief", "science", "population", "hibernate"]);
    if (strategy === "memory") {
      if (state.la < LA_CAP) return __firstAction(["arts", "economy", "population"]);
      return __firstAction(["balance", "economy", "hibernate"]);
    }
    return __firstAction(["arts", "science", "belief", "balance"]);
  }

  function __targetEndingForStrategy(strategy) {
    return {
      science: "A",
      belief: "B",
      "exodus-science": "D",
      "exodus-belief": "E",
      balance: "F",
      authority: "H",
      conquest: "K",
      collapse: "G"
    }[strategy] || null;
  }

  function __conquestDeploymentTarget(army) {
    const immediateTarget = selectAttackTarget();
    if (immediateTarget) return immediateTarget;
    const queue = [{ regionId: army.regionId, firstStep: null }];
    const visited = new Set([army.regionId]);
    while (queue.length) {
      const current = queue.shift();
      for (const neighborId of roadNeighbors(current.regionId)) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        const region = mapStateRegion(neighborId);
        if (!region) continue;
        const firstStep = current.firstStep || neighborId;
        if (mapRegionOwner(region) !== MAP_OWNER_PLAYER) return mapStateRegion(firstStep);
        queue.push({ regionId: neighborId, firstStep });
      }
    }
    return null;
  }

  function __runSimulation(seed, strategy, difficulty, aggression, limit) {
    __prepareSimulation(seed, difficulty, aggression);
    const politicalStrategy = {
      science: "science",
      "exodus-science": "science",
      authority: "fortress",
      conquest: "expansion",
      belief: "faith",
      "exodus-belief": "faith"
    }[strategy] || "balanced";
    state.map.entities[PLAYER_ENTITY_ID].strategy = politicalStrategy;
    const targetEnding = __targetEndingForStrategy(strategy);
    let guard = 0;
    while (!state.finished && state.turn < limit && guard < limit * 5) {
      guard += 1;
      if (state.awaitingCivilizationRestart) {
        restartCivilizationFromPending();
        continue;
      }

      if (strategy === "conquest") {
        state.selectedArmyId = PLAYER_ARMY_ID;
        const army = primaryPlayerArmy();
        const campaignReady = state.military.force >= 11000 && state.sc >= 4000 && state.eco >= 52000;
        const target = army && campaignReady ? __conquestDeploymentTarget(army) : null;
        if (army && target && army.lastMovedTurn < state.turn) deploySelectedArmy(target.id);
      }

      if (state.finished) break;
      if (targetEnding && state.endingCandidate?.id === targetEnding) {
        settleCurrentEnding();
        break;
      }

      const actionId = __chooseSimulationAction(strategy);
      if (!actionId) break;
      advanceRound(actionId);

      if (!state.finished && targetEnding && state.endingCandidate?.id === targetEnding) {
        settleCurrentEnding();
      }
    }

    return {
      ending: state.finalEnding?.id || null,
      years: state.turn,
      civilizations: state.count,
      territories: mapOwnerCounts().player,
      candidate: state.endingCandidate?.id || null
    };
  }
`, context, { filename: "balance-harness.js" });

const allStrategies = [
  "science",
  "belief",
  "exodus-science",
  "exodus-belief",
  "balance",
  "authority",
  "conquest",
  "collapse",
  "stagnation",
  "anarchy",
  "memory",
  "passive"
];
const strategies = requestedStrategy === "all" ? allStrategies : [requestedStrategy];
const strategyTargets = {
  science: "A",
  belief: "B",
  "exodus-science": "D",
  "exodus-belief": "E",
  balance: "F",
  authority: "H",
  conquest: "K",
  collapse: "G",
  stagnation: "C",
  anarchy: "I",
  memory: "J",
  passive: "L"
};

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

const report = [];
for (const difficulty of difficulties) {
  for (const strategy of strategies) {
    const results = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const seed = 100003 + index * 7919 + strategies.indexOf(strategy) * 101 + difficulties.indexOf(difficulty) * 1000003;
      results.push(vm.runInContext(`__runSimulation(${seed}, ${JSON.stringify(strategy)}, ${JSON.stringify(difficulty)}, ${JSON.stringify(requestedAggression)}, ${maxYears})`, context));
    }

    const endingCounts = results.reduce((counts, result) => {
      const key = result.ending || "未结算";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const completed = results.filter((result) => result.ending);
    const targetEnding = strategyTargets[strategy];
    const targetHits = results.filter((result) => result.ending === targetEnding).length;
    const candidates = results.reduce((counts, result) => {
      if (!result.candidate) return counts;
      counts[result.candidate] = (counts[result.candidate] || 0) + 1;
      return counts;
    }, {});
    report.push({
      difficulty,
      aggression: requestedAggression,
      strategy,
      samples: sampleCount,
      completionRate: Number((completed.length / sampleCount * 100).toFixed(1)),
      targetEnding,
      targetRate: Number((targetHits / sampleCount * 100).toFixed(1)),
      endings: Object.fromEntries(Object.entries(endingCounts).sort((left, right) => right[1] - left[1])),
      candidates,
      medianYears: percentile(completed.map((result) => result.years), 0.5),
      p90Years: percentile(completed.map((result) => result.years), 0.9),
      medianCivilizations: percentile(completed.map((result) => result.civilizations), 0.5),
      medianTerritories: percentile(results.map((result) => result.territories), 0.5)
    });
  }
}

console.log(JSON.stringify({ sampleCount, maxYears, aggression: requestedAggression, report }, null, 2));
