import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { civilizations, MIN_YEAR, MAX_YEAR, INITIAL_YEAR } from "../src/data/demo.js";

// This is a local production-browser regression and performance smoke check.
// Timings depend on the host; they are not Lighthouse scores or real-device FPS.
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:4173";
const outputDirectory = fileURLToPath(new URL("../test-results/", import.meta.url));
await mkdir(outputDirectory, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  target: baseUrl,
  scope:
    "Local Chromium production-preview smoke check; not Lighthouse or real-device benchmarking.",
  checks: [],
  errors: [],
  httpFailures: [],
  screenshots: [],
  viewports: {},
};
let browser;
let page;

async function check(name, run) {
  const start = performance.now();
  try {
    const detail = await run();
    report.checks.push({
      name,
      passed: true,
      durationMs: Math.round(performance.now() - start),
      ...(detail ? { detail } : {}),
    });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({
      name,
      passed: false,
      durationMs: Math.round(performance.now() - start),
      error: error.message,
    });
    throw error;
  }
}

async function prepareContext(viewport, deviceScaleFactor = 1) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    window.__atlasSmoke = { longTasks: [], lcp: null };
    try {
      new PerformanceObserver((list) => {
        window.__atlasSmoke.longTasks.push(
          ...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })),
        );
      }).observe({ type: "longtask", buffered: true });
    } catch {
      /* This browser may not expose long tasks. */
    }
    try {
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last)
          window.__atlasSmoke.lcp = {
            startTime: last.startTime,
            size: last.size,
            tagName: last.element?.tagName ?? null,
          };
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* LCP is supplementary and is not used as a timing threshold. */
    }
  });
  const tab = await context.newPage();
  tab.on("pageerror", (error) =>
    report.errors.push({ type: "pageerror", message: error.message, viewport }),
  );
  tab.on("response", (response) => {
    if (response.status() >= 400)
      report.httpFailures.push({ url: response.url(), status: response.status(), viewport });
  });
  const demoUrl = new URL(baseUrl);
  demoUrl.searchParams.set("demo", "1");
  await tab.goto(demoUrl.href, { waitUntil: "networkidle" });
  await tab.locator("canvas[data-draw-count]").waitFor();
  await tab.evaluate(() => document.fonts.ready);
  await tab.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return { context, page: tab };
}

async function mapStats(tab = page) {
  return tab.locator("canvas").evaluate((canvas) => ({
    drawCount: Number(canvas.dataset.drawCount),
    drawMs: Number(canvas.dataset.drawMs),
    visibleMarkers: Number(canvas.dataset.visibleMarkers),
    totalMarkers: Number(canvas.dataset.totalMarkers),
    canvasPixels: canvas.width * canvas.height,
    width: canvas.width,
    height: canvas.height,
    zoom: Number(canvas.dataset.zoom),
    longitude: Number(canvas.dataset.centerLongitude),
    latitude: Number(canvas.dataset.centerLatitude),
    markers: JSON.parse(canvas.dataset.markerPositions || "[]"),
  }));
}

async function afterDraw(previousCount, tab = page) {
  await tab.waitForFunction(
    (count) => Number(document.querySelector("canvas")?.dataset.drawCount) > count,
    previousCount,
  );
  return mapStats(tab);
}

async function clickAndDraw(locator, tab = page) {
  // Settle React's pending effects before taking the baseline. An unrelated
  // queued paint must not stand in for the interaction being verified.
  await tab.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const before = await mapStats(tab);
  await locator.click();
  await afterDraw(before.drawCount, tab);
  await tab.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return mapStats(tab);
}

async function waitForMapCenter(position, tab = page) {
  await tab.waitForFunction(([longitude, latitude]) => {
    const dataset = document.querySelector("canvas")?.dataset;
    return (
      dataset &&
      Math.abs(Number(dataset.centerLongitude) - longitude) < 0.02 &&
      Math.abs(Number(dataset.centerLatitude) - latitude) < 0.02
    );
  }, position);
  return mapStats(tab);
}

async function detailsAre(civilization) {
  await page
    .locator(".detail-panel")
    .getByRole("heading", { name: civilization.name, exact: true })
    .waitFor();
  await page.waitForFunction((name) => {
    const image = document.querySelector(".detail-panel img");
    return image?.alt.includes(name) && image.complete && image.naturalWidth > 0;
  }, civilization.name);
  assert.equal(await page.locator(".detail-panel img").getAttribute("loading"), "lazy");
}

async function snapshotMetrics(tab) {
  const metrics = await tab.evaluate(() => {
    const resources = performance.getEntriesByType("resource");
    const navigation = performance.getEntriesByType("navigation")[0];
    const images = [...document.images].map((image) => ({
      src: new URL(image.src).pathname,
      loading: image.loading,
      decoding: image.decoding,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));
    const totals = resources.reduce(
      (sum, resource) => ({
        transferBytes: sum.transferBytes + resource.transferSize,
        encodedBytes: sum.encodedBytes + resource.encodedBodySize,
        decodedBytes: sum.decodedBytes + resource.decodedBodySize,
      }),
      {
        transferBytes: navigation?.transferSize || 0,
        encodedBytes: navigation?.encodedBodySize || 0,
        decodedBytes: navigation?.decodedBodySize || 0,
      },
    );
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      domNodes: document.querySelectorAll("*").length,
      svgNodes: document.querySelectorAll("svg").length,
      canvasElements: document.querySelectorAll("canvas").length,
      images,
      resources: {
        count: resources.length,
        ...totals,
        entries: resources.map((entry) => ({
          name: new URL(entry.name).pathname,
          type: entry.initiatorType,
          transferBytes: entry.transferSize,
          durationMs: Number(entry.duration.toFixed(2)),
        })),
      },
      heap: performance.memory
        ? {
            usedBytes: performance.memory.usedJSHeapSize,
            totalBytes: performance.memory.totalJSHeapSize,
            limitBytes: performance.memory.jsHeapSizeLimit,
          }
        : null,
      firstContentfulPaintMs:
        performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      largestContentfulPaint: window.__atlasSmoke?.lcp ?? null,
      longTasks: window.__atlasSmoke?.longTasks ?? [],
    };
  });
  metrics.map = await mapStats(tab);
  metrics.estimatedCanvasBackingStoreBytes = metrics.map.canvasPixels * 4 * 2 + 160 * 160 * 4;
  return metrics;
}

async function screenshot(tab, filename) {
  await tab.screenshot({ path: join(outputDirectory, filename), fullPage: true });
  report.screenshots.push(filename);
}

const percentile = (values, percent) =>
  values.length
    ? [...values].sort((a, b) => a - b)[
        Math.min(values.length - 1, Math.ceil(values.length * percent) - 1)
      ]
    : null;

try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}),
  });
  const desktop = await prepareContext({ width: 1440, height: 900 });
  page = desktop.page;
  page.setDefaultTimeout(10_000);

  await check("Initial Egypt profile, lazy artwork, and bounded page complexity", async () => {
    await detailsAre(civilizations[0]);
    assert.equal(
      await page.getByRole("slider", { name: "Historical year" }).inputValue(),
      String(INITIAL_YEAR),
    );
    assert.match(await page.locator(".brand").innerText(), /CUNABULA\s*CIVILITATIS/);
    report.viewports.desktop = await snapshotMetrics(page);
    const metrics = report.viewports.desktop;
    assert.ok(metrics.domNodes < 1000, `Unexpected DOM growth: ${metrics.domNodes}`);
    assert.ok(metrics.svgNodes < 120, `Unexpected SVG growth: ${metrics.svgNodes}`);
    assert.equal(metrics.canvasElements, 1, "The geographic map should use one visible canvas.");
    assert.ok(
      metrics.images.every((image) => image.loading === "lazy" && image.decoding === "async"),
    );
    assert.ok(metrics.map.canvasPixels <= 2_400_000);
    assert.equal(metrics.horizontalOverflowPx, 0);
    await screenshot(page, "desktop.png");
  });

  await check("Each civilization can be selected and its artwork updates", async () => {
    for (let index = 0; index < civilizations.length; index += 1) {
      await page.locator(".civ-item").nth(index).click();
      await detailsAre(civilizations[index]);
      await waitForMapCenter(civilizations[index].position);
      assert.equal(await page.locator(".civ-item").nth(index).getAttribute("aria-pressed"), "true");
    }
  });

  await check("Culture and chronicle panels, including keyboard tab navigation", async () => {
    const civilization = civilizations.at(-1);
    await page.getByRole("tab", { name: "culture", exact: true }).click();
    assert.ok((await page.getByRole("tabpanel").innerText()).includes(civilization.writing));
    assert.equal(await page.locator(".achievement").count(), civilization.achievements.length);
    await page.getByRole("tab", { name: "chronicle", exact: true }).click();
    assert.ok((await page.locator(".detail-timeline").count()) > 0);
    await page.getByRole("tab", { name: "chronicle", exact: true }).press("ArrowLeft");
    assert.equal(
      await page.getByRole("tab", { name: "culture", exact: true }).getAttribute("aria-selected"),
      "true",
    );
    await page.getByRole("tab", { name: "culture", exact: true }).press("ArrowLeft");
    assert.equal(
      await page.getByRole("tab", { name: "overview", exact: true }).getAttribute("aria-selected"),
      "true",
    );
  });

  await check("Minimum year has empty events; playback stops at the maximum year", async () => {
    const slider = page.getByRole("slider", { name: "Historical year" });
    await slider.focus();
    await slider.press("Home");
    assert.equal(await slider.inputValue(), String(MIN_YEAR));
    assert.equal(
      await page.getByRole("button", { name: "Step back 100 years", exact: true }).isDisabled(),
      true,
    );
    await page.locator(".event-empty").waitFor();
    assert.equal(await page.locator(".event-card").count(), 0);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Chronicle", exact: true })
      .click();
    assert.ok(
      (await page.locator(".atlas-drawer").innerText()).includes("first page is still unwritten"),
    );
    await page.getByRole("button", { name: "Close atlas panel" }).click();
    await slider.focus();
    await slider.press("End");
    await slider.press("ArrowLeft");
    assert.equal(await slider.inputValue(), String(MAX_YEAR - 25));
    await page.getByRole("button", { name: "4×", exact: true }).click();
    await page.getByRole("button", { name: "Play timeline", exact: true }).click();
    await page.waitForFunction(
      (max) => document.querySelector('input[type="range"]').value === String(max),
      MAX_YEAR,
    );
    await page.getByRole("button", { name: "Play timeline", exact: true }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Step forward 100 years", exact: true }).isDisabled(),
      true,
    );
    const atEnd = await slider.inputValue();
    await page.waitForTimeout(500);
    assert.equal(await slider.inputValue(), atEnd);
    await page
      .locator(".timeline-ticks")
      .getByRole("button", { name: "2,500 BCE", exact: true })
      .click();
    await page.getByRole("button", { name: "1×", exact: true }).click();
  });

  await check("Event modal returns to the matching civilization and moment", async () => {
    await page.locator(".civ-item").first().click();
    await page.locator(".event-card").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "A monument to eternity", exact: true }).waitFor();
    assert.ok((await dialog.innerText()).includes("Illustrative event"));
    await dialog.getByRole("button", { name: "View this moment in the atlas" }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await detailsAre(civilizations[0]);
    await waitForMapCenter(civilizations[0].position);
    assert.equal(await page.getByRole("slider", { name: "Historical year" }).inputValue(), "-2500");
    await clickAndDraw(page.getByRole("button", { name: "Reset map view" }));
    await page.getByRole("button", { name: "Locate on map", exact: true }).click();
    const focused = await waitForMapCenter(civilizations[0].position);
    assert.ok(Math.abs(focused.longitude - civilizations[0].position[0]) < 0.02);
  });

  await check(
    "Dossier city buttons focus their actual city, then civilization selection restores its center",
    async () => {
      const egypt = civilizations.find(({ id }) => id === "egypt");
      const thebes = egypt.cities.find(({ id }) => id === "thebes");
      await page.getByRole("button", { name: "Explore Egypt", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: egypt.name, exact: true }).waitFor();
      assert.equal(await dialog.locator("img").getAttribute("loading"), "lazy");
      await dialog.getByRole("button", { name: thebes.name, exact: true }).click();
      await page.waitForFunction(() => !document.querySelector("dialog"));
      const cityView = await waitForMapCenter(thebes.position);
      assert.ok(
        Math.abs(cityView.longitude - egypt.position[0]) > 0.5,
        "The city action must focus Thebes rather than the civilization center.",
      );
      await page.locator(".civ-item").first().click();
      await waitForMapCenter(egypt.position);
      report.cityFocus = { city: thebes.name, position: [cityView.longitude, cityView.latitude] };
    },
  );

  await check("Civilization search includes river names and a useful empty state", async () => {
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Civilizations", exact: true })
      .click();
    const search = page.getByRole("textbox", { name: "Find a civilization" });
    await search.fill("Nile");
    assert.equal(await page.locator(".drawer-civ").count(), 1);
    assert.ok((await page.locator(".drawer-civ").innerText()).includes("Ancient Egypt"));
    await search.fill("no-such-civilization");
    assert.equal(await page.locator(".drawer-civ").count(), 0);
    assert.ok(
      (await page.locator(".atlas-drawer .empty-note").innerText()).includes(
        "No civilizations match",
      ),
    );
    await search.fill("");
    assert.equal(await page.locator(".drawer-civ").count(), 4);
    await page.getByRole("button", { name: "Close atlas panel" }).click();
  });

  await check("Collection bookmark survives reload and can be removed", async () => {
    await page
      .getByRole("button", { name: "Save civilization to collection", exact: true })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /My collection/ })
      .click();
    assert.equal(await page.locator(".drawer-civ").count(), 1);
    assert.ok((await page.locator(".drawer-civ").innerText()).includes("Ancient Egypt"));
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Remove civilization from collection", exact: true })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /My collection/ })
      .click();
    assert.equal(await page.locator(".drawer-civ").count(), 0);
    assert.ok(
      (await page.locator(".atlas-drawer .empty-note").innerText()).includes(
        "Keep a civilization close",
      ),
    );
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem("cunabula.ui.collection.v1"))),
      [],
    );
    await page.getByRole("button", { name: "Close atlas panel" }).click();
  });

  await check("Settings change labels and route visibility; trade navigation works", async () => {
    await page.getByRole("button", { name: "Atlas settings" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .locator(".setting-row")
      .filter({ hasText: "Place names" })
      .getByRole("checkbox")
      .uncheck();
    await dialog
      .locator(".setting-row")
      .filter({ hasText: "Trade routes overlay" })
      .getByRole("checkbox")
      .check();
    await dialog.getByRole("button", { name: "Close dialog" }).click();
    assert.equal(
      await page.getByRole("button", { name: "Toggle map labels" }).getAttribute("aria-pressed"),
      "false",
    );
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Trade routes", exact: true })
      .click();
    await page.locator(".trade-note").waitFor();
    assert.equal(
      await page
        .locator(".map-layer-switch")
        .getByRole("button", { name: "Trade", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.getByRole("button", { name: "Close trade note" }).click();
    await page.getByRole("button", { name: "Atlas settings" }).click();
    await page
      .getByRole("dialog")
      .locator(".setting-row")
      .filter({ hasText: "Place names" })
      .getByRole("checkbox")
      .check();
    const routes = page
      .getByRole("dialog")
      .locator(".setting-row")
      .filter({ hasText: "Trade routes overlay" })
      .getByRole("checkbox");
    assert.equal(await routes.isChecked(), true);
    await routes.uncheck();
    await page.getByRole("button", { name: "Close dialog" }).click();
  });

  await check("Map marker selection, zoom, reset, and viewport culling", async () => {
    const initial = await clickAndDraw(page.getByRole("button", { name: "Reset map view" }));
    assert.equal(initial.totalMarkers, 16);
    assert.equal(initial.visibleMarkers, initial.totalMarkers);
    assert.equal(initial.markers.length, 4);
    const marker = initial.markers.find(({ id }) => id === "indus");
    const box = await page.locator("canvas").boundingBox();
    await page.mouse.click(box.x + marker.x, box.y + marker.y);
    await detailsAre(civilizations[2]);
    const zoomed = await clickAndDraw(page.getByRole("button", { name: "Zoom in", exact: true }));
    assert.ok(zoomed.zoom > initial.zoom);
    const zoomedOut = await clickAndDraw(
      page.getByRole("button", { name: "Zoom out", exact: true }),
    );
    assert.ok(zoomedOut.zoom < zoomed.zoom);
    await page.locator(".civ-item").first().click();
    for (let i = 0; i < 6; i += 1)
      await clickAndDraw(page.getByRole("button", { name: "Zoom in", exact: true }));
    const culled = await mapStats();
    assert.ok(
      culled.visibleMarkers < culled.totalMarkers,
      "Zooming into Egypt must stop drawing offscreen markers.",
    );
    assert.ok(culled.visibleMarkers > 0, "The focused civilization should remain visible.");
    report.markerCulling = { initial, focused: culled };
    await clickAndDraw(page.getByRole("button", { name: "Reset map view" }));
  });

  await check("Sixty mouse pan steps produce measured draws, then the map stays idle", async () => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    const initial = await mapStats();
    const centerX = box.x + box.width * 0.5;
    const centerY = box.y + box.height * 0.46;
    await page.mouse.move(centerX - 120, centerY);
    await page.mouse.down();
    const samples = [];
    let lastCount = initial.drawCount;
    for (let i = 1; i <= 60; i += 1) {
      await page.mouse.move(centerX - 120 + i * 4, centerY + Math.sin(i / 10) * 10);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const stats = await mapStats();
      if (stats.drawCount > lastCount) samples.push(stats.drawMs);
      lastCount = stats.drawCount;
    }
    await page.mouse.up();
    const moved = await mapStats();
    assert.ok(samples.length >= 45, `Expected measured drag draws, received ${samples.length}.`);
    assert.notEqual(moved.longitude, initial.longitude);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(250);
    const idleStart = await mapStats();
    await page.waitForTimeout(1100);
    const idleEnd = await mapStats();
    assert.equal(
      idleEnd.drawCount,
      idleStart.drawCount,
      "A paused and untouched map must not redraw continuously.",
    );
    report.panPerformance = {
      steps: 60,
      measuredFrames: samples.length,
      drawMs: {
        min: Math.min(...samples),
        p50: percentile(samples, 0.5),
        p95: percentile(samples, 0.95),
        max: Math.max(...samples),
      },
      samples,
      idleWindowMs: 1100,
      idleDraws: idleEnd.drawCount - idleStart.drawCount,
    };
    report.afterInteractions = await snapshotMetrics(page);
  });

  await check("Responsive views remain within the window and canvas pixel ceiling", async () => {
    for (const [name, viewport, dpr] of [
      ["wide", { width: 3840, height: 2160 }, 2],
      ["compact", { width: 1024, height: 768 }, 1],
      ["mobile", { width: 390, height: 844 }, 1],
    ]) {
      const view = await prepareContext(viewport, dpr);
      const metrics = await snapshotMetrics(view.page);
      report.viewports[name] = metrics;
      await screenshot(view.page, `${name}.png`);
      assert.equal(metrics.horizontalOverflowPx, 0, `${name} must not overflow horizontally.`);
      assert.ok(
        metrics.map.canvasPixels > 0 && metrics.map.canvasPixels <= 2_400_000,
        `${name} exceeds its canvas pixel ceiling.`,
      );
      assert.equal(metrics.viewport.dpr, dpr);
      assert.ok(
        metrics.images.every((image) => image.loading === "lazy" && image.decoding === "async"),
      );
      await view.context.close();
    }
  });

  await check("No uncaught browser exceptions or failed HTTP responses", async () => {
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.httpFailures, []);
  });
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = { message: error.message, stack: error.stack };
  console.error(error);
  if (page && !page.isClosed()) {
    try {
      await screenshot(page, "failure.png");
    } catch {
      /* Preserve the original failure. */
    }
  }
  process.exitCode = 1;
} finally {
  await writeFile(
    join(outputDirectory, "browser-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await browser?.close();
  console.log(`Report: ${join(outputDirectory, "browser-report.json")}`);
}
