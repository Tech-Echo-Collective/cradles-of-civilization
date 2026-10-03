import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const scripts = ['endings.js', 'balance-model.js', 'map-lab/map-data.js', 'map-lab/map-model.js', 'map-lab/map-generator.js', 'game.js'];
function createHarness(hosted = true, initialStorage = new Map(), href = 'http://localhost/index.html') {
  const storage = new Map(initialStorage);
  const location = { href };
  const replacedUrls = [];
  const unexpectedDom = () => { throw new Error('Hosted rules touched legacy DOM'); };
  const context = vm.createContext({
    console, URL, Intl, Date, Math,
    ...(hosted ? { CRADLES_GAME_HOST: {} } : {}),
    document: { addEventListener: hosted ? unexpectedDom : () => {}, querySelector: unexpectedDom, querySelectorAll: unexpectedDom },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    location, history: { replaceState(_state, _title, url) { location.href = new URL(url, location.href).href; replacedUrls.push(location.href); } },
    addEventListener: hosted ? unexpectedDom : () => {},
    performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout: () => 0, clearTimeout() {}, confirm: () => true,
  });
  context.window = context;
  for (const name of scripts) vm.runInContext(fs.readFileSync(`${root}${name}`, 'utf8'), context, { filename: name });
  if (!hosted) vm.runInContext(`render = renderMap = renderLog = renderSetup = renderActionButtons = renderWorkspaceView = renderPoliticalEntityPanel = announceStrategicMap = goToEndingPage = () => {};`, context);
  const evaluate = code => vm.runInContext(code, context);
  return { context, storage, replacedUrls, evaluate, api: context.CRADLES_GAME_ENGINE };
}
const host = createHarness();
const legacy = createHarness(false);
const api = host.api;
const json = value => JSON.parse(JSON.stringify(value));
const coreState = harness => {
  const result = json(harness.evaluate(`({
  snapshot: snapshot(), turn: state.turn, count: state.count, rngState: state.rngState,
  map: state.map, military: state.military, scTrend: state.scTrend, beTrend: state.beTrend,
  selectedArmyId: state.selectedArmyId, selectedRegionId: state.selectedRegionId,
  history: state.history, pendingRestart: state.pendingRestart, specialNotice: state.specialNotice,
  autoRunUntilCollapse: state.autoRunUntilCollapse, finished: state.finished,
  finalEndingId: state.finalEnding?.id || null, log: state.log,
})`));
  // The legacy loader canonicalizes an absent optional event location to null.
  if (result.map.lastEvent) result.map.lastEvent.regionId ??= null;
  if (result.military.lastBattle) result.military.lastBattle.regionId ??= null;
  return result;
};
const equivalent = label => assert.deepEqual(coreState(host), coreState(legacy), label);
const loadBoth = fixture => {
  const serialized = JSON.stringify(fixture);
  assert.equal(api.importSave(serialized).ok, true);
  legacy.context.fixture = serialized;
  legacy.evaluate('state = loadState(fixture); alignArmiesWithEntityTerritories(); eliminateDefeatedEntities();');
};
const beginBoth = seed => {
  assert.equal(api.createGame({ seed, realmName: '接入回归国' }).ok, true);
  assert.equal(api.completeSetup().ok, true);
  legacy.context.testSeed = seed;
  legacy.evaluate(`state = createNewState(testSeed); state.realmName = '接入回归国'; state.setupStage = 'territory'; rebuildFoundingPreview(); completeWorldSetup();`);
};

api.initialize();
assert.equal(api.getView().initialSeed, null, 'A new world without a seed link keeps the initial form random.');
assert.equal(api.getView().actions.length, 21);
assert.equal(api.getView(), api.getView(), 'useSyncExternalStore snapshots must be cached.');
assert.ok(Object.isFrozen(api.getView()));
assert.ok(Object.isFrozen(api.getView().geometry.cells[0].points));
let notifications = 0;
const unsubscribe = api.subscribe(() => { notifications += 1; });
beginBoth(1058);
equivalent('same setup produces the same seeded rules state');
const geometry = api.getView().geometry;
assert.equal(geometry.cells.length, 64);
assert.equal(geometry.strategicRegions.length, 10);
assert.ok(geometry.connections.length > 63);
const beforeInvalid = api.exportSave();
const beforeInvalidView = api.getView();
const beforeInvalidNotifications = notifications;
assert.equal(api.executeAction('upgradeEerf').ok, false);
assert.equal(api.executeAction('not-an-action').ok, false);
assert.equal(api.exportSave(), beforeInvalid, 'Disabled commands may not consume RNG or advance a year.');
assert.equal(api.getView(), beforeInvalidView);
assert.equal(notifications, beforeInvalidNotifications);

for (const seed of [1058, 314159, 271828]) {
  beginBoth(seed);
  for (let turn = 0; turn < 30 && !api.getView().finished; turn += 1) {
    const view = api.getView();
    const preferred = view.awaitingCivilizationRestart ? 'restartCivilization' : view.economicCrisis ? 'recovery' : ['balance', 'economy', 'science', 'belief'][turn % 4];
    const action = view.actions.find(item => item.id === preferred && !item.disabledReason)
      || view.actions.find(item => !item.disabledReason && !['settleEnding'].includes(item.id));
    if (!action) break;
    const countBefore = notifications;
    assert.equal(api.executeAction(action.id).ok, true);
    legacy.context.actionId = action.id;
    legacy.evaluate('advanceRound(actionId)');
    equivalent(`seed ${seed}, step ${turn}, action ${action.id}`);
    assert.equal(notifications, countBefore + 1, 'A completed command publishes one snapshot.');
  }
}

beginBoth(1058);
const stableGeometry = api.getView().geometry;
const beforeClear = coreState(host);
const beforeClearNotifications = notifications;
assert.equal(api.clearChronicle().ok, true);
legacy.evaluate('clearChronicle()');
assert.deepEqual(coreState(host), { ...beforeClear, log: [] }, 'Clearing the log must not change gameplay, time or RNG.');
equivalent('Chronicle clearing uses the original behavior');
assert.equal(notifications, beforeClearNotifications + 1);
assert.deepEqual(JSON.parse(host.storage.get('three-sun-chronicle:v1')).log, []);
api.selectProvince('cb01'); legacy.evaluate('selectMapRegion("cb01")');
equivalent('Province selection does not advance game rules');
assert.equal(api.getView().geometry, stableGeometry);
assert.equal(api.getView().selectedRegion.neighbors.length > 0, true);
const exactSave = api.exportSave();
const reload = createHarness(true, host.storage);
reload.api.initialize();
assert.deepEqual(coreState(reload), coreState(host), 'Reload preserves state, RNG, ownership, armies and geography.');
assert.equal(reload.api.getView().geometry.signature, api.getView().geometry.signature);
const storageBefore = [...host.storage];
const cachedBefore = api.getView();
for (const broken of ['{}', '{bad', JSON.stringify({ ...JSON.parse(exactSave), geometryVersion: 'unknown-map' }), JSON.stringify({ ...JSON.parse(exactSave), rngState: 'broken' })]) {
  assert.equal(api.importSave(broken).ok, false);
  assert.equal(api.exportSave(), exactSave);
  assert.equal(api.getView(), cachedBefore);
  assert.deepEqual([...host.storage], storageBefore);
}
const fixedFixture = JSON.parse(exactSave);
delete fixedFixture.geometryVersion;
delete fixedFixture.geometrySeed;
loadBoth(fixedFixture);
assert.equal(api.getView().geometry.signature, '342bf330', 'Legacy saves retain the reviewed fixed continent.');
equivalent('legacy geometry migration parity');
api.createGame({ seed: 1058 });
const firstGeometry = api.getView().geometry.signature;
api.createGame({ seed: 271828 });
assert.notEqual(api.getView().geometry.signature, firstGeometry);
api.createGame({ seed: 0 });
assert.equal(api.getView().seed, 1, 'Explicit zero is accepted by the existing seed normalizer.');
api.createGame({ seed: '' });
const randomSeed = api.getView().seed;
api.createGame({ seed: '' });
assert.notEqual(api.getView().seed, randomSeed, 'Successive blank seeds create fresh worlds.');

beginBoth(1058);
let fixture = JSON.parse(api.exportSave());
const province = api.getView().regions.find(region => region.controllerId === 'player-realm' && region.neighbors.some(id => api.getView().regions.find(other => other.id === id).controllerId !== 'player-realm'));
const targetId = province.neighbors.find(id => api.getView().regions.find(region => region.id === id).controllerId !== 'player-realm');
const playerArmy = fixture.military.armies.find(army => army.entityId === 'player-realm');
fixture.turn = 10; fixture.pop = 50000; fixture.eco = 800000;
playerArmy.regionId = province.id; playerArmy.force = 50000; playerArmy.lastMovedTurn = -1;
fixture.selectedArmyId = playerArmy.id;
fixture.military.force = fixture.military.armies.filter(army => army.entityId === 'player-realm').reduce((sum, army) => sum + army.force, 0);
fixture.map.regions.find(region => region.id === targetId).fortification = 5;
loadBoth(fixture);
const armyForceBefore = api.getView().selectedArmy.force;
assert.equal(api.deployArmy(targetId).ok, true);
legacy.context.targetId = targetId;
legacy.evaluate('deploySelectedArmy(targetId)');
equivalent('Real attack resolves identical casualties and ownership');
assert.equal(api.getView().turn, 10, 'Deployment does not advance the annual action clock.');
assert.ok(api.getView().selectedArmy.force < armyForceBefore, 'The battle must apply actual casualties.');
assert.equal(api.deployArmy(targetId).ok, false, 'A legion cannot act twice in one year.');
const fullRoster = JSON.parse(api.exportSave()).military.armies;
const visibleIds = new Set(api.getView().visibleMilitaryRegionIds);
for (const army of api.getView().visibleArmies) assert.ok(army.entityId === 'player-realm' || visibleIds.has(army.regionId));
const hidden = fullRoster.find(army => army.entityId !== 'player-realm' && !visibleIds.has(army.regionId));
assert.ok(hidden, 'Fixture must contain at least one hidden enemy army.');
assert.equal(api.selectArmy(hidden.id).ok, false);
assert.ok(!api.getView().visibleArmies.some(army => army.id === hidden.id));

beginBoth(1058);
fixture = JSON.parse(api.exportSave());
fixture.autoRunUntilCollapse = true; fixture.controlLocked = true;
loadBoth(fixture);
assert.equal(api.executeAction('balance').ok, false, 'Manual actions remain locked during automatic collapse.');
assert.equal(api.tickAutoRun().ok, true);
legacy.evaluate('advanceRound(DIVIDE_AUTO_ACTION)');
equivalent('Hosted automatic collapse tick reuses the original driver action');

beginBoth(1058);
fixture = JSON.parse(api.exportSave());
fixture.rngState = 1; fixture.eerfLevel = 3; fixture.sc = 4500; fixture.be = 4000;
loadBoth(fixture);
assert.equal(api.executeAction('balance').ok, true);
legacy.evaluate('advanceRound("balance")');
equivalent('A real seeded disaster preserves the original inheritance computation');
assert.equal(api.getView().awaitingCivilizationRestart, true);
assert.ok(api.getView().pendingRestart.pop > 0);
assert.equal(api.getView().actions.filter(action => !action.disabledReason).length, 1);
assert.equal(api.executeAction('restartCivilization').ok, true);
legacy.evaluate('advanceRound("restartCivilization")');
equivalent('Civilization restart restores the same population, knowledge, territories and RNG');
assert.equal(api.getView().count, 2);

beginBoth(1058);
fixture = JSON.parse(api.exportSave());
fixture.sc = 20000; fixture.be = 200; fixture.rngState = 20000; fixture.eco = 900000;
loadBoth(fixture);
assert.equal(api.executeAction('balance').ok, true);
legacy.evaluate('advanceRound("balance")');
equivalent('Automatic scientific ending uses the same rule outcome');
assert.equal(api.getView().finished, true);
assert.equal(api.getView().finalEnding.id, 'A');
assert.equal(host.storage.has('three-sun-chronicle:v1'), false);
assert.equal(api.clearChronicle().ok, false, 'A completed run cannot be saved again by clearing its log.');
assert.equal(host.storage.has('three-sun-chronicle:v1'), false);
assert.equal(host.context.location.href, 'http://localhost/index.html', 'The React host must not navigate the old HTML page.');
const finalReload = createHarness(true, host.storage);
finalReload.api.initialize();
assert.equal(finalReload.api.getView().finished, true);
assert.equal(finalReload.api.getView().finalEnding.id, 'A');
assert.equal(finalReload.api.getView().sc, api.getView().sc);
assert.equal(finalReload.api.getView().geometry.signature, api.getView().geometry.signature);
const endingCount = finalReload.api.getView().endingStats.completedRuns;
finalReload.api.createGame({ seed: 1058 });
assert.equal(finalReload.api.getView().endingStats.completedRuns, endingCount);
assert.equal(finalReload.storage.has('three-sun-chronicle:ending:v1'), false);

// Seed links have the same priority and one-shot URL cleanup as the legacy
// entry point, including while an active run and final result are both stored.
const storedBeforeSeedLink = new Map(host.storage);
storedBeforeSeedLink.set('three-sun-chronicle:v1', exactSave);
const seeded = createHarness(true, storedBeforeSeedLink, 'http://localhost/game/?lang=en&seed=271828#atlas');
seeded.api.initialize();
assert.equal(seeded.api.getView().seed, 271828);
assert.equal(seeded.api.getView().initialSeed, 271828, 'The initial React settings form receives the consumed query seed.');
assert.equal(seeded.api.getView().setupComplete, false);
assert.equal(seeded.api.getView().turn, 0);
assert.equal(seeded.api.getView().finished, false);
assert.equal(seeded.storage.has('three-sun-chronicle:ending:v1'), false);
assert.equal(JSON.parse(seeded.storage.get('three-sun-chronicle:v1')).seed, 271828);
assert.equal(seeded.api.getView().endingStats.completedRuns, endingCount, 'A seed link keeps existing completion statistics.');
assert.equal(seeded.context.location.href, 'http://localhost/game/?lang=en#atlas');
assert.equal(seeded.replacedUrls.length, 1);
const seededView = seeded.api.getView();
assert.equal(seeded.api.initialize(), seededView, 'Repeated initialization does not create another seed world.');
assert.equal(seeded.replacedUrls.length, 1);

const setupRefresh = createHarness(true, seeded.storage, seeded.context.location.href);
setupRefresh.api.initialize();
assert.equal(setupRefresh.api.getView().initialSeed, 271828, 'Refreshing before setup retains the consumed seed in the form.');
assert.equal(setupRefresh.api.getView().geometry.signature, seededView.geometry.signature);
assert.equal(setupRefresh.replacedUrls.length, 0);
assert.equal(setupRefresh.api.createGame({ realmName: '链接种子国', seed: setupRefresh.api.getView().initialSeed }).ok, true);
assert.equal(setupRefresh.api.getView().seed, 271828, 'Submitting the prefilled setup starts the requested world.');
assert.equal(setupRefresh.api.getView().geometry.signature, seededView.geometry.signature);
assert.equal(setupRefresh.api.completeSetup().ok, true);
assert.equal(setupRefresh.api.getView().initialSeed, null);
assert.equal(setupRefresh.api.executeAction('economy').ok, true);
const playingRefresh = createHarness(true, setupRefresh.storage, setupRefresh.context.location.href);
playingRefresh.api.initialize();
const beforeRefresh = coreState(setupRefresh);
const afterRefresh = coreState(playingRefresh);
for (const key of ['snapshot', 'turn', 'count', 'rngState', 'history', 'log']) {
  assert.deepEqual(afterRefresh[key], beforeRefresh[key], `Refresh keeps ${key} instead of consuming the seed link again.`);
}
assert.equal(playingRefresh.api.getView().seed, 271828);
assert.equal(playingRefresh.api.getView().geometry.signature, seededView.geometry.signature);
// The existing loader canonicalizes fractional entity values and notice fields.
// Compare that whole restored state to the legacy loader, not to raw live data.
legacy.context.fixture = setupRefresh.api.exportSave();
legacy.evaluate('state = loadState(fixture); alignArmiesWithEntityTerritories(); eliminateDefeatedEntities();');
assert.deepEqual(afterRefresh, coreState(legacy), 'Seed-link reload follows the unchanged legacy migration rules.');
assert.equal(playingRefresh.replacedUrls.length, 0);
assert.equal(playingRefresh.api.createGame({ realmName: '新的随机世界', seed: '' }).ok, true);
assert.notEqual(playingRefresh.api.getView().seed, 271828, 'A later blank new-world seed remains random.');

const blankSeedLink = createHarness(true, new Map([['three-sun-chronicle:v1', exactSave]]), 'http://localhost/?seed=%20');
blankSeedLink.api.initialize();
assert.equal(blankSeedLink.api.getView().seed, JSON.parse(exactSave).seed, 'Whitespace-only seed links do not replace an existing run.');
assert.equal(blankSeedLink.replacedUrls.length, 0);
const zeroSeedLink = createHarness(true, new Map(), 'http://localhost/?seed=0');
zeroSeedLink.api.initialize();
assert.equal(zeroSeedLink.api.getView().initialSeed, 1, 'URL seeds use the existing normalizer, including explicit zero.');
assert.equal(zeroSeedLink.context.location.href, 'http://localhost/');
unsubscribe();
console.log('React engine adapter checks passed: command parity, 3 seeds × 30 actions, exact reload, migration, validation, fog, deployment casualties, automatic collapse, inheritance, ending persistence, and one-shot seed URL setup.');
