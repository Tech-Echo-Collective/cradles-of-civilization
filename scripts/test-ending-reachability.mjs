import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  createCampaign,
  replayProof,
  reloadCompletedCampaign,
} from "./lib/ending-reachability-harness.mjs";
import { routes as knowledgeRoutes, runKnowledgeRoute } from "./ending-routes-knowledge.mjs";
import { cycleRoutes, runCycleRoute } from "./ending-routes-cycle.mjs";
import { hiddenRoutes, runHiddenRoute } from "./ending-routes-hidden.mjs";
import { militaryRoutes, runMilitaryRoute } from "./ending-routes-military.mjs";

const output = fileURLToPath(new URL("../ui-shell/test-results/", import.meta.url));
const RUN_KEY = "three-sun-chronicle:v1";
const ENDING_KEY = "three-sun-chronicle:ending:v1";
const report = {
  generatedAt: new Date().toISOString(),
  scope:
    "Existence of one reproducible legal new-game route per ending. Seeds, difficulty, governor and map mode vary; this is not a win-rate or every-seed guarantee.",
  cases: [],
  passed: false,
};
const names = createCampaign({ seed: 1, mapUiExpanded: false }).endingNames;
const cases = [
  ...knowledgeRoutes.map((route) => ({
    id: route.target,
    run: () => ({ proof: runKnowledgeRoute(route) }),
  })),
  ...cycleRoutes.map((route) => ({
    id: route.id,
    run: () => ({ campaign: runCycleRoute(route.id, route.config, route) }),
  })),
  ...hiddenRoutes.map((route) => ({
    id: route.id,
    run: () => ({ campaign: runHiddenRoute(route.id, route.config, route) }),
  })),
  ...militaryRoutes.map((route) => ({
    id: route.id,
    run: () => ({ campaign: runMilitaryRoute(route.id) }),
  })),
].sort((a, b) => a.id.localeCompare(b.id));
assert.deepEqual(
  cases.map((item) => item.id),
  Object.keys(names).sort(),
  "All defined endings must have exactly one fresh-game route",
);
const requestedCase = process.argv.find((argument) => argument.startsWith("--case="))?.slice(7);

// Give each engine/replay/reload audit its own process. This avoids retaining
// several heavy VM worlds in a long-running process and keeps cases isolated.
if (!requestedCase) {
  await mkdir(output, { recursive: true });
  try {
    for (const item of cases) {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [fileURLToPath(import.meta.url), `--case=${item.id}`],
        { maxBuffer: 1024 * 1024 },
      );
      process.stdout.write(stdout);
      const one = JSON.parse(
        await readFile(join(output, `ending-reachability-${item.id}.json`), "utf8"),
      );
      assert.equal(one.passed, true);
      assert.equal(one.cases[0].id, item.id);
      report.cases.push(one.cases[0]);
    }
    report.passed = true;
  } catch (error) {
    report.error = error.stack || error.message;
    throw error;
  } finally {
    await writeFile(join(output, "ending-reachability.json"), JSON.stringify(report, null, 2));
  }
  console.log(`All ${report.cases.length} endings are reachable from legal fresh campaigns.`);
  process.exit(0);
}
assert.ok(
  cases.some((item) => item.id === requestedCase),
  `Unknown ending case ${requestedCase}`,
);

function evidenceFor(id, state, generations) {
  const result = {};
  if (["C", "I", "J"].includes(id)) {
    const count = { C: 18, I: 16, J: 3 }[id];
    assert.ok(generations);
    const last = generations.slice(-count);
    assert.equal(last.length, count);
    last.forEach((generation, index) => {
      if (index) assert.equal(generation.civilization, last[index - 1].civilization + 1);
      if (id === "C")
        assert.ok(generation.completed && generation.turns >= 1 && generation.peakSc < 1600);
      if (id === "I") assert.ok(generation.finalOrder < 20);
      if (id === "J") assert.ok(generation.hadLaCap || generation.peakLa >= 18000);
    });
    result.qualifyingCivilizations = last;
    result.observedCivilizations = generations;
  }
  if (["K", "L"].includes(id)) {
    const owned = state.map.regions.filter((region) => region.controllerId === "player-realm");
    const armies = state.military.armies.filter((army) => army.entityId === "player-realm");
    const force = armies.reduce((sum, army) => sum + army.force, 0);
    assert.equal(state.mapUiExpanded, true);
    assert.equal(owned.length, id === "K" ? 64 : 0);
    if (id === "K") assert.ok(force >= 18000);
    else {
      assert.equal(armies.length, 0);
      assert.equal(state.awaitingCivilizationRestart, false);
      assert.equal(state.map.lastEvent.type, "lost", "L must come from losing territory in war");
    }
    Object.assign(result, {
      provinces: owned.length,
      force,
      lastMilitaryEvent: state.map.lastEvent,
    });
  }
  return result;
}

await mkdir(output, { recursive: true });
try {
  for (const item of cases.filter((item) => item.id === requestedCase)) {
    const started = performance.now();
    const original = item.run();
    const proof = original.proof || original.campaign.proof();
    assert.equal(proof.ending, item.id, `New-game route must actually finish with ${item.id}`);
    assert.ok(proof.commands.length > 0);
    assert.equal(proof.commands.length, proof.commandCount);
    // These commands are replayed through the same public API as React. The
    // harness forbids imports and exposes no mutating private engine functions.
    const replayed = replayProof(proof);
    const view = replayed.view(),
      terminalSave = replayed.state();
    assert.equal(view.finished, true);
    assert.equal(view.finalEnding.id, item.id);
    assert.equal(
      view.endingStats.endings[item.id],
      1,
      "Replay must record the ending exactly once",
    );
    assert.equal(replayed.storage.has(RUN_KEY), false);
    assert.equal(JSON.parse(replayed.storage.get(ENDING_KEY)).id, item.id);
    const restored = reloadCompletedCampaign(replayed.storage).view();
    assert.equal(restored.finished, true);
    assert.equal(restored.finalEnding.id, item.id);
    assert.deepEqual(
      JSON.parse(JSON.stringify(restored.finalEnding)),
      JSON.parse(JSON.stringify(view.finalEnding)),
    );
    assert.equal(restored.geometry.signature, view.geometry.signature);
    assert.ok(
      view.actions.every((action) => action.disabledReason),
      "A finished run must reject further annual decisions",
    );
    const evidence = evidenceFor(item.id, terminalSave, original.campaign?.civilizationEvidence);
    const actionCounts = proof.commands.reduce((counts, [method, argument]) => {
      const key = method === "executeAction" ? argument : method;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    report.cases.push({
      id: item.id,
      name: names[item.id].name,
      passed: true,
      replayVerified: true,
      reloadVerified: true,
      durationMs: Math.round(performance.now() - started),
      proof,
      evidence,
      trigger: view.finalEnding.trigger,
      actionCounts,
      terminalSave,
      storage: [...replayed.storage],
    });
    console.log(
      `PASS ${item.id} ${names[item.id].name}: ${proof.years} years / ${proof.civilizations} civilizations / ${proof.commandCount} legal commands; replay + reload`,
    );
  }
  report.passed = true;
} catch (error) {
  report.error = error.stack || error.message;
  throw error;
} finally {
  await writeFile(
    join(output, `ending-reachability-${requestedCase}.json`),
    JSON.stringify(report, null, 2),
  );
}
