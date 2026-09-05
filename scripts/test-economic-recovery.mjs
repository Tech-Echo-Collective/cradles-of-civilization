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
  render = () => {};
  goToEndingPage = () => {};
  cancelAutoRun = () => {};
  scheduleAutoRunIfNeeded = () => {};

  function prepare(seed, overrides = {}) {
    state = createNewState(seed);
    Object.assign(state, {
      setupComplete: true,
      setupStage: "complete",
      mapUiExpanded: true,
      eco: 0,
      pop: 7600,
      stability: 10,
      eerfLevel: 5
    }, overrides);
    return state;
  }

  prepare(1058);
  state.map.regions.slice(0, 63).forEach((region) => setRegionController(region, PLAYER_ENTITY_ID));
  advanceRound("recovery");
  check(!state.awaitingCivilizationRestart, "the fixture must survive its recovery year");
  check(state.eco >= 24000, "annual maintenance must not consume the emergency recovery reserve");
  check(!isEconomicCrisis(), "recovery must leave economic crisis after the complete year");
  check(!actionDisabledReason(ACTIONS.economy), "economic stimulus must be available after recovery");
  check(Boolean(actionDisabledReason(ACTIONS.recovery)), "recovery must not remain available outside crisis");
  const largeRealmEconomy = state.eco;
  saveState();
  state = loadState();
  check(state.eco === largeRealmEconomy, "saving and reloading must preserve recovered funds");
  check(!actionDisabledReason(ACTIONS.economy), "reloading must not re-lock economic stimulus");

  prepare(1009);
  advanceRound("recovery");
  const afterRecovery = state.eco;
  advanceRound("economy");
  check(state.eco > 0, "the formerly looping recovery/stimulus sequence must escape crisis");
  check(!state.log[0].text.includes("经济危机锁死了这项行动"), "stimulus must not be silently cancelled mid-round");

  prepare(1009);
  advanceRound("recovery");
  state.eco = 1;
  const originalPrepareActionDelta = prepareActionDelta;
  let emptiedBeforeStimulus = false;
  prepareActionDelta = (action, delta, crisisAtStart) => {
    if (action === ACTIONS.economy) emptiedBeforeStimulus = !crisisAtStart && isEconomicCrisis();
    return originalPrepareActionDelta(action, delta, crisisAtStart);
  };
  advanceRound("economy");
  prepareActionDelta = originalPrepareActionDelta;
  check(emptiedBeforeStimulus, "the second regression must really empty the treasury before stimulus");
  check(state.eco > 0 && !state.log[0].text.includes("经济危机锁死了这项行动"),
    "a full year must execute stimulus after a mid-year treasury loss");

  prepare(1009);
  const crisisScience = state.sc;
  const crisisBelief = state.be;
  state.scTrend = 300;
  state.beTrend = 300;
  advanceRound("recovery");
  check(state.sc <= crisisScience && state.be <= crisisBelief, "recovery year must retain the positive-knowledge freeze");

  prepare(1009);
  check(prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state), true).locked,
    "a year starting in crisis must still require recovery");
  check(!prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state), false).locked,
    "a funded year's stimulus must still run if an earlier event empties the treasury");
  check(prepareActionDelta(ACTIONS.science, ACTIONS.science.delta, false).locked,
    "mid-year crisis must not bypass spending requirements");
  state.controlLocked = true;
  check(prepareActionDelta(ACTIONS.economy, ACTIONS.economy.delta(state), false).locked,
    "income actions must not bypass loss of player control");
  state.controlLocked = false;
  const beforeKnowledge = state.sc;
  const balanceResult = prepareActionDelta(ACTIONS.balance, ACTIONS.balance.delta, false);
  check(!balanceResult.locked, "a positive-income governance action may repair a mid-year crisis");
  applyDelta(balanceResult.delta);
  check(state.sc === beforeKnowledge, "mid-year crisis must still freeze positive knowledge before income arrives");
  check(state.eco > 0, "positive-income action must actually repair the treasury");
  check(prepareActionDelta(ACTIONS.recovery, ACTIONS.recovery.delta(state), false).locked,
    "healthy civilizations must not farm emergency recovery funds");

  prepare(1058, { governorId: "black-man" });
  const originalResolveMilitaryYear = resolveMilitaryYear;
  resolveMilitaryYear = () => {
    applyDelta({ eco: -1000000 });
    return { title: "测试战事开支", text: "年度战事耗尽现有财政。" };
  };
  advanceRound("recovery");
  resolveMilitaryYear = originalResolveMilitaryYear;
  check(state.eco === 26400, "recovery must arrive after war costs with the governor bonus applied exactly once");

  prepare(1058);
  const originalEventFor = eventFor;
  eventFor = () => ({ destroy: true, type: "disaster", title: "测试毁灭灾变", text: "真正的灾变仍然摧毁文明。" });
  advanceRound("recovery");
  eventFor = originalEventFor;
  check(state.awaitingCivilizationRestart && state.eco === 0,
    "recovery must not inject money into a civilization destroyed before its action");

  let variants = 0;
  for (const difficulty of ["easy", "normal", "hard", "ultimate"]) {
    for (const governorId of ["east-asian-man", "white-woman", "black-man", "listener"]) {
      for (const mapUiExpanded of [true, false]) {
        prepare(1058, { difficulty, governorId, mapUiExpanded, pop: 3000 });
        state.map.regions.slice(0, 51).forEach((region) => setRegionController(region, PLAYER_ENTITY_ID));
        advanceRound("recovery");
        check(!state.awaitingCivilizationRestart && !isEconomicCrisis(),
          "recovery failed for " + difficulty + "/" + governorId + "/" + mapUiExpanded);
        variants += 1;
      }
    }
  }
  return { largeRealmEconomy, afterRecovery, variants };
})()`, context, { filename: "economic-recovery-regression.js" });

console.log("Economic recovery checks passed:", JSON.stringify(result));
