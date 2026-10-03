import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createCampaign, firstAvailable, replayProof } from "./lib/ending-reachability-harness.mjs";

const PLAYER = "player-realm";

function act(campaign, priorities) {
  const view = campaign.view();
  const action = firstAvailable(view, priorities);
  assert.ok(action, `No legal action at year ${view.turn}: ${priorities.join(", ")}`);
  campaign.api.executeAction(action);
}

/**
 * A conservative treasury and recruitment policy, followed by normal expeditions.
 * Territorial inheritance after disasters is handled entirely by the real engine.
 * No route reads hidden state, imports a save, or changes any gameplay value.
 */
export function runConquestCampaign(campaign) {
  const { api } = campaign;
  api.setStrategy("expansion");
  for (let step = 0; step < 500 && !campaign.view().finished; step += 1) {
    let view = campaign.view();
    if (view.awaitingCivilizationRestart) {
      api.executeAction("restartCivilization");
      continue;
    }
    if (view.endingCandidate?.id === "K") {
      api.executeAction("settleEnding");
      continue;
    }

    const armies = view.visibleArmies
      .filter((army) => army.entityId === PLAYER)
      .sort((left, right) => right.force - left.force);
    const force = armies.reduce((sum, army) => sum + army.force, 0);
    const army = armies[0];
    if (army && view.selectedArmyId !== army.id) api.selectArmy(army.id);
    if (army && view.selectedRegionId !== army.regionId) api.selectProvince(army.regionId);
    view = campaign.view();

    if (view.economicCrisis) act(campaign, ["recovery", "economy", "balance"]);
    else if (view.stability < 48) act(campaign, ["balance", "order", "economy"]);
    else if (view.eco < 80000) act(campaign, ["economy", "recovery", "balance"]);
    else if (view.pop < 7000) act(campaign, ["balance", "population"]);
    else if (view.eerfLevel === 0) act(campaign, ["buildEerf", "balance"]);
    else if (force < 25000) act(campaign, ["levyHost", "trainLegion", "balance"]);
    else if (view.ownerCounts.player < 64)
      act(campaign, ["militaryCampaign", "economy", "balance"]);
    else act(campaign, ["levyHost", "trainLegion", "balance"]);
  }

  const final = campaign.view().finalEnding;
  assert.equal(final?.id, "K", "The conquest route must actually finish as K");
  assert.equal(final.mapUiExpanded, true);
  assert.equal(final.mapArchive.regions.length, 64);
  assert.equal(final.mapArchive.counts.player, 64);
  assert.ok(final.mapArchive.regions.every((region) => region.controllerId === PLAYER));
  assert.ok(final.military.force >= 18000);
  return campaign;
}

/** Public, visible intelligence only; the selected governor removes military fog. */
function recklessDeploymentTarget(view, army) {
  const regions = new Map(view.regions.map((region) => [region.id, region]));
  const defenseEstimate = (region) =>
    region.fortification +
    (view.visibleArmies.find(
      (unit) => unit.regionId === region.id && unit.entityId === region.controllerId,
    )?.force || 0) /
      100;
  const target = regions
    .get(army.regionId)
    .neighbors.map((id) => regions.get(id))
    .filter((region) => region.controllerId !== PLAYER)
    .sort((left, right) => defenseEstimate(right) - defenseEstimate(left))[0];
  if (target) return target.id;

  // One legal road step towards a frontier, rather than teleporting the army.
  const queue = [[army.regionId, null]];
  const visited = new Set([army.regionId]);
  while (queue.length) {
    const [id, firstStep] = queue.shift();
    for (const next of regions.get(id).neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      if (regions.get(next).controllerId !== PLAYER) return firstStep || next;
      queue.push([next, firstStep || next]);
    }
  }
  return null;
}

/**
 * A deliberately losing but legal policy: overextend the standing legion, never
 * levy replacements, and neglect order. The AI must capture the last province;
 * a disaster's temporary empty map does not count as the L ending.
 */
export function runExtinctionCampaign(campaign) {
  const { api } = campaign;
  api.setStrategy("trade");
  for (let step = 0; step < 1000 && !campaign.view().finished; step += 1) {
    let view = campaign.view();
    if (view.awaitingCivilizationRestart) {
      api.executeAction("restartCivilization");
      continue;
    }
    if (view.autoRunUntilCollapse) {
      api.tickAutoRun();
      continue;
    }
    const readyArmies = view.visibleArmies.filter(
      (army) => army.entityId === PLAYER && army.lastMovedTurn < view.turn,
    );
    for (const army of readyArmies) {
      if (campaign.view().finished) break;
      const target = recklessDeploymentTarget(campaign.view(), army);
      if (target) {
        api.selectArmy(army.id);
        api.deployArmy(target);
      }
    }
    view = campaign.view();
    if (view.finished) break;
    if (view.economicCrisis) act(campaign, ["recovery"]);
    else if (view.eco < 15000) act(campaign, ["economy", "balance"]);
    else if (view.sc > 12000) act(campaign, ["suppressScience", "economy"]);
    else act(campaign, ["suppressBelief", "economy", "balance"]);
  }

  const view = campaign.view();
  const final = view.finalEnding;
  assert.equal(final?.id, "L", "The losing route must actually finish as L");
  assert.equal(final.mapUiExpanded, true);
  assert.equal(view.awaitingCivilizationRestart, false);
  assert.equal(final.mapArchive.counts.player, 0);
  assert.ok(final.mapArchive.regions.every((region) => region.controllerId !== PLAYER));
  assert.equal(final.mapArchive.armies.filter((army) => army.entityId === PLAYER).length, 0);
  assert.equal(final.mapArchive.lastEvent.type, "lost");
  return campaign;
}

export const militaryRoutes = [
  {
    id: "K",
    name: "万王之王",
    config: {
      seed: 314159,
      realmName: "结局可达性验证国",
      difficulty: "easy",
      aiAggression: "restrained",
      governorId: "east-asian-man",
      mapUiExpanded: true,
      startingRegionId: "cb05",
    },
    expected: { years: 75, civilizations: 2, territories: 64, force: 50125 },
    run: runConquestCampaign,
  },
  {
    id: "L",
    name: "末代皇帝",
    config: {
      seed: 42,
      realmName: "结局可达性验证国",
      difficulty: "normal",
      aiAggression: "total",
      governorId: "listener",
      mapUiExpanded: true,
      startingRegionId: "nb01",
    },
    expected: { years: 236, civilizations: 9, territories: 0, force: 0 },
    run: runExtinctionCampaign,
  },
];

export function runMilitaryRoute(id, options) {
  const route = militaryRoutes.find((candidate) => candidate.id === id);
  assert.ok(route, `Unknown military ending: ${id}`);
  return route.run(createCampaign(route.config, options));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const requested = process.argv[2] ? [process.argv[2]] : militaryRoutes.map((route) => route.id);
  for (const id of requested) {
    const route = militaryRoutes.find((candidate) => candidate.id === id);
    const campaign = runMilitaryRoute(id);
    const proof = campaign.proof();
    const replayed = replayProof(proof);
    const final = replayed.view().finalEnding;
    const actual = {
      years: final.turn,
      civilizations: final.civilization,
      territories: final.mapArchive.counts.player,
      force: final.military.force,
    };
    assert.deepEqual(actual, route.expected);
    console.log(
      JSON.stringify({
        ending: id,
        ...actual,
        commands: proof.commandCount,
        freshReplay: "passed",
        config: route.config,
      }),
    );
  }
}
