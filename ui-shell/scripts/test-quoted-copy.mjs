import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseQuotedCopy } from "../src/data/quoted-copy.js";

const squeeze = (text) => text.replace(/\s/gu, "");
const preservesCopy = (text, blocks = parseQuotedCopy(text)) => {
  assert.equal(
    squeeze(blocks.map((block) => block.text + (block.source || "")).join("")),
    squeeze(text),
    "Parsing must not drop, reorder or rewrite copy.",
  );
};

assert.deepEqual(
  parseQuotedCopy("牛奶会有的，面包也会有的。一切都会有的！\n ——弗拉基米尔·伊里奇·列宁，1917年"),
  [
    {
      type: "quote",
      text: "牛奶会有的，面包也会有的。一切都会有的！",
      source: "——弗拉基米尔·伊里奇·列宁，1917年",
    },
  ],
);
assert.deepEqual(parseQuotedCopy("“君不见，青海头，古来白骨无人收。”——杜甫"), [
  { type: "quote", text: "“君不见，青海头，古来白骨无人收。”", source: "——杜甫" },
]);
assert.deepEqual(
  parseQuotedCopy(
    "王侯将相，宁有种乎？\n——陈胜、吴广，公元前209年。\n叛军夺取粮仓与观测站，人口损失 3,000。",
  ),
  [
    { type: "quote", text: "王侯将相，宁有种乎？", source: "——陈胜、吴广，公元前209年。" },
    { type: "prose", text: "叛军夺取粮仓与观测站，人口损失 3,000。" },
  ],
);
for (const text of [
  "终于，没有圣城从天而降——",
  "自然对数被奉为女神，人们在她的祭坛上计算——嗯，几乎是一切。\n",
  "——来吧，我们要作砖；将土烧透了。",
  "科学缓慢增长。\n人口开始恢复。\n不要丢失这些换行。",
  "他说“再见”——然后离开了房间。",
  "变化已经发生——1900年以后，人们开始新的生活。",
  "他解释这本书——《1984》是一部小说。",
]) {
  assert.deepEqual(parseQuotedCopy(text), [{ type: "prose", text: text.trim() }]);
  preservesCopy(text);
}
const mixed = "人群在广场停下。“起初，神创造天地。”——《创世记》1:1。人口增长 200。";
assert.deepEqual(parseQuotedCopy(mixed), [
  { type: "prose", text: "人群在广场停下。" },
  { type: "quote", text: "“起初，神创造天地。”", source: "——《创世记》1:1。" },
  { type: "prose", text: "人口增长 200。" },
]);
preservesCopy(mixed);
const poetry =
  "背景叙述。\n\n君不见，青海头，\n古来白骨无人收。\n——《兵车行》，杜甫，750年\n\n人口下降。";
const poems = parseQuotedCopy(poetry);
assert.equal(poems[1].text, "君不见，青海头，\n古来白骨无人收。");
assert.equal(poems[2].text, "人口下降。");
preservesCopy(poetry, poems);
const adjacent = "“第一句。”——甲乙，1900年。“第二句。”——丙丁，1901年。人口下降。";
assert.deepEqual(
  parseQuotedCopy(adjacent).map((block) => block.type),
  ["quote", "quote", "prose"],
);
preservesCopy(adjacent);
const broadcast =
  "科学降级至荒无人烟：盛宴已毕。——杨振宁，1980年\n 神学降级至扩张：日光之下，并无新事。——《传道书》1:9 科学升级至成形：\n万物皆数。——毕达哥拉斯，公元前530年\n";
const broadcastBlocks = parseQuotedCopy(broadcast);
assert.deepEqual(
  broadcastBlocks.filter((block) => block.type === "quote").map((block) => block.text),
  ["盛宴已毕。", "日光之下，并无新事。", "万物皆数。"],
);
assert.equal(broadcastBlocks.filter((block) => block.type === "prose").length, 3);
preservesCopy(broadcast, broadcastBlocks);
assert.deepEqual(parseQuotedCopy(""), []);
assert.deepEqual(parseQuotedCopy(null), []);

// Verify the actual repository copy without importing browser/engine code.
const gameSource = readFileSync(new URL("../../game.js", import.meta.url), "utf8");
let citedGameTexts = 0;
for (const match of gameSource.matchAll(
  /\b(?:text|budding|formed|expanding|surging|stalled|decline|collapse):\s*("(?:\\.|[^"\\])*")/gu,
)) {
  const text = JSON.parse(match[1]);
  preservesCopy(text);
  if (/——(?:《|[\s\S]*?\d+年)/u.test(text)) {
    assert.ok(
      parseQuotedCopy(text).some((block) => block.type === "quote"),
      `Expected cited game text to become a quote: ${text}`,
    );
    citedGameTexts += 1;
  }
}
const endingsContext = vm.createContext({});
endingsContext.window = endingsContext;
vm.runInContext(readFileSync(new URL("../../endings.js", import.meta.url), "utf8"), endingsContext);
for (const ending of Object.values(endingsContext.THREE_SUN_ENDINGS)) {
  const blocks = parseQuotedCopy(ending.quote);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "quote");
  assert.ok(blocks[0].source.startsWith("——"));
  preservesCopy(ending.quote, blocks);
  ending.paragraphs.forEach((paragraph) => preservesCopy(paragraph));
}
console.log(
  `Quoted-copy presentation checks passed: ${citedGameTexts} actual cited event/action texts, all 12 ending quotes, narrative dashes, mixed prose, poetry, and content preservation.`,
);
