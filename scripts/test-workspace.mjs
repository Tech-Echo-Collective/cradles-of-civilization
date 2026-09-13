import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");

// This lightweight DOM exercises setup and workspace visibility, not browser layout
// or SVG painting. Parse the real markup so missing IDs/controls cannot be invented
// by a permissive querySelector stub.
class TestElement {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentElement = null;
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.hidden = Object.hasOwn(attributes, "hidden");
    this.disabled = Object.hasOwn(attributes, "disabled");
    this.value = attributes.value || "";
    this.textContent = "";
    this.dataset = {};
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith("data-")) this.dataset[this.dataKey(name)] = value;
    }
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(" "); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(" "); },
      toggle: (name, force) => {
        const active = force ?? !this.classList.contains(name);
        this.classList[active ? "add" : "remove"](name);
        return active;
      }
    };
  }

  dataKey(name) { return name.slice(5).replace(/-([a-z])/g, (_, character) => character.toUpperCase()); }
  get id() { return this.attributes.id || ""; }
  get firstChild() { return this.children[0] || null; }
  get className() { return this.attributes.class || ""; }
  set className(value) { this.attributes.class = value; }
  get innerHTML() { return this._innerHTML || ""; }
  set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith("data-")) this.dataset[this.dataKey(name)] = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof TestElement) { node.parentElement = this; this.children.push(node); }
    }
  }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((node) => node !== this);
    this.parentElement = null;
  }
  addEventListener() {}
  removeEventListener() {}
  focus() { document.activeElement = this; }
  scrollIntoView() {}
  getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 960, height: 640 }; }
  matches(selector) {
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && tag.toUpperCase() !== this.tagName) return false;
    const id = selector.match(/#([\w-]+)/)?.[1];
    if (id && id !== this.id) return false;
    if ([...selector.matchAll(/\.([\w-]+)/g)].some(([, name]) => !this.classList.contains(name))) return false;
    return [...selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)].every(([, name, value]) =>
      this.hasAttribute(name) && (value === undefined || this.getAttribute(name) === value)
    );
  }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) {
    const alternatives = selector.split(",").map((part) => part.trim().split(/\s+/));
    const matches = (node, parts) => {
      if (!node.matches(parts.at(-1))) return false;
      let ancestor = node.parentElement;
      for (let index = parts.length - 2; index >= 0; index -= 1) {
        while (ancestor && !ancestor.matches(parts[index])) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
      }
      return true;
    };
    return this.children.flatMap((child) => [
      ...(alternatives.some((parts) => matches(child, parts)) ? [child] : []),
      ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

const root = new TestElement("document");
const stack = [root];
const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
for (const match of cleanHtml.matchAll(/<\/?([a-z][\w:-]*)\b([^>]*?)>/gi)) {
  const [, tag, attributeText] = match;
  if (match[0].startsWith("</")) {
    const index = stack.findLastIndex((node) => node.tagName === tag.toUpperCase());
    if (index > 0) stack.length = index;
    continue;
  }
  const attributes = {};
  for (const attribute of attributeText.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attributes[attribute[1]] = attribute[2] ?? attribute[3] ?? attribute[4] ?? "";
  }
  const node = new TestElement(tag, attributes);
  stack.at(-1).append(node);
  if (!voidTags.has(tag.toLowerCase()) && !match[0].endsWith("/>")) stack.push(node);
}

const document = {
  querySelector: (selector) => root.querySelector(selector),
  querySelectorAll: (selector) => root.querySelectorAll(selector),
  createElement: (tag) => new TestElement(tag),
  createElementNS: (_, tag) => new TestElement(tag),
  createDocumentFragment: () => new TestElement("fragment"),
  addEventListener() {},
  activeElement: null,
  documentElement: root.querySelector("html"),
  body: root.querySelector("body")
};
const ids = document.querySelectorAll("[id]").map((element) => element.id);
assert.equal(new Set(ids).size, ids.length, "every HTML ID must be unique");
const expectedActions = [
  "restartCivilization", "settleEnding", "science", "belief", "population", "economy", "arts", "hibernate",
  "balance", "suppressBelief", "order", "suppressScience", "militaryCampaign", "levyHost", "secureFrontier",
  "crownAuthority", "trainLegion", "fieldWorks", "buildEerf", "upgradeEerf", "recovery"
];
assert.deepEqual(document.querySelectorAll("[data-action]").map((element) => element.dataset.action).sort(), expectedActions.sort(),
  "all 21 original actions must remain, each exactly once");
const form = document.querySelector("#realmNameForm");
assert.ok(form, "the combined world settings form must exist");
for (const selector of ["#realmNameInput", "#seedInput", "[data-difficulty]", "[data-aggression]", "[data-governor]", "[data-map-mode]"]) {
  assert.ok(form.querySelector(selector), `${selector} must be available in the same settings form`);
}
assert.ok(document.querySelector("#gamePanel")?.querySelector("#territoryStep"), "the capital picker must be inside the main workspace");
assert.ok(!document.querySelector("#startRegionMap"), "capital selection must reuse the main map, not a second miniature map");

const memoryStore = new Map();
const context = vm.createContext({
  console, document, URL, Intl,
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
  confirm: () => true
});
context.window = context;
context.addEventListener = () => {};
for (const filename of ["endings.js", "balance-model.js", "map-lab/map-data.js", "map-lab/map-model.js", "map-lab/map-generator.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, filename), "utf8"), context, { filename });
}

const report = vm.runInContext(`(() => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), message);
  const isShown = (node) => Boolean(node) && !node.hidden && (!node.parentElement || isShown(node.parentElement));
  const businessState = () => JSON.stringify({
    seed: state.seed, rngState: state.rngState, turn: state.turn, count: state.count,
    sc: state.sc, be: state.be, la: state.la, pop: state.pop, eco: state.eco, stability: state.stability,
    map: state.map, military: state.military, history: state.history, finished: state.finished, mapUiExpanded: state.mapUiExpanded,
    pendingRestart: state.pendingRestart, endingCandidate: state.endingCandidate
  });
  // Geometry is covered by map/engine tests; keep the actual setup, workspace,
  // action availability, metrics, and map-expansion renderers in this harness.
  const actualRenderMap = renderMap;
  renderMap = () => { renderRegionIntel(); };
  renderStartingRegionPicker = () => {};
  renderLog = () => {};
  renderArchive = () => {};
  renderEndingWatch = () => {};
  renderEndingStats = () => {};
  renderEerfDetails = () => {};
  renderSpecialNotice = () => {};
  cacheDom();
  syncUtilityButtonCopy();
  check(dom.workspaceNewWorldButton.getAttribute("aria-keyshortcuts") === "Shift+N", "the visible workspace New World button must retain the original shortcut hint");

  state = createNewState(1058);
  render();
  check(state.setupStage === "settings" && !state.setupComplete, "a new world must start at combined settings");
  check(isShown(dom.setupPanel) && !isShown(dom.gamePanel), "settings must be visible before entering the workspace");
  for (const buttons of [dom.difficultyButtons, dom.aggressionButtons, dom.governorButtons, dom.mapModeButtons]) {
    check(buttons.length > 0 && buttons.every(isShown), "every setup option group must be visible together");
  }
  dom.realmNameInput.value = "工作区回归国";
  dom.seedInput.value = "314159";
  selectDifficulty("hard");
  selectAiAggression("total");
  selectGovernor("listener");
  selectMapMode("collapsed");
  equal([dom.realmNameInput.value, dom.seedInput.value], ["工作区回归国", "314159"], "changing options must not erase the unsubmitted name or seed");
  confirmRealmName({ preventDefault() {} });
  check(state.setupStage === "territory" && !state.setupComplete, "entering the map must defer world completion until capital confirmation");
  check(state.seed === 314159 && state.realmName === "工作区回归国", "the combined form must apply name and seed");
  equal([state.difficulty, state.aiAggression, state.governorId, state.mapUiExpanded], ["hard", "total", "listener", false], "all selected settings must survive entry");
  check(!isShown(dom.setupPanel) && isShown(dom.gamePanel) && isShown(dom.territoryStep), "the real workspace must host capital selection");
  check(isShown(dom.worldMap), "even pure-number mode must show the world map during capital selection");
  check(dom.actionButtons.every((button) => button.disabled), "every gameplay action must be disabled until the world starts");
  check(dom.deployArmyButton.disabled, "army deployment must be disabled until the world starts");
  const beforePreviewActions = businessState();
  for (const actionId of Object.keys(ACTIONS)) advanceRound(actionId);
  for (const shortcut of ACTION_SHORTCUTS) {
    handleShortcut({ key: shortcut.key, shiftKey: Boolean(shortcut.shiftKey), target: document.body, preventDefault() {} });
  }
  changeSelectedEntityStrategy({ target: { value: "expansion" } });
  toggleMapExpansion();
  check(setWorkspaceTab("development") === false, "unconfirmed worlds must not enter gameplay action panels");
  deploySelectedArmy(MAP_REGIONS.find((region) => region.id !== state.startingRegionId).id);
  equal(businessState(), beforePreviewActions, "actions, shortcuts, deployment, and strategy changes must not mutate a capital-selection preview");

  const alternateRegionId = MAP_REGIONS.find((region) => region.id !== state.startingRegionId).id;
  const originalRegionId = state.startingRegionId;
  const previewProvince = document.createElement("path");
  previewProvince.setAttribute("data-region", alternateRegionId);
  handleMapInteraction({ target: previewProvince });
  check(state.startingRegionId === alternateRegionId && state.selectedRegionId === alternateRegionId, "selecting a province must set the prospective capital");
  check(state.map.regions.find((region) => region.id === alternateRegionId)?.controllerId === PLAYER_ENTITY_ID, "the preview must surround the selected capital with player territory");
  check(state.turn === 0 && !state.setupComplete, "selecting a capital must not start time");
  previewProvince.setAttribute("data-region", originalRegionId);
  handleMapKeyboardInteraction({ target: previewProvince, key: "Enter", preventDefault() {} });
  check(state.startingRegionId === originalRegionId && state.turn === 0, "keyboard province selection must choose a capital without advancing time");
  returnToRealmName();
  check(state.setupStage === "settings" && isShown(dom.setupPanel), "back must return directly to combined settings");
  equal([state.difficulty, state.aiAggression, state.governorId, state.mapUiExpanded], ["hard", "total", "listener", false], "back must preserve all settings");
  equal([dom.realmNameInput.value, dom.seedInput.value], ["工作区回归国", "314159"], "back must preserve entered name and seed");
  confirmRealmName({ preventDefault() {} });
  selectStartingRegion(alternateRegionId);
  completeWorldSetup();
  check(state.setupComplete && state.setupStage === "complete" && state.turn === 0, "capital confirmation must start exactly once at year zero");
  check(state.startingRegionId === alternateRegionId && state.map.startingRegionId === alternateRegionId, "the confirmed capital must be used by the formal map");
  check(!state.mapUiExpanded && !isShown(dom.worldMap), "pure-number mode must hide the map after capital confirmation");
  check(isShown(document.querySelector("#numericalOverviewPanel")), "pure-number mode must show the civilization overview instead of a blank map slot");
  check(!isShown(dom.territoryStep) && !dom.actionButtons.find((button) => button.dataset.action === "science").disabled, "starting the world must replace the picker with playable actions");
  check(entityArmies(PLAYER_ENTITY_ID).every((army) => mapStateRegion(army.regionId)?.controllerId === PLAYER_ENTITY_ID), "starting armies must be placed on the confirmed realm's land");
  const afterConfirmation = businessState();
  completeWorldSetup();
  equal(businessState(), afterConfirmation, "double confirmation must not reset the world or create extra armies");

  // Record actual canvas drawing calls without claiming browser visual coverage.
  const chartCanvas = dom.workspaceMetricsChart;
  check(isShown(chartCanvas), "collapsing the map must expose the chart in its place");
  const chartStrokes = [];
  const chartText = [];
  let chartPath = [];
  const chartContext = {
    setTransform() {}, clearRect() {}, setLineDash() {}, arc() {}, fill() {},
    beginPath() { chartPath = []; },
    moveTo(x, y) { chartPath.push(["move", x, y]); },
    lineTo(x, y) { chartPath.push(["line", x, y]); },
    stroke() { chartStrokes.push({ color: this.strokeStyle, path: chartPath.slice() }); },
    fillText(value) { chartText.push(String(value)); }
  };
  chartCanvas.getContext = () => chartContext;
  renderWorkspaceChart();
  check(dom.workspaceChartLegend.children.length === 3, "the default chart must include science, belief, and literature/art");
  check(chartText.some((label) => label.includes("推进一年")), "a new world must show an honest single-sample hint");
  const sampleCountBeforeToggle = state.metricSamples.length;
  toggleMapExpansion();
  check(isShown(dom.worldMap) && !isShown(chartCanvas), "expanding strategy must restore the map and hide the chart");
  const strokesWhileHidden = chartStrokes.length;
  renderWorkspaceChart();
  check(chartStrokes.length === strokesWhileHidden, "the hidden chart must not draw");
  toggleMapExpansion();
  check(!isShown(dom.worldMap) && isShown(chartCanvas), "collapsing strategy must restore the chart");
  equal(businessState(), afterConfirmation, "map/chart switching must preserve the game and RNG");
  check(state.metricSamples.length === sampleCountBeforeToggle, "map/chart switching must not create history samples");
  const stateBeforeChartChecks = state;
  state = { ...state, metricSamples: [
    createMetricSample(2, 1, { ...snapshot(), eco: 900000, pop: 400000 }),
    createMetricSample(4, 1, { ...snapshot(), eco: 1200000, pop: 800000 }),
    createMetricSample(10, 1, { ...snapshot(), eco: 0, pop: 0 }, { collapse: "测试毁灭" }),
    createMetricSample(10, 2, { ...snapshot(), eco: 50000, pop: 2600 })
  ] };
  const beforeChartNavigation = JSON.stringify(state);
  chartStrokes.length = 0;
  setWorkspaceChart("economy");
  const economyPath = chartStrokes.find((stroke) => stroke.color === WORKSPACE_CHART_SERIES.eco.color).path;
  equal(economyPath.map((point) => point[0]), ["move", "line", "line", "move"], "new civilizations must begin a new line, including same-year restarts");
  check(Math.abs((economyPath[2][1] - economyPath[1][1]) / (economyPath[1][1] - economyPath[0][1]) - 3) < 0.001, "year gaps must use real time distances, not equally spaced sample indexes");
  check(economyPath[0][2] > economyPath[1][2], "large economic values must stay distinct rather than clip at the old meter cap");
  check(workspaceChartCeiling(normalizedMetricSamples(), WORKSPACE_CHART_GROUPS.population) >= 800000, "unbounded population must fit its own scale");
  for (const group of Object.keys(WORKSPACE_CHART_GROUPS)) setWorkspaceChart(group);
  check(!setWorkspaceChart("invalid"), "unknown chart groups must be rejected");
  equal(JSON.stringify(state), beforeChartNavigation, "chart navigation must never alter gameplay or stored samples");
  const originalEnglish = I18N.isEnglish;
  I18N.isEnglish = () => true;
  setWorkspaceChart("knowledge");
  check(!/[\u3400-\u9fff]/u.test(chartCanvas.getAttribute("aria-label")), "the English chart must have an English accessible summary");
  I18N.isEnglish = originalEnglish;
  state = { ...stateBeforeChartChecks, metricSamples: [] };
  renderWorkspaceChart();
  check(dom.workspaceChartLegend.children.length === 3 && !state.metricSamples.length, "missing old history must use a read-only current snapshot");
  state = stateBeforeChartChecks;
  renderWorkspaceChart();

  const tabs = Array.from(document.querySelectorAll("[data-workspace-tab]")).map((button) => button.dataset.workspaceTab);
  check(tabs.length >= 5, "workspace navigation must preserve multiple action and information categories");
  const beforeNavigation = businessState();
  for (const tab of tabs) {
    setWorkspaceTab(tab);
    if (tab === "military") continue;
    const panels = Array.from(document.querySelectorAll("[data-workspace-panel]"));
    check(panels.filter(isShown).length === 1 && isShown(panels.find((panel) => panel.dataset.workspacePanel === tab)), "navigation must show only the selected " + tab + " panel");
  }
  setWorkspaceTab("unknown-tab");
  equal(businessState(), beforeNavigation, "workspace navigation must not advance time or mutate metrics, territories, armies, or RNG");

  const economyBeforeCrisis = state.eco;
  state.eco = 0;
  setWorkspaceTab("development");
  render();
  const crisisNotice = document.querySelector("#workspaceCrisisNotice");
  check(isShown(crisisNotice), "a crisis must expose a recovery route even outside the Facilities panel");
  check(currentWorkspaceTab === "development", "crisis rendering must not steal the player's current panel");
  const beforeRecoveryNavigation = businessState();
  check(openFiscalRecovery(), "the crisis route must open the existing recovery action");
  const recoveryButton = dom.actionButtons.find((button) => button.dataset.action === "recovery");
  check(isShown(recoveryButton) && !recoveryButton.disabled && document.activeElement === recoveryButton, "the recovery route must reveal and focus the original enabled action");
  equal(businessState(), beforeRecoveryNavigation, "opening recovery must not execute it or consume a year");
  setWorkspaceTab("records");
  render();
  check(currentWorkspaceTab === "records" && isShown(crisisNotice), "players must still be able to read records while the crisis route remains visible");
  state.awaitingCivilizationRestart = true;
  render();
  check(!isShown(crisisNotice) && !openFiscalRecovery(), "a collapsed civilization must use restart, not offer fiscal recovery");
  state.awaitingCivilizationRestart = false;
  state.finished = true;
  render();
  check(!isShown(crisisNotice) && !openFiscalRecovery(), "a finished game must not offer fiscal recovery");
  state.finished = false;
  state.eco = economyBeforeCrisis;
  render();
  check(!isShown(crisisNotice) && !openFiscalRecovery(), "the crisis route must disappear after economic recovery");

  setWorkspaceTab("records");
  const scienceButton = dom.actionButtons.find((button) => button.dataset.action === "science");
  check(!scienceButton.disabled && !isShown(scienceButton), "shortcut coverage must begin with an available action on an inactive panel");
  const originalAdvanceRound = advanceRound;
  const shortcutCalls = [];
  advanceRound = (actionId) => { shortcutCalls.push(actionId); };
  const keyEvent = { key: "s", shiftKey: false, target: document.body, preventDefault() {} };
  handleShortcut(keyEvent);
  equal(shortcutCalls, ["science"], "the original action shortcut must remain reachable from another tab");
  check(isShown(scienceButton), "the action's panel must open so keyboard users see the shortcut feedback");
  for (const ignored of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { repeat: true }, { target: dom.realmNameInput }]) {
    handleShortcut({ ...keyEvent, ...ignored });
  }
  scienceButton.disabled = true;
  handleShortcut(keyEvent);
  equal(shortcutCalls, ["science"], "typing, browser shortcuts, held keys, and disabled actions must not trigger a game action");
  advanceRound = originalAdvanceRound;
  renderActionButtons();
  const beforeMapInspection = businessState();
  selectMapRegion(originalRegionId);
  equal(businessState(), beforeMapInspection, "inspection after the game starts must not regenerate borders or change the capital");

  const saved = JSON.parse(JSON.stringify(state));
  for (const legacyStage of ["name", "difficulty", "governor", "settings"]) {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...saved, setupComplete: false, setupStage: legacyStage }));
    state = loadState();
    check(state?.setupStage === "settings" && !state.setupComplete, "unfinished legacy " + legacyStage + " saves must migrate to combined settings");
    equal([state.difficulty, state.aiAggression, state.governorId, state.mapUiExpanded], ["hard", "total", "listener", false], "legacy setup migration must retain player choices");
  }
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...saved, setupComplete: false, setupStage: "territory" }));
  state = loadState();
  check(state?.setupStage === "territory" && !state.setupComplete && state.startingRegionId === alternateRegionId, "unfinished territory saves must resume capital selection");
  render();
  check(isShown(dom.gamePanel) && isShown(dom.worldMap), "restored capital selection must show the workspace map");
  localStorage.setItem(STORE_KEY, JSON.stringify({ ...saved, setupComplete: true, setupStage: "governor", turn: 12 }));
  state = loadState();
  render();
  check(state?.setupStage === "complete" && state.setupComplete && state.turn === 12, "existing active runs must bypass all setup stages");
  check(isShown(dom.gamePanel) && !isShown(dom.setupPanel) && !isShown(dom.territoryStep), "active saves must return directly to play");

  // Exercise the real SVG renderer separately. This proves geometry/DOM wiring
  // and rebuild hygiene, not visual appearance in an actual browser viewport.
  const svgProvincePaths = [];
  for (const worldSeed of [1058, 271828, 1058]) {
    state = createNewState(worldSeed);
    state.realmName = "地图绘制测试国";
    state.setupStage = "territory";
    state.governorId = "listener";
    rebuildFoundingPreview();
    check(!strategicMapView.built && dom.strategicProvinceLayer.children.length === 0, "switching seeds must clear the old SVG province layer and build cache");
    check(POLITICAL_ENTITY_IDS.every((id) => !document.querySelector("#formal-entity-clip-" + id)), "switching seeds must remove old realm clipping definitions");
    actualRenderMap();
    check(strategicMapView.built && strategicMapView.provinceNodes.size === 64, "the real renderer must build all 64 seeded province paths");
    check(dom.strategicProvinceLayer.children.length === 64 && dom.strategicProvinceReliefLayer.children.length === 64, "province and relief layers must each contain one node per province");
    check(dom.strategicArmyLayer.children.length === 0 && strategicMapView.armyNodes.size === 0, "capital previews must not expose movable army markers");
    check(dom.formalLandClipPath.getAttribute("d") === STRATEGIC_MAP_DATA.landPath, "the land mask must use the active generated coast");
    const provincePaths = MAP_REGIONS.map((region) => strategicMapView.provinceNodes.get(region.id).getAttribute("d"));
    svgProvincePaths.push(provincePaths);
    for (const region of MAP_REGIONS) {
      check(strategicMapView.provinceNodes.get(region.id).getAttribute("d") === strategicPointsPath(STRATEGIC_GEOGRAPHY.cellByProvinceId[region.id].points), "each SVG province must use the active geography's polygon");
    }
    completeWorldSetup();
    actualRenderMap();
    actualRenderMap();
    check(dom.strategicProvinceLayer.children.length === 64, "re-rendering must not duplicate province paths");
    check(strategicMapView.armyNodes.size === armies().filter((army) => army.force > 0).length, "listener view must render each live army exactly once");
    check(dom.strategicArmyLayer.children.length === strategicMapView.armyNodes.size, "re-rendering must not accumulate stale army markers");
    for (const id of POLITICAL_ENTITY_IDS) {
      check(document.querySelectorAll("#formal-entity-clip-" + id).length === 1, "each realm must retain exactly one clipping definition after rebuilding");
    }
  }
  check(JSON.stringify(svgProvincePaths[0]) !== JSON.stringify(svgProvincePaths[1]), "changing seeds must visibly replace the province path data");
  equal(svgProvincePaths[0], svgProvincePaths[2], "returning to the same seed must recreate identical SVG province paths");
  state = createNewState(314159, { geometryVersion: null });
  state.setupComplete = true;
  state.setupStage = "complete";
  alignArmiesWithEntityTerritories();
  actualRenderMap();
  check(STRATEGIC_GEOGRAPHY.signature === "342bf330" && strategicMapView.provinceNodes.size === 64, "the renderer must also recover the fixed legacy map after displaying generated worlds");
  const finalIds = Array.from(document.querySelectorAll("[id]")).map((node) => node.id);
  check(new Set(finalIds).size === finalIds.length, "dynamic SVG rebuilding must not introduce duplicate IDs");
  return [
    "combined settings preserve difficulty, AI, governor, map mode, name, and seed",
    "capital selection runs inside the real map-first workspace without advancing time",
    "unconfirmed worlds block all 21 actions and army deployment",
    "pure-number mode uses the map to choose a capital and then shows live metric charts",
    "charts preserve history and gameplay, handle single samples and generation breaks, and scale large values honestly",
    "workspace navigation does not mutate gameplay",
    "economic crises expose the original fiscal recovery action without forcing tabs or advancing time",
    "active and unfinished legacy saves resume at the correct stage",
    "real SVG map rendering rebuilds seeded worlds and legacy maps without stale clipping paths or duplicate markers"
  ];
})()`, context, { filename: "workspace-regression" });

console.log("Workspace regression checks passed:");
console.log("- unique HTML IDs, all 21 original actions, and one combined setup form");
for (const item of report) console.log(`- ${item}`);
