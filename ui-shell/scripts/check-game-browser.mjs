import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Exercises the real game through its React UI. Engine snapshots and the formal
// save are observation points; regular play is never simulated by mutating them.
// Imported fixtures cover states that would otherwise require a long campaign.
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";
const outputDirectory = fileURLToPath(new URL("../test-results/", import.meta.url));
const STORE_KEY = "three-sun-chronicle:v1";
const ENDING_STORE_KEY = "three-sun-chronicle:ending:v1";
const report = {
  generatedAt: new Date().toISOString(),
  target: baseUrl,
  scope: "Real game-engine integration in local Chromium; timings are smoke measurements, not Lighthouse or real-device FPS.",
  checks: [],
  errors: [],
  httpFailures: [],
  screenshots: [],
  viewports: {},
};
let browser;
let page;

async function check(name, run) {
  const started = performance.now();
  try {
    const detail = await run();
    report.checks.push({ name, passed: true, durationMs: Math.round(performance.now() - started), ...(detail ? { detail } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, durationMs: Math.round(performance.now() - started), error: error.message });
    throw error;
  }
}

async function settle(tab = page) {
  await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function prepareContext(viewport, deviceScaleFactor = 1, savedRun = null) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, reducedMotion: "reduce", acceptDownloads: true });
  await context.addInitScript(({ key, savedRun }) => {
    if (savedRun && !sessionStorage.getItem("game-smoke-fixture-installed")) {
      localStorage.setItem(key, JSON.stringify(savedRun));
      sessionStorage.setItem("game-smoke-fixture-installed", "true");
    }
    window.__gameSmoke = { longTasks: [], lcp: null };
    try {
      new PerformanceObserver((list) => {
        window.__gameSmoke.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })));
      }).observe({ type: "longtask", buffered: true });
    } catch { /* Supplementary browser measurement. */ }
    try {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) window.__gameSmoke.lcp = { startTime: last.startTime, size: last.size, tagName: last.element?.tagName ?? null };
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* Supplementary browser measurement. */ }
  }, { key: STORE_KEY, savedRun });
  const tab = await context.newPage();
  tab.setDefaultTimeout(12_000);
  tab.on("pageerror", (error) => report.errors.push({ message: error.message, viewport }));
  tab.on("response", (response) => {
    if (response.status() >= 400) report.httpFailures.push({ url: response.url(), status: response.status(), viewport });
  });
  await tab.goto(baseUrl, { waitUntil: "networkidle" });
  await tab.waitForFunction(() => Boolean(window.CRADLES_GAME_ENGINE));
  await tab.evaluate(() => document.fonts.ready);
  await settle(tab);
  return { context, page: tab };
}

async function readSave(tab = page) {
  return tab.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORE_KEY);
}

async function waitForSave(test, argument, tab = page) {
  await tab.waitForFunction(({ key, source, argument }) => {
    const save = JSON.parse(localStorage.getItem(key));
    return save && Function("save", "argument", `return (${source})(save, argument)`)(save, argument);
  }, { key: STORE_KEY, source: test.toString(), argument });
  await settle(tab);
  return readSave(tab);
}

async function mapStats(tab = page) {
  return tab.locator("canvas[data-draw-count]").evaluate((canvas) => ({
    drawCount: Number(canvas.dataset.drawCount),
    drawMs: Number(canvas.dataset.drawMs),
    baseBuildCount: Number(canvas.dataset.baseBuildCount),
    visibleMarkers: Number(canvas.dataset.visibleMarkers),
    totalMarkers: Number(canvas.dataset.totalMarkers),
    visibleProvinces: Number(canvas.dataset.visibleProvinces),
    provinceCount: Number(canvas.dataset.provinceCount),
    canvasPixels: canvas.width * canvas.height,
    cachePixels: Number(canvas.dataset.cachePixels),
    geometryRevision: canvas.dataset.geometryRevision,
    geometrySignature: canvas.dataset.geometrySignature,
    zoom: Number(canvas.dataset.zoom),
    centerX: Number(canvas.dataset.centerX),
    centerY: Number(canvas.dataset.centerY),
    provincePositions: JSON.parse(canvas.dataset.provincePositions || "[]"),
    armyPositions: JSON.parse(canvas.dataset.armyPositions || "[]"),
  }));
}

async function clickMapPoint(point, tab = page) {
  const bounds = await tab.locator("canvas[data-draw-count]").boundingBox();
  assert.ok(bounds && point, "A visible map hit target is required.");
  await tab.mouse.click(bounds.x + point.x, bounds.y + point.y);
  await settle(tab);
}

async function screenshot(tab, filename) {
  await tab.screenshot({ path: join(outputDirectory, filename), fullPage: true });
  report.screenshots.push(filename);
}

async function snapshotMetrics(tab) {
  const metrics = await tab.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      domNodes: document.querySelectorAll("*").length,
      svgNodes: document.querySelectorAll("svg").length,
      canvasElements: document.querySelectorAll("canvas").length,
      canvases: [...document.querySelectorAll("canvas")].map((canvas) => ({ label: canvas.getAttribute("aria-label"), width: canvas.width, height: canvas.height, pixels: canvas.width * canvas.height })),
      images: [...document.images].map((image) => ({ src: new URL(image.src).pathname, loading: image.loading, decoding: image.decoding, complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })),
      resources: {
        count: resources.length,
        transferBytes: resources.reduce((sum, resource) => sum + resource.transferSize, navigation?.transferSize || 0),
        decodedBytes: resources.reduce((sum, resource) => sum + resource.decodedBodySize, navigation?.decodedBodySize || 0),
      },
      heap: performance.memory ? { usedBytes: performance.memory.usedJSHeapSize, totalBytes: performance.memory.totalJSHeapSize, limitBytes: performance.memory.jsHeapSizeLimit } : null,
      firstContentfulPaintMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      largestContentfulPaint: window.__gameSmoke?.lcp ?? null,
      longTasks: window.__gameSmoke?.longTasks ?? [],
    };
  });
  metrics.map = await mapStats(tab);
  metrics.estimatedCanvasBackingStoreBytes = (metrics.canvases.reduce((sum, canvas) => sum + canvas.pixels, 0) + metrics.map.cachePixels) * 4;
  return metrics;
}

async function readView(tab = page) {
  return tab.evaluate(() => window.CRADLES_GAME_ENGINE.getView());
}

async function navigate(name, tab = page) {
  await tab.getByRole("navigation", { name: "文明事务" }).getByRole("button", { name, exact: true }).click();
  await settle(tab);
}

async function closeDialog(tab = page) {
  const close = tab.getByRole("dialog").getByRole("button", { name: "关闭对话框", exact: true });
  if (await close.count()) await close.click();
  await settle(tab);
}

async function importFixture(fixture, filename = "regression-save.json", tab = page) {
  await tab.getByRole("button", { name: "世界与存档", exact: true }).click();
  await tab.getByLabel("导入存档文件", { exact: true }).setInputFiles({
    name: filename,
    mimeType: "application/json",
    buffer: Buffer.from(typeof fixture === "string" ? fixture : JSON.stringify(fixture)),
  });
  await tab.waitForFunction(() => !document.querySelector("input[type=file]")?.value);
  await settle(tab);
}

async function setupWorld(seed, name = "浏览器回归国", tab = page) {
  await tab.getByRole("textbox", { name: "国度名称", exact: true }).fill(name);
  await tab.getByLabel("世界种子", { exact: true }).fill(seed == null ? "" : String(seed));
  await tab.getByRole("combobox", { name: "难度", exact: true }).selectOption("easy");
  await tab.getByRole("combobox", { name: "敌对势力", exact: true }).selectOption("restrained");
  await tab.getByRole("combobox", { name: "执政官", exact: true }).selectOption("east-asian-man");
  await tab.getByRole("button", { name: "生成世界", exact: true }).click();
  await tab.getByRole("heading", { name: "选择文明的发源地", exact: true }).waitFor();
  await tab.locator("canvas[data-draw-count]").waitFor();
  await settle(tab);
}

async function createAnotherWorld(seed, name, tab = page) {
  await tab.getByRole("button", { name: "世界与存档", exact: true }).click();
  await tab.getByRole("button", { name: "开启随机新世界", exact: true }).click();
  await setupWorld(seed, name, tab);
}

async function executeAction(id, navigation = "发展", tab = page) {
  await navigate(navigation, tab);
  await tab.locator(`[data-action="${id}"]`).click();
  const execute = tab.getByRole("button", { name: "执行决议", exact: true });
  assert.equal(await execute.isDisabled(), false, `${id} must be available for this fixture.`);
  await execute.click();
  await settle(tab);
}

async function assertQuotedCopy(container, quoteText, sourceText) {
  const quote = container.locator(".game-quoted-copy blockquote").filter({ hasText: quoteText }).first();
  await quote.waitFor();
  assert.ok((await quote.innerText()).includes(quoteText));
  assert.equal((await quote.innerText()).includes(sourceText), false, "Attribution belongs outside the quotation body.");
  const figure = quote.locator("xpath=ancestor::figure[1]");
  assert.equal(await figure.count(), 1, "A reusable quotation must use a semantic figure.");
  const cite = figure.locator("cite");
  assert.equal(await cite.count(), 1);
  assert.ok((await cite.innerText()).includes(sourceText));
  const layout = await figure.evaluate((element) => {
    const body = element.querySelector("blockquote");
    const source = element.querySelector("cite");
    const bodyBounds = body.getBoundingClientRect();
    const sourceBounds = source.getBoundingClientRect();
    return { bodyBottom: bodyBounds.bottom, sourceTop: sourceBounds.top, bodyHeight: bodyBounds.height, sourceHeight: sourceBounds.height, bodyLineHeight: getComputedStyle(body).lineHeight };
  });
  assert.ok(layout.bodyHeight > 0 && layout.sourceHeight > 0, "Quotation and source must have visible text boxes.");
  assert.ok(layout.sourceTop >= layout.bodyBottom - 1, "Attribution must occupy a line below the quotation.");
  return layout;
}

const endingArchive = (tab = page) => tab.locator('[aria-label="结局档案"]');

async function assertEndingCopy(endingId = "A", tab = page) {
  const archive = endingArchive(tab);
  await archive.waitFor();
  const original = await tab.evaluate((id) => window.THREE_SUN_ENDINGS[id], endingId);
  const text = await archive.innerText();
  for (const paragraph of original.paragraphs) assert.ok(text.includes(paragraph), "The ending page must retain each original ending paragraph.");
  const separator = original.quote.lastIndexOf("——");
  assert.ok(separator > 0, "This fixture must exercise a quotation with its attribution.");
  const quote = original.quote.slice(0, separator).trim().replace(/^[“「]|[”」]$/g, "");
  const source = original.quote.slice(separator + 2).trim();
  await assertQuotedCopy(archive, quote, source);
  return archive;
}

function comparableRun(save) {
  return Object.fromEntries(["seed", "geometryVersion", "geometrySeed", "turn", "count", "rngState", "sc", "be", "la", "pop", "eco", "stability", "eerfLevel", "realmName", "startingRegionId"].map((key) => [key, save[key] ?? null]));
}

await mkdir(outputDirectory, { recursive: true });
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  const desktop = await prepareContext({ width: 1440, height: 900 });
  page = desktop.page;
  let initialSave;
  let progressedSave;
  let originalSignature;

  await check("A real engine campaign is configured and founded by selecting a Canvas province", async () => {
    const fresh = await readView();
    assert.equal(fresh.setupComplete, false);
    assert.equal(fresh.actions.length, 21);
    assert.equal(fresh.geometry.provinces.length, 64);
    await screenshot(page, "game-setup.png");
    await setupWorld(314159);
    const map = await mapStats();
    const canvasBounds = await page.locator("canvas[data-draw-count]").boundingBox();
    const starting = (await readView()).startingRegionId;
    const point = map.provincePositions.find((point) => point.id !== starting && point.y > 90 && point.y < canvasBounds.height * 0.55 && point.x > 50 && point.x < canvasBounds.width - 50 && map.armyPositions.every((army) => Math.hypot(army.x - point.x, army.y - point.y) > 25));
    assert.ok(point, "At least one uncovered alternate capital must be selectable.");
    await clickMapPoint(point);
    await waitForSave((save, id) => save.startingRegionId === id, point.id);
    await page.getByRole("button", { name: /在 .+ 建立文明/ }).click();
    initialSave = await waitForSave((save) => save.setupComplete, null);
    assert.equal(initialSave.seed, 314159);
    assert.equal(initialSave.turn, 0);
    assert.equal(initialSave.startingRegionId, point.id);
    assert.equal(initialSave.realmName, "浏览器回归国");
    assert.equal(initialSave.difficulty, "easy");
    assert.equal(initialSave.aiAggression, "restrained");
    assert.equal(initialSave.governorId, "east-asian-man");
    assert.ok(initialSave.geometryVersion, "New campaigns must use a versioned generated geography.");
    originalSignature = (await mapStats()).geometrySignature;
    assert.ok(originalSignature);
    report.initialDesktop = await snapshotMetrics(page);
    await screenshot(page, "game-desktop.png");
    return { seed: initialSave.seed, startingRegionId: point.id, geometrySignature: originalSignature };
  });

  await check("All 21 original decisions expose the engine's availability; a disabled decision cannot advance time", async () => {
    const seen = new Set();
    for (const name of ["发展", "治理", "军务", "设施"]) {
      await navigate(name);
      const ids = await page.locator("[data-action]").evaluateAll((buttons) => buttons.map((button) => button.dataset.action));
      const view = await readView();
      for (const id of ids) {
        seen.add(id);
        await page.locator(`[data-action="${id}"]`).click();
        assert.equal(await page.getByRole("button", { name: "执行决议", exact: true }).isDisabled(), Boolean(view.actions.find((action) => action.id === id)?.disabledReason), `${id} availability must match the original rules.`);
      }
    }
    assert.equal(seen.size, 21);
    await page.locator('[data-action="upgradeEerf"]').click();
    const before = await readSave();
    const disabled = page.getByRole("button", { name: "执行决议", exact: true });
    assert.equal(await disabled.isDisabled(), true);
    await disabled.evaluate((button) => button.click());
    await settle();
    assert.deepEqual(comparableRun(await readSave()), comparableRun(before));
    return { decisions: seen.size };
  });

  await check("An annual decision advances the original simulation, updates metrics, and creates a readable event", async () => {
    const before = await readSave();
    await executeAction("science");
    progressedSave = await waitForSave((save, turn) => save.turn === turn + 1, before.turn);
    assert.notEqual(progressedSave.rngState, before.rngState);
    assert.notDeepEqual([progressedSave.sc, progressedSave.be, progressedSave.pop, progressedSave.eco], [before.sc, before.be, before.pop, before.eco]);
    assert.ok(progressedSave.log.length > before.log.length);
    assert.equal((await mapStats()).geometrySignature, originalSignature);
    for (const key of ["sc", "be", "pop", "eco", "la", "stability"]) assert.ok((await page.locator(`[data-metric="${key}"]`).innerText()).trim());
    await page.locator(".game-event").first().click();
    assert.ok((await page.getByRole("dialog").innerText()).includes(progressedSave.log[0].title));
    await closeDialog();
    await navigate("记录");
    assert.ok((await page.getByRole("dialog").innerText()).includes(progressedSave.log[0].title));
    await closeDialog();
    return { before: comparableRun(before), after: comparableRun(progressedSave) };
  });

  await check("Decision quotations and event attributions remain separate in previews, details, and records", async () => {
    await navigate("发展");
    await page.locator('[data-action="science"]').click();
    const action = (await readView()).actions.find((item) => item.id === "science");
    const preview = page.locator(".game-action-preview");
    assert.ok((await preview.innerText()).includes(action.chronicleText));
    const actionLayout = await assertQuotedCopy(preview, "我们必须知道；我们必将知道。", "大卫·希尔伯特，1930年");
    await preview.scrollIntoViewIfNeeded();
    await screenshot(page, "game-quote-preview.png");

    const baseline = await readSave();
    const quotedEvent = { type: "special", title: "引用格式回归事件", text: "灾变之后，编年官留下了这段记录。\n“我们必须知道；我们必将知道。”\n——大卫·希尔伯特，1930年", delta: {} };
    const fixture = structuredClone(baseline);
    fixture.specialNotice = quotedEvent;
    fixture.log.unshift(quotedEvent);
    await importFixture(fixture, "quoted-event.json");
    const notice = page.locator(".game-special-notice");
    await assertQuotedCopy(notice, "我们必须知道；我们必将知道。", "大卫·希尔伯特，1930年");
    await assertQuotedCopy(page.locator(".game-event").first(), "我们必须知道；我们必将知道。", "大卫·希尔伯特，1930年");
    await notice.click();
    const detail = page.getByRole("dialog");
    assert.ok((await detail.innerText()).includes("灾变之后，编年官留下了这段记录。"));
    await assertQuotedCopy(detail, "我们必须知道；我们必将知道。", "大卫·希尔伯特，1930年");
    await closeDialog();
    await navigate("记录");
    await assertQuotedCopy(page.locator(".game-record").filter({ hasText: quotedEvent.title }), "我们必须知道；我们必将知道。", "大卫·希尔伯特，1930年");
    await closeDialog();
    await importFixture(baseline);
    return { actionLayout, surfaces: ["decision", "special-notice", "event-card", "event-detail", "chronicle-record"] };
  });

  await check("Shift+B executes balanced governance once, while typing in setup cannot trigger a decision", async () => {
    const before = await readSave();
    await page.keyboard.press("Shift+B");
    const after = await waitForSave((save, turn) => save.turn === turn + 1, before.turn);
    assert.match(after.log[0].title, /均衡治理/, "Shift+B must not be mistaken for the unmodified B belief shortcut.");
    await page.getByRole("button", { name: "世界与存档", exact: true }).click();
    await page.getByRole("button", { name: "开启随机新世界", exact: true }).click();
    await page.getByRole("textbox", { name: "国度名称", exact: true }).fill("B");
    await page.getByRole("textbox", { name: "国度名称", exact: true }).press("b");
    assert.equal((await readSave()).turn, after.turn);
    await closeDialog();
    progressedSave = await readSave();
  });

  await check("Historical observation is read-only and resumes current decisions without changing geography", async () => {
    await navigate("发展");
    const before = await readSave();
    const timeline = page.getByRole("slider", { name: "查看历史观测", exact: true });
    await timeline.focus();
    await timeline.press("Home");
    assert.equal(await page.getByRole("button", { name: "执行决议", exact: true }).isDisabled(), true);
    assert.deepEqual(comparableRun(await readSave()), comparableRun(before));
    assert.equal((await mapStats()).geometrySignature, originalSignature);
    await page.getByRole("button", { name: "回到当前", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "执行决议", exact: true }).isDisabled(), false);
  });

  await check("Canvas army/province selection, national strategy, and one deployment use the real military state", async () => {
    await navigate("国度");
    await page.getByRole("combobox", { name: "国家战略", exact: true }).selectOption("fortress");
    let current = await readView();
    assert.equal(current.entities.find((entity) => entity.id === "player-realm").strategy, "fortress");
    const army = current.visibleArmies.find((army) => army.entityId === "player-realm");
    assert.ok(army);
    let stats = await mapStats();
    await clickMapPoint(stats.armyPositions.find((point) => point.id === army.id));
    assert.equal((await readView()).selectedArmyId, army.id);
    current = await readView();
    const target = current.regions.find((region) => region.controllerId === "player-realm" && region.id !== army.regionId && current.geometry.neighbors[army.regionId].includes(region.id) && stats.provincePositions.some((point) => point.id === region.id));
    assert.ok(target, "A visible connected friendly province must be available.");
    await clickMapPoint(stats.provincePositions.find((point) => point.id === target.id));
    assert.equal((await readView()).selectedRegionId, target.id);
    const before = await readSave();
    const deploy = page.getByRole("button", { name: "部署选中军队", exact: true });
    assert.equal(await deploy.isDisabled(), false);
    await deploy.click();
    await settle();
    const after = await readSave();
    assert.equal(after.turn, before.turn, "Deployment must not also consume an annual decision.");
    assert.equal(after.military.armies.find((item) => item.id === army.id).regionId, target.id);
    assert.equal(after.military.armies.find((item) => item.id === army.id).lastMovedTurn, after.turn);
    assert.equal(await deploy.isDisabled(), true);
    progressedSave = after;
    return { armyId: army.id, targetProvince: target.id, turn: after.turn };
  });

  await check("Military fog hides enemy rosters, map hit targets, and unknown realm strength", async () => {
    await navigate("军务");
    const view = await readView();
    const save = await readSave();
    const visibleRegions = new Set(view.visibleMilitaryRegionIds);
    const hidden = save.military.armies.filter((army) => army.entityId !== "player-realm" && !visibleRegions.has(army.regionId));
    assert.ok(hidden.length > 0, "The chosen seed must exercise hidden enemy armies.");
    const ids = new Set(view.visibleArmies.map((army) => army.id));
    const markers = new Set((await mapStats()).armyPositions.map((army) => army.id));
    const rosterText = await page.locator(".game-armies").innerText();
    for (const army of hidden) {
      assert.equal(ids.has(army.id), false);
      assert.equal(markers.has(army.id), false);
      assert.equal(rosterText.includes(army.name), false);
    }
    assert.equal(await page.locator(".game-armies button").count(), view.visibleArmies.length);
    for (const entity of view.entities) {
      if (hidden.some((army) => army.entityId === entity.id)) assert.equal(entity.force, null);
    }
    return { visibleArmies: view.visibleArmies.length, hiddenArmies: hidden.length };
  });

  await check("Original-format export/import and reload preserve seed, geography, random stream, and campaign progress", async () => {
    await page.getByRole("button", { name: "世界与存档", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出存档", exact: true }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), "utf8"));
    assert.deepEqual(comparableRun(exported), comparableRun(progressedSave));
    assert.ok(exported.map.regions.length === 64 && Array.isArray(exported.military.armies));
    await closeDialog();
    await executeAction("balance");
    assert.equal((await readSave()).turn, exported.turn + 1);
    await importFixture(exported);
    assert.deepEqual(comparableRun(await readSave()), comparableRun(exported));
    assert.equal((await mapStats()).geometrySignature, originalSignature);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("canvas[data-draw-count]").waitFor();
    await settle();
    assert.deepEqual(comparableRun(await readSave()), comparableRun(exported));
    assert.equal((await mapStats()).geometrySignature, originalSignature);
    const beforeInvalid = await readSave();
    await importFixture('{"seed":"invalid"}', "invalid-save.json");
    assert.deepEqual(comparableRun(await readSave()), comparableRun(beforeInvalid));
    await closeDialog();
    progressedSave = await readSave();
    return { exportName: download.suggestedFilename(), geometrySignature: originalSignature, seed: exported.seed, turn: exported.turn };
  });

  await check("Legacy saves retain fixed geography; explicit seeds reproduce worlds and random new games differ", async () => {
    const legacy = structuredClone(progressedSave);
    delete legacy.geometryVersion;
    delete legacy.geometrySeed;
    await importFixture(legacy, "legacy-save.json");
    const legacySignature = (await mapStats()).geometrySignature;
    assert.equal(legacySignature, "342bf330", "Old saves must retain the reviewed fixed-map geography.");
    assert.equal((await readView()).geometryVersion, null);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("canvas[data-draw-count]").waitFor();
    await settle();
    assert.equal((await mapStats()).geometrySignature, legacySignature);
    await createAnotherWorld(314159, "复现种子国");
    assert.equal((await mapStats()).geometrySignature, originalSignature);
    await createAnotherWorld(271828, "另一种子国");
    const secondSignature = (await mapStats()).geometrySignature;
    assert.notEqual(secondSignature, originalSignature);
    await createAnotherWorld(null, "随机新国一");
    const randomOne = await readView();
    await createAnotherWorld(null, "随机新国二");
    const randomTwo = await readView();
    assert.notEqual(randomOne.seed, randomTwo.seed);
    assert.notEqual(randomOne.geometry.signature, randomTwo.geometry.signature);
    await importFixture(progressedSave);
    return { legacySignature, sameSeedSignature: originalSignature, otherSeedSignature: secondSignature, randomSeeds: [randomOne.seed, randomTwo.seed] };
  });

  await check("Crisis, civilization restart, and ending screens remain playable through original save fixtures", async () => {
    const crisis = structuredClone(progressedSave);
    crisis.eco = 0;
    await importFixture(crisis, "economic-crisis.json");
    assert.equal((await readView()).economicCrisis, true);
    const crisisActions = (await readView()).actions;
    assert.deepEqual(crisisActions.filter((action) => !action.disabledReason).map((action) => action.id), ["recovery"]);
    await executeAction("recovery", "设施");
    assert.ok((await readSave()).eco > 0);

    const pending = structuredClone(progressedSave);
    Object.assign(pending, { awaitingCivilizationRestart: true, autoRunUntilCollapse: false, controlLocked: false, sc: 0, be: 0, la: 0, pop: 0, eco: 0 });
    pending.pendingRestart = { oldCount: pending.count, nextCount: pending.count + 1, sc: 125, be: 140, la: 0, scTrend: 4, beTrend: 5, pop: 3000, eco: 8000, stability: 25, eerfLevel: 1, collapseCause: "浏览器回归灾变", mapState: progressedSave.map };
    await importFixture(pending, "restart-pending.json");
    await page.getByRole("heading", { name: "文明已毁灭，火种仍在", exact: true }).waitFor();
    await screenshot(page, "game-restart.png");
    await page.locator(".game-crisis").getByRole("button", { name: "重启文明", exact: true }).click();
    const restarted = await waitForSave((save) => !save.awaitingCivilizationRestart, null);
    assert.equal(restarted.count, pending.count + 1);
    assert.equal(restarted.pop, 3000);
    assert.equal(restarted.turn, pending.turn);
    assert.equal((await mapStats()).geometrySignature, originalSignature);

    const candidate = structuredClone(progressedSave);
    candidate.endingCandidate = { id: "A", name: "地上天国/Promised Land", turn: candidate.turn, trigger: "浏览器回归终局存档", rand: 100, snapshot: { sc: 20000, be: 12000, la: 1000, pop: 15000, eco: 110000, eerf: 2, stability: 90 } };
    await importFixture(candidate, "ending-candidate.json");
    await executeAction("settleEnding", "设施");
    await assertEndingCopy("A");
    assert.equal((await readView()).finished, true);
    assert.ok(!page.url().includes("ending.html"), "The hosted UI must retain its ending flow.");
    assert.equal(await endingArchive().locator(".ending-owner-counts > div").filter({ hasText: "废墟省份" }).locator("b").innerText(), "0", "An existing territory archive with no ruined provinces must display zero, not missing data.");
    await screenshot(page, "game-ending.png");
    await endingArchive().getByRole("tab", { name: "文明档案", exact: true }).click();
    const civilizationRecord = endingArchive().locator(".ending-civilization-toggle").first();
    await civilizationRecord.click();
    assert.ok(await endingArchive().locator(".ending-sample-table tbody tr").count() > 0, "The archive must expose saved observations rather than an empty summary.");
    await screenshot(page, "game-ending-details.png");
    await endingArchive().getByRole("tab", { name: "文明档案", exact: true }).press("ArrowRight");
    assert.equal(await endingArchive().getByRole("tab", { name: "领土军情", exact: true }).getAttribute("aria-selected"), "true");
    const provinces = endingArchive().getByRole("region", { name: "省份簿册", exact: true });
    assert.equal(await provinces.locator("tbody tr").count(), 16, "Territory records should be paginated instead of creating unbounded table rows.");
    const firstProvince = await provinces.locator("tbody tr").first().innerText();
    await endingArchive().getByRole("button", { name: "省份簿册分页下一页", exact: true }).click();
    assert.notEqual(await provinces.locator("tbody tr").first().innerText(), firstProvince);
    await page.reload({ waitUntil: "networkidle" });
    await assertEndingCopy("A");
    assert.equal((await readView()).finished, true);
    assert.equal((await readView()).geometry.signature, originalSignature);

    const endingState = await page.evaluate((key) => ({ savedEnding: localStorage.getItem(key), seed: window.CRADLES_GAME_ENGINE.getView().seed }), ENDING_STORE_KEY);
    await endingArchive().getByRole("button", { name: "返回世界记录", exact: true }).click();
    assert.equal(await endingArchive().count(), 0);
    await page.locator(".game-timeline").getByRole("button", { name: "查看结局档案", exact: true }).click();
    await assertEndingCopy("A");
    await endingArchive().getByRole("button", { name: "开启新的世界", exact: true }).click();
    await page.getByRole("dialog").getByRole("textbox", { name: "国度名称", exact: true }).fill("不会建立的新国");
    await closeDialog();
    await assertEndingCopy("A");
    assert.deepEqual(await page.evaluate((key) => ({ savedEnding: localStorage.getItem(key), seed: window.CRADLES_GAME_ENGINE.getView().seed }), ENDING_STORE_KEY), endingState, "Cancelling a new world must preserve the existing ending record and seed.");

    const finalDownloadPromise = page.waitForEvent("download");
    await endingArchive().getByRole("button", { name: "导出终局存档", exact: true }).click();
    const finalDownload = await finalDownloadPromise;
    const finalExport = JSON.parse(await readFile(await finalDownload.path(), "utf8"));
    assert.equal(finalExport.finished, true);
    assert.equal(finalExport.finalEnding.id, "A");
    assert.equal(finalExport.seed, progressedSave.seed);
    assert.ok(Array.isArray(finalExport.map.regions) && Array.isArray(finalExport.military.armies), "The ending export must retain the host save schema.");
    await endingArchive().getByRole("button", { name: "开启新的世界", exact: true }).click();
    await setupWorld(null, "终局之后的新国");
    assert.equal(await endingArchive().count(), 0);
    assert.equal((await readView()).finalEnding, null);
    assert.notEqual((await readView()).seed, finalExport.seed);
    await page.getByRole("button", { name: /在 .+ 建立文明/ }).click();
    const newCampaign = await waitForSave((save) => save.setupComplete, null);
    assert.equal(newCampaign.realmName, "终局之后的新国");
    assert.equal(newCampaign.turn, 0);
    assert.equal(newCampaign.finalEnding, null);
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), ENDING_STORE_KEY), null);
    await importFixture(finalExport, "ending-round-trip.json");
    await assertEndingCopy("A");
    assert.equal((await readView()).geometry.signature, originalSignature);
    await endingArchive().getByRole("button", { name: "返回世界记录", exact: true }).click();
    await page.getByRole("button", { name: "世界与存档", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "查看结局档案", exact: true }).click();
    await assertEndingCopy("A");
    await endingArchive().getByRole("button", { name: "返回世界记录", exact: true }).click();
    await importFixture(progressedSave);
  });

  await check("A fractured civilization automatically advances and stops at the restart boundary", async () => {
    const fractured = structuredClone(progressedSave);
    Object.assign(fractured, {
      difficulty: "normal", rngState: 1, sc: 4500, be: 4000, eerfLevel: 3,
      autoRunUntilCollapse: true, controlLocked: true, finished: false,
      awaitingCivilizationRestart: false, pendingRestart: null, endingCandidate: null,
    });
    await importFixture(fractured, "fractured-civilization.json");
    await page.waitForFunction(() => window.CRADLES_GAME_ENGINE.getView().awaitingCivilizationRestart, null, { timeout: 12_000 });
    const collapsed = await readSave();
    assert.ok(collapsed.turn > fractured.turn);
    await page.getByRole("heading", { name: "文明已毁灭，火种仍在", exact: true }).waitFor();
    await page.waitForTimeout(700);
    assert.equal((await readSave()).turn, collapsed.turn, "Auto-run must stop while waiting for a civilization restart.");
    await importFixture(progressedSave);
    return { startTurn: fractured.turn, stoppedTurn: collapsed.turn };
  });

  await check("Focused-map F, 0, and Home control only the camera even when EERF construction is available", async () => {
    const funded = structuredClone(progressedSave);
    Object.assign(funded, { eco: 250000, pop: 15000, sc: 4500, be: 4000, eerfLevel: 0 });
    await importFixture(funded, "camera-keyboard.json");
    const view = await readView();
    assert.equal(view.actions.find((action) => action.id === "buildEerf").disabledReason, "");
    const before = await readSave();
    const canvas = page.locator("canvas[data-draw-count]");
    await canvas.focus();
    await canvas.press("f");
    await settle();
    const focusedZoom = (await mapStats()).zoom;
    assert.ok(focusedZoom > 1, "F must focus the selected province.");
    for (const key of ["0", "Home"]) {
      await canvas.press(key);
      await settle();
      assert.ok((await mapStats()).zoom < focusedZoom, `${key} must restore the camera overview.`);
    }
    assert.deepEqual(comparableRun(await readSave()), comparableRun(before));
    assert.equal((await readSave()).eerfLevel, 0);
    await importFixture(progressedSave);
  });

  await check("The Canvas stays idle without input and the desktop/4K UI stays within its pixel and DOM budgets", async () => {
    await navigate("国度");
    const dismissNotice = page.getByRole("button", { name: "关闭提示", exact: true });
    if (await dismissNotice.isVisible()) await dismissNotice.click();
    await settle();
    const before = await mapStats();
    await page.waitForTimeout(1000);
    const after = await mapStats();
    assert.equal(after.drawCount, before.drawCount, "The strategy map must not run an idle animation loop.");
    report.idleDraws = after.drawCount - before.drawCount;
    report.viewports.desktop = await snapshotMetrics(page);
    await screenshot(page, "game-desktop.png");
    for (const [name, width, height, dpr] of [["wide", 3840, 2160, 2], ["compact", 1024, 768, 1], ["mobile", 390, 844, 1]]) {
      const responsive = await prepareContext({ width, height }, dpr, progressedSave);
      report.viewports[name] = await snapshotMetrics(responsive.page);
      await screenshot(responsive.page, `game-${name}.png`);
      await responsive.context.close();
    }
    for (const [name, metrics] of Object.entries(report.viewports)) {
      assert.ok(metrics.domNodes < 1500, `${name} DOM grew to ${metrics.domNodes} nodes.`);
      assert.ok(metrics.svgNodes < 120, `${name} should not rebuild the original SVG map.`);
      assert.ok(metrics.map.canvasPixels <= 2_400_000, `${name} exceeds the map pixel budget.`);
      assert.equal(metrics.map.provinceCount, 64);
      assert.equal(metrics.horizontalOverflowPx, 0);
      assert.ok(metrics.images.every((image) => image.loading === "lazy" && image.decoding === "async"));
    }
  });

  await check("Sixty small drag steps reuse the terrain cache and preserve simulation state", async () => {
    const before = await mapStats();
    const stateBefore = await readSave();
    const bounds = await page.locator("canvas[data-draw-count]").boundingBox();
    const start = { x: bounds.x + bounds.width * 0.35, y: bounds.y + bounds.height * 0.32 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const samples = [];
    for (let step = 1; step <= 60; step += 1) {
      await page.mouse.move(start.x + step * 1.5, start.y + step);
      await settle();
      samples.push((await mapStats()).drawMs);
    }
    await page.mouse.up();
    await settle();
    const after = await mapStats();
    assert.ok(after.drawCount > before.drawCount, "Dragging must actually redraw the map.");
    assert.ok(after.baseBuildCount - before.baseBuildCount <= 2, "A 90×60 px drag must mostly reuse the bounded terrain overscan cache.");
    assert.equal(after.geometrySignature, before.geometrySignature);
    assert.deepEqual(comparableRun(await readSave()), comparableRun(stateBefore));
    const sorted = [...samples].sort((a, b) => a - b);
    report.panPerformance = {
      steps: 60,
      drawCount: after.drawCount - before.drawCount,
      terrainRebuilds: after.baseBuildCount - before.baseBuildCount,
      drawMs: { min: sorted[0], p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) },
      samples,
    };
  });

  await check("No uncaught browser exceptions or failed HTTP responses", async () => {
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.httpFailures, []);
  });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack || error.message;
  if (page) await screenshot(page, "game-failure.png").catch(() => {});
  console.error(error.stack || error);
  process.exitCode = 1;
} finally {
  await writeFile(join(outputDirectory, "game-browser-report.json"), JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(`Report: ${join(outputDirectory, "game-browser-report.json")}`);
}
