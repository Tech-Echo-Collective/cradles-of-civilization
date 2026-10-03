import assert from "node:assert/strict";
import { createCampaign, firstAvailable, replayProof } from "./lib/ending-reachability-harness.mjs";

// All three policies read the public view and issue ordinary player commands.
// Difficulty, governor, seed and numerical mode are normal new-game settings.
// Neither the policy nor its evidence collector writes an engine/save field.
export const hiddenRoutes = [
  {
    id: "C",
    config: {
      seed: 1,
      difficulty: "ultimate",
      governorId: "black-man",
      aiAggression: "restrained",
      mapUiExpanded: false,
    },
    maxYears: 600,
  },
  {
    id: "I",
    config: {
      seed: 1,
      difficulty: "normal",
      governorId: "black-man",
      aiAggression: "restrained",
      mapUiExpanded: false,
    },
    maxYears: 1100,
  },
  {
    id: "J",
    config: {
      seed: 3,
      difficulty: "easy",
      governorId: "black-man",
      aiAggression: "restrained",
      mapUiExpanded: false,
    },
    maxYears: 2400,
  },
];

export function chooseHiddenAction(view, target) {
  const pick = (ids) => firstAvailable(view, ids);
  if (view.eco <= 0) return pick(["recovery"]);
  if (target === "C") {
    if (view.be > 15000) return pick(["suppressBelief", "economy", "population"]);
    if (view.eco < 13000) return pick(["economy", "suppressScience", "population"]);
    return pick(["suppressScience", "economy", "population"]);
  }
  if (target === "I") {
    if (view.eco < 18000) return pick(["economy", "suppressBelief", "population"]);
    if (view.pop < 4000) return pick(["population", "suppressBelief", "economy"]);
    return pick(["suppressBelief", "population", "economy"]);
  }
  if (target === "J") {
    if (view.eco < 30000) return pick(["economy", "arts", "population"]);
    if (view.pop < 7000) return pick(["population", "arts", "economy"]);
    if (view.stability < 25) return pick(["order", "arts", "balance"]);
    if (view.la < 18000) return pick(["arts", "economy", "balance"]);
    return pick(["economy", "arts", "population"]);
  }
  throw new Error(`Unsupported hidden ending ${target}`);
}

function archiveEvidence(entry, completed = true, finalSnapshot = entry.finalSnapshot) {
  return {
    civilization: entry.civilization,
    startTurn: entry.startTurn,
    turns: entry.turns,
    peakSc: Math.max(entry.peakSc, finalSnapshot?.sc || 0),
    peakLa: Math.max(entry.peakLa, finalSnapshot?.la || 0),
    hadLaCap: Boolean(entry.hadLaCap),
    finalOrder: finalSnapshot?.stability ?? null,
    collapseCause: entry.collapseCause,
    completed,
  };
}

export function runHiddenRoute(target, config, { maxYears = 2500, record = true } = {}) {
  const campaign = createCampaign(config, { record });
  const evidence = new Map();
  while (
    !campaign.view().finished &&
    campaign.view().turn < maxYears &&
    campaign.commandCount < maxYears * 3
  ) {
    const view = campaign.view();
    if (view.awaitingCivilizationRestart) campaign.api.executeAction("restartCivilization");
    else if (view.autoRunUntilCollapse) campaign.api.tickAutoRun();
    else {
      const action = chooseHiddenAction(view, target);
      assert.ok(action, `No legal action selected for ending ${target}`);
      campaign.api.executeAction(action);
    }
    // The game keeps only twelve completed generations in its save. Preserve
    // each real collapse as it happens so C's full eighteen can be audited.
    const archived = campaign.view().history[0];
    if (archived && !evidence.has(archived.civilization)) {
      evidence.set(archived.civilization, archiveEvidence(archived));
    }
  }
  const terminal = campaign.view();
  if (terminal.finished && !evidence.has(terminal.count)) {
    const current = terminal.currentCivilization;
    evidence.set(terminal.count, {
      ...archiveEvidence(current, false, terminal.finalEnding.snapshot),
      turns: terminal.turn - current.startTurn,
    });
  }
  campaign.civilizationEvidence = [...evidence.values()].sort(
    (a, b) => a.civilization - b.civilization,
  );
  return campaign;
}

export function verifyHiddenRoute(route) {
  const campaign = runHiddenRoute(route.id, route.config, route);
  const proof = campaign.proof();
  assert.equal(proof.ending, route.id, `Route ${route.id} did not reach its target`);
  const count = { C: 18, I: 16, J: 3 }[route.id];
  const qualifyingCivilizations = campaign.civilizationEvidence.slice(-count);
  assert.equal(qualifyingCivilizations.length, count);
  qualifyingCivilizations.forEach((entry, index) => {
    if (index > 0)
      assert.equal(entry.civilization, qualifyingCivilizations[index - 1].civilization + 1);
    if (route.id === "C") assert.ok(entry.completed && entry.turns >= 1 && entry.peakSc < 1600);
    if (route.id === "I") assert.ok(entry.finalOrder < 20);
    if (route.id === "J") assert.ok(entry.hadLaCap || entry.peakLa >= 18000);
  });
  // Replay from another freshly initialized engine, never an imported fixture.
  replayProof(proof);
  return {
    ...proof,
    qualifyingCivilizations,
    civilizationEvidence: campaign.civilizationEvidence,
    replayVerified: true,
  };
}
