import { createCampaign, firstAvailable } from "./lib/ending-reachability-harness.mjs";

export function runCycleRoute(target, config, { maxYears = 2500, record = true } = {}) {
  const campaign = createCampaign(config, { record });
  for (let guard = 0; guard < maxYears * 3; guard += 1) {
    const view = campaign.view();
    if (view.finished || view.turn >= maxYears) break;
    if (view.awaitingCivilizationRestart) {
      campaign.api.executeAction("restartCivilization");
      continue;
    }
    if (view.autoRunUntilCollapse) {
      campaign.api.tickAutoRun();
      continue;
    }
    if (view.endingCandidate?.id === target) {
      campaign.api.executeAction("settleEnding");
      continue;
    }
    let preferred;
    if (view.eco <= 0) preferred = ["recovery"];
    else if (target === "F") {
      if (view.eco < 68000) preferred = ["economy", "balance"];
      else if (view.pop < 8500) preferred = ["population", "balance"];
      else if (view.stability < 28) preferred = ["order", "balance"];
      else if (view.eerfLevel <= 0 && view.eco > 135000) preferred = ["buildEerf", "balance"];
      else if (view.eerfLevel > 0 && view.eerfLevel < 5 && view.eco > 155000)
        preferred = ["upgradeEerf", "balance"];
      else preferred = ["balance", "economy", "population", "hibernate"];
    } else {
      preferred = ["balance", "economy", "hibernate"];
    }
    const action = firstAvailable(view, preferred);
    if (!action) break;
    campaign.api.executeAction(action);
  }
  return campaign;
}

export const cycleRoutes = [
  { id: "F", config: { seed: 314159, difficulty: "normal", mapUiExpanded: false }, maxYears: 500 },
  { id: "G", config: { seed: 1058, difficulty: "normal", mapUiExpanded: false }, maxYears: 300 },
];
