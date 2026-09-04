import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const memoryStore = new Map();
const context = vm.createContext({
  URL,
  localStorage: {
    getItem(key) { return memoryStore.get(key) ?? null; },
    setItem(key, value) { memoryStore.set(key, String(value)); }
  },
  window: {
    location: { href: "https://techecho.org/games/cradles-of-civilization/?lang=en" },
    history: { replaceState() {} }
  }
});
context.location = context.window.location;
context.history = context.window.history;
context.window = context;
context.globalThis = context;

const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
vm.runInContext(read("map-lab/map-data.js"), context, { filename: "map-data.js" });
vm.runInContext(read("localization.js"), context, { filename: "localization.js" });
vm.runInContext(read("endings.js"), context, { filename: "endings.js" });

const i18n = context.CRADLES_I18N;
i18n.init();
assert.equal(i18n.getLanguage(), "en", "?lang=en must select English");
assert.equal(memoryStore.get("three-sun-chronicle:language:v1"), "en", "language preference must persist separately");
context.CRADLES_MAP_LAB_DATA.provinces.forEach((province) => {
  assert.equal(i18n.translate(province.nameZh), province.nameEn, `province ${province.id} must use its canonical English name`);
});
context.CRADLES_MAP_LAB_DATA.strategicRegions.forEach((region) => {
  assert.equal(i18n.translate(region.nameZh), region.nameEn, `strategic region ${region.id} must use its canonical English name`);
});

const hasHan = (value) => /[\u3400-\u9fff]/u.test(String(value || ""));
const assertTranslated = (source, label = source) => {
  const translated = i18n.translate(source);
  assert.ok(!hasHan(translated), `${label} retains Han characters: ${translated}`);
  return translated;
};

for (const file of ["index.html", "ending.html"]) {
  const html = read(file);
  const visibleMarkup = html.replace(/<script[\s\S]*?<\/script>/giu, "");
  const values = [];
  for (const match of visibleMarkup.matchAll(/>([^<]+)</gu)) values.push(match[1]);
  for (const match of visibleMarkup.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*)"/gu)) values.push(match[1]);
  values
    .map((value) => value.trim())
    .filter((value) => hasHan(value) && value !== "切换到英文")
    .forEach((value) => assertTranslated(value, `${file}: ${value}`));

  assert.match(html, /id="languageToggle"/u, `${file} must expose the language toggle`);
  assert.match(html, /src="localization\.js\?v=/u, `${file} must load the shared localization runtime`);
}

const endingPageSource = read("ending.html");
assert.doesNotMatch(endingPageSource, /storedEnding\?\.id \|\| "A"/u, "opening the ending page without a record must not claim ending A");
assert.match(endingPageSource, /nameEn: "No Ending Recorded"/u, "the empty ending page needs a neutral English state");
assert.match(endingPageSource, /`Civilization \$\{formatNumber\(entry\.civilization\)\}/u, "ending archive options need explicit English wording");
assert.match(endingPageSource, /endings reached \/ \$\{formatNumber\(endingStats\.total\)\} total/u, "ending statistics need explicit English wording");

const gameSource = read("game.js");
for (const match of gameSource.matchAll(/"((?:\\.|[^"\\])*)"/gsu)) {
  let value;
  try {
    value = JSON.parse(match[0]);
  } catch {
    continue;
  }
  if (hasHan(value) && !value.includes("<")) assertTranslated(value, `game.js literal: ${value}`);
}

const dynamicSamples = [
  "长生军开始文明演化",
  "冷却 4 年",
  "军力 需 18,000",
  "日冕王庭在中央盆地边境试探后撤回。",
  "日冕王庭接管中央盆地，长生军仍保有核心疆域。",
  "长生军开始执行“均衡发展”。",
  "第一军团在中央盆地进入防御姿态。",
  "第一军团沿道路进驻北境冰原。",
  "第一军团沿道路进驻霜鸦原。",
  "败军撤往北境冰原。",
  "中央盆地血战",
  "中央盆地，长生军，地块防御 66",
  "第一军团｜长生军｜兵力 6,200｜战斗力 III（58）",
  "Seed 1058｜普通｜AI 标准｜可见 8/25｜本国 5｜中立 10｜敌国 10｜边境拉锯",
  "Seed 1058｜普通｜AI 标准｜可见 22/64｜本国 13｜中立 26｜敌国 25｜边境拉锯",
  "盆地｜攻 +2｜防 +2｜基础工事 66｜将生成五块连通初始疆域",
  "盆地｜攻 +2｜防 +2｜基础工事 59｜将围绕首都生成 13 块连通初始疆域",
  "远征军本次连续控制 3 块领土。",
  "日冕王庭和长生军的军队在中央盆地相遇。最终长生军取得了胜利，败军撤往北境冰原。 进攻方阵亡 1,200（24%），守军阵亡 900（31%）。 灰烬邦联灭亡，其军事单位全部解散。",
  "第 3 号文明毁灭，等待重启文明",
  "第 3 号文明从 EERF 和废墟档案里醒来。",
  "终极答案倒计时：还剩 4 次行动",
  "全图征服已经完成，军力达到 18,000 后方可加冕。",
  "K结局可结算。可继续发展，或点击脱离苦海",
  "连续 18 代文明毁灭时科学峰值未突破青铜停滞阈值 1,600",
  "连续 16 代文明以无政府秩序收束（低于 20）",
  "第 3 号文明在 全图征服 后抵达终局。游戏结束。终局统计已更新。",
  "已达成 4/12 种｜总计 7 次｜最近 K｜万王之王",
  "灾后火种等级 3；下一代初始人口约 8,200；SC/BE 约 1,200/900；LA 保存增幅 30%",
  "SPEC 2048｜无特殊事件"
];
dynamicSamples.forEach((value) => assertTranslated(value, `dynamic sample: ${value}`));

const exactTranslations = new Map([
  [
    "女孩们只想玩乐。\n——辛迪·劳帕，1983年。\n人口增长策略转向审慎，本代文明内人口增速变为原来的 2/3。\n",
    "Girls just want to have fun.\n—Cyndi Lauper, 1983.\nPopulation policy turns cautious; population growth becomes 2/3 of its former rate for this civilization.\n"
  ],
  [
    "妇女能顶半边天。新的家庭制度释放劳动与生育潜能，本代文明内人口增速变为原来的 5/4。\n",
    "Women hold up half the sky. New family institutions release labor and reproductive potential; population growth becomes 5/4 of its former rate for this civilization.\n"
  ],
  ["第一军团 4.2k / III", "First Legion 4.2k / III"],
  ["可见 8/25", "Visible 8/25"],
  ["本代已记录记忆饱和；连续文明 2/3", "Memory saturation recorded in this civilization; 2/3 consecutive civilizations"],
  ["科学升级至萌芽", "Science rises to Budding"],
  ["神学降级至停滞", "Theology falls to Stalled"],
  ["第 5 年｜趋势播报｜科学升级至萌芽；神学降级至停滞", "Year 5 | Trend Report | Science rises to Budding; Theology falls to Stalled"],
  ["中央盆地血战：没有战报。", "Bloodbath at Central Basin: No battle reports."],
  [
    "日冕王庭和长生军的军队在中央盆地相遇。最终长生军取得了胜利，败军撤往北境冰原。 进攻方阵亡 1,200（24%），守军阵亡 900（31%）。 灰烬邦联灭亡，其军事单位全部解散。",
    "Court of the Corona and Longevity Army meet in battle at Central Basin. Longevity Army wins. The defeated force retreats to Northern Icefields. Attacker casualties: 1,200 (24%); defender casualties: 900 (31%). Ash Confederacy has fallen; all of its military units are disbanded."
  ],
  ["未知触发", "Unknown trigger"],
  ["未知灾变", "Unknown disaster"],
  ["地上天国/Promised Land", "Promised Land"],
  ["第 3 号文明｜热疫", "Civilization 3 | Heat Plague"],
  ["42 年", "42 years"],
  ["已达成 4 种 / 总计 7 次", "4 endings reached / 7 total"]
]);
exactTranslations.forEach((expected, source) => {
  assert.equal(i18n.translate(source), expected, `exact English translation mismatch for: ${source}`);
});

i18n.setProtectedTerms(["文明共和国"]);
assert.equal(
  i18n.translate("文明共和国开始文明演化"),
  "文明共和国 begins its civilizational evolution",
  "a player-supplied realm name must remain untouched"
);
i18n.setProtectedTerms([]);

const endings = context.window.THREE_SUN_ENDINGS;
assert.deepEqual(Object.keys(endings), [..."ABCDEFGHIJKL"], "all twelve endings must be present");
Object.entries(endings).forEach(([id, ending]) => {
  assert.ok(ending.nameEn && !hasHan(ending.nameEn), `ending ${id} needs an English name`);
  assert.ok(Array.isArray(ending.paragraphsEn) && ending.paragraphsEn.length === ending.paragraphs.length, `ending ${id} needs matching English paragraphs`);
  ending.paragraphsEn.forEach((paragraph) => assert.ok(paragraph && !hasHan(paragraph), `ending ${id} has untranslated body copy`));
  assert.ok(ending.quoteEn && !hasHan(ending.quoteEn), `ending ${id} needs an English quotation`);
});

assert.match(read("scripts/package-game.mjs"), /"localization\.js"/u, "offline package must include localization.js");
console.log("Web bilingual coverage checks passed for static UI, dynamic copy, and endings A-L.");
