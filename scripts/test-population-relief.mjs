import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storage = new Map();
const context = vm.createContext({
  console,
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, documentElement: {}, body: {} },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
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
context.addEventListener = () => {};
for (const filename of ["endings.js", "balance-model.js", "map-lab/map-data.js", "map-lab/map-model.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, filename), "utf8"), context, { filename });
}

const result = vm.runInContext(`(() => {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const equal = (actual, expected, message) => {
    check(actual === expected, message + ": expected " + expected + ", got " + actual);
  };
  render = () => {};
  goToEndingPage = () => {};
  cancelAutoRun = () => {};
  scheduleAutoRunIfNeeded = () => {};

  function prepare(overrides = {}, seed = 1058) {
    state = createNewState(seed);
    Object.assign(state, {
      setupComplete: true,
      setupStage: "complete",
      mapUiExpanded: false,
      governorId: "listener",
      difficulty: "normal",
      eco: 100000,
      pop: 7600,
      sc: 1000,
      be: 1000,
      stability: 60,
      eerfLevel: 0
    }, overrides);
    return state;
  }

  // This failed before relief: a funded civilization at 1,000 POP had its
  // income action locked solely because it was below the sustainable floor.
  let stimulusCases = 0;
  for (const difficulty of ["easy", "normal", "hard", "ultimate"]) {
    for (const offset of [-500, 0, 1, 10]) {
      prepare({ difficulty });
      const floor = minimumSustainablePopulation();
      state.pop = floor + offset;
      const before = state.pop;
      const raw = ACTIONS.economy.delta(state);
      const expected = before <= floor ? 0 : Math.max(raw.pop, floor - before);
      equal(actionDisabledReason(ACTIONS.economy), "", "low population must not disable stimulus");
      const actionResult = prepareActionDelta(ACTIONS.economy, raw);
      check(!actionResult.locked, "execution must agree with the enabled stimulus button");
      equal(actionResult.delta.pop, expected, "stimulus stops at its pre-action population floor");
      applyDelta(actionResult.delta);
      equal(state.pop, before + expected, "stimulus must not fabricate a recovery to the population floor");
      check(state.eco > 100000, "low-population stimulus must still restore treasury funds");
      stimulusCases += 1;
    }
  }

  prepare({ pop: 100000 });
  const fullStimulus = prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state));
  equal(fullStimulus.delta.pop, -800, "healthy populations retain the original 0.8% cost");
  applyDelta(fullStimulus.delta);
  equal(state.pop, 99200, "the original healthy-population cost is applied once");

  prepare({ controlEfficiencyMultiplier: 3, populationGrowthMultiplier: 4 });
  const amplifiedFloor = minimumSustainablePopulation();
  state.pop = amplifiedFloor + 5;
  const amplifiedStimulus = prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state));
  check(!amplifiedStimulus.locked, "amplified actions must still be available near the floor");
  equal(amplifiedStimulus.delta.pop, -5, "protection must apply after the action efficiency multiplier");
  prepare({ pop: 100000, controlEfficiencyMultiplier: 2, populationGrowthMultiplier: 4 });
  equal(prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state)).delta.pop, -1600,
    "efficiency still scales healthy population costs; population-growth buffs do not scale losses");

  prepare({ pop: 1000, eco: 0 });
  check(Boolean(actionDisabledReason(ACTIONS.economy)), "zero treasury still requires recovery first");
  check(prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state), true).locked,
    "population relief must not bypass a crisis at the start of the year");
  equal(actionDisabledReason(ACTIONS.recovery), "", "recovery remains available in the combined crisis");
  prepare({ pop: 1000, controlLocked: true });
  check(Boolean(actionDisabledReason(ACTIONS.economy)), "loss of control still disables stimulus");
  check(prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state)).locked,
    "population relief must not bypass execution-time loss of control");
  prepare({ pop: 1000, setupComplete: false, setupStage: "territory" });
  const incompleteBefore = JSON.stringify(state);
  check(Boolean(actionDisabledReason(ACTIONS.economy)), "unfinished setup must still block stimulus");
  advanceRound("economy");
  equal(JSON.stringify(state), incompleteBefore, "an unconfirmed world must not advance through relief");

  for (const action of [ACTIONS.science, ACTIONS.suppressBelief, ACTIONS.hibernate]) {
    prepare();
    state.pop = minimumSustainablePopulation();
    check(Boolean(actionDisabledReason(action)), action.label + " must retain its population gate");
    const raw = typeof action.delta === "function" ? action.delta(state) : action.delta;
    check(prepareActionDelta(action, raw).locked, action.label + " must retain its execution-time gate");
  }

  let ordinaryCases = 0;
  for (const population of [0, 1, 8, 9, 1000, 3000, 7600, 30000, 100000]) {
    for (const loss of [120, 900, 3600, 50000]) {
      prepare({ pop: population });
      const expected = -Math.min(loss, Math.floor(population * 0.12));
      equal(cappedOrdinaryEventPopulationDelta(-loss), expected, "ordinary losses use the current population");
      equal(cappedOrdinaryEventPopulationDelta(-loss, population), expected, "ordinary losses obey the explicit population cap");
      const delta = { pop: -loss, sc: 30, be: -20, la: 100, eco: -12000, stability: -6 };
      const original = JSON.stringify(delta);
      const effective = applyDelta(delta, { ordinaryEvent: true });
      equal(effective.pop, expected, "ordinary-event application must return its capped population change");
      equal(state.pop, population + expected, "ordinary-event state matches its population cap");
      equal(state.sc, 1030, "ordinary-event science changes remain unchanged");
      equal(state.be, 980, "ordinary-event theology changes remain unchanged");
      equal(state.eco, 88000, "ordinary-event financial damage remains unchanged");
      equal(state.stability, 54, "ordinary-event order damage remains unchanged");
      equal(JSON.stringify(delta), original, "applying relief must not mutate an event definition");
      ordinaryCases += 1;
    }
  }
  equal(cappedOrdinaryEventPopulationDelta(1200, 7600), 1200, "positive event populations are not capped");
  prepare({ pop: 100000 });
  equal(applyDelta({ pop: -3600 }, { ordinaryEvent: true }).pop, -3600,
    "a large civilization retains the full original epidemic loss");
  prepare();
  const ordinaryFloor = minimumSustainablePopulation();
  state.pop = ordinaryFloor + 5;
  equal(applyDelta({ pop: -3600 }, { ordinaryEvent: true, protectPopulationFloor: true }).pop, -5,
    "the ordinary-event cap must coexist with the stricter existing sustainable floor");

  prepare({ governorId: "east-asian-man", pop: 3000 });
  equal(applyDelta({ pop: 1000 }, { ordinaryEvent: true }).pop, 1080,
    "positive ordinary events receive the governor population bonus exactly once");
  equal(state.pop, 4080, "positive-event population is applied once");
  prepare({ pop: 7600 });
  equal(applyDelta({ pop: -3600 }, { protectPopulationFloor: true }).pop, -3600,
    "non-event losses such as drift must not inherit the ordinary-event percentage cap");

  // Observe an actual selected heat epidemic in the complete annual pipeline.
  // The normal drift, pressure and military calculations run unmodified here.
  const realApplyDelta = applyDelta;
  let ordinaryObservation = null;
  let heatSeed = null;
  prepare();
  for (let candidate = 1000; candidate < 3000; candidate += 1) {
    const rng = new Lcg(candidate);
    const rand = rng.nextInt(10000);
    const spec = rng.nextInt(SPEC_MAX) + 1;
    state.seed = candidate;
    if (eventFor(rand, snapshot()).title === "热疫" && !specialEventFor(spec, rng)) {
      heatSeed = candidate;
      break;
    }
  }
  check(heatSeed !== null, "a deterministic ordinary epidemic fixture must exist");
  prepare({}, heatSeed);
  applyDelta = (delta, options = {}) => {
    const before = state.pop;
    const floor = minimumSustainablePopulation();
    const effective = realApplyDelta(delta, options);
    if (options.ordinaryEvent) ordinaryObservation = { before, floor, delta, effective, after: state.pop };
    return effective;
  };
  try {
    advanceRound("economy");
  } finally {
    applyDelta = realApplyDelta;
  }
  check(ordinaryObservation, "advanceRound must identify its ordinary event when applying changes");
  equal(ordinaryObservation.delta.pop, -3600, "the real fixture must select the original heat epidemic");
  const epidemicExpected = Math.max(-3600, -Math.floor(ordinaryObservation.before * 0.12),
    Math.min(0, ordinaryObservation.floor - ordinaryObservation.before));
  equal(ordinaryObservation.effective.pop, epidemicExpected,
    "the real event is capped against population after this year's drift, not opening population");
  equal(ordinaryObservation.after, ordinaryObservation.before + epidemicExpected,
    "the real annual event applies the expected relief");
  check(!state.awaitingCivilizationRestart, "a funded small civilization must survive this normal epidemic fixture");

  // Isolate event families from unrelated annual random changes while retaining
  // the real advanceRound, action preparation, special application and collapse.
  const originals = { computeDrift, eventFor, specialEventFor, computeSystemPressure, resolveMilitaryYear };
  const neutralEvent = () => ({ type: "progress", title: "测试平年", text: "", delta: {} });
  computeDrift = () => ({});
  eventFor = neutralEvent;
  specialEventFor = () => null;
  computeSystemPressure = () => ({});
  resolveMilitaryYear = () => ({ title: "测试休兵", text: "" });
  try {
    prepare({ pop: 1000 });
    advanceRound("economy");
    equal(state.pop, 1000, "a full funded relief year below the floor must not invent population");
    check(state.eco > 100000, "the full relief action must increase treasury funds");
    equal(state.turn, 1, "a relief action still consumes one year");

    prepare();
    const specialPlague = originals.specialEventFor(2020, new Lcg(1058));
    const plagueApplied = applySpecialEvent(specialPlague, { protectPopulationFloor: true });
    equal(plagueApplied.pop, -3040, "special-event plague retains its original 40% population loss");
    equal(state.pop, 4560, "special-event plague is not capped to 12%");

    prepare({ eerfLevel: 5 });
    eventFor = () => baseDoomEvent(50, snapshot());
    advanceRound("economy");
    check(state.awaitingCivilizationRestart && state.pop === 0, "a true catastrophe still destroys the active civilization");
    equal(state.pendingRestart.collapseCause, "三日凌空", "the true catastrophe's cause remains intact");
    equal(state.pendingRestart.eerfLevel, 4, "true catastrophe preserves existing EERF level inheritance");

    prepare({ eerfLevel: 5, populationLockTurns: 3, lockedPopulation: 7600 });
    eventFor = neutralEvent;
    specialEventFor = () => originals.specialEventFor(1937, new Lcg(1058));
    advanceRound("economy");
    check(state.awaitingCivilizationRestart && state.pop === 0,
      "a piercing special event still destroys population through EERF and population locks");
    check(state.pendingRestart.collapseCause.includes("Remember the Pain"),
      "piercing-event collapse must preserve its original special-event cause");
  } finally {
    computeDrift = originals.computeDrift;
    eventFor = originals.eventFor;
    specialEventFor = originals.specialEventFor;
    computeSystemPressure = originals.computeSystemPressure;
    resolveMilitaryYear = originals.resolveMilitaryYear;
  }

  return { stimulusCases, ordinaryCases, heatSeed, epidemicPopulationLoss: -ordinaryObservation.effective.pop };
})()`, context, { filename: "population-relief-regression.js" });

console.log("Population relief checks passed:", JSON.stringify(result));
