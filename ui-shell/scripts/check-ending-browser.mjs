import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Restore only the storage actually emitted by the legal-command campaign
// replays. No ending candidates, metrics, history, or RNG are constructed here.
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";
const outputDirectory = fileURLToPath(new URL("../test-results/", import.meta.url));
const inputPath = process.env.ENDING_REPORT || join(outputDirectory, "ending-reachability.json");
const inputText = await readFile(inputPath, "utf8");
const campaigns = JSON.parse(inputText);
const originalContext = { window: {} };
vm.runInNewContext(
  await readFile(new URL("../../endings.js", import.meta.url), "utf8"),
  originalContext,
);
const originalCopy = JSON.parse(JSON.stringify(originalContext.window.THREE_SUN_ENDINGS));
const endingKey = "three-sun-chronicle:ending:v1";
const activeKey = "three-sun-chronicle:v1";
const metricKeys = ["sc", "be", "la", "pop", "eco", "stability", "eerf"];
const metricCodes = ["SC", "BE", "LA", "POP", "ECO", "ORDER", "EERF"];
const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const normalized = (text) => text.replace(/\s+/gu, "");
const format = (value) =>
  value != null && Number.isFinite(Number(value)) ? integer.format(Number(value)) : "—";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const report = {
  generatedAt: new Date().toISOString(),
  target: baseUrl,
  scope:
    "Twelve genuine completed campaigns, each restored from the engine's own storage in an isolated Chromium context. No manually constructed ending state.",
  campaignReport: { path: inputPath, sha256: hash(inputText), generatedAt: campaigns.generatedAt },
  viewport: { width: 1440, height: 900 },
  cases: [],
  errors: [],
  httpFailures: [],
  requestFailures: [],
  screenshots: [],
};

assert.equal(
  campaigns.passed,
  true,
  "The source campaign suite must pass before browser restoration.",
);
assert.deepEqual(campaigns.cases.map(({ id }) => id).sort(), [..."ABCDEFGHIJKL"]);
await mkdir(outputDirectory, { recursive: true });

async function settle(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

async function storageEntries(page) {
  return page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith("three-sun-chronicle:"))
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

async function stateSummary(page) {
  return page.evaluate(() => {
    const view = window.CRADLES_GAME_ENGINE.getView();
    return {
      finished: view.finished,
      seed: view.seed,
      turn: view.turn,
      civilization: view.count,
      finalEnding: view.finalEnding,
      geometrySignature: view.geometry?.signature,
      actionsDisabled: view.actions.every((action) => Boolean(action.disabledReason)),
    };
  });
}

async function assertArchive(page, item, expectedEnding) {
  const archive = page.locator('main[aria-label="结局档案"]');
  await archive.waitFor();
  assert.equal(await archive.getAttribute("data-ending"), item.id);
  const copy = originalCopy[item.id];
  assert.equal(await archive.locator("h1").innerText(), copy.name.split("/")[0]);
  assert.equal(await archive.locator(".ending-english-title").innerText(), copy.nameEn);
  const paragraphs = await archive.locator(".ending-story > .game-quoted-copy").allInnerTexts();
  assert.deepEqual(
    paragraphs.map(normalized),
    copy.paragraphs.map(normalized),
    "Every original paragraph must be preserved in order.",
  );

  const separator = copy.quote.lastIndexOf("——");
  assert.ok(separator > 0, "Each canonical ending quotation has a source.");
  const quote = archive.locator(".ending-quote blockquote");
  const cite = archive.locator(".ending-quote cite");
  assert.equal(await quote.count(), 1);
  assert.equal(await cite.count(), 1);
  assert.equal(await quote.innerText(), copy.quote.slice(0, separator).trim());
  assert.equal(await cite.innerText(), copy.quote.slice(separator).trim());
  const quoteLayout = await archive.locator(".ending-quote figure").evaluate((figure) => {
    const body = figure.querySelector("blockquote").getBoundingClientRect();
    const source = figure.querySelector("cite").getBoundingClientRect();
    return { quoteHeight: body.height, sourceHeight: source.height, gap: source.top - body.bottom };
  });
  assert.ok(quoteLayout.quoteHeight > 0 && quoteLayout.sourceHeight > 0);
  assert.ok(quoteLayout.gap >= -1, "The attribution must occupy its own line beneath the quote.");

  const rows = archive.locator(".ending-metrics tbody tr");
  assert.equal(await rows.count(), metricKeys.length);
  const displayedMetrics = [];
  for (const [index, key] of metricKeys.entries()) {
    const row = rows.nth(index);
    assert.equal(await row.locator("th small").innerText(), metricCodes[index]);
    const values = await row.locator("td").allInnerTexts();
    assert.deepEqual(
      values,
      [format(expectedEnding.snapshot[key]), format(expectedEnding.peakSnapshot[key])],
      `${key}: displayed final and peak values must match the genuine terminal archive.`,
    );
    displayedMetrics.push({ key, final: values[0], peak: values[1] });
  }
  const restored = await stateSummary(page);
  assert.equal(restored.finished, true);
  assert.equal(restored.seed, expectedEnding.seed);
  assert.equal(restored.turn, expectedEnding.turn);
  assert.equal(restored.civilization, expectedEnding.civilization);
  assert.deepEqual(
    restored.finalEnding,
    expectedEnding,
    "Restoration must retain the complete genuine ending archive.",
  );
  assert.equal(
    await archive.locator("canvas").count(),
    0,
    "A completed archive should not retain the live map.",
  );
  assert.equal(
    await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
    0,
  );
  return {
    paragraphs: paragraphs.length,
    quoteLayout,
    displayedMetrics,
    geometrySignature: restored.geometrySignature,
  };
}

const browser = await chromium.launch({ headless: true });
try {
  for (const item of campaigns.cases) {
    const started = performance.now();
    const result = {
      id: item.id,
      name: item.name,
      passed: false,
      checks: [],
      proof: {
        config: item.proof.config,
        years: item.proof.years,
        civilizations: item.proof.civilizations,
        commandCount: item.proof.commandCount,
      },
    };
    const context = await browser.newContext({
      viewport: report.viewport,
      reducedMotion: "reduce",
    });
    let page;
    try {
      assert.equal(item.passed, true);
      assert.equal(item.replayVerified, true);
      assert.equal(item.reloadVerified, true);
      assert.equal(item.proof.ending, item.id);
      assert.equal(item.terminalSave.finished, true);
      const expectedEntries = [...item.storage].sort(([a], [b]) => a.localeCompare(b));
      const savedEnding = item.storage.find(([key]) => key === endingKey)?.[1];
      assert.ok(savedEnding);
      const expectedEnding = JSON.parse(savedEnding);
      assert.deepEqual(expectedEnding, item.terminalSave.finalEnding);
      assert.equal(
        expectedEntries.some(([key]) => key === activeKey),
        false,
        "A real completed campaign must clear the active save.",
      );
      result.endingStorageSha256 = hash(savedEnding);
      await context.addInitScript(
        ({ entries }) => {
          // The marker prevents refresh from re-seeding storage and concealing
          // persistence defects. Each case has its own context and localStorage.
          if (!sessionStorage.getItem("genuine-ending-installed")) {
            localStorage.clear();
            for (const [key, value] of entries) localStorage.setItem(key, value);
            sessionStorage.setItem("genuine-ending-installed", "true");
          }
        },
        { entries: item.storage },
      );
      page = await context.newPage();
      page.setDefaultTimeout(12_000);
      page.on("pageerror", (error) => report.errors.push({ id: item.id, message: error.message }));
      page.on("response", (response) => {
        if (response.status() >= 400)
          report.httpFailures.push({ id: item.id, url: response.url(), status: response.status() });
      });
      page.on("requestfailed", (request) =>
        report.requestFailures.push({
          id: item.id,
          url: request.url(),
          error: request.failure()?.errorText,
        }),
      );
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await settle(page);
      result.archive = await assertArchive(page, item, expectedEnding);
      assert.deepEqual(await storageEntries(page), expectedEntries);
      result.checks.push(
        "Genuine terminal storage restored",
        "Canonical titles, every paragraph, quotation and separate attribution",
        "Seven final and peak metrics match the achieved save",
      );
      const screenshot = `ending-${item.id.toLowerCase()}.png`;
      await page.locator(".ending-hero").screenshot({ path: join(outputDirectory, screenshot) });
      report.screenshots.push(screenshot);
      result.screenshot = screenshot;

      await page.reload({ waitUntil: "networkidle" });
      await assertArchive(page, item, expectedEnding);
      assert.deepEqual(await storageEntries(page), expectedEntries);
      result.checks.push("Refresh preserves the ending and storage");

      await page.getByRole("button", { name: "返回世界记录", exact: true }).click();
      await page.locator(".game-timeline").waitFor();
      await settle(page);
      const before = await stateSummary(page);
      assert.equal(before.finished, true);
      assert.equal(
        before.actionsDisabled,
        true,
        "All gameplay actions must be disabled after returning to a completed world.",
      );
      await page
        .getByRole("navigation", { name: "文明事务" })
        .getByRole("button", { name: "发展", exact: true })
        .click();
      await page.locator('[data-action="science"]').click();
      const execute = page.locator('[data-execute-action="science"]');
      assert.equal(await execute.isDisabled(), true);
      await execute.evaluate((button) => button.click());
      await page.keyboard.press("s");
      await settle(page);
      assert.deepEqual(
        await stateSummary(page),
        before,
        "Neither the disabled UI nor the action shortcut may mutate a completed world.",
      );
      assert.deepEqual(await storageEntries(page), expectedEntries);
      result.checks.push("Returned world rejects annual decisions and shortcut without mutation");

      await page
        .locator(".game-timeline")
        .getByRole("button", { name: "查看结局档案", exact: true })
        .click();
      await assertArchive(page, item, expectedEnding);
      assert.deepEqual(await storageEntries(page), expectedEntries);
      result.checks.push("Footer reopens the same ending without refresh");
      assert.equal(report.errors.filter(({ id }) => id === item.id).length, 0);
      assert.equal(report.httpFailures.filter(({ id }) => id === item.id).length, 0);
      assert.equal(report.requestFailures.filter(({ id }) => id === item.id).length, 0);
      result.checks.push("No JavaScript, HTTP or failed-request errors");
      result.passed = true;
      console.log(`PASS ${item.id} ${item.name}`);
    } catch (error) {
      result.error = error.stack || error.message;
      if (page)
        await page
          .screenshot({
            path: join(outputDirectory, `ending-${item.id.toLowerCase()}-failure.png`),
            fullPage: true,
          })
          .catch(() => {});
      console.error(`FAIL ${item.id}: ${error.message}`);
    } finally {
      result.durationMs = Math.round(performance.now() - started);
      report.cases.push(result);
      await context.close();
    }
  }
} finally {
  await browser.close();
  report.passed =
    report.cases.length === 12 &&
    report.cases.every(({ passed }) => passed) &&
    !report.errors.length &&
    !report.httpFailures.length &&
    !report.requestFailures.length;
  report.summary = {
    passed: report.cases.filter(({ passed }) => passed).length,
    total: report.cases.length,
    javascriptErrors: report.errors.length,
    httpFailures: report.httpFailures.length,
    requestFailures: report.requestFailures.length,
  };
  await writeFile(
    join(outputDirectory, "ending-browser-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report.summary));
  if (!report.passed) process.exitCode = 1;
}
