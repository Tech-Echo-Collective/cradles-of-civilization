import { createCampaign, firstAvailable, replayProof } from "./lib/ending-reachability-harness.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// These policies observe the public presentation snapshot and issue only player
// commands. They never edit a save, replace randomness, or manufacture an ending.
export const targetStrategies = Object.freeze({
  A: "science",
  B: "belief",
  D: "exodus-science",
  E: "exodus-belief",
  H: "authority",
});

function maintain(view, preferred) {
  const pick = (ids) => firstAvailable(view, ids);
  if (view.eco <= 0) return pick(["recovery"]);
  if (view.eco < 68000) return pick(["economy", "balance", preferred]);
  if (view.pop < 8500) return pick(["population", "balance", preferred]);
  if (view.stability < 28) return pick(["order", "balance", preferred]);
  if (view.eerfLevel <= 0 && view.eco > 135000 && pick(["buildEerf"])) return "buildEerf";
  if (view.eerfLevel > 0 && view.eerfLevel < 5 && view.eco > 155000 && pick(["upgradeEerf"]))
    return "upgradeEerf";
  return pick([preferred, "balance", "economy", "population", "hibernate"]);
}

function strategicEerf(view) {
  if (view.eerfLevel <= 0 && view.eco > 135000 && firstAvailable(view, ["buildEerf"]))
    return "buildEerf";
  if (
    view.eerfLevel > 0 &&
    view.eerfLevel < 5 &&
    view.eco > 165000 &&
    firstAvailable(view, ["upgradeEerf"])
  )
    return "upgradeEerf";
  return null;
}

export function chooseKnowledgeAction(view, target) {
  const pick = (ids) => firstAvailable(view, ids);
  if (view.eco <= 0) return pick(["recovery"]);
  if (target === "A") {
    if (view.be > 7600 && pick(["suppressBelief"])) return "suppressBelief";
    return maintain(view, "science");
  }
  if (target === "B") {
    if (view.sc > 7600 && pick(["suppressScience"])) return "suppressScience";
    return maintain(view, "belief");
  }
  const eerf = strategicEerf(view);
  if (eerf) return eerf;
  if (view.pop < 10500) return pick(["population", "balance", "economy"]);
  if (target === "D") {
    if (view.eco < 110000) return pick(["economy", "balance", "science"]);
    if (view.be > 8200) return pick(["suppressBelief", "science"]);
    return pick(["science", "balance", "economy"]);
  }
  if (target === "E") {
    if (view.stability < 62) return pick(["order", "belief", "balance"]);
    if (view.sc > 8200) return pick(["suppressScience", "belief"]);
    return pick(["belief", "balance", "economy"]);
  }
  if (target === "H") {
    if (view.stability < 82) return pick(["order", "balance", "science"]);
    if (view.be > 6500) return pick(["suppressBelief", "science"]);
    if (view.sc >= 15000) return pick(["order", "economy", "population"]);
    return pick(["science", "order", "economy"]);
  }
  throw new Error(`Unsupported knowledge ending ${target}`);
}

export function runKnowledgeRoute({
  target,
  config,
  maxYears = 720,
  record = true,
  politicalStrategy = null,
  numericAfterStrategy = false,
}) {
  const campaign = createCampaign(config, { record });
  if (politicalStrategy) campaign.api.setStrategy(politicalStrategy);
  if (numericAfterStrategy) campaign.api.setMapExpanded(false);
  let stopReason = null;
  while (
    !campaign.view().finished &&
    campaign.view().turn < maxYears &&
    campaign.commandCount < maxYears * 4
  ) {
    const view = campaign.view();
    if (view.awaitingCivilizationRestart) {
      campaign.api.executeAction("restartCivilization");
    } else if (view.autoRunUntilCollapse) {
      campaign.api.tickAutoRun();
    } else if (view.endingCandidate?.id === target) {
      campaign.api.executeAction("settleEnding");
    } else {
      const action = chooseKnowledgeAction(view, target);
      if (!action) {
        stopReason = "No legal action selected";
        break;
      }
      campaign.api.executeAction(action);
    }
  }
  const proof = campaign.proof();
  const view = campaign.view();
  return {
    ...proof,
    target,
    success: proof.ending === target,
    stopReason,
    finalMetrics: {
      sc: view.sc,
      be: view.be,
      la: view.la,
      pop: view.pop,
      eco: view.eco,
      order: view.stability,
      eerf: view.eerfLevel,
    },
    politicalStrategy,
    numericAfterStrategy,
  };
}

// Each opens in the user-selectable numerical mode. No strategy or mode change
// is hidden in setup; the governor and restrained AI are explicitly disclosed.
export const routes = ["A", "B", "D", "E", "H"].map((target) =>
  Object.freeze({
    target,
    strategy: targetStrategies[target],
    config: Object.freeze({
      seed: 100003,
      difficulty: "normal",
      aiAggression: "restrained",
      governorId: target === "B" || target === "E" ? "white-woman" : "east-asian-man",
      mapUiExpanded: false,
    }),
    maxYears: 720,
  }),
);

export function replayKnowledgeRoutes() {
  return routes.map((route) => {
    const proof = runKnowledgeRoute(route);
    if (!proof.success)
      throw new Error(
        `Ending ${route.target} was not reached: ${proof.ending || proof.stopReason || "year limit"}`,
      );
    replayProof(proof);
    return proof;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const proofs = replayKnowledgeRoutes();
  const report = {
    scope:
      "Legal public-host commands from newly founded campaigns; no imports, injected state, patched rules, or forced endings.",
    replayVerified: true,
    routes: process.argv.includes("--proofs")
      ? proofs
      : proofs.map(({ commands, ...proof }) => ({
          ...proof,
          actionCounts: commands.reduce((counts, [method, action]) => {
            const key = method === "executeAction" ? action : method;
            counts[key] = (counts[key] || 0) + 1;
            return counts;
          }, {}),
        })),
  };
  console.log(JSON.stringify(report, null, 2));
}
