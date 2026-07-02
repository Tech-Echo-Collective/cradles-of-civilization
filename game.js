"use strict";

const CAP = 20000;
const SPEC_MAX = 5000;
const DEFAULT_ECO = 50000;
const ECO_METER_CAP = 300000;
const EERF_MAX_LEVEL = 5;
const BASE_RESTART_POP = 2600;
const SAVE_VERSION = 2;
const STORE_KEY = "three-sun-chronicle:v1";
const ENDING_STORE_KEY = "three-sun-chronicle:ending:v1";
const ENDING_PAGE = "ending.html";
const RNG_MOD = 2147483647;
const RNG_MUL = 48271;
const KNOWLEDGE_RESTART_RATES = [0, 0.026, 0.05, 0.074, 0.102, 0.135];
const KNOWLEDGE_RESTART_CAPS = [0, 520, 1050, 1650, 2400, 3300];
const C_AUTO_STREAK = 2;
const ENDING_THRESHOLDS = {
  dominanceRatio: 1.28,
  reformHigh: 18500,
  companionKnowledge: 9000,
  exodusKnowledge: 17000,
  balancedKnowledge: 14500,
  middleScience: 12500,
  lowKnowledge: 7000,
  bronzeScience: 1800,
  faithfulCollapse: 12000,
  exodusPopulation: 50000,
  exodusEconomy: 120000,
  promisedEconomy: 150000,
  promisedPopulation: 60000,
  orderHigh: 82,
  collapseCycle: 8
};

const SCIENCE_ERAS = [
  { threshold: 0, name: "石器时代" },
  { threshold: 500, name: "铜石并用时代" },
  { threshold: 1200, name: "青铜时代" },
  { threshold: 2500, name: "铁器时代" },
  { threshold: 4000, name: "古典机械时代" },
  { threshold: 6000, name: "蒸汽时代" },
  { threshold: 8000, name: "电气时代" },
  { threshold: 10000, name: "原子时代" },
  { threshold: 12000, name: "信息时代" },
  { threshold: 14000, name: "太空时代" },
  { threshold: 16000, name: "星际航行时代" },
  { threshold: 18000, name: "宇宙工程时代" },
  { threshold: 20000, name: "上限：宇宙灯塔" }
];

const BELIEF_ERAS = [
  { threshold: 0, name: "巫祝萌芽" },
  { threshold: 500, name: "图腾祭司" },
  { threshold: 1200, name: "祖灵城邦" },
  { threshold: 2500, name: "神权律法" },
  { threshold: 4000, name: "经院神学" },
  { threshold: 6000, name: "圣城体系" },
  { threshold: 8000, name: "正典教会" },
  { threshold: 10000, name: "三位一体" },
  { threshold: 12000, name: "教皇选举" },
  { threshold: 14000, name: "尼西亚信经" },
  { threshold: 16000, name: "异端审判" },
  { threshold: 18000, name: "唯有上帝" },
  { threshold: 20000, name: "天国王朝" }
];

const ACTIONS = {
  science: {
    label: "建造研究所",
    type: "progress",
    delta: { sc: 235, be: -20, pop: -120, eco: -7800, stability: -2 },
    text: "我们必须知道；我们必将知道。\n ——大卫·希尔伯特，1930年",
    chronicleText: "研究者把恐惧写成公式，科学上升，但旧祭司们感到不安。"
  },
  belief: {
    label: "潜心苦修",
    type: "special",
    delta: { sc: -18, be: 170, pop: 300, eco: -6400, stability: 4 },
    text: "万物非主，唯有真主。",
    chronicleText: "苦修者重新解释星象，人群获得秩序，怀疑者退回暗处。"
  },
  population: {
    label: "扩建聚居地",
    type: "progress",
    delta: { sc: -18, be: 24, pop: 2600, eco: -9500, stability: -5 },
    text: "居者有其屋，耕者有其田。安得广厦千万间，大庇天下寒士俱欢颜？",
    chronicleText: "新的洞穴、温室与地下街区被打开，人口膨胀也带来拥挤。"
  },
  balance: {
    label: "均衡治理",
    type: "progress",
    delta: { sc: 95, be: 95, pop: 1100, eco: 4000, stability: 8 },
    text: "政治是妥协的艺术。由此，百花齐放，百家争鸣；\n我看没什么，起码挺热闹。",
    chronicleText: "学院和神殿互相让出一步，文明暂时学会用两种语言说话。"
  },
  order: {
    label: "维持秩序",
    type: "special",
    delta: { sc: -6, be: 22, pop: -160, eco: -11500, stability: 18 },
    text: "您自由了。\n——《悲惨世界》，1862年",
    chronicleText: "巡夜队、粮票与临时法院重新挤压混乱，经济为秩序让路。"
  },
  suppressBelief: {
    label: "打压神学",
    type: "special",
    delta: { sc: 125, be: -125, pop: -420, eco: -8800, stability: -8 },
    text: "陛下，我不需要上帝这个假设。\n——皮埃尔·西蒙·拉普拉斯，1802年",
    chronicleText: "学院夺回祭坛、税粮与钟楼，神学退却，科学获得一段残酷的清场。"
  },
  suppressScience: {
    label: "打压科学",
    type: "special",
    delta: { sc: -125, be: 125, pop: 120, eco: -6200, stability: 3 },
    text: "不管怎么说，它依然在转动！\n——伽利略·伽利莱，1632年",
    chronicleText: "祭司接管测量器与工坊账簿，科学退却，神学获得一段安静的扩张。"
  },
  hibernate: {
    label: "冬眠：增援未来",
    type: "special",
    delta(state) {
      return {
        sc: 35,
        be: 35,
        pop: -Math.max(1, Math.ceil(state.pop * 0.06)),
        eco: -5000,
        stability: 14
      };
    },
    text: "国度从你而立，君王由你而出。",
    chronicleText: "一批人进入冬眠库，文明用当下的热闹换取下一次醒来的秩序。"
  },
  economy: {
    label: "刺激经济",
    type: "progress",
    delta(state) {
      return {
        sc: -8,
        be: -6,
        pop: -Math.max(0, Math.round(state.pop * 0.012)),
        eco: Math.round(16000 + Math.sqrt(Math.max(0, state.pop)) * 68 + state.stability * 160),
        stability: -1
      };
    },
    text: "牛奶会有的，面包也会有的。一切都会有的！\n ——列宁，1917年",
    chronicleText: "粮仓、工坊和税制被重新接上线，文明把理想暂时换成了现金流。"
  },
  buildEerf: {
    label: "建造 EERF",
    type: "special",
    delta: { sc: -45, be: -35, pop: -800, eco: -65000, stability: -4 },
    text: "E.E.R.F.极端环境抵抗设施在地下开工。子子孙孙无穷匮也，而山不加增，何苦而不平？",
    chronicleText: "极端环境抵抗设施在地下开工，地表文明为下一代火种支付第一笔代价。",
    effect() {
      state.eerfLevel = Math.max(state.eerfLevel, 1);
    }
  },
  upgradeEerf: {
    label: "升级 EERF",
    type: "special",
    delta(state) {
      const nextLevel = Math.min(EERF_MAX_LEVEL, state.eerfLevel + 1);
      const cost = 36000 + nextLevel * 34000;
      return {
        sc: -20 - nextLevel * 6,
        be: -18 - nextLevel * 5,
        pop: -Math.round(600 + nextLevel * 450),
        eco: -cost,
        stability: -3
      };
    },
    text: "风雨不动安如山。呜呼！何时眼前突兀见此屋，吾庐独破受冻死亦足！",
    chronicleText: "更深的门、更厚的隔热层、更长的冬眠协议被写入 EERF。",
    effect() {
      state.eerfLevel = Math.min(EERF_MAX_LEVEL, state.eerfLevel + 1);
    }
  },
  recovery: {
    label: "炉边谈话",
    type: "special",
    crisisOnly: true,
    canRunWithZeroPopulation: true,
    delta(state) {
      const relief = Math.max(18000, Math.round(Math.sqrt(Math.max(1, state.pop)) * 115 + state.stability * 260));
      const seedPopulation = state.pop <= 0 ? 3000 : 0;
      return {
        sc: -25,
        be: -15,
        pop: seedPopulation,
        eco: relief,
        stability: -3
      };
    },
    text: "我想花几分钟时间，向我们的人民谈谈银行的情况。\n ——富兰克林·罗斯福，1933年",
    chronicleText: "城邦发行硬债、重启税粮并征用冬眠库物资，财政恢复了最小心跳。"
  },
  restartCivilization: {
    label: "重启文明",
    type: "special",
    restartOnly: true,
    canRunWithZeroPopulation: true,
    delta: {},
    text: "神又说，要有光。于是又有了光。",
    chronicleText: "幸存者打开 EERF 和废墟档案，下一代文明从火种中醒来。"
  },
  settleEnding: {
    label: "脱离苦海",
    type: "special",
    settleOnly: true,
    canRunWithZeroPopulation: true,
    delta: {},
    text: "在这一刻，我们必须想象你是幸福的。",
    chronicleText: "文明把当前状态写成最终结局。"
  }
};

const ACTION_SHORTCUTS = [
  { key: "s", actionId: "science", label: "S" },
  { key: "b", actionId: "belief", label: "B" },
  { key: "p", actionId: "population", label: "P" },
  { key: "b", shiftKey: true, actionId: "balance", label: "Shift+B" },
  { key: "z", actionId: "order", label: "Z" },
  { key: "1", actionId: "suppressBelief", label: "1" },
  { key: "2", actionId: "suppressScience", label: "2" },
  { key: "h", actionId: "hibernate", label: "H" },
  { key: "e", actionId: "economy", label: "E" },
  { key: "f", actionId: "buildEerf", label: "F" },
  { key: "u", actionId: "upgradeEerf", label: "U" },
  { key: "o", actionId: "recovery", label: "O" },
  { key: "r", actionId: "restartCivilization", label: "R" },
  { key: "t", actionId: "settleEnding", label: "T" }
];

const ACTION_SHORTCUT_LABELS = ACTION_SHORTCUTS.reduce((labels, shortcut) => {
  labels[shortcut.actionId] = shortcut.label;
  return labels;
}, {});

const UTILITY_SHORTCUTS = [
  { key: "l", shiftKey: true, buttonId: "clearLogButton", label: "Shift+L", run: clearChronicle },
  { key: "n", shiftKey: true, buttonId: "newGameButton", label: "Shift+N", run: startNewGame }
];

const dom = {};
let state = null;
let frameHandle = 0;

class Lcg {
  constructor(seed) {
    this.state = normalizeSeed(seed);
  }

  next() {
    this.state = (this.state * RNG_MUL) % RNG_MOD;
    return this.state / RNG_MOD;
  }

  nextInt(max) {
    return Math.floor(this.next() * max);
  }
}

function normalizeSeed(value) {
  const number = Number.isFinite(Number(value)) ? Number(value) : Date.now();
  const seed = Math.floor(Math.abs(number)) % RNG_MOD;
  return seed > 0 ? seed : 1;
}

function createNewState() {
  const seed = normalizeSeed(Date.now());
  const initialSnapshot = {
    sc: 240,
    be: 360,
    pop: 7600,
    eco: DEFAULT_ECO,
    stability: 52
  };
  return {
    saveVersion: SAVE_VERSION,
    seed,
    rngState: seed,
    lastSavedAt: null,
    loadedFromSave: false,
    turn: 0,
    count: 1,
    ...initialSnapshot,
    populationGrowthMultiplier: 1,
    knowledgeGrowthMultiplier: 1,
    controlEfficiencyMultiplier: 1,
    controlLocked: false,
    populationLockTurns: 0,
    doomCountdown: 0,
    lockedPopulation: null,
    eerfLevel: 0,
    restartPopulationSeed: BASE_RESTART_POP,
    awaitingCivilizationRestart: false,
    pendingRestart: null,
    endingCandidate: null,
    cEndingStreak: 0,
    finished: false,
    finalEnding: null,
    lastRand: null,
    lastTone: "quiet",
    specialNotice: null,
    history: [],
    currentCivilization: createCivilizationStats(1, 0, initialSnapshot),
    weather: "等待第一年观测",
    ending: "我们依旧存在。",
    log: [
      {
        type: "progress",
        title: "第 1 号文明苏醒",
        text: "三颗恒星在天幕上留下互相矛盾的轨迹。科学、神学、人口与经济都脆弱不堪，这是一个文明的新生。",
        delta: { sc: 240, be: 360, pop: 7600, eco: DEFAULT_ECO, stability: 52 }
      }
    ]
  };
}

function createCivilizationStats(civilization, startTurn, initialSnapshot = {}) {
  const snap = {
    sc: finiteOr(initialSnapshot.sc, 0),
    be: finiteOr(initialSnapshot.be, 0),
    pop: finiteOr(initialSnapshot.pop, 0),
    eco: finiteOr(initialSnapshot.eco, 0),
    stability: finiteOr(initialSnapshot.stability, 0)
  };

  return {
    civilization,
    startTurn,
    turns: 0,
    peakSc: snap.sc,
    peakBe: snap.be,
    peakPop: snap.pop,
    peakEco: snap.eco,
    peakEerf: finiteOr(initialSnapshot.eerfLevel ?? initialSnapshot.eerf, 0),
    peakStability: snap.stability,
    specialEvents: [],
    collapseCause: null,
    finalSnapshot: null,
    ending: "未判定"
  };
}

function updateCivilizationStats(snapshotValue = snapshot(), specialEventTitle = null) {
  if (!state.currentCivilization) {
    state.currentCivilization = createCivilizationStats(state.count, state.turn, snapshotValue);
  }

  const stats = state.currentCivilization;
  stats.turns = Math.max(0, state.turn - stats.startTurn);
  stats.peakSc = Math.max(stats.peakSc, snapshotValue.sc);
  stats.peakBe = Math.max(stats.peakBe, snapshotValue.be);
  stats.peakPop = Math.max(stats.peakPop, snapshotValue.pop);
  stats.peakEco = Math.max(stats.peakEco, snapshotValue.eco);
  stats.peakEerf = Math.max(stats.peakEerf || 0, snapshotValue.eerf || state.eerfLevel || 0);
  stats.peakStability = Math.max(stats.peakStability, snapshotValue.stability);

  if (specialEventTitle && !stats.specialEvents.includes(specialEventTitle)) {
    stats.specialEvents.unshift(specialEventTitle);
    stats.specialEvents = stats.specialEvents.slice(0, 6);
  }
}

function init() {
  cacheDom();
  syncActionButtonCopy();
  syncUtilityButtonCopy();
  const restoredState = loadState();
  state = restoredState || createNewState();
  state.loadedFromSave = Boolean(restoredState);
  bindEvents();
  if (state.finished && state.finalEnding?.id) {
    goToEndingPage(state.finalEnding.id);
    return;
  }
  if (maybeFinishGame({ kind: "load", trigger: "载入存档" })) return;
  updateEnding();
  render();
  drawSky();
}

function cacheDom() {
  dom.countValue = document.querySelector("#countValue");
  dom.turnValue = document.querySelector("#turnValue");
  dom.randValue = document.querySelector("#randValue");
  dom.scValue = document.querySelector("#scValue");
  dom.beValue = document.querySelector("#beValue");
  dom.popValue = document.querySelector("#popValue");
  dom.ecoValue = document.querySelector("#ecoValue");
  dom.eerfValue = document.querySelector("#eerfValue");
  dom.scMeter = document.querySelector("#scMeter");
  dom.beMeter = document.querySelector("#beMeter");
  dom.popMeter = document.querySelector("#popMeter");
  dom.ecoMeter = document.querySelector("#ecoMeter");
  dom.eerfMeter = document.querySelector("#eerfMeter");
  dom.scEra = document.querySelector("#scEra");
  dom.beEra = document.querySelector("#beEra");
  dom.stabilityValue = document.querySelector("#stabilityValue");
  dom.ecoStatus = document.querySelector("#ecoStatus");
  dom.eerfStatus = document.querySelector("#eerfStatus");
  dom.weatherLabel = document.querySelector("#weatherLabel");
  dom.endingLabel = document.querySelector("#endingLabel");
  dom.specialBanner = document.querySelector("#specialBanner");
  dom.specialTitle = document.querySelector("#specialTitle");
  dom.specialText = document.querySelector("#specialText");
  dom.specialDelta = document.querySelector("#specialDelta");
  dom.seedValue = document.querySelector("#seedValue");
  dom.saveStatus = document.querySelector("#saveStatus");
  dom.logList = document.querySelector("#logList");
  dom.archiveList = document.querySelector("#archiveList");
  dom.skyCanvas = document.querySelector("#skyCanvas");
  dom.clearLogButton = document.querySelector("#clearLogButton");
  dom.newGameButton = document.querySelector("#newGameButton");
  dom.actionButtons = Array.from(document.querySelectorAll("[data-action]"));
}

function syncActionButtonCopy() {
  dom.actionButtons.forEach((button) => {
    const action = ACTIONS[button.dataset.action];
    if (!action) return;

    const title = button.querySelector(".action-copy strong");
    const description = button.querySelector(".action-copy small");
    if (title) title.textContent = action.label;
    if (description) description.textContent = action.text;
    const shortcut = ACTION_SHORTCUT_LABELS[button.dataset.action];
    const accessibleName = shortcut ? `${action.label}，快捷键 ${shortcut}` : action.label;
    button.title = accessibleName;
    button.setAttribute("aria-label", accessibleName);
    syncShortcutBadge(button, shortcut, "shortcut-badge");
  });
}

function syncUtilityButtonCopy() {
  UTILITY_SHORTCUTS.forEach((shortcut) => {
    const button = document.querySelector(`#${shortcut.buttonId}`);
    if (!button) return;

    const baseLabel = button.dataset.baseLabel || button.textContent.trim();
    button.dataset.baseLabel = baseLabel;
    button.textContent = "";

    const label = document.createElement("span");
    label.textContent = baseLabel;
    button.append(label);
    syncShortcutBadge(button, shortcut.label, "inline-shortcut");

    const accessibleName = `${baseLabel}，快捷键 ${shortcut.label}`;
    button.title = accessibleName;
    button.setAttribute("aria-label", accessibleName);
    button.setAttribute("aria-keyshortcuts", shortcut.label);
  });
}

function syncShortcutBadge(button, label, className) {
  const existing = Array.from(button.children).find((child) => child.classList.contains(className));
  if (!label) {
    existing?.remove();
    button.removeAttribute("aria-keyshortcuts");
    return;
  }

  const badge = existing || document.createElement("span");
  badge.className = className;
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = label;
  if (!existing) button.append(badge);
  button.setAttribute("aria-keyshortcuts", label);
}

function bindEvents() {
  dom.actionButtons.forEach((button) => {
    button.addEventListener("click", () => advanceRound(button.dataset.action));
  });

  dom.newGameButton.addEventListener("click", startNewGame);

  dom.clearLogButton.addEventListener("click", clearChronicle);

  window.addEventListener("resize", () => {
    renderSkyFrame(performance.now());
  });

  window.addEventListener("keydown", handleShortcut);
}

function handleShortcut(event) {
  if (shouldIgnoreShortcut(event)) return;

  const key = event.key.toLowerCase();
  if (handleUtilityShortcut(event, key)) return;

  const shortcut = ACTION_SHORTCUTS.find((item) => {
    return item.key === key && Boolean(item.shiftKey) === event.shiftKey;
  });
  if (!shortcut) return;

  const button = dom.actionButtons.find((candidate) => candidate.dataset.action === shortcut.actionId);
  if (!button || button.disabled) return;

  event.preventDefault();
  flashShortcutButton(button);
  advanceRound(shortcut.actionId);
}

function handleUtilityShortcut(event, key) {
  const shortcut = UTILITY_SHORTCUTS.find((item) => {
    return item.key === key && Boolean(item.shiftKey) === event.shiftKey;
  });
  if (!shortcut) return false;

  const button = document.querySelector(`#${shortcut.buttonId}`);
  if (!button || button.disabled) return false;

  event.preventDefault();
  flashShortcutButton(button);
  shortcut.run();
  return true;
}

function startNewGame() {
  clearStoredEnding();
  state = createNewState();
  saveState();
  render();
}

function clearChronicle() {
  state.log = [];
  saveState();
  if (dom.saveStatus) dom.saveStatus.textContent = saveStatusText();
  renderLog();
}

function shouldIgnoreShortcut(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return true;

  const target = event.target;
  if (!target || target === document.body) return false;
  const tagName = target.tagName;
  return target.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function flashShortcutButton(button) {
  button.classList.remove("shortcut-flash");
  void button.offsetWidth;
  button.classList.add("shortcut-flash");
  window.setTimeout(() => button.classList.remove("shortcut-flash"), 180);
}

function advanceRound(actionId) {
  if (state.finished) {
    goToEndingPage(state.finalEnding?.id || "A");
    return;
  }

  if (actionId === "restartCivilization") {
    restartCivilizationFromPending();
    saveState();
    render();
    return;
  }

  if (actionId === "settleEnding") {
    settleCurrentEnding();
    return;
  }

  if (state.awaitingCivilizationRestart) return;

  const action = ACTIONS[actionId];
  if (!action || action.restartOnly || action.settleOnly) return;
  const crisisAtRoundStart = isEconomicCrisis();

  const rng = new Lcg(state.rngState);
  const rand = rng.nextInt(10000);
  const spec = rng.nextInt(SPEC_MAX) + 1;
  state.rngState = rng.state;
  state.turn += 1;
  state.lastRand = rand;
  state.specialNotice = null;

  const before = snapshot();
  const drift = computeDrift(rand, before);
  const event = eventFor(rand, before);

  if (event.destroy) {
    if (!collapseCivilization(event, before, rand)) {
      state.rngState = rng.state;
      saveState();
      render();
    }
    return;
  }

  applyDelta(drift, { freezeKnowledge: crisisAtRoundStart });
  if (maybeFinishGame({ kind: "drift", trigger: event.title, rand })) return;
  applyDelta(event.delta, { freezeKnowledge: crisisAtRoundStart });
  if (maybeFinishGame({ kind: "event", trigger: event.title, rand })) return;

  const specialEvent = specialEventFor(spec, rng);
  state.rngState = rng.state;
  if (specialEvent) {
    const specialDelta = applySpecialEvent(specialEvent, { freezeKnowledge: crisisAtRoundStart });
    state.specialNotice = {
      title: specialEvent.title,
      text: specialEvent.text,
      delta: specialDelta
    };
    updateCivilizationStats(snapshot(), specialEvent.title);
    if (maybeFinishGame({ kind: "special", trigger: specialEvent.title, rand })) return;
    if (specialEvent.piercesPopulationProtection && state.populationLockTurns > 0) {
      state.lockedPopulation = state.pop;
    }
    if (state.pop <= 0 && specialEvent.piercesPopulationProtection) {
      if (!collapseCivilization(
        {
          title: specialEvent.title,
          text: `${specialEvent.text} EERF 无法替地表人口承受这次屠杀。`,
          type: "disaster"
        },
        snapshot(),
        rand
      )) {
        saveState();
        render();
      }
      return;
    }
  }

  const populationLockedBeforeAction = enforcePopulationLock();
  if (state.pop <= 0 && !action.canRunWithZeroPopulation) {
    if (!collapseCivilization(
      {
        title: "人口断代",
        text: "从何时开始，文明掐死了自己的最后一个婴儿。万籁俱寂，一切必须重新开始。",
        type: "disaster"
      },
      before,
      rand
    )) {
      saveState();
      render();
    }
    return;
  }

  const actionDelta = typeof action.delta === "function" ? action.delta(state) : action.delta;
  const actionResult = prepareActionDelta(action, actionDelta, crisisAtRoundStart);
  applyDelta(actionResult.delta, { freezeKnowledge: crisisAtRoundStart });
  if (!actionResult.locked && typeof action.effect === "function") {
    action.effect();
  }
  if (maybeFinishGame({ kind: "action", trigger: action.label, rand })) return;
  const pressureDelta = applyDelta(computeSystemPressure(snapshot()), { freezeKnowledge: crisisAtRoundStart });
  const populationWasLocked = enforcePopulationLock() || populationLockedBeforeAction;
  if (maybeFinishGame({ kind: "pressure", trigger: "系统压力", rand })) return;
  if (state.pop <= 0) {
    if (!collapseCivilization(
      {
        title: "人口断代",
        text: "最后的配给没有等来接收者，文明被迫再次归零。",
        type: "disaster"
      },
      before,
      rand
    )) {
      saveState();
      render();
    }
    return;
  }
  updateEnding();

  const countdownDisaster = tickCivilizationTimers();
  if (countdownDisaster) {
    if (!collapseCivilization(countdownDisaster, before, rand)) {
      saveState();
      render();
    }
    return;
  }

  updateEnding();
  const after = snapshot();
  updateCivilizationStats(after, specialEvent?.title || null);
  const totalDelta = diff(before, after);
  const type = event.type === "special" || specialEvent || action.type === "special" || actionResult.locked
    ? "special"
    : "progress";
  state.weather = [event.title, specialEvent?.title, action.label].filter(Boolean).join("；");
  state.lastTone = type;
  addLog({
    type,
    title: `第 ${state.turn} 年｜Rand ${formatRand(rand)}｜${state.weather}`,
    text: [
      event.text,
      specialEvent?.text,
      actionResult.text,
      describeSystemPressure(pressureDelta),
      populationWasLocked ? "只生一个好，政府来养老。本年所有人口变化均被回滚。" : ""
    ]
      .filter(Boolean)
      .join(" "),
    delta: totalDelta
  });

  saveState();
  render();
}

function computeDrift(rand, current) {
  const scNoise = (rand % 19) - 8;
  const beNoise = (Math.floor(rand / 10) % 19) - 8;
  const popNoise = (Math.floor(rand / 100) % 41) - 19;
  const orderNoise = (Math.floor(rand / 1000) % 9) - 4;
  const lowOrderPenalty = current.stability < 30 ? 900 : 0;
  const highOrderBonus = current.stability > 72 ? 650 : 0;

  return {
    sc: clamp(Math.round(scNoise * 14 + current.sc * 0.004 - current.be * 0.001), -50, 50),
    be: clamp(Math.round(beNoise * 14 + current.be * 0.004 - current.sc * 0.001), -50, 50),
    pop: Math.round(current.pop * (0.004 + current.stability / 18000) + popNoise * 70 - lowOrderPenalty + highOrderBonus),
    eco: Math.round(Math.sqrt(Math.max(0, current.eco)) * 6 + current.stability * 5 - current.pop * 0.006 - (state.eerfLevel || 0) * 900),
    stability: orderNoise
  };
}

function computeSystemPressure(current) {
  const scRatio = current.sc / CAP;
  const beRatio = current.be / CAP;
  const scienceEraLevel = eraIndexFor(current.sc, SCIENCE_ERAS);
  const beliefEraLevel = eraIndexFor(current.be, BELIEF_ERAS);
  const harmony = knowledgeHarmony(current.sc, current.be);
  const rivalry = 1 - harmony;
  const sciencePressure = Math.max(0, scienceEraLevel - 2) * (1 - harmony * 0.88);
  const beliefPressure = Math.max(0, beliefEraLevel - 2) * (1 - harmony * 0.88);
  const harmonyLift = harmony > 0.72 ? Math.round((harmony - 0.72) * 46) : 0;
  const scPressure = clamp(
    harmonyLift - Math.round(beliefPressure * (3 + beRatio * 14)),
    -95,
    18
  );
  const bePressure = clamp(
    harmonyLift - Math.round(sciencePressure * (3 + scRatio * 14)),
    -95,
    18
  );

  const carryingCapacity = civilizationCarryingCapacity(current);
  const economyFactor = current.eco <= 0
    ? 0.15
    : clamp(Math.log10(current.eco + 10) / 6, 0.22, 1);
  const medicineFactor = 0.65 + scRatio * 0.8;
  const orderFactor = 0.68 + beRatio * 0.64 + harmony * 0.18;
  const birthRate = 0.0022 + beRatio * 0.0034 + scRatio * 0.0012;
  const overloadPenalty = current.pop > carryingCapacity
    ? (current.pop - carryingCapacity) * (0.028 + rivalry * 0.016)
    : 0;
  const povertyPenalty = current.eco < current.pop * 0.32
    ? current.pop * (0.008 + rivalry * 0.006)
    : 0;
  const popPressure = clamp(
    Math.round(current.pop * birthRate * medicineFactor * orderFactor * economyFactor - overloadPenalty - povertyPenalty),
    -60000,
    12000
  );

  const laborBase = Math.sqrt(Math.max(0, current.pop)) * 38;
  const scienceProductivity = 0.72 + scRatio * 1.45;
  const beliefOrder = 0.7 + beRatio * 0.8;
  const harmonyEconomy = 0.86 + harmony * 0.38;
  const eerfUpkeep = (state.eerfLevel || 0) * 3500;
  const treasuryDrag = current.eco > 220000 ? (current.eco - 220000) * 0.1 : 0;
  const upkeep = current.pop * 0.055 + (current.sc + current.be) * 0.18 + eerfUpkeep + treasuryDrag;
  const overloadCost = current.pop > carryingCapacity
    ? (current.pop - carryingCapacity) * 0.07
    : 0;
  const rivalryCost = rivalry * (2600 + (current.sc + current.be) * 0.09);
  const ecoPressure = clamp(
    Math.round(laborBase * scienceProductivity * beliefOrder * harmonyEconomy - upkeep - overloadCost - rivalryCost),
    -120000,
    90000
  );

  return {
    sc: scPressure,
    be: bePressure,
    pop: popPressure,
    eco: ecoPressure,
    stability: clamp(Math.round(harmony * 4 - rivalry * 5 - Math.max(0, current.pop - carryingCapacity) / 60000), -8, 5)
  };
}

function describeSystemPressure(delta) {
  const populationStress = delta.pop < -1000 ? "人口承载压力正在回收扩张。" : "";
  const economyStress = delta.eco < -3000 ? "经济维护成本吞噬了部分产出。" : "";
  const harmonyBonus = delta.stability > 0 ? "科学与神学的相对均衡提高了秩序。" : "";
  const knowledgeStress = delta.sc < 0 || delta.be < 0 ? "知识结构的互斥开始显现。" : "";
  return [populationStress, economyStress, harmonyBonus, knowledgeStress].filter(Boolean).join(" ");
}

function civilizationCarryingCapacity(current) {
  const scRatio = current.sc / CAP;
  const beRatio = current.be / CAP;
  const economySupport = Math.sqrt(Math.max(0, current.eco)) * 145;
  const eerfShelter = (state.eerfLevel || 0) * 6500;
  return Math.round(9000 + current.sc * 4.6 + current.be * 2.35 + economySupport + eerfShelter + (scRatio + beRatio) * 18000);
}

function knowledgeHarmony(sc, be) {
  const logGap = Math.abs(Math.log((sc + 600) / (be + 600)));
  return clamp(1 - logGap / Math.log(2.25), 0, 1);
}

function eventFor(rand, current) {
  const doom = doomEvent(rand, current);
  if (doom) return doom;

  if (current.sc >= 7500 && rand % 313 === 0) {
    return {
      type: "special",
      title: "微粒封锁假说",
      text: "最先进的实验同时失败，学者怀疑宇宙本身在挤压文明的上限。",
      delta: { sc: -50, be: 50, pop: -1200, eco: -18000, stability: -9 }
    };
  }

  if (current.be >= 7500 && rand % 271 === 0) {
    return {
      type: "special",
      title: "不信者税",
      text: "天意如此，不信者自当征收重税。",
      delta: { sc: -50, be: 50, pop: -1600, eco: -22000, stability: -7 }
    };
  }

  if (current.sc >= 6000 && current.be >= 6000 && rand % 89 === 0) {
    return {
      type: "special",
      title: "双相启示",
      text: "公式与祷文在同一块石碑上闭合，文明短暂理解了自己的双重心脏。",
      delta: { sc: 50, be: 50, pop: 4200, eco: 18000, stability: 10 }
    };
  }

  return baseEvent(rand);
}

function doomEvent(rand, current) {
  if (rand < 130) {
    return {
      destroy: true,
      type: "disaster",
      title: "三日凌空",
      text: "三颗恒星同时占据天空，海洋沸腾，山脉像纸页一样卷曲。"
    };
  }

  if (rand >= 2968 && rand <= 3024) {
    return {
      destroy: true,
      type: "disaster",
      title: "引力长鞭",
      text: "恒星轨道突然抽紧，整颗行星被甩入一段无法计算的黑暗。"
    };
  }

  if (rand >= 7375 && rand <= 7429) {
    return {
      destroy: true,
      type: "disaster",
      title: "潮汐裂谷",
      text: "大地被三颗太阳的潮汐力撕开，地下河与城市一起坠入裂谷。"
    };
  }

  if (rand >= 6140 && rand <= 6165) {
    return {
      destroy: true,
      type: "disaster",
      title: "烈焰长夜",
      text: "天空在同一天内经历正午与深夜，热浪和冰霜轮流碾过地表。"
    };
  }

  if (rand >= 1848 && rand <= 1862) {
    return {
      destroy: true,
      type: "disaster",
      title: "地壳回潮",
      text: "远古海床重新隆起，城市像沉船一样被埋进盐壳和石灰岩。"
    };
  }

  if (rand >= 4520 && rand <= 4536) {
    return {
      destroy: true,
      type: "disaster",
      title: "黑星凌日",
      text: "一颗恒星在另一颗恒星前方变暗，潮汐和辐射同时失序，历法彻底失效。"
    };
  }

  if (rand >= 8840 && rand <= 8857) {
    return {
      destroy: true,
      type: "disaster",
      title: "寒潮纪元",
      text: "长夜提前降临，冰层越过赤道，火种和粮仓在同一周内熄灭。"
    };
  }

  if (rand > 0 && rand % 769 === 0) {
    return {
      destroy: true,
      type: "disaster",
      title: "飞星雨",
      text: "来自旧轨道的碎片贯穿大气层，城市和神殿一起消失在白光里。"
    };
  }

  if (current.pop > 105000 && rand % 607 === 0) {
    return {
      destroy: true,
      type: "disaster",
      title: "地下城窒息",
      text: "人口超过洞穴和粮仓的承载极限，最后的避难所从内部崩塌。"
    };
  }

  return null;
}

function specialEventFor(spec, rng) {
  const current = snapshot();

  if (spec === 1) {
    const loss = 50000 + rng.nextInt(100001);
    return {
      type: "special",
      title: "ReUnion - 叛军起义",
      text: `王侯将相，宁有种乎？ \n——陈胜、吴广，公元前209年。\n叛军夺取粮仓与观测站，人口损失 ${formatNumber(loss)}。`,
      delta: { sc: -30, be: -10, pop: -loss }
    };
  }

  if (spec === 42) {
    return {
      type: "special",
      title: "Answers to All - 终极答案",
      text: "我们不禁驻足思考。生命、宇宙和万物的终极答案，究竟是什么？\n人口被锁定 5 次行动，同时启动毁灭倒计时。",
      delta: { sc: 100, be: -200 },
      effect() {
        state.populationLockTurns = 5;
        state.doomCountdown = 5;
        state.lockedPopulation = state.pop;
      }
    };
  }

  if (spec === 1861) {
    const divisor = rng.nextInt(2) === 0 ? 2 : 3;
    return {
      type: "special",
      title: "Civil War - 三体内战",
      text: `内战撕裂城邦，人口被除以 ${divisor}，经济损失 100,000。`,
      delta: {
        pop: Math.round(current.pop / divisor) - current.pop,
        eco: -100000
      }
    };
  }

  if (spec === 2020) {
    const survivorBase = current.pop * 0.6;
    const newPopulation = Math.round(Math.cbrt(survivorBase));
    return {
      type: "special",
      title: "Plague Inc. - 瘟疫公司",
      text: "灰烬，灰烬，我们都将倒下。\n——中世纪英国民谣。\n先按 4/5 人口减半、1/5 人口保留得到幸存基数，再执行 p = ∛p。",
      delta: { pop: newPopulation - current.pop }
    };
  }

  if (spec === 2006) {
    return {
      type: "special",
      title: "Genesis Birth - 创世出生",
      text: "冬至过了那整三天，耶稣降生在驻马店。",
      delta: { sc: 10, be: 5, pop: 20000, eco: 5000 }
    };
  }

  if (spec === 38) {
    const slowsGrowth = rng.nextInt(2) === 0;
    const factor = slowsGrowth ? 2 / 3 : 5 / 4;
    return {
      type: "special",
      title: "Gender Equality - 两性平等",
      text: slowsGrowth
        ? "女孩们只想玩乐。\n——辛迪·劳帕，1983年。\n人口增长策略转向审慎，本代文明内人口增速变为原来的 2/3。"
        : "新的家庭制度释放劳动与生育潜能，本代文明内人口增速变为原来的 5/4。",
      delta: {},
      effect() {
        state.populationGrowthMultiplier = roundStat(state.populationGrowthMultiplier * factor);
      }
    };
  }

  if (spec === 1922) {
    return {
      type: "special",
      title: "Union We Stand - 团结永存",
      text: "所有派系暂时站在同一条防线上，本代文明内发展与打压效率 ×2。",
      delta: {},
      effect() {
        state.controlEfficiencyMultiplier = roundStat(state.controlEfficiencyMultiplier * 2);
      }
    };
  }

  if (spec === 1991) {
    return {
      type: "special",
      title: "Divide and Fall - 分崩离析",
      text: "共同体碎裂。本代文明内，玩家行动无法再控制 SC、BE、人口或经济的发展。",
      delta: {},
      effect() {
        state.controlLocked = true;
      }
    };
  }

  if (spec === 1937) {
    return {
      type: "special",
      title: "Remember the Pain - 勿忘国耻",
      text: "神州陆沉。\n人口损失 300,000。",
      delta: { pop: -300000 },
      piercesPopulationProtection: true
    };
  }

  if (spec === 1945) {
    return {
      type: "special",
      title: "Revenge Our Loss - 招核男儿",
      text: "亲王亲王御马前，何物随风斩娇颜？",
      delta: { sc: 20, pop: -800000 }
    };
  }

  if (spec === 1800) {
    const target = current.sc <= 300 ? 420 : current.sc;
    return {
      type: "special",
      title: "Industrial Revolution - 工业革命",
      text: current.sc <= 300
        ? "工厂、滚轮和蒸汽噪声同时启动，科学被推至 420。"
        : "工业革命擦过地平线，但当前科学基础已不需要这次补课。",
      delta: { sc: target - current.sc }
    };
  }

  if (spec === 476) {
    const target = current.be <= 300 ? 700 : current.be;
    return {
      type: "special",
      title: "Middle Aged Times - 中古世纪",
      text: current.be <= 300
        ? "旧秩序用城墙、钟声和滚轮重组信仰，BE 被推至 700。"
        : "中古世纪的影子出现了，但神学基础已经更高。",
      delta: { be: target - current.be }
    };
  }

  if (spec === 1776) {
    return {
      type: "special",
      title: "Independence and Freedom - 独立自由",
      text: "独立宣言扩散进学院和神殿，本代文明内 SC/BE 正向增速 ×1.15。",
      delta: {},
      effect() {
        state.knowledgeGrowthMultiplier = roundStat(state.knowledgeGrowthMultiplier * 1.15);
      }
    };
  }

  if (spec === 1453) {
    return {
      type: "special",
      title: "Anarchy - 时代终结",
      text: "难道就没有一个基督徒来砍下我的头吗？！\n——君士坦丁十一世，1453年5月29日。\n经济被压到五分之一，人口流失一成。",
      delta: {
        eco: Math.round(current.eco / 5) - current.eco,
        pop: Math.round(current.pop * 0.9) - current.pop
      }
    };
  }

  if (spec === 3332) {
    return {
      type: "special",
      title: "No Meaning - 虚无主义",
      text: "跳舞吧，狂欢吧。一切都没有意义。\n经济损失 30,000，神学增长 30。",
      delta: { be: 30, eco: -30000 }
    };
  }

  if (spec === 3141) {
    return {
      type: "special",
      title: "Great Ratio - π",
      text: "山巅一寺一壶酒。",
      delta: { sc: 31.4159, eco: 31000 }
    };
  }

  if (spec === 2718) {
    return {
      type: "special",
      title: "Nature Goddess - 自然对数",
      text: "自然对数被奉为女神，增长曲线突然变得优雅。",
      delta: { sc: 27.1828, eco: 27000 }
    };
  }

  if (spec === 3688) {
    return {
      type: "special",
      title: "No Refund - 概不退款",
      text: "朋友，随我来，加入这场伟大的合唱。",
      delta: { eco: -30000 }
    };
  }

  if (spec === 404) {
    return {
      type: "special",
      title: "God Not Found - 查无此神",
      text: "我们把天空翻了个遍，没有发现上帝和天使。\n——尤里·加加林，1961年。",
      delta: { be: -50 }
    };
  }

  return null;
}

function baseEvent(rand) {
  const events = [
    {
      title: "乱纪元延长",
      text: "昼夜和季节失去意义，人们靠猜测安排播种和迁徙。",
      delta: { sc: 12, be: 45, pop: -2800, eco: -9000, stability: -8 }
    },
    {
      title: "稳定恒纪元",
      text: "浸泡在恒纪元的光辉里，文明的秩序和产出都获得了提升。",
      delta: { sc: 40, be: 14, pop: 3600, eco: 7000, stability: 7 }
    },
    {
      title: "地层翻页",
      text: "新的矿脉从断崖里露出，代价是一片旧城被埋进岩层。",
      delta: { sc: 50, be: -8, pop: -900, eco: 12000, stability: -2 }
    },
    {
      title: "神权辩论",
      text: "祭司们用一场漫长争论解释灾变，群众获得方向，学院失去经费。",
      delta: { sc: -30, be: 50, pop: 500, eco: -5000, stability: 4 }
    },
    {
      title: "观测失误",
      text: "一次错误预报让迁徙队走向错误山谷，星象学派趁机扩张。",
      delta: { sc: -45, be: 35, pop: -1300, eco: -7000, stability: -5 }
    },
    {
      title: "丰收季",
      text: "温暖、雨水和安静的夜晚罕见地同时出现，粮仓被装满。",
      delta: { sc: 20, be: 28, pop: 4600, eco: 10000, stability: 5 }
    },
    {
      title: "热疫",
      text: "高温唤醒古老病灶，医师与祈祷者都被推到人群前方。",
      delta: { sc: 45, be: 45, pop: -3600, eco: -12000, stability: -6 }
    },
    {
      title: "工匠学院",
      text: "师者，所以传道授业解惑也。",
      delta: { sc: 50, be: -10, pop: 900, eco: 8000, stability: 1 }
    },
    {
      title: "圣典整理",
      text: "要依靠主得救。",
      delta: { sc: -8, be: 50, pop: 700, eco: 3000, stability: 6 }
    },
    {
      title: "星象安静",
      text: "这一年没有宏大的灾变，普通人的手艺和耐心反而推进了文明。",
      delta: { sc: 36, be: 36, pop: 1500, eco: 5000, stability: 3 }
    },
    {
      title: "冷寂季",
      text: "长夜覆盖地表，人口退入洞穴，火和故事成为同一种资源。",
      delta: { sc: -12, be: 46, pop: -2200, eco: -8000, stability: -3 }
    },
    {
      title: "轨道共振",
      text: "天体运行短暂呈现规律，历法、神谕和工程计划同时变得可信。",
      delta: { sc: 50, be: 32, pop: 1200, eco: 9000, stability: 7 }
    }
  ];

  return {
    type: "progress",
    ...events[rand % events.length]
  };
}

function applySpecialEvent(event, options = {}) {
  const effectiveDelta = applyDelta(event.delta || {}, options);
  if (typeof event.effect === "function") {
    event.effect();
  }
  return effectiveDelta;
}

function isEconomicCrisis() {
  return state.eco <= 0;
}

function applyEconomicCrisisRules(delta = {}, options = {}) {
  const effectiveDelta = { ...delta };
  if (!isEconomicCrisis() && !options.freezeKnowledge) return effectiveDelta;

  if (effectiveDelta.sc > 0) effectiveDelta.sc = 0;
  if (effectiveDelta.be > 0) effectiveDelta.be = 0;
  return effectiveDelta;
}

function prepareActionDelta(action, rawDelta, crisisAtRoundStart = false) {
  const crisisNow = isEconomicCrisis();
  if ((crisisAtRoundStart || crisisNow) && !action.crisisOnly) {
    return {
      locked: true,
      delta: {},
      text: "经济危机锁死了这项行动。正向发展冻结，只能先重启财政。"
    };
  }

  if (!crisisAtRoundStart && !crisisNow && action.crisisOnly) {
    return {
      locked: true,
      delta: {},
      text: "经济尚未归零，重启财政未被触发。"
    };
  }

  if (state.controlLocked && !action.crisisOnly) {
    return {
      locked: true,
      delta: {},
      text: `${action.label} 被各自为政的城邦吞没，1991 后的文明不再响应玩家控制。`
    };
  }

  if (action === ACTIONS.buildEerf && state.eerfLevel > 0) {
    return {
      locked: true,
      delta: {},
      text: "EERF 已经存在，只能继续升级。"
    };
  }

  if (action === ACTIONS.upgradeEerf && state.eerfLevel <= 0) {
    return {
      locked: true,
      delta: {},
      text: "尚未建造 EERF，无法升级不存在的地下设施。"
    };
  }

  if (action === ACTIONS.upgradeEerf && state.eerfLevel >= EERF_MAX_LEVEL) {
    return {
      locked: true,
      delta: {},
      text: "EERF 已达到当前技术能支持的最高等级。"
    };
  }

  const delta = { ...rawDelta };
  if (delta.eco < 0 && state.eco + delta.eco < 0) {
    return {
      locked: true,
      delta: {},
      text: `${action.label} 需要 ${formatNumber(Math.abs(delta.eco))} ECO，当前经济无法支付。`
    };
  }

  const controlEfficiency = state.controlEfficiencyMultiplier || 1;
  const knowledgeGrowth = state.knowledgeGrowthMultiplier || 1;
  const populationGrowth = state.populationGrowthMultiplier || 1;

  ["sc", "be"].forEach((key) => {
    if (typeof delta[key] !== "number") return;
    if (delta[key] > 0) delta[key] *= knowledgeGrowth;
    delta[key] *= controlEfficiency;
  });

  if (typeof delta.pop === "number") {
    if (delta.pop > 0) delta.pop *= populationGrowth;
    delta.pop *= controlEfficiency;
  }

  return {
    locked: false,
    delta,
    text: action.chronicleText || action.text
  };
}

function enforcePopulationLock() {
  if (state.populationLockTurns <= 0 || !Number.isFinite(state.lockedPopulation)) {
    return false;
  }

  state.pop = Math.max(0, Math.round(state.lockedPopulation));
  return true;
}

function tickCivilizationTimers() {
  if (state.populationLockTurns > 0) {
    state.populationLockTurns -= 1;
    if (state.populationLockTurns === 0) {
      state.lockedPopulation = null;
    }
  }

  if (state.doomCountdown > 0) {
    state.doomCountdown -= 1;
    if (state.doomCountdown === 0) {
      return {
        title: "终极答案倒计时归零",
        text: "第 42 号答案完成最后一次回响，文明在确定性里停止。"
      };
    }
  }

  return null;
}

function resetCivilizationModifiers() {
  state.populationGrowthMultiplier = 1;
  state.knowledgeGrowthMultiplier = 1;
  state.controlEfficiencyMultiplier = 1;
  state.controlLocked = false;
  state.populationLockTurns = 0;
  state.doomCountdown = 0;
  state.lockedPopulation = null;
}

function collapseCivilization(event, before, rand) {
  if (maybeFinishGame({ kind: "collapse", trigger: event.title, rand, snapshot: before })) {
    return true;
  }

  const oldCount = state.count;
  const restartPopulation = computeRestartPopulation(before);
  const restartKnowledge = computeRestartKnowledge(before);
  const oldEerfLevel = state.eerfLevel || 0;
  updateCivilizationStats(before);
  const archived = {
    ...state.currentCivilization,
    turns: Math.max(1, state.turn - state.currentCivilization.startTurn),
    collapseCause: event.title,
    finalSnapshot: { ...before },
    ending: "毁灭后待判定"
  };
  state.history.unshift(archived);
  state.history = state.history.slice(0, 12);

  state.pendingRestart = {
    oldCount,
    nextCount: oldCount + 1,
    sc: restartKnowledge.sc,
    be: restartKnowledge.be,
    pop: restartPopulation,
    eco: restartPopulation > BASE_RESTART_POP ? Math.round(restartPopulation * 2.2) : 0,
    stability: Math.max(18, Math.floor(before.stability * 0.42)),
    eerfLevel: Math.max(0, oldEerfLevel - 1),
    collapseCause: event.title
  };
  state.awaitingCivilizationRestart = true;
  state.sc = 0;
  state.be = 0;
  state.pop = 0;
  state.eco = 0;
  state.stability = Math.max(0, Math.floor(before.stability * 0.2));
  state.weather = event.title;
  state.ending = `第 ${oldCount} 号文明毁灭，等待重启文明`;
  state.lastTone = "disaster";
  state.specialNotice = {
    title: `${event.title}｜文明毁灭`,
    text: `${event.text} 第 ${oldCount} 号文明进化至${scienceEra(before.sc)}。EERF 将保存人口 ${formatNumber(restartPopulation)} 与少量知识。`,
    delta: diff(before, snapshot())
  };
  updateEnding();

  addLog({
    type: "disaster",
    title: `第 ${state.turn} 年｜Rand ${formatRand(rand)}｜${event.title}`,
    text: `${event.text} 第 ${oldCount} 号文明在${event.title}中毁灭了，该文明进化至${scienceEra(before.sc)}。文明的种子仍在，等待重启文明。EERF 保存人口 ${formatNumber(restartPopulation)} 与少量知识。`,
    delta: diff(before, snapshot())
  });

  return false;
}

function restartCivilizationFromPending() {
  if (!state.awaitingCivilizationRestart || !state.pendingRestart) return false;

  const before = snapshot();
  const restart = state.pendingRestart;
  state.sc = restart.sc;
  state.be = restart.be;
  state.pop = restart.pop;
  state.eco = restart.eco;
  state.stability = restart.stability;
  state.eerfLevel = restart.eerfLevel;
  state.restartPopulationSeed = restart.pop;
  resetCivilizationModifiers();
  state.count = restart.nextCount;
  state.currentCivilization = createCivilizationStats(state.count, state.turn, snapshot());
  state.awaitingCivilizationRestart = false;
  state.pendingRestart = null;
  state.endingCandidate = null;
  state.weather = `第 ${state.count} 号文明苏醒`;
  state.ending = "我们依然存在。";
  state.lastTone = "special";
  state.specialNotice = {
    title: "重启文明",
    text: `第 ${state.count} 号文明从 EERF 火种中启动。`,
    delta: diff(before, snapshot())
  };

  addLog({
    type: "special",
    title: `第 ${state.turn} 年｜重启文明`,
    text: `第 ${state.count} 号文明从 EERF 和废墟档案里醒来。`,
    delta: diff(before, snapshot())
  });

  return true;
}

function computeRestartPopulation(snapshotValue) {
  const level = state.eerfLevel || 0;
  if (level <= 0) return BASE_RESTART_POP;

  const preserveRates = [0, 0.045, 0.085, 0.13, 0.19, 0.28];
  const base = BASE_RESTART_POP + level * 1450;
  const preserved = Math.round(snapshotValue.pop * preserveRates[level]);
  return clamp(base + preserved, BASE_RESTART_POP, 95000);
}

function computeRestartKnowledge(snapshotValue) {
  const level = state.eerfLevel || 0;
  if (level <= 0) return { sc: 0, be: 0 };

  const rate = KNOWLEDGE_RESTART_RATES[level] || 0;
  const cap = KNOWLEDGE_RESTART_CAPS[level] || 0;
  return {
    sc: clamp(Math.round(level * 35 + snapshotValue.sc * rate), 0, cap),
    be: clamp(Math.round(level * 35 + snapshotValue.be * rate), 0, cap)
  };
}

function applyDelta(delta, options = {}) {
  const effectiveDelta = applyEconomicCrisisRules(delta, options);
  state.sc = clamp(roundStat(state.sc + Number(effectiveDelta.sc || 0)), 0, CAP);
  state.be = clamp(roundStat(state.be + Number(effectiveDelta.be || 0)), 0, CAP);
  state.pop = Math.max(0, Math.round(state.pop + (effectiveDelta.pop || 0)));
  state.eco = Math.max(0, Math.round(state.eco + (effectiveDelta.eco || 0)));
  state.stability = clamp(state.stability + Math.round(effectiveDelta.stability || 0), 0, 100);
  return effectiveDelta;
}

function updateEnding() {
  if (state.finished && state.finalEnding?.id) {
    state.ending = `${state.finalEnding.id}结局已经抵达`;
  } else if (state.awaitingCivilizationRestart) {
    const oldCount = state.pendingRestart?.oldCount || state.count;
    const settlement = settlementStatusText();
    state.ending = settlement
      ? `第 ${oldCount} 号文明毁灭，等待重启文明；${settlement}`
      : `第 ${oldCount} 号文明毁灭，等待重启文明`;
  } else if (state.endingCandidate?.id) {
    state.ending = settlementStatusText();
  } else if (state.doomCountdown > 0) {
    state.ending = `终极答案倒计时：还剩 ${state.doomCountdown} 次行动`;
  } else if (isEconomicCrisis()) {
    state.ending = "经济危机：科学与神学的正向发展冻结";
  } else if (state.sc >= ENDING_THRESHOLDS.exodusKnowledge && state.be < ENDING_THRESHOLDS.companionKnowledge) {
    state.ending = "科学终局临界：离星舰只差最后的秩序与经济";
  } else if (state.be >= ENDING_THRESHOLDS.exodusKnowledge && state.sc < ENDING_THRESHOLDS.companionKnowledge) {
    state.ending = "神学终局临界：正道正在吞没旧世界";
  } else if (state.sc >= ENDING_THRESHOLDS.balancedKnowledge && state.be >= ENDING_THRESHOLDS.balancedKnowledge) {
    state.ending = "双相终局临界：学院与神殿正在同一座塔中合流";
  } else if (state.sc >= ENDING_THRESHOLDS.middleScience && state.be <= ENDING_THRESHOLDS.lowKnowledge) {
    state.ending = "技术统治临界：天空仍远，王座已近";
  } else {
    state.ending = "文明尚未抵达终局";
  }
}

function settlementStatusText() {
  if (!state.endingCandidate?.id) return "";

  return `${state.endingCandidate.id}结局可结算：可继续发展或点击结算终局`;
}

function maybeFinishGame(context = {}) {
  const current = context.snapshot || snapshot();
  if (updateHiddenCEndingStreak(context, current)) {
    finishGame("C", {
      ...context,
      trigger: `信仰断代文明连续 ${C_AUTO_STREAK} 次毁灭`,
      snapshot: current
    });
    return true;
  }

  const endingId = resolveEnding(context, current);
  updateEndingCandidate(endingId, context, current);

  const automaticEndingId = resolveAutomaticEnding(context, current, endingId);
  if (!automaticEndingId) return false;
  finishGame(automaticEndingId, {
    ...context,
    trigger: automaticEndingTrigger(automaticEndingId, context),
    snapshot: current
  });
  return true;
}

function resolveEnding(context = {}, current = snapshot()) {
  const harmony = knowledgeHarmony(current.sc, current.be);
  const thresholds = ENDING_THRESHOLDS;
  const scDominance = current.sc >= current.be * thresholds.dominanceRatio;
  const beDominance = current.be >= current.sc * thresholds.dominanceRatio;

  if (
    current.sc >= thresholds.exodusKnowledge &&
    current.be < thresholds.companionKnowledge &&
    current.pop >= thresholds.exodusPopulation &&
    current.eco >= thresholds.exodusEconomy
  ) {
    return "D";
  }

  if (
    current.be >= thresholds.exodusKnowledge &&
    current.sc < thresholds.companionKnowledge &&
    current.pop >= thresholds.exodusPopulation &&
    current.stability >= 66
  ) {
    return "E";
  }

  if (
    current.sc >= thresholds.reformHigh &&
    current.be >= thresholds.companionKnowledge &&
    scDominance &&
    current.pop >= thresholds.promisedPopulation &&
    current.eco >= thresholds.promisedEconomy &&
    current.stability >= 55
  ) {
    return "A";
  }

  if (
    current.be >= thresholds.reformHigh &&
    current.sc >= thresholds.companionKnowledge &&
    beDominance &&
    current.stability >= 62
  ) {
    return "B";
  }

  if (
    current.sc >= thresholds.balancedKnowledge &&
    current.be >= thresholds.balancedKnowledge &&
    harmony >= 0.84
  ) {
    return "F";
  }

  if (
    current.sc >= thresholds.middleScience &&
    current.sc < thresholds.exodusKnowledge &&
    current.be <= thresholds.lowKnowledge &&
    current.stability >= thresholds.orderHigh &&
    current.pop >= 25000
  ) {
    return "H";
  }

  if (context.kind === "collapse" && (state.count >= thresholds.collapseCycle || state.history.length >= thresholds.collapseCycle - 1)) {
    return "G";
  }

  if (state.history.length >= thresholds.collapseCycle) {
    return "G";
  }

  return null;
}

function isCEndingState(current) {
  return current.be >= ENDING_THRESHOLDS.faithfulCollapse &&
    current.sc <= ENDING_THRESHOLDS.bronzeScience;
}

function updateEndingCandidate(endingId, context = {}, current = snapshot()) {
  if (!endingId) {
    state.endingCandidate = null;
    return;
  }

  const ending = endingCopyFor(endingId);
  state.endingCandidate = {
    id: endingId,
    name: ending.name,
    turn: state.turn,
    rand: Number.isFinite(Number(context.rand)) ? context.rand : state.lastRand,
    trigger: context.trigger || state.weather,
    snapshot: { ...current }
  };
}

function updateHiddenCEndingStreak(context = {}, current = snapshot()) {
  if (context.kind !== "collapse") return false;

  if (isCEndingState(current)) {
    state.cEndingStreak = Math.min(C_AUTO_STREAK, Math.max(0, Math.round(state.cEndingStreak || 0)) + 1);
    return state.cEndingStreak >= C_AUTO_STREAK;
  } else {
    state.cEndingStreak = 0;
  }

  return false;
}

function resolveAutomaticEnding(context = {}, current = snapshot(), endingId = null) {
  if (current.sc >= CAP && current.be >= CAP) {
    return current.be > current.sc ? "B" : "A";
  }

  if (current.sc >= CAP) return "A";
  if (current.be >= CAP) return "B";

  return null;
}

function automaticEndingTrigger(endingId, context = {}) {
  if (endingId === "A") return "科学抵达上限";
  if (endingId === "B") return "神学抵达上限";
  return context.trigger || state.weather;
}

function settleCurrentEnding() {
  if (!state.endingCandidate?.id) return false;

  finishGame(state.endingCandidate.id, {
    kind: "settlement",
    trigger: `手动结算：${state.endingCandidate.trigger || state.endingCandidate.name}`,
    rand: state.endingCandidate.rand,
    snapshot: state.endingCandidate.snapshot || snapshot()
  });
  return true;
}

function finishGame(endingId, context = {}) {
  if (state.finished) return;

  const ending = endingCopyFor(endingId);
  const finalSnapshot = context.snapshot || snapshot();
  state.finished = true;
  state.finalEnding = {
    id: endingId,
    name: ending.name,
    civilization: state.count,
    turn: state.turn,
    rand: Number.isFinite(Number(context.rand)) ? context.rand : state.lastRand,
    trigger: context.trigger || state.weather,
    snapshot: { ...finalSnapshot },
    createdAt: new Date().toISOString()
  };
  state.weather = context.trigger || state.weather;
  state.ending = `${ending.name}已经抵达`;
  addLog({
    type: "special",
    title: `${ending.name}｜终局达成`,
    text: `第 ${state.count} 号文明在 ${state.finalEnding.trigger || "未知触发"} 后抵达终局。游戏结束。`,
    delta: diff(finalSnapshot, finalSnapshot)
  });
  saveFinalEnding();
  saveState();
  goToEndingPage(endingId);
}

function endingCopyFor(endingId) {
  return window.THREE_SUN_ENDINGS?.[endingId] || {
    name: `${endingId}结局`,
    paragraphs: ["终局资料缺失。"],
    quote: ""
  };
}

function saveFinalEnding() {
  try {
    localStorage.setItem(ENDING_STORE_KEY, JSON.stringify(state.finalEnding));
  } catch {
    // The ending page can still render from the query string.
  }
}

function clearStoredEnding() {
  try {
    localStorage.removeItem(ENDING_STORE_KEY);
  } catch {
    // Storage may be unavailable in private contexts.
  }
}

function goToEndingPage(endingId) {
  const url = new URL(ENDING_PAGE, window.location.href);
  url.searchParams.set("ending", endingId);
  window.location.href = url.href;
}

function addLog(entry) {
  state.log.unshift(entry);
  state.log = state.log.slice(0, 80);
}

function snapshot() {
  return {
    sc: state.sc,
    be: state.be,
    pop: state.pop,
    eco: state.eco,
    eerf: state.eerfLevel || 0,
    stability: state.stability
  };
}

function snapshotForObject(source) {
  return {
    sc: finiteOr(source.sc, 0),
    be: finiteOr(source.be, 0),
    pop: finiteOr(source.pop, 0),
    eco: finiteOr(source.eco, 0),
    eerf: finiteOr(source.eerf ?? source.eerfLevel, 0),
    stability: finiteOr(source.stability, 0)
  };
}

function diff(before, after) {
  return {
    sc: after.sc - before.sc,
    be: after.be - before.be,
    pop: after.pop - before.pop,
    eco: after.eco - before.eco,
    eerf: after.eerf - before.eerf,
    stability: after.stability - before.stability
  };
}

function scienceEra(value) {
  return eraNameFor(value, SCIENCE_ERAS);
}

function beliefEra(value) {
  return eraNameFor(value, BELIEF_ERAS);
}

function eraNameFor(value, eras) {
  return eras[eraIndexFor(value, eras)]?.name || eras[0].name;
}

function eraIndexFor(value, eras) {
  let index = 0;
  for (let cursor = 0; cursor < eras.length; cursor += 1) {
    if (value >= eras[cursor].threshold) {
      index = cursor;
    }
  }
  return index;
}

function render() {
  dom.countValue.textContent = state.count;
  dom.turnValue.textContent = state.turn;
  dom.randValue.textContent = state.lastRand === null ? "----" : formatRand(state.lastRand);
  dom.scValue.textContent = formatNumber(state.sc);
  dom.beValue.textContent = formatNumber(state.be);
  dom.popValue.textContent = formatNumber(state.pop);
  dom.ecoValue.textContent = formatNumber(state.eco);
  dom.eerfValue.textContent = `${state.eerfLevel || 0}/${EERF_MAX_LEVEL}`;
  dom.scMeter.style.width = `${(state.sc / CAP) * 100}%`;
  dom.beMeter.style.width = `${(state.be / CAP) * 100}%`;
  dom.popMeter.style.width = `${Math.min(100, Math.sqrt(state.pop / 180000) * 100)}%`;
  dom.ecoMeter.style.width = `${Math.min(100, Math.sqrt(state.eco / ECO_METER_CAP) * 100)}%`;
  dom.eerfMeter.style.width = `${((state.eerfLevel || 0) / EERF_MAX_LEVEL) * 100}%`;
  dom.scEra.textContent = scienceEra(state.sc);
  dom.beEra.textContent = beliefEra(state.be);
  dom.stabilityValue.textContent = `秩序 ${state.stability}`;
  dom.ecoStatus.textContent = isEconomicCrisis() ? "经济危机：发展冻结" : "预算、产业与粮仓";
  dom.eerfStatus.textContent = eerfStatusText();
  dom.weatherLabel.textContent = state.weather;
  dom.endingLabel.textContent = state.ending;
  dom.seedValue.textContent = state.seed;
  if (dom.saveStatus) dom.saveStatus.textContent = saveStatusText();
  renderActionButtons();
  renderLog();
  renderArchive();
  renderSpecialNotice();
  renderSkyFrame(performance.now());
}

function renderActionButtons() {
  const crisis = isEconomicCrisis();
  dom.actionButtons.forEach((button) => {
    const action = ACTIONS[button.dataset.action];
    let disabled = state.finished;
    if (!disabled && action?.settleOnly) {
      disabled = !state.endingCandidate?.id;
    } else if (!disabled && state.awaitingCivilizationRestart) {
      disabled = !action?.restartOnly;
    } else if (!disabled && action?.restartOnly) {
      disabled = true;
    } else if (!disabled) {
      disabled = crisis ? !action?.crisisOnly : Boolean(action?.crisisOnly);
    }
    if (!disabled && action === ACTIONS.buildEerf) {
      disabled = state.eerfLevel > 0 || state.eco < Math.abs(action.delta.eco || 0);
    }
    if (!disabled && action === ACTIONS.upgradeEerf) {
      const rawDelta = typeof action.delta === "function" ? action.delta(state) : action.delta;
      disabled = state.eerfLevel <= 0 || state.eerfLevel >= EERF_MAX_LEVEL || state.eco < Math.abs(rawDelta.eco || 0);
    }
    if (!disabled && action && !action.crisisOnly && !action.restartOnly && !action.settleOnly) {
      const rawDelta = typeof action.delta === "function" ? action.delta(state) : action.delta;
      disabled = Number(rawDelta.eco || 0) < 0 && state.eco < Math.abs(rawDelta.eco || 0);
    }
    button.disabled = disabled;
    button.setAttribute("aria-disabled", disabled ? "true" : "false");
  });
}

function renderSpecialNotice() {
  if (!state.specialNotice) {
    dom.specialBanner.hidden = true;
    dom.specialTitle.textContent = "----";
    dom.specialText.textContent = "";
    dom.specialDelta.innerHTML = "";
    return;
  }

  dom.specialBanner.hidden = false;
  dom.specialTitle.textContent = state.specialNotice.title;
  dom.specialText.textContent = state.specialNotice.text;
  dom.specialDelta.innerHTML = deltaHtml(state.specialNotice.delta);
}

function renderLog() {
  dom.logList.innerHTML = "";
  if (!state.log.length) {
    const empty = document.createElement("li");
    empty.className = "progress";
    empty.innerHTML = "<strong>编年史空白</strong><p>下一年行动会写入新的记录。</p>";
    dom.logList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.log.forEach((entry) => {
    const item = document.createElement("li");
    item.className = entry.type || "progress";

    const title = document.createElement("strong");
    title.textContent = entry.title;
    const text = document.createElement("p");
    text.textContent = entry.text;
    const delta = document.createElement("div");
    delta.className = "delta-row";
    delta.innerHTML = deltaHtml(entry.delta);

    item.append(title, text, delta);
    fragment.append(item);
  });
  dom.logList.append(fragment);
}

function renderArchive() {
  dom.archiveList.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("li");
    empty.innerHTML = "<strong>尚无毁灭记录</strong><p>第一份档案会在文明归零时生成。</p>";
    dom.archiveList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.history.forEach((entry) => {
    const item = document.createElement("li");
    const peak = `SC ${formatNumber(entry.peakSc)} / BE ${formatNumber(entry.peakBe)} / POP ${formatNumber(entry.peakPop)} / ECO ${formatNumber(entry.peakEco)} / EERF ${formatNumber(entry.peakEerf || 0)}`;
    const specials = entry.specialEvents?.length
      ? `特殊：${entry.specialEvents.slice(0, 2).join("、")}`
      : "特殊：无";
    item.innerHTML = `
      <strong>第 ${entry.civilization} 号文明｜${formatNumber(entry.turns)} 年</strong>
      <p>${entry.collapseCause || "未知终止"}｜${peak}</p>
      <p>${specials}</p>
    `;
    fragment.append(item);
  });
  dom.archiveList.append(fragment);
}

function deltaHtml(delta = {}) {
  return ["sc", "be", "pop", "eco", "eerf", "stability"].map((key) => {
    const label = key === "stability" ? "秩序" : key.toUpperCase();
    const value = Number(delta[key] || 0);
    const sign = value > 0 ? "+" : "";
    return `<span>${label} ${sign}${formatNumber(value)}</span>`;
  }).join("");
}

function eerfStatusText() {
  if (state.awaitingCivilizationRestart && state.pendingRestart) {
    return `等待重启文明；火种人口 ${formatNumber(state.pendingRestart.pop)}；SC/BE ${formatNumber(state.pendingRestart.sc)}/${formatNumber(state.pendingRestart.be)}`;
  }

  const level = state.eerfLevel || 0;
  if (level <= 0) return `无地下种子库；下一代初始人口 ${formatNumber(BASE_RESTART_POP)}`;
  const estimate = computeRestartPopulation(snapshot());
  const knowledge = computeRestartKnowledge(snapshot());
  return `灾后火种等级 ${level}；下一代初始人口约 ${formatNumber(estimate)}；SC/BE 约 ${formatNumber(knowledge.sc)}/${formatNumber(knowledge.be)}`;
}

function drawSky() {
  renderSkyFrame(performance.now());
  frameHandle = requestAnimationFrame(drawSky);
}

function renderSkyFrame(time) {
  const canvas = dom.skyCanvas;
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width);
  const height = Math.max(220, rect.height);
  const targetWidth = Math.floor(width * ratio);
  const targetHeight = Math.floor(height * ratio);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = false;
  paintSky(context, width, height, time);
}

function paintSky(context, width, height, time) {
  const tone = state.lastTone || "quiet";
  const randFactor = ((state.lastRand ?? state.seed) % 10000) / 10000;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, tone === "disaster" ? "#351019" : "#071020");
  gradient.addColorStop(0.36, tone === "special" ? "#172442" : "#12233a");
  gradient.addColorStop(0.72, tone === "disaster" ? "#59331f" : "#28362d");
  gradient.addColorStop(1, "#15160f");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  drawAtmosphere(context, width, height, time, tone, randFactor);
  drawStars(context, width, height, time, randFactor);
  drawSuns(context, width, height, time, randFactor, tone);
  drawHeatHaze(context, width, height, time, tone);
  drawGround(context, width, height);
}

function drawAtmosphere(context, width, height, time, tone, randFactor) {
  context.save();
  const horizon = height * 0.68;
  const haze = context.createLinearGradient(0, horizon - height * 0.22, 0, horizon + height * 0.12);
  haze.addColorStop(0, "rgba(255, 255, 255, 0)");
  haze.addColorStop(0.56, tone === "disaster" ? "rgba(255, 123, 65, 0.18)" : "rgba(255, 210, 132, 0.16)");
  haze.addColorStop(1, "rgba(255, 240, 190, 0.05)");
  context.fillStyle = haze;
  context.fillRect(0, horizon - height * 0.24, width, height * 0.36);

  for (let layer = 0; layer < 3; layer += 1) {
    const y = height * (0.2 + layer * 0.11) + Math.sin(time * 0.00022 + layer) * 8;
    context.beginPath();
    context.moveTo(0, y);
    for (let x = 0; x <= width + 40; x += 40) {
      const offset = Math.sin(x * 0.008 + time * 0.00018 + layer * 1.9 + randFactor) * (12 + layer * 5);
      context.lineTo(x, y + offset);
    }
    context.lineTo(width, y + 32);
    context.lineTo(0, y + 28);
    context.closePath();
    context.fillStyle = layer === 0
      ? "rgba(255, 255, 255, 0.025)"
      : "rgba(255, 221, 178, 0.035)";
    context.fill();
  }
  context.restore();
}

function drawStars(context, width, height, time, randFactor) {
  context.save();
  for (let index = 0; index < 140; index += 1) {
    const x = ((index * 131) % 997) / 997 * width;
    const y = ((index * 197) % 463) / 463 * height * 0.58;
    const pulse = 0.24 + Math.sin(time * 0.0012 + index + randFactor) * 0.18;
    const size = index % 13 === 0 ? 1.8 : 1;
    context.fillStyle = `rgba(224, 235, 255, ${Math.max(0.08, pulse)})`;
    context.fillRect(x, y, size, size);
  }
  context.restore();
}

function drawSuns(context, width, height, time, randFactor, tone) {
  const t = time * 0.00028 + state.turn * 0.11;
  const centerX = width * (0.5 + (randFactor - 0.5) * 0.12);
  const centerY = height * 0.34;
  const suns = [
    {
      x: centerX + Math.cos(t) * width * 0.23,
      y: centerY + Math.sin(t * 1.21) * height * 0.17,
      radius: 34 + randFactor * 14,
      color: tone === "disaster" ? "#ff5b4a" : "#ffd36b",
      corona: tone === "disaster" ? "#ff3f36" : "#ffb95c"
    },
    {
      x: centerX + Math.cos(-t * 0.82 + 2.1) * width * 0.18,
      y: centerY + Math.sin(t * 0.74 + 1.2) * height * 0.2,
      radius: 26 + (1 - randFactor) * 12,
      color: "#ff8c42",
      corona: "#c65f32"
    },
    {
      x: centerX + Math.cos(t * 1.42 + 4.2) * width * 0.27,
      y: centerY + Math.sin(-t * 0.93 + 2.9) * height * 0.14,
      radius: 21 + Math.sin(t) * 5,
      color: tone === "special" ? "#9ad8ff" : "#fff1a6",
      corona: tone === "special" ? "#7fbfe8" : "#ffe18a"
    }
  ];

  suns
    .sort((left, right) => left.radius - right.radius)
    .forEach((sun, index) => drawSunDisc(context, sun, time, index));
}

function drawSunDisc(context, sun, time, index) {
  context.save();
  const glow = context.createRadialGradient(sun.x, sun.y, sun.radius * 0.1, sun.x, sun.y, sun.radius * 5.2);
  glow.addColorStop(0, hexToRgba(sun.color, 0.88));
  glow.addColorStop(0.22, hexToRgba(sun.corona, 0.36));
  glow.addColorStop(0.64, hexToRgba(sun.corona, 0.1));
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(sun.x, sun.y, sun.radius * 5.2, 0, Math.PI * 2);
  context.fill();

  const disc = context.createRadialGradient(
    sun.x - sun.radius * 0.34,
    sun.y - sun.radius * 0.38,
    sun.radius * 0.12,
    sun.x,
    sun.y,
    sun.radius
  );
  disc.addColorStop(0, "#fff7c8");
  disc.addColorStop(0.34, sun.color);
  disc.addColorStop(0.82, sun.corona);
  disc.addColorStop(1, "rgba(84, 28, 16, 0.96)");
  context.fillStyle = disc;
  context.beginPath();
  context.arc(sun.x, sun.y, sun.radius, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.beginPath();
  context.arc(sun.x, sun.y, sun.radius * 0.94, 0, Math.PI * 2);
  context.clip();
  for (let spot = 0; spot < 9; spot += 1) {
    const angle = spot * 1.73 + time * 0.00018 * (index + 1);
    const orbit = sun.radius * (0.18 + ((spot * 23) % 42) / 100);
    const sx = sun.x + Math.cos(angle) * orbit;
    const sy = sun.y + Math.sin(angle * 0.72) * orbit * 0.72;
    context.fillStyle = spot % 3 === 0 ? "rgba(87, 30, 17, 0.36)" : "rgba(255, 244, 180, 0.14)";
    context.beginPath();
    context.ellipse(sx, sy, sun.radius * (0.05 + spot * 0.003), sun.radius * 0.024, angle, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
  context.restore();
}

function drawHeatHaze(context, width, height, time, tone) {
  context.save();
  const horizon = height * 0.66;
  context.globalAlpha = tone === "disaster" ? 0.28 : 0.16;
  for (let band = 0; band < 4; band += 1) {
    context.beginPath();
    const y = horizon + band * 12;
    context.moveTo(0, y);
    for (let x = 0; x <= width; x += 28) {
      context.lineTo(x, y + Math.sin(x * 0.018 + time * 0.001 + band) * 5);
    }
    context.strokeStyle = band % 2 === 0 ? "rgba(255, 218, 150, 0.22)" : "rgba(156, 207, 255, 0.14)";
    context.lineWidth = 1;
    context.stroke();
  }
  context.restore();
}

function drawGround(context, width, height) {
  const groundY = height * 0.72;
  drawMountainLayer(context, width, height, groundY, 0.5, "#24323a", "#111a1b", 28);
  drawMountainLayer(context, width, height, groundY, 0.76, "#314238", "#151a13", 18);

  const terrain = context.createLinearGradient(0, groundY, 0, height);
  terrain.addColorStop(0, "#2f3525");
  terrain.addColorStop(0.46, "#1d2117");
  terrain.addColorStop(1, "#090b08");
  context.fillStyle = terrain;
  context.beginPath();
  context.moveTo(0, groundY);
  for (let x = 0; x <= width; x += 34) {
    const y = groundY + Math.sin(x * 0.018 + state.turn * 0.4) * 9 + Math.sin(x * 0.047) * 4;
    context.lineTo(x, y);
  }
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();

  drawTerrainTexture(context, width, height, groundY);
  drawRealisticCity(context, width, height, groundY);
  drawUndergroundHints(context, width, height, groundY);
}

function drawMountainLayer(context, width, height, groundY, depth, topColor, baseColor, roughness) {
  const top = groundY - height * depth * 0.34;
  const gradient = context.createLinearGradient(0, top, 0, groundY + 20);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, baseColor);
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(0, groundY);
  for (let x = -20; x <= width + 20; x += 48) {
    const peak = top + Math.sin(x * 0.011 + depth * 9) * roughness + ((x * 17) % 39);
    context.lineTo(x, peak);
    context.lineTo(x + 24, peak + roughness * 1.5);
  }
  context.lineTo(width, groundY);
  context.closePath();
  context.fill();
}

function drawTerrainTexture(context, width, height, groundY) {
  context.save();
  context.globalAlpha = 0.28;
  for (let index = 0; index < 56; index += 1) {
    const x = ((index * 89) % 997) / 997 * width;
    const y = groundY + 18 + ((index * 47) % Math.max(1, height - groundY - 26));
    context.strokeStyle = index % 2 === 0 ? "rgba(124, 112, 77, 0.35)" : "rgba(36, 48, 38, 0.45)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 24 + (index % 5) * 12, y + Math.sin(index) * 5);
    context.stroke();
  }
  context.restore();
}

function drawRealisticCity(context, width, height, groundY) {
  const cityWidth = Math.min(width * 0.62, 620);
  const startX = (width - cityWidth) / 2;
  const scRatio = state.sc / CAP;
  const beRatio = state.be / CAP;
  const populationFactor = clamp(Math.sqrt(Math.max(0, state.pop)) / 430, 0.25, 1.35);
  const buildingCount = Math.round(14 + populationFactor * 8 + scRatio * 7);
  const laneY = groundY + 12;

  context.save();
  context.fillStyle = "rgba(6, 8, 9, 0.38)";
  context.beginPath();
  context.ellipse(width * 0.5, laneY + 16, cityWidth * 0.58, 24, 0, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < buildingCount; index += 1) {
    const cell = cityWidth / buildingCount;
    const bw = Math.max(8, cell - 4);
    const techLift = scRatio * (52 + (index % 3) * 10);
    const civicLift = beRatio * (34 + (index % 4) * 7);
    const bh = 24 + ((index * 17) % 42) + (index % 2 === 0 ? techLift : civicLift);
    const x = startX + index * (cityWidth / buildingCount);
    const y = groundY - bh;
    drawBuilding(context, x, y, bw, bh, index, scRatio, beRatio);
  }

  drawObservatory(context, startX + cityWidth * 0.18, groundY, scRatio);
  drawTempleDome(context, startX + cityWidth * 0.72, groundY, beRatio);

  const popLights = Math.min(150, Math.floor(Math.sqrt(Math.max(0, state.pop)) * 0.42));
  for (let index = 0; index < popLights; index += 1) {
    const x = startX + ((index * 53) % Math.max(1, cityWidth));
    const y = groundY - 16 - ((index * 29) % 96);
    context.fillStyle = index % 5 === 0 ? "rgba(150, 207, 255, 0.72)" : "rgba(255, 218, 126, 0.72)";
    context.fillRect(x, y, 1.6, 1.6);
  }
  context.restore();
}

function drawBuilding(context, x, y, width, height, index, scRatio, beRatio) {
  const shade = 18 + (index % 5) * 7;
  context.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 10})`;
  context.fillRect(x, y, width, height);

  const side = context.createLinearGradient(x, y, x + width, y);
  side.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  side.addColorStop(1, "rgba(0, 0, 0, 0.22)");
  context.fillStyle = side;
  context.fillRect(x, y, width, height);

  if (index % 3 === 0 && scRatio > 0.18) {
    context.strokeStyle = "rgba(151, 206, 255, 0.56)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + width * 0.52, y);
    context.lineTo(x + width * 0.52, y - 14 - scRatio * 30);
    context.stroke();
    context.fillStyle = "rgba(151, 206, 255, 0.72)";
    context.beginPath();
    context.arc(x + width * 0.52, y - 14 - scRatio * 30, 2.4, 0, Math.PI * 2);
    context.fill();
  }

  const rows = Math.max(1, Math.floor(height / 13));
  const columns = Math.max(1, Math.floor(width / 8));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((row + column + index) % 3 === 0) continue;
      context.fillStyle = beRatio > scRatio && column % 2 === 0
        ? "rgba(255, 205, 112, 0.44)"
        : "rgba(139, 196, 232, 0.38)";
      context.fillRect(x + 4 + column * 7, y + 6 + row * 12, 2.4, 4);
    }
  }
}

function drawObservatory(context, x, groundY, scRatio) {
  if (scRatio < 0.08) return;

  const radius = 11 + scRatio * 18;
  const baseY = groundY - 18 - scRatio * 22;
  context.fillStyle = "rgba(16, 25, 31, 0.96)";
  context.fillRect(x - radius * 0.7, baseY, radius * 1.4, groundY - baseY);
  context.fillStyle = "rgba(98, 142, 168, 0.88)";
  context.beginPath();
  context.arc(x, baseY, radius, Math.PI, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(186, 226, 255, 0.66)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(x + radius * 0.45, baseY - radius * 0.34);
  context.lineTo(x + radius * 1.7, baseY - radius * 0.88);
  context.stroke();
}

function drawTempleDome(context, x, groundY, beRatio) {
  if (beRatio < 0.08) return;

  const radius = 14 + beRatio * 20;
  const baseY = groundY - 12 - beRatio * 26;
  context.fillStyle = "rgba(31, 26, 18, 0.96)";
  context.fillRect(x - radius * 0.9, baseY, radius * 1.8, groundY - baseY);
  const dome = context.createRadialGradient(x - radius * 0.3, baseY - radius * 0.36, 2, x, baseY, radius * 1.1);
  dome.addColorStop(0, "#ffe3a1");
  dome.addColorStop(1, "#8b632f");
  context.fillStyle = dome;
  context.beginPath();
  context.arc(x, baseY, radius, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(255, 232, 158, 0.8)";
  context.fillRect(x - 1, baseY - radius * 1.26, 2, radius * 0.9);
  context.fillRect(x - radius * 0.18, baseY - radius * 1.1, radius * 0.36, 2);
}

function drawUndergroundHints(context, width, height, groundY) {
  if ((state.eerfLevel || 0) <= 0) return;

  const level = state.eerfLevel || 0;
  const bunkerWidth = Math.min(220, width * 0.28);
  const x = width * 0.5 - bunkerWidth / 2;
  const y = groundY + 32;
  context.save();
  context.fillStyle = "rgba(5, 7, 10, 0.72)";
  context.fillRect(x, y, bunkerWidth, 14 + level * 4);
  context.strokeStyle = "rgba(199, 210, 254, 0.44)";
  context.strokeRect(x, y, bunkerWidth, 14 + level * 4);
  for (let index = 0; index < level + 2; index += 1) {
    context.fillStyle = index % 2 === 0 ? "rgba(199, 210, 254, 0.82)" : "rgba(123, 216, 143, 0.72)";
    context.fillRect(x + 14 + index * 24, y + 6, 8, 3);
  }
  context.restore();
}

function paintSky(context, width, height, time) {
  const pixel = Math.max(3, Math.round(width / 320));
  const tone = state.lastTone || "quiet";
  const randFactor = ((state.lastRand ?? state.seed) % 10000) / 10000;

  context.fillStyle = tone === "disaster" ? "#1b0b10" : "#07111f";
  context.fillRect(0, 0, width, height);
  drawPixelSky(context, width, height, pixel, tone);
  drawPixelStars(context, width, height, pixel, time);
  drawPixelSuns(context, width, height, pixel, time, randFactor, tone);
  drawPixelHorizon(context, width, height, pixel, time);
  drawPixelCity(context, width, height, pixel);
  drawPixelEerf(context, width, height, pixel);
}

function drawPixelSky(context, width, height, pixel, tone) {
  const bands = tone === "disaster"
    ? ["#1b0b10", "#25121a", "#3a1e1c", "#55311d", "#2d2d1c"]
    : ["#07111f", "#0d1a2d", "#152843", "#2a3a3e", "#283525"];
  const bandHeight = Math.ceil(height * 0.72 / bands.length / pixel) * pixel;
  bands.forEach((color, index) => {
    pixelRect(context, 0, index * bandHeight, width, bandHeight + pixel, color, pixel);
  });

  for (let index = 0; index < 8; index += 1) {
    const y = snap(height * (0.2 + index * 0.055), pixel);
    const color = index % 2 === 0 ? "rgba(255, 222, 160, 0.12)" : "rgba(142, 189, 234, 0.1)";
    for (let x = -pixel * 8; x < width; x += pixel * 12) {
      const wave = Math.sin(x * 0.015 + index) * pixel * 2;
      pixelRect(context, x, y + wave, pixel * 10, pixel, color, pixel);
    }
  }
}

function drawPixelStars(context, width, height, pixel, time) {
  for (let index = 0; index < 116; index += 1) {
    const x = snap(((index * 137) % 991) / 991 * width, pixel);
    const y = snap(((index * 211) % 457) / 457 * height * 0.58, pixel);
    const blink = Math.sin(time * 0.001 + index) > 0.2;
    const size = index % 19 === 0 ? pixel * 2 : pixel;
    const color = blink ? "rgba(236, 245, 255, 0.78)" : "rgba(236, 245, 255, 0.28)";
    pixelRect(context, x, y, size, size, color, pixel);
  }
}

function drawPixelSuns(context, width, height, pixel, time, randFactor, tone) {
  const t = time * 0.00024 + state.turn * 0.1;
  const centerX = width * (0.5 + (randFactor - 0.5) * 0.1);
  const centerY = height * 0.31;
  const suns = [
    {
      x: centerX + Math.cos(t) * width * 0.23,
      y: centerY + Math.sin(t * 1.17) * height * 0.15,
      r: 12 + randFactor * 5,
      core: tone === "disaster" ? "#ff7354" : "#ffd56d",
      mid: "#f09b45",
      glow: "rgba(255, 199, 95, 0.16)"
    },
    {
      x: centerX + Math.cos(-t * 0.81 + 2.1) * width * 0.18,
      y: centerY + Math.sin(t * 0.76 + 1.2) * height * 0.19,
      r: 10 + (1 - randFactor) * 4,
      core: "#ff9a4a",
      mid: "#c65d34",
      glow: "rgba(255, 112, 66, 0.14)"
    },
    {
      x: centerX + Math.cos(t * 1.38 + 4.2) * width * 0.27,
      y: centerY + Math.sin(-t * 0.92 + 2.9) * height * 0.13,
      r: 8 + Math.sin(t) * 2,
      core: tone === "special" ? "#b7e6ff" : "#fff1a6",
      mid: tone === "special" ? "#73bce6" : "#dfb85c",
      glow: "rgba(255, 236, 166, 0.12)"
    }
  ];

  suns.forEach((sun, index) => drawPixelSun(context, sun, pixel, time, index));
}

function drawPixelSun(context, sun, pixel, time, index) {
  const x = snap(sun.x, pixel);
  const y = snap(sun.y, pixel);
  const radius = Math.max(pixel * 4, snap(sun.r * pixel, pixel));
  pixelCircle(context, x, y, radius * 3, sun.glow, pixel);
  pixelCircle(context, x, y, radius, sun.mid, pixel);
  pixelCircle(context, x - pixel * 2, y - pixel * 2, radius * 0.62, sun.core, pixel);

  for (let spot = 0; spot < 5; spot += 1) {
    const angle = spot * 1.7 + time * 0.0002 * (index + 1);
    const sx = x + snap(Math.cos(angle) * radius * 0.42, pixel);
    const sy = y + snap(Math.sin(angle * 0.8) * radius * 0.28, pixel);
    pixelRect(context, sx, sy, pixel, pixel, "rgba(83, 35, 20, 0.45)", pixel);
  }
}

function drawPixelHorizon(context, width, height, pixel, time) {
  const farY = snap(height * 0.62, pixel);
  drawPixelMountains(context, width, height, pixel, farY, "#213447", "#132331", 8, time * 0.00005);
  drawPixelMountains(context, width, height, pixel, farY + pixel * 8, "#2d3f32", "#172417", 6, time * 0.00003);

  const groundY = snap(height * 0.74, pixel);
  pixelRect(context, 0, groundY, width, height - groundY, "#1b2115", pixel);
  for (let y = groundY; y < height; y += pixel * 4) {
    const color = y % (pixel * 8) === 0 ? "#22291a" : "#13180f";
    pixelRect(context, 0, y, width, pixel * 2, color, pixel);
  }
  for (let index = 0; index < 34; index += 1) {
    const x = snap(((index * 83) % 997) / 997 * width, pixel);
    const y = snap(groundY + pixel * 5 + ((index * 37) % Math.max(pixel, height - groundY - pixel * 8)), pixel);
    pixelRect(context, x, y, pixel * (4 + index % 8), pixel, index % 2 ? "#2b3120" : "#3a3b25", pixel);
  }
}

function drawPixelMountains(context, width, height, pixel, baseY, topColor, baseColor, roughness, drift) {
  for (let x = -pixel * 10; x < width + pixel * 10; x += pixel * 9) {
    const peak = snap(baseY - pixel * (8 + ((x / pixel + roughness * 11) % 17)) - Math.sin(x * 0.01 + drift) * pixel * roughness, pixel);
    const mid = snap(x + pixel * 5, pixel);
    context.fillStyle = topColor;
    context.beginPath();
    context.moveTo(x, baseY);
    context.lineTo(mid, peak);
    context.lineTo(x + pixel * 11, baseY);
    context.closePath();
    context.fill();
    pixelRect(context, mid, peak + pixel * 2, pixel * 2, baseY - peak - pixel * 2, baseColor, pixel);
  }
}

function drawPixelCity(context, width, height, pixel) {
  const groundY = snap(height * 0.74, pixel);
  const cityWidth = Math.min(width * 0.7, 720);
  const startX = snap((width - cityWidth) / 2, pixel);
  const scRatio = state.sc / CAP;
  const beRatio = state.be / CAP;
  const popRatio = clamp(Math.sqrt(Math.max(0, state.pop)) / 430, 0.2, 1.35);
  const eraBoost = eraIndexFor(state.sc, SCIENCE_ERAS) + eraIndexFor(state.be, BELIEF_ERAS);
  const buildingCount = Math.round(10 + popRatio * 9 + eraBoost * 0.45);
  const cell = snap(cityWidth / buildingCount, pixel);

  pixelRect(context, startX - pixel * 8, groundY + pixel * 2, cityWidth + pixel * 16, pixel * 5, "rgba(0, 0, 0, 0.35)", pixel);

  for (let index = 0; index < buildingCount; index += 1) {
    const x = startX + index * cell;
    const w = Math.max(pixel * 3, cell - pixel);
    const heightBase = pixel * (6 + ((index * 7) % 10));
    const techHeight = pixel * Math.round(scRatio * (8 + index % 5));
    const faithHeight = pixel * Math.round(beRatio * (7 + index % 4));
    const h = heightBase + (index % 2 === 0 ? techHeight : faithHeight);
    const y = groundY - h;
    const palette = index % 2 === 0
      ? ["#26394a", "#1a2733", "#6ab8e6"]
      : ["#473b27", "#2a2217", "#f1c46e"];
    drawPixelBuilding(context, x, y, w, h, pixel, palette, index);
  }

  if (scRatio > 0.08) drawPixelObservatory(context, startX + cityWidth * 0.18, groundY, pixel, scRatio);
  if (beRatio > 0.08) drawPixelTemple(context, startX + cityWidth * 0.74, groundY, pixel, beRatio);
  drawPixelPopulationLights(context, startX, cityWidth, groundY, pixel, popRatio);
}

function drawPixelBuilding(context, x, y, width, height, pixel, palette, index) {
  pixelRect(context, x, y, width, height, palette[0], pixel);
  pixelRect(context, x + width - pixel, y, pixel, height, palette[1], pixel);
  pixelRect(context, x, y, width, pixel, "rgba(255, 255, 255, 0.12)", pixel);

  const rows = Math.max(1, Math.floor(height / (pixel * 3)));
  const columns = Math.max(1, Math.floor(width / (pixel * 3)));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if ((row + column + index) % 3 === 0) continue;
      pixelRect(context, x + pixel + column * pixel * 3, y + pixel * 2 + row * pixel * 3, pixel, pixel, palette[2], pixel);
    }
  }
}

function drawPixelObservatory(context, x, groundY, pixel, scRatio) {
  const height = pixel * (8 + Math.round(scRatio * 14));
  const y = groundY - height;
  pixelRect(context, x - pixel * 3, y, pixel * 6, height, "#1c2c38", pixel);
  pixelRect(context, x - pixel * 5, y - pixel * 3, pixel * 10, pixel * 3, "#7297ad", pixel);
  pixelRect(context, x + pixel * 2, y - pixel * 6, pixel * 8, pixel * 2, "#9dd6f5", pixel);
  pixelRect(context, x + pixel * 9, y - pixel * 7, pixel * 2, pixel * 4, "#d8f4ff", pixel);
}

function drawPixelTemple(context, x, groundY, pixel, beRatio) {
  const height = pixel * (7 + Math.round(beRatio * 12));
  const y = groundY - height;
  pixelRect(context, x - pixel * 5, y, pixel * 10, height, "#322819", pixel);
  pixelRect(context, x - pixel * 7, y - pixel * 2, pixel * 14, pixel * 3, "#9d763b", pixel);
  pixelRect(context, x - pixel * 4, y - pixel * 5, pixel * 8, pixel * 3, "#f0c56d", pixel);
  pixelRect(context, x - pixel, y - pixel * 9, pixel * 2, pixel * 4, "#f6dd8a", pixel);
  pixelRect(context, x - pixel * 2, y - pixel * 8, pixel * 4, pixel, "#f6dd8a", pixel);
}

function drawPixelPopulationLights(context, startX, cityWidth, groundY, pixel, popRatio) {
  const lights = Math.min(160, Math.round(popRatio * 70));
  for (let index = 0; index < lights; index += 1) {
    const x = snap(startX + ((index * 41) % Math.max(pixel, cityWidth)), pixel);
    const y = snap(groundY - pixel * 3 - ((index * 29) % (pixel * 28)), pixel);
    const color = index % 5 === 0 ? "#8fd4ff" : "#ffd778";
    pixelRect(context, x, y, pixel, pixel, color, pixel);
  }
}

function drawPixelEerf(context, width, height, pixel) {
  const level = state.eerfLevel || 0;
  if (level <= 0) return;

  const groundY = snap(height * 0.74, pixel);
  const bunkerWidth = pixel * (28 + level * 4);
  const x = snap(width / 2 - bunkerWidth / 2, pixel);
  const y = groundY + pixel * 8;
  pixelRect(context, x, y, bunkerWidth, pixel * (4 + level), "#07090d", pixel);
  pixelRect(context, x, y, bunkerWidth, pixel, "#c7d2fe", pixel);
  for (let index = 0; index < level + 2; index += 1) {
    const color = index % 2 ? "#7bd88f" : "#c7d2fe";
    pixelRect(context, x + pixel * (3 + index * 4), y + pixel * 2, pixel * 2, pixel, color, pixel);
  }
}

function pixelRect(context, x, y, width, height, color, pixel) {
  context.fillStyle = color;
  context.fillRect(snap(x, pixel), snap(y, pixel), snap(width, pixel), snap(height, pixel));
}

function pixelCircle(context, centerX, centerY, radius, color, pixel) {
  const snappedRadius = snap(radius, pixel);
  for (let y = -snappedRadius; y <= snappedRadius; y += pixel) {
    for (let x = -snappedRadius; x <= snappedRadius; x += pixel) {
      if (x * x + y * y <= snappedRadius * snappedRadius) {
        pixelRect(context, centerX + x, centerY + y, pixel, pixel, color, pixel);
      }
    }
  }
}

function snap(value, pixel) {
  return Math.round(value / pixel) * pixel;
}

function saveState() {
  try {
    state.saveVersion = SAVE_VERSION;
    state.lastSavedAt = new Date().toISOString();
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // The game remains playable without persistent storage.
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const migrated = {
      ...createNewState(),
      ...parsed,
      saveVersion: SAVE_VERSION,
      seed: normalizeSeed(parsed.seed),
      rngState: normalizeSeed(parsed.rngState || parsed.seed),
      log: Array.isArray(parsed.log) ? parsed.log : []
    };
    migrated.lastSavedAt = typeof parsed.lastSavedAt === "string" ? parsed.lastSavedAt : null;
    migrated.loadedFromSave = true;
    migrated.turn = Math.max(0, Math.round(finiteOr(migrated.turn, 0)));
    migrated.count = Math.max(1, Math.round(finiteOr(migrated.count, 1)));
    migrated.lastRand = Number.isFinite(Number(migrated.lastRand))
      ? clamp(Math.round(Number(migrated.lastRand)), 0, 9999)
      : null;
    migrated.weather = String(migrated.weather || "等待第一年观测");
    migrated.ending = String(migrated.ending || "文明尚未抵达终局");
    migrated.lastTone = String(migrated.lastTone || "quiet");
    migrated.specialNotice = migrated.specialNotice && typeof migrated.specialNotice === "object"
      ? {
          title: String(migrated.specialNotice.title || "特殊事件"),
          text: String(migrated.specialNotice.text || ""),
          delta: migrated.specialNotice.delta && typeof migrated.specialNotice.delta === "object"
            ? diff(snapshotForObject({}), snapshotForObject(migrated.specialNotice.delta))
            : {}
        }
      : null;
    migrated.sc = clamp(roundStat(finiteOr(migrated.sc, 240)), 0, CAP);
    migrated.be = clamp(roundStat(finiteOr(migrated.be, 360)), 0, CAP);
    migrated.pop = Math.max(0, Math.round(finiteOr(migrated.pop, 7600)));
    migrated.eco = Math.max(0, Math.round(finiteOr(migrated.eco, DEFAULT_ECO)));
    migrated.stability = clamp(Math.round(finiteOr(migrated.stability, 52)), 0, 100);
    migrated.populationGrowthMultiplier = finiteOr(migrated.populationGrowthMultiplier, 1);
    migrated.knowledgeGrowthMultiplier = finiteOr(migrated.knowledgeGrowthMultiplier, 1);
    migrated.controlEfficiencyMultiplier = finiteOr(migrated.controlEfficiencyMultiplier, 1);
    migrated.controlLocked = Boolean(migrated.controlLocked);
    migrated.populationLockTurns = Math.max(0, Math.round(finiteOr(migrated.populationLockTurns, 0)));
    migrated.doomCountdown = Math.max(0, Math.round(finiteOr(migrated.doomCountdown, 0)));
    migrated.lockedPopulation = Number.isFinite(Number(migrated.lockedPopulation))
      ? Math.max(0, Math.round(Number(migrated.lockedPopulation)))
      : null;
    migrated.eerfLevel = clamp(Math.round(finiteOr(migrated.eerfLevel, 0)), 0, EERF_MAX_LEVEL);
    migrated.restartPopulationSeed = Math.max(BASE_RESTART_POP, Math.round(finiteOr(migrated.restartPopulationSeed, BASE_RESTART_POP)));
    migrated.awaitingCivilizationRestart = Boolean(migrated.awaitingCivilizationRestart);
    migrated.pendingRestart = migrated.pendingRestart && typeof migrated.pendingRestart === "object"
      ? {
          oldCount: Math.max(1, Math.round(finiteOr(migrated.pendingRestart.oldCount, migrated.count))),
          nextCount: Math.max(1, Math.round(finiteOr(migrated.pendingRestart.nextCount, migrated.count + 1))),
          sc: clamp(roundStat(finiteOr(migrated.pendingRestart.sc, 0)), 0, CAP),
          be: clamp(roundStat(finiteOr(migrated.pendingRestart.be, 0)), 0, CAP),
          pop: Math.max(0, Math.round(finiteOr(migrated.pendingRestart.pop, BASE_RESTART_POP))),
          eco: Math.max(0, Math.round(finiteOr(migrated.pendingRestart.eco, 0))),
          stability: clamp(Math.round(finiteOr(migrated.pendingRestart.stability, 18)), 0, 100),
          eerfLevel: clamp(Math.round(finiteOr(migrated.pendingRestart.eerfLevel, 0)), 0, EERF_MAX_LEVEL),
          collapseCause: String(migrated.pendingRestart.collapseCause || "未知灾变")
        }
      : null;
    if (migrated.awaitingCivilizationRestart && !migrated.pendingRestart) {
      migrated.awaitingCivilizationRestart = false;
    }
    migrated.endingCandidate = migrated.endingCandidate && typeof migrated.endingCandidate === "object" && migrated.endingCandidate.id
      ? {
          id: String(migrated.endingCandidate.id),
          name: String(migrated.endingCandidate.name || `${migrated.endingCandidate.id}结局`),
          turn: Math.max(0, Math.round(finiteOr(migrated.endingCandidate.turn, migrated.turn))),
          rand: Number.isFinite(Number(migrated.endingCandidate.rand)) ? Number(migrated.endingCandidate.rand) : migrated.lastRand,
          trigger: String(migrated.endingCandidate.trigger || migrated.weather || "存档恢复"),
          snapshot: migrated.endingCandidate.snapshot && typeof migrated.endingCandidate.snapshot === "object"
            ? {
                sc: clamp(roundStat(finiteOr(migrated.endingCandidate.snapshot.sc, migrated.sc)), 0, CAP),
                be: clamp(roundStat(finiteOr(migrated.endingCandidate.snapshot.be, migrated.be)), 0, CAP),
                pop: Math.max(0, Math.round(finiteOr(migrated.endingCandidate.snapshot.pop, migrated.pop))),
                eco: Math.max(0, Math.round(finiteOr(migrated.endingCandidate.snapshot.eco, migrated.eco))),
                eerf: clamp(Math.round(finiteOr(migrated.endingCandidate.snapshot.eerf, migrated.eerfLevel)), 0, EERF_MAX_LEVEL),
                stability: clamp(Math.round(finiteOr(migrated.endingCandidate.snapshot.stability, migrated.stability)), 0, 100)
              }
            : snapshotForObject(migrated)
        }
      : null;
    if (migrated.endingCandidate?.id === "C") {
      migrated.endingCandidate = null;
    }
    migrated.cEndingStreak = clamp(Math.round(finiteOr(migrated.cEndingStreak, 0)), 0, C_AUTO_STREAK);
    migrated.finished = Boolean(migrated.finished);
    migrated.finalEnding = migrated.finalEnding && typeof migrated.finalEnding === "object"
      ? migrated.finalEnding
      : null;
    if (migrated.finished && !migrated.finalEnding?.id) {
      migrated.finished = false;
      migrated.finalEnding = null;
    }
    migrated.history = Array.isArray(parsed.history) ? parsed.history.slice(0, 12) : [];
    const fallbackCivilization = createCivilizationStats(migrated.count, Math.max(0, migrated.turn - 1), migrated);
    migrated.currentCivilization = parsed.currentCivilization && typeof parsed.currentCivilization === "object"
      ? { ...fallbackCivilization, ...parsed.currentCivilization }
      : fallbackCivilization;
    migrated.currentCivilization.peakSc = Math.max(finiteOr(migrated.currentCivilization.peakSc, 0), migrated.sc);
    migrated.currentCivilization.peakBe = Math.max(finiteOr(migrated.currentCivilization.peakBe, 0), migrated.be);
    migrated.currentCivilization.peakPop = Math.max(finiteOr(migrated.currentCivilization.peakPop, 0), migrated.pop);
    migrated.currentCivilization.peakEco = Math.max(finiteOr(migrated.currentCivilization.peakEco, 0), migrated.eco);
    migrated.currentCivilization.peakEerf = Math.max(finiteOr(migrated.currentCivilization.peakEerf, 0), migrated.eerfLevel);
    migrated.currentCivilization.specialEvents = Array.isArray(migrated.currentCivilization.specialEvents)
      ? migrated.currentCivilization.specialEvents.slice(0, 6)
      : [];
    return migrated;
  } catch {
    return null;
  }
}

function saveStatusText() {
  const savedAt = formatSavedAt(state.lastSavedAt);
  return state.loadedFromSave
    ? `已继续上次存档；最近保存 ${savedAt}`
    : `自动保存开启；最近保存 ${savedAt}`;
}

function formatSavedAt(value) {
  if (!value) return "尚未写入";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatNumber(value) {
  const number = finiteOr(value, 0);
  const hasFraction = Math.abs(number - Math.round(number)) > 0.0001;
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: hasFraction ? 4 : 0
  }).format(number);
}

function formatRand(value) {
  return String(value).padStart(4, "0");
}

function isPalindrome(text) {
  return text === text.split("").reverse().join("");
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundStat(value) {
  return Math.round(finiteOr(value, 0) * 10000) / 10000;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const red = parseInt(clean.slice(0, 2), 16);
  const green = parseInt(clean.slice(2, 4), 16);
  const blue = parseInt(clean.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("beforeunload", () => {
  if (state && !state.finished) saveState();
  if (frameHandle) cancelAnimationFrame(frameHandle);
});
