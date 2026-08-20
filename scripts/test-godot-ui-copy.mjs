import fs from "node:fs";
import { execFileSync } from "node:child_process";

const localization = fs.readFileSync(new URL("../godot/Main.Localization.cs", import.meta.url), "utf8");
const mainSource = fs.readFileSync(new URL("../godot/Main.cs", import.meta.url), "utf8");
const gameEngine = fs.readFileSync(new URL("../godot/Core/GameEngine.cs", import.meta.url), "utf8");
const gameState = fs.readFileSync(new URL("../godot/Core/GameState.cs", import.meta.url), "utf8");
const eventNarratives = fs.readFileSync(new URL("../godot/Core/EventNarratives.cs", import.meta.url), "utf8");
const endingCatalog = fs.readFileSync(new URL("../godot/Core/EndingCatalog.cs", import.meta.url), "utf8");
const worldEvents = fs.readFileSync(new URL("../godot/Core/WorldEvents.cs", import.meta.url), "utf8");
const eventSources = ["EventCatalog.cs", "WorldEvents.cs", "GameEngine.cs"]
  .map((name) => fs.readFileSync(new URL(`../godot/Core/${name}`, import.meta.url), "utf8"))
  .join("\n");
const actionIds = [
  "science", "belief", "population", "economy", "arts", "hibernate",
  "balance", "suppressBelief", "order", "suppressScience",
  "buildEerf", "upgradeEerf", "recovery"
];

function decodeCSharpString(value) {
  return JSON.parse(`"${value}"`);
}

const baseline = "113f659a98ef4de125a4efe114fe8a1077e61bab";
let historicalGame;
let historicalEndings;
try {
  historicalGame = execFileSync("git", ["show", `${baseline}:game.js`], { encoding: "utf8" });
  historicalEndings = execFileSync("git", ["show", `${baseline}:endings.js`], { encoding: "utf8" });
} catch {
  throw new Error(`Git history is required to verify the pre-map baseline ${baseline}`);
}

function webAction(actionId) {
  const actionBlock = historicalGame.slice(historicalGame.indexOf("const ACTIONS ="), historicalGame.indexOf("const ACTION_SHORTCUTS"));
  const match = actionBlock.match(new RegExp(`\\n\\s{2}${actionId}: \\{[\\s\\S]*?label: "((?:\\\\.|[^"\\\\])*)"[\\s\\S]*?text: "((?:\\\\.|[^"\\\\])*)"[\\s\\S]*?chronicleText: "((?:\\\\.|[^"\\\\])*)"`, "u"));
  return match ? { label: JSON.parse(`"${match[1]}"`), quote: JSON.parse(`"${match[2]}"`), chronicle: JSON.parse(`"${match[3]}"`) } : { label: "", quote: "", chronicle: "" };
}

const godotActions = new Map();
for (const match of gameEngine.matchAll(/new\("([^"]+)",\s*"((?:\\.|[^"\\])*)",\s*"(?:\\.|[^"\\])*",\s*"((?:\\.|[^"\\])*)",\s*"((?:\\.|[^"\\])*)",\s*"((?:\\.|[^"\\])*)",\s*"((?:\\.|[^"\\])*)"/gu)) {
  godotActions.set(match[1], {
    label: decodeCSharpString(match[2]),
    quote: decodeCSharpString(match[3]),
    quoteEn: decodeCSharpString(match[4]),
    chronicle: decodeCSharpString(match[5]),
    chronicleEn: decodeCSharpString(match[6])
  });
}

const errors = [];
for (const actionId of actionIds) {
  const web = webAction(actionId);
  const godot = godotActions.get(actionId);
  if (web.label !== godot?.label) errors.push(`${actionId} label\n  web:   ${web.label}\n  godot: ${godot?.label}`);
  if (web.quote !== godot?.quote) errors.push(`${actionId} quote\n  web:   ${web.quote}\n  godot: ${godot?.quote}`);
  if (web.chronicle !== godot?.chronicle) errors.push(`${actionId} chronicle copy\n  web:   ${web.chronicle}\n  godot: ${godot?.chronicle}`);
  if (/\p{Script=Han}/u.test(godot?.quoteEn ?? "")) errors.push(`${actionId} English quote still contains Chinese`);
  if (/\p{Script=Han}/u.test(godot?.chronicleEn ?? "")) errors.push(`${actionId} English chronicle copy still contains Chinese`);
}
for (const [key, shifted, actionId] of [
  ["s", false, "science"], ["b", false, "belief"], ["p", false, "population"],
  ["b", true, "balance"], ["z", false, "order"], ["1", false, "suppressBelief"],
  ["2", false, "suppressScience"], ["h", false, "hibernate"], ["l", false, "arts"],
  ["e", false, "economy"], ["f", false, "buildEerf"], ["u", false, "upgradeEerf"],
  ["o", false, "recovery"], ["r", false, "restartCivilization"], ["t", false, "settleEnding"]
]) {
  const code = `('${key}', ${shifted}) => "${actionId}"`;
  if (!mainSource.includes(code)) errors.push(`missing runtime shortcut mapping: ${shifted ? "Shift+" : ""}${key.toUpperCase()} -> ${actionId}`);
}
if (!mainSource.includes("button.Pressed += () => Advance(actionId)")) errors.push("action cards are not wired to their runtime action ids");
if (!mainSource.includes("CustomMinimumSize = new Vector2(ActionCardSize, ActionCardSize)")) errors.push("action cards are not constrained to a square slot");
if (!mainSource.includes('CreateTerminalButton("settleEnding"')) errors.push("the Settle Ending / 脱离苦海 terminal is missing");
if (mainSource.indexOf("_engine.DisabledReason(_state, actionId)") > mainSource.indexOf("_engine.Advance(_state, actionId)")) errors.push("disabled actions can reach the engine before the UI guard");
for (const copy of ["本局复盘", "复制挑战链接", "新世界　Shift+N", "指定种子", "开始　Enter", "终局统计", "终值", "峰值"]) {
  if (!mainSource.includes(copy)) errors.push(`ending page is missing web copy: ${copy}`);
}
for (const behavior of ["StartEndingNewWorld", "StartEndingSeedWorld", "SplitEndingQuote", "EndingMetricLine", "EndingPeakMetricLine"]) {
  if (!mainSource.includes(behavior)) errors.push(`ending page behavior is missing: ${behavior}`);
}

const openingCopy = "三颗恒星在天幕上留下互相矛盾的轨迹。执政官看着围在篝火旁的各人，那时科学、神学、人口与经济都脆弱不堪：这是一个文明的新生。";
if (!gameState.includes(openingCopy)) errors.push("the v0.2 opening chronicle prose is missing");

const historicalNarratives = new Map();
for (const match of historicalGame.matchAll(/title:\s*"((?:\\.|[^"\\])*)",\s*\n\s*text:\s*"((?:\\.|[^"\\])*)"/gu)) {
  historicalNarratives.set(JSON.parse(`"${match[1]}"`), JSON.parse(`"${match[2]}"`));
}
const godotNarratives = new Map();
for (const match of eventNarratives.matchAll(/\["([^"]+)"\]\s*=\s*\("((?:\\.|[^"\\])*)",\s*"((?:\\.|[^"\\])*)"\)/gu)) {
  godotNarratives.set(match[1], { zh: decodeCSharpString(match[2]), en: decodeCSharpString(match[3]) });
}
for (const [title, text] of historicalNarratives) {
  if (title === "第 1 号文明苏醒" || title === "人口断代" || title.includes(" - ")) continue;
  const godot = godotNarratives.get(title);
  if (!godot) errors.push(`missing v0.2 event narrative: ${title}`);
  else if (godot.zh !== text) errors.push(`${title} narrative differs from v0.2\n  web:   ${text}\n  godot: ${godot.zh}`);
  if (godot && /\p{Script=Han}/u.test(godot.en)) errors.push(`${title} English narrative still contains Chinese`);
}

for (const citation of ["陈胜、吴广", "辛迪·劳帕", "君士坦丁十一世", "尤里·加加林", "莎士比亚"]) {
  if (!worldEvents.includes(citation)) errors.push(`missing cited special-event source: ${citation}`);
}

const preMilitaryEndings = historicalEndings.slice(0, historicalEndings.indexOf("  K: {"));
const endingStrings = [...preMilitaryEndings.matchAll(/"((?:\\.|[^"\\])*)"/gu)]
  .map((match) => JSON.parse(`"${match[1]}"`))
  .filter((value) => /\p{Script=Han}/u.test(value));
for (const value of endingStrings) {
  const pieces = value.includes("/") ? value.split("/") : [value];
  if (!pieces.every((piece) => endingCatalog.includes(piece.replaceAll("\\", "\\\\").replaceAll('"', '\\"')))) {
    errors.push(`missing v0.2 ending copy: ${value}`);
  }
}

const eventMapBlock = localization.slice(localization.indexOf("EventNamesEn ="), localization.indexOf("SpecialNamesEn ="));
const translatedEventNames = new Set([...eventMapBlock.matchAll(/\["([^"]+)"\]\s*=/gu)].map((match) => match[1]));
const eventTitlePatterns = [
  /\bEvent\("([^"]+)"/gu,
  /\bDisaster\("([^"]+)"/gu,
  /new EventDefinition\("([^"]+)"/gu
];
const coreEventNames = new Set(eventTitlePatterns.flatMap((pattern) => [...eventSources.matchAll(pattern)].map((match) => match[1])));
for (const title of coreEventNames) {
  if (/\p{Script=Han}/u.test(title) && !title.includes(" - ") && !translatedEventNames.has(title)) {
    errors.push(`missing English event title: ${title}`);
  }
}

if (errors.length) {
  console.error(`Godot/web UI copy parity failed:\n${errors.join("\n")}`);
  process.exit(1);
}

console.log(`GODOT_WEB_UI_COPY baseline=v0.2 actions=${actionIds.length} narratives=${historicalNarratives.size} endings=10 events=${coreEventNames.size} status=PASS`);
