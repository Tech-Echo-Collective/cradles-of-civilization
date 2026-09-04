import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
const context = vm.createContext({});
context.globalThis = context;

vm.runInContext(read("balance-model.js"), context, { filename: "balance-model.js" });
vm.runInContext(read("map-lab/map-data.js"), context, { filename: "map-data.js" });
vm.runInContext(read("map-lab/map-model.js"), context, { filename: "map-model.js" });

const data = context.CRADLES_MAP_LAB_DATA;
const model = context.CRADLES_MAP_LAB_MODEL;
assert.ok(data && model, "map lab data and model must load without a browser");

const formalGameSource = read("game.js");
const formalIndexSource = read("index.html");
assert.doesNotMatch(
  formalGameSource,
  /STRATEGIC_MAP_MODEL\.(?:createScenario|classifyArmyDestination|executeArmyMove|executeArmyBattle|executeRecruitment|executeAiPhase)\s*\(/u,
  "the formal map view must never call map-lab scenario or mutation APIs"
);
assert.doesNotMatch(formalGameSource, /dom\.worldMap\.innerHTML\s*=/u, "formal renders must preserve the stable SVG scene and camera bindings");
assert.match(formalGameSource, /querySelectorAll\("\.strategic-map-modes button\[data-strategic-map-mode\]"\)/u, "mode bindings must target buttons without binding the map-state root");
assert.match(formalGameSource, /activeMapRoads\(\)\.forEach\(\(road\)/u, "formal map roads must come from the authoritative 167-edge topology");
assert.match(formalGameSource, /STRATEGIC_GEOGRAPHY\.sharedEdges\.forEach/u, "formal political borders must use the fixed geography edges");
assert.match(formalIndexSource, /id="strategicMapSvg"[^>]*viewBox="0 0 1200 760"/u, "the formal page must expose the fixed 1200x760 SVG map");
assert.ok(
  formalIndexSource.indexOf('id="strategicProvinceLayer"') < formalIndexSource.indexOf('id="strategicProvinceReliefLayer"'),
  "formal relief sidewalls must render above province top faces so internal height remains visible"
);
assert.equal((formalIndexSource.match(/data-strategic-map-mode="(?:political|terrain|military)"/gu) || []).length, 4, "formal HTML must expose three mode buttons and one view-state root");
assert.doesNotMatch(formalIndexSource, /id="endPhaseButton"|id="recruitButton"|id="seedForm"/u, "the formal map must not duplicate map-lab turn, recruitment, or seed controls");

function sampleLandSubpaths(pathData, steps = 24) {
  const tokens = pathData.match(/[MCZ]|-?\d+(?:\.\d+)?/gu) || [];
  const subpaths = [];
  let current = null;
  let point = null;
  for (let index = 0; index < tokens.length;) {
    const command = tokens[index++];
    if (command === "M") {
      point = { x: Number(tokens[index++]), y: Number(tokens[index++]) };
      current = [{ ...point }];
      subpaths.push(current);
    } else if (command === "C") {
      const controlA = { x: Number(tokens[index++]), y: Number(tokens[index++]) };
      const controlB = { x: Number(tokens[index++]), y: Number(tokens[index++]) };
      const end = { x: Number(tokens[index++]), y: Number(tokens[index++]) };
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const inverse = 1 - t;
        current.push({
          x: inverse ** 3 * point.x + 3 * inverse ** 2 * t * controlA.x + 3 * inverse * t ** 2 * controlB.x + t ** 3 * end.x,
          y: inverse ** 3 * point.y + 3 * inverse ** 2 * t * controlA.y + 3 * inverse * t ** 2 * controlB.y + t ** 3 * end.y
        });
      }
      point = end;
    } else if (command !== "Z") {
      throw new Error(`Unsupported land-path token ${command}`);
    }
  }
  return subpaths;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let left = 0, right = polygon.length - 1; left < polygon.length; right = left, left += 1) {
    const a = polygon[left];
    const b = polygon[right];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

const landSubpaths = sampleLandSubpaths(data.landPath);

const provinceIds = data.provinces.map((province) => province.id);
const regionIds = new Set(data.strategicRegions.map((region) => region.id));
const realmIds = new Set(data.realms.map((realm) => realm.id));
assert.equal(data.provinces.length, 64, "the fixed map must contain 64 provinces");
assert.equal(data.strategicRegions.length, 10, "the fixed map must contain 10 strategic regions");
assert.equal(new Set(provinceIds).size, provinceIds.length, "province ids must be unique");
assert.equal(regionIds.size, data.strategicRegions.length, "strategic region ids must be unique");
assert.equal(realmIds.size, data.realms.length, "realm ids must be unique");
assert.equal(Object.keys(data.terrainTypes).length, 8, "all eight terrain families must remain available");

data.provinces.forEach((province) => {
  assert.ok(province.nameZh && province.nameEn, `${province.id} needs bilingual names`);
  assert.ok(regionIds.has(province.strategicRegionId), `${province.id} references an unknown strategic region`);
  assert.ok(data.terrainTypes[province.terrain], `${province.id} references an unknown terrain type`);
  assert.ok(province.center[0] >= data.viewBox.x && province.center[0] <= data.viewBox.x + data.viewBox.width, `${province.id} x coordinate is outside the map`);
  assert.ok(province.center[1] >= data.viewBox.y && province.center[1] <= data.viewBox.y + data.viewBox.height, `${province.id} y coordinate is outside the map`);
  assert.ok(landSubpaths.some((polygon) => pointInPolygon({ x: province.center[0], y: province.center[1] }, polygon)), `${province.id} center is outside every landmass`);
  ["development", "fortification", "supply", "population"].forEach((key) => {
    assert.ok(Number.isFinite(province.base[key]), `${province.id} needs numeric base ${key}`);
  });
});

const geography = model.buildGeography(data);
const repeatedGeography = model.buildGeography(data);
assert.equal(geography.cells.length, 64, "every province needs one geometry cell");
assert.equal(geography.signature, repeatedGeography.signature, "fixed geography must be deterministic");
assert.equal(geography.signature, "342bf330", "unexpected fixed geography revision");
assert.equal(model.connectedComponents(provinceIds, geography.neighbors).length, 1, "the province graph must be connected");
assert.equal(geography.connections.length, geography.sharedEdges.length, "movement connections and shared edges must stay in sync");

geography.cells.forEach((cell) => {
  assert.ok(cell.points.length >= 3, `${cell.provinceId} needs a valid polygon`);
  assert.ok(model.polygonArea(cell.points) > 100, `${cell.provinceId} polygon is too small`);
});

provinceIds.forEach((provinceId) => {
  const neighbors = geography.neighbors[provinceId];
  assert.ok(neighbors.length >= 2 && neighbors.length <= 8, `${provinceId} must have 2-8 neighboring provinces`);
  assert.equal(new Set(neighbors).size, neighbors.length, `${provinceId} has duplicate neighbors`);
  neighbors.forEach((neighborId) => {
    assert.ok(provinceIds.includes(neighborId), `${provinceId} references missing neighbor ${neighborId}`);
    assert.ok(geography.neighbors[neighborId].includes(provinceId), `${provinceId}/${neighborId} adjacency must be symmetric`);
  });
});

data.strategicRegions.forEach((region) => {
  const members = data.provinces.filter((province) => province.strategicRegionId === region.id).map((province) => province.id);
  assert.ok(members.length >= 4 && members.length <= 9, `${region.id} must contain 4-9 provinces`);
  assert.ok(model.isConnectedSubset(members, geography.neighbors), `${region.id} must be geographically connected`);
});

data.routes.forEach((route) => {
  assert.ok(route.provinceIds.length >= 2, `${route.id} needs at least two waypoints`);
  route.provinceIds.forEach((provinceId) => assert.ok(geography.provinceById[provinceId], `${route.id} references missing province ${provinceId}`));
});

let previousSignature = null;
for (let seed = 1; seed <= 100; seed += 1) {
  const scenario = model.createScenario(data, geography, seed);
  const repeated = model.createScenario(data, geography, seed);
  assert.equal(scenario.signature, repeated.signature, `seed ${seed} must reproduce the same scenario`);
  assert.equal(scenario.turn, 1, `seed ${seed} must begin on turn one`);
  assert.equal(Object.keys(scenario.controllerByProvince).length, 64, `seed ${seed} must assign every province`);
  assert.equal(scenario.armies.length, data.realms.length * 2, `seed ${seed} must create two armies per realm`);
  data.realms.forEach((realm) => {
    const owned = provinceIds.filter((provinceId) => scenario.controllerByProvince[provinceId] === realm.id);
    assert.ok(owned.length, `seed ${seed} leaves ${realm.id} without territory`);
    assert.ok(model.isConnectedSubset(owned, geography.neighbors), `seed ${seed} gives ${realm.id} disconnected territory`);
    assert.equal(scenario.controllerByProvince[scenario.capitals[realm.id]], realm.id, `seed ${seed} capital must remain owned`);
  });
  scenario.armies.forEach((army) => {
    assert.ok(realmIds.has(army.realmId), `seed ${seed} army references an unknown realm`);
    assert.equal(army.lastActedTurn, 0, `seed ${seed} army must begin ready to act`);
    assert.equal(scenario.controllerByProvince[army.provinceId], army.realmId, `seed ${seed} army must stand on owned territory`);
    assert.equal(model.classifyArmyDestination(scenario, geography, army.id, army.provinceId).kind, "current", `seed ${seed} army must recognize its current province`);
    (geography.neighbors[army.provinceId] || []).forEach((provinceId) => {
      const expected = scenario.controllerByProvince[provinceId] === army.realmId ? "move" : "attack";
      assert.equal(model.classifyArmyDestination(scenario, geography, army.id, provinceId).kind, expected, `seed ${seed} movement classification mismatch`);
    });
  });
  if (previousSignature) assert.notEqual(scenario.signature, previousSignature, `adjacent seeds ${seed - 1}/${seed} should produce distinct scenarios`);
  previousSignature = scenario.signature;
  assert.equal(model.buildGeography(data).signature, geography.signature, `seed ${seed} must not mutate fixed geography`);
}

assert.equal(model.RECRUITMENT_FORCE, 5200, "each recruitment must request exactly 5,200 troops");
assert.equal(model.RECRUITMENT_COOLDOWN, 4, "recruitment must use a four-round cooldown");
assert.equal(model.MILITARY_FORCE_CAP, 120000, "no army may exceed the 120,000 force cap");

const relationScenario = model.createScenario(data, geography, 1058);
const neutralRealmIds = data.realms
  .filter((realm) => model.realmRelation(relationScenario, realm.id) === "neutral")
  .map((realm) => realm.id)
  .sort();
const hostileRealmIds = data.realms
  .filter((realm) => model.realmRelation(relationScenario, realm.id) === "hostile")
  .map((realm) => realm.id)
  .sort();
assert.equal(JSON.stringify(neutralRealmIds), JSON.stringify(["free-cities", "polaris-see"]), "the initial map must contain exactly the two intended neutral realms");
assert.equal(JSON.stringify(hostileRealmIds), JSON.stringify(["ash-confederacy", "solar-court"]), "the initial map must contain exactly the two intended hostile realms");
assert.equal(model.realmRelation(relationScenario, "player-realm"), "player", "the player realm must have its own relationship state");
neutralRealmIds.forEach((realmId) => {
  assert.equal(model.canRealmAttack(relationScenario, realmId, "player-realm"), false, `${realmId} must not attack the player while neutral`);
});
hostileRealmIds.forEach((realmId) => {
  assert.equal(model.canRealmAttack(relationScenario, realmId, "player-realm"), true, `${realmId} must be allowed to attack the player while hostile`);
});

const mergeRecruitScenario = model.createScenario(data, geography, 1058);
const mergeRecruitArmy = mergeRecruitScenario.armies.find((army) => army.realmId === "player-realm");
const mergeForceBefore = mergeRecruitArmy.force;
const mergeLastActedTurn = mergeRecruitArmy.lastActedTurn;
const mergeArmyCount = mergeRecruitScenario.armies.length;
const mergeSignature = mergeRecruitScenario.signature;
const mergeRecruitment = model.executeRecruitment(mergeRecruitScenario, geography, mergeRecruitArmy.provinceId);
assert.equal(mergeRecruitment.recruited, true, "recruitment in an occupied friendly province must succeed");
assert.equal(mergeRecruitment.kind, "merge", "recruitment in an occupied province must merge into the resident army");
assert.equal(mergeRecruitment.forceRequested, 5200, "a merge must request the standard 5,200 troops");
assert.equal(mergeRecruitment.forceAdded, 5200, "an uncapped merge must add all 5,200 troops");
assert.equal(mergeRecruitArmy.force, mergeForceBefore + 5200, "a merge must increase the resident army by 5,200");
assert.equal(mergeRecruitArmy.lastActedTurn, mergeLastActedTurn, "merging recruits must not refresh or spend the resident army's action");
assert.equal(mergeRecruitScenario.armies.length, mergeArmyCount, "a merge must not create a duplicate army marker");
assert.equal(mergeRecruitScenario.recruitment.cooldown, 4, "successful recruitment must start the four-round cooldown");
assert.equal(mergeRecruitScenario.recruitment.used, 1, "successful recruitment must increment its deterministic use counter");
assert.equal(mergeRecruitScenario.signature, mergeSignature, "recruitment must preserve the seeded scenario signature");

const newRecruitScenario = model.createScenario(data, geography, 1058);
const emptyRecruitProvinceId = provinceIds.find((provinceId) => newRecruitScenario.controllerByProvince[provinceId] === "player-realm"
  && !newRecruitScenario.armies.some((army) => army.realmId === "player-realm" && army.provinceId === provinceId)
  && geography.neighbors[provinceId].some((neighborId) => newRecruitScenario.controllerByProvince[neighborId] === "player-realm"));
assert.ok(emptyRecruitProvinceId, "the recruitment fixture needs an empty friendly province with a friendly neighbor");
const newRecruitArmyCount = newRecruitScenario.armies.length;
const newRecruitSignature = newRecruitScenario.signature;
const newRecruitment = model.executeRecruitment(newRecruitScenario, geography, emptyRecruitProvinceId);
assert.equal(newRecruitment.recruited, true, "recruitment in an empty friendly province must succeed");
assert.equal(newRecruitment.kind, "new-army", "an empty friendly province must raise a new field army");
assert.equal(newRecruitment.forceAdded, 5200, "a new field army must receive exactly 5,200 troops");
assert.equal(newRecruitScenario.armies.length, newRecruitArmyCount + 1, "raising a field army must add exactly one army");
const newRecruitArmy = newRecruitScenario.armies.find((army) => army.id === newRecruitment.armyId);
assert.ok(newRecruitArmy, "new recruitment must return the id of the created army");
assert.equal(newRecruitArmy.force, 5200, "a new field army must begin with 5,200 troops");
assert.equal(newRecruitArmy.provinceId, emptyRecruitProvinceId, "a new field army must appear in the selected province");
assert.equal(newRecruitArmy.lastActedTurn, newRecruitScenario.turn - 1, "a newly raised army must begin ready to act");
const newRecruitMoveTargetId = geography.neighbors[emptyRecruitProvinceId]
  .find((provinceId) => newRecruitScenario.controllerByProvince[provinceId] === "player-realm");
assert.equal(model.executeArmyMove(newRecruitScenario, geography, newRecruitArmy.id, newRecruitMoveTargetId).moved, true, "a newly raised army must be able to move in its recruitment turn");
assert.equal(newRecruitArmy.lastActedTurn, newRecruitScenario.turn, "a new army's same-turn move must spend its action normally");
assert.equal(newRecruitScenario.signature, newRecruitSignature, "raising and moving a field army must preserve the seeded scenario signature");

const rebuildRecruitScenario = model.createScenario(data, geography, 1058);
rebuildRecruitScenario.armies = rebuildRecruitScenario.armies.filter((army) => army.realmId !== "player-realm");
const rebuildProvinceId = provinceIds.find((provinceId) => rebuildRecruitScenario.controllerByProvince[provinceId] === "player-realm");
const rebuildSignature = rebuildRecruitScenario.signature;
const rebuildRecruitment = model.executeRecruitment(rebuildRecruitScenario, geography, rebuildProvinceId);
assert.equal(rebuildRecruitment.recruited, true, "a player with no surviving army must still be able to recruit");
assert.equal(rebuildRecruitment.kind, "rebuild", "the first army after total military loss must be reported as a rebuild");
const rebuiltArmy = rebuildRecruitScenario.armies.find((army) => army.id === rebuildRecruitment.armyId);
assert.ok(rebuiltArmy, "a rebuild must create a replacement player army");
assert.equal(rebuiltArmy.force, 5200, "a rebuilt army must begin with 5,200 troops");
assert.equal(rebuiltArmy.lastActedTurn, rebuildRecruitScenario.turn - 1, "a rebuilt army must be ready to act immediately");
assert.equal(rebuildRecruitScenario.signature, rebuildSignature, "rebuilding after total military loss must preserve the seeded signature");

const rejectedRecruitScenario = model.createScenario(data, geography, 1058);
const enemyRecruitProvinceId = provinceIds.find((provinceId) => rejectedRecruitScenario.controllerByProvince[provinceId] !== "player-realm");
const beforeRejectedRecruitment = JSON.stringify(rejectedRecruitScenario);
const rejectedRecruitment = model.executeRecruitment(rejectedRecruitScenario, geography, enemyRecruitProvinceId);
assert.equal(rejectedRecruitment.recruited, false, "recruitment in an enemy province must be rejected");
assert.equal(rejectedRecruitment.kind, "not-owned", "enemy-province recruitment must identify the ownership failure");
assert.equal(JSON.stringify(rejectedRecruitScenario), beforeRejectedRecruitment, "rejected enemy-province recruitment must have no side effects");

const cappedRecruitScenario = model.createScenario(data, geography, 1058);
const cappedRecruitArmy = cappedRecruitScenario.armies.find((army) => army.realmId === "player-realm");
cappedRecruitArmy.force = 118000;
const cappedSignature = cappedRecruitScenario.signature;
const cappedRecruitment = model.executeRecruitment(cappedRecruitScenario, geography, cappedRecruitArmy.provinceId);
assert.equal(cappedRecruitment.recruited, true, "recruitment below the force cap must still succeed");
assert.equal(cappedRecruitment.forceAdded, 2000, "recruitment must add only the room remaining below 120,000");
assert.equal(cappedRecruitment.forceAfter, 120000, "recruitment must clamp force at 120,000");
assert.equal(cappedRecruitment.capped, true, "a partially applied recruitment must report the cap");
assert.equal(cappedRecruitArmy.force, 120000, "the resident army must never exceed 120,000");
assert.equal(cappedRecruitScenario.signature, cappedSignature, "capped recruitment must preserve the seeded signature");

const cooldownRecruitScenario = model.createScenario(data, geography, 1058);
const cooldownSignature = cooldownRecruitScenario.signature;
const cooldownProvinceId = cooldownRecruitScenario.armies.find((army) => army.realmId === "player-realm").provinceId;
assert.equal(model.executeRecruitment(cooldownRecruitScenario, geography, cooldownProvinceId).recruited, true, "the cooldown fixture must recruit on turn one");
for (const expectedCooldown of [3, 2, 1, 0]) {
  const phase = model.executeAiPhase(cooldownRecruitScenario, geography);
  assert.equal(phase.recruitmentCooldown.after, expectedCooldown, `AI phase must tick recruitment cooldown to ${expectedCooldown}`);
  assert.equal(cooldownRecruitScenario.recruitment.cooldown, expectedCooldown, `scenario cooldown must persist as ${expectedCooldown}`);
  if (expectedCooldown > 0) {
    const ownedProvinceId = provinceIds.find((provinceId) => cooldownRecruitScenario.controllerByProvince[provinceId] === "player-realm");
    const beforeCooldownRejection = JSON.stringify(cooldownRecruitScenario);
    const cooldownRejection = model.executeRecruitment(cooldownRecruitScenario, geography, ownedProvinceId);
    assert.equal(cooldownRejection.recruited, false, "recruitment must remain blocked before all four cooldown ticks complete");
    assert.equal(cooldownRejection.kind, "cooldown", "blocked repeat recruitment must report its cooldown");
    assert.equal(JSON.stringify(cooldownRecruitScenario), beforeCooldownRejection, "a cooldown rejection must not mutate scenario state");
  }
}
assert.equal(cooldownRecruitScenario.turn, 5, "four completed AI phases must open turn five");
const turnFiveRecruitProvinceId = provinceIds.find((provinceId) => cooldownRecruitScenario.controllerByProvince[provinceId] === "player-realm");
const turnFiveRecruitment = model.executeRecruitment(cooldownRecruitScenario, geography, turnFiveRecruitProvinceId);
assert.equal(turnFiveRecruitment.recruited, true, "recruitment must become available again on turn five");
assert.equal(turnFiveRecruitment.used, 2, "the second legal recruitment must advance the use counter deterministically");
assert.equal(cooldownRecruitScenario.signature, cooldownSignature, "cooldown ticks and repeated recruitment must preserve the seeded signature");

const movementScenario = model.createScenario(data, geography, 1058);
const commandArmy = movementScenario.armies.find((army) => army.realmId === "player-realm"
  && geography.neighbors[army.provinceId].some((provinceId) => movementScenario.controllerByProvince[provinceId] === army.realmId));
assert.ok(commandArmy, "the player needs an army with a friendly adjacent movement target");
const friendlyTarget = geography.neighbors[commandArmy.provinceId]
  .find((provinceId) => movementScenario.controllerByProvince[provinceId] === commandArmy.realmId);
const originId = commandArmy.provinceId;
const otherArmyPositions = Object.fromEntries(movementScenario.armies.filter((army) => army.id !== commandArmy.id).map((army) => [army.id, army.provinceId]));
const controllersBeforeMove = JSON.stringify(movementScenario.controllerByProvince);
const provinceStateBeforeMove = JSON.stringify(movementScenario.provinceState);
const scenarioSignatureBeforeMove = movementScenario.signature;
const moveResult = model.executeArmyMove(movementScenario, geography, commandArmy.id, friendlyTarget);
assert.equal(moveResult.moved, true, "a player army must move to an adjacent friendly province");
assert.equal(moveResult.fromProvinceId, originId, "movement must report its origin");
assert.equal(commandArmy.provinceId, friendlyTarget, "movement must update only the commanded army position");
assert.equal(commandArmy.lastActedTurn, movementScenario.turn, "a successful move must spend that army for the current turn");
assert.deepEqual(
  Object.fromEntries(movementScenario.armies.filter((army) => army.id !== commandArmy.id).map((army) => [army.id, army.provinceId])),
  otherArmyPositions,
  "movement must not relocate other armies"
);
assert.equal(JSON.stringify(movementScenario.controllerByProvince), controllersBeforeMove, "sandbox movement must not alter political control");
assert.equal(JSON.stringify(movementScenario.provinceState), provinceStateBeforeMove, "sandbox movement must not alter province values");
assert.equal(movementScenario.signature, scenarioSignatureBeforeMove, "sandbox movement must preserve the seeded scenario signature");
const afterFirstMove = JSON.stringify(movementScenario);
const duplicateMove = model.executeArmyMove(movementScenario, geography, commandArmy.id, originId);
assert.equal(duplicateMove.moved, false, "the same army must not move twice in one turn");
assert.equal(duplicateMove.kind, "spent", "a duplicate movement command must report that the army is spent");
assert.equal(JSON.stringify(movementScenario), afterFirstMove, "a rejected second move must have no side effects");
const otherReadyPlayerArmy = movementScenario.armies.find((army) => army.realmId === "player-realm" && army.id !== commandArmy.id);
assert.ok(otherReadyPlayerArmy, "the player needs a second army for per-army action checks");
assert.equal(otherReadyPlayerArmy.lastActedTurn, 0, "spending one army must not spend the player's other army");
const otherReadyTarget = geography.neighbors[otherReadyPlayerArmy.provinceId][0];
assert.notEqual(model.classifyArmyDestination(movementScenario, geography, otherReadyPlayerArmy.id, otherReadyTarget).kind, "spent", "an unspent player army must keep its available orders");

const rejectedScenario = model.createScenario(data, geography, 1058);
const rejectedArmy = rejectedScenario.armies.find((army) => army.realmId === "player-realm");
const borderOrigin = provinceIds.find((provinceId) => rejectedScenario.controllerByProvince[provinceId] === rejectedArmy.realmId
  && geography.neighbors[provinceId].some((neighborId) => rejectedScenario.controllerByProvince[neighborId] !== rejectedArmy.realmId));
const hostileTarget = geography.neighbors[borderOrigin]
  .find((provinceId) => rejectedScenario.controllerByProvince[provinceId] !== rejectedArmy.realmId);
rejectedArmy.provinceId = borderOrigin;
const beforeRejectedAttack = JSON.stringify(rejectedScenario);
assert.equal(model.executeArmyMove(rejectedScenario, geography, rejectedArmy.id, hostileTarget).kind, "attack", "hostile destination must be classified as an attack");
assert.equal(JSON.stringify(rejectedScenario), beforeRejectedAttack, "an unavailable attack must have no side effects");
const distantTarget = provinceIds.find((provinceId) => provinceId !== borderOrigin && !geography.neighbors[borderOrigin].includes(provinceId));
assert.equal(model.executeArmyMove(rejectedScenario, geography, rejectedArmy.id, distantTarget).kind, "unreachable", "non-adjacent movement must be rejected");
assert.equal(JSON.stringify(rejectedScenario), beforeRejectedAttack, "rejected long-distance movement must have no side effects");
assert.equal(rejectedArmy.lastActedTurn, 0, "an invalid order must not spend the army");
const foreignArmy = rejectedScenario.armies.find((army) => army.realmId !== "player-realm");
const foreignFriendlyTarget = geography.neighbors[foreignArmy.provinceId]
  .find((provinceId) => rejectedScenario.controllerByProvince[provinceId] === foreignArmy.realmId);
assert.ok(foreignFriendlyTarget, "foreign army test needs a friendly adjacent province");
const beforeForeignOrder = JSON.stringify(rejectedScenario);
assert.equal(model.executeArmyMove(rejectedScenario, geography, foreignArmy.id, foreignFriendlyTarget).kind, "not-commandable", "foreign armies must remain observer-only");
assert.equal(JSON.stringify(rejectedScenario), beforeForeignOrder, "foreign orders must have no side effects");

const repeatBattle = () => {
  const scenario = model.createScenario(data, geography, 1058);
  const attacker = scenario.armies.find((army) => army.realmId === "player-realm"
    && geography.neighbors[army.provinceId].some((provinceId) => scenario.controllerByProvince[provinceId] !== army.realmId));
  const targetId = geography.neighbors[attacker.provinceId]
    .find((provinceId) => scenario.controllerByProvince[provinceId] !== attacker.realmId);
  return { scenario, result: model.executeArmyBattle(scenario, geography, attacker.id, targetId) };
};
const repeatedBattleLeft = repeatBattle();
const repeatedBattleRight = repeatBattle();
assert.equal(JSON.stringify(repeatedBattleLeft.result), JSON.stringify(repeatedBattleRight.result), "the same battle order must reproduce the same result");
assert.equal(JSON.stringify(repeatedBattleLeft.scenario), JSON.stringify(repeatedBattleRight.scenario), "the same battle order must reproduce the same scenario state");
assert.equal(repeatedBattleLeft.result.attacked, true, "an adjacent hostile province must start a battle");
assert.equal(repeatedBattleLeft.scenario.battleCount, 1, "an accepted battle must increment the sandbox battle counter");

const victoryScenario = model.createScenario(data, geography, 1058);
const victoryArmy = victoryScenario.armies.find((army) => army.realmId === "player-realm");
const victoryOriginId = provinceIds.find((provinceId) => victoryScenario.controllerByProvince[provinceId] === victoryArmy.realmId
  && geography.neighbors[provinceId].some((neighborId) => victoryScenario.controllerByProvince[neighborId] !== victoryArmy.realmId));
const victoryTargetId = geography.neighbors[victoryOriginId]
  .find((provinceId) => victoryScenario.controllerByProvince[provinceId] !== victoryArmy.realmId);
const victoryPreviousController = victoryScenario.controllerByProvince[victoryTargetId];
victoryArmy.provinceId = victoryOriginId;
victoryArmy.force = 24000;
victoryArmy.attack = 240;
victoryScenario.armies = victoryScenario.armies.filter((army) => army.provinceId !== victoryTargetId);
const victoryFortification = victoryScenario.provinceState[victoryTargetId].fortification;
const victorySignature = victoryScenario.signature;
const victoryResult = model.executeArmyBattle(victoryScenario, geography, victoryArmy.id, victoryTargetId);
assert.equal(victoryResult.attackerWon, true, "an overwhelming attack must win the province");
assert.equal(victoryScenario.controllerByProvince[victoryTargetId], victoryArmy.realmId, "victory must update the controller index");
assert.equal(victoryScenario.provinceState[victoryTargetId].controllerId, victoryArmy.realmId, "victory must update rendered province control");
assert.equal(victoryArmy.provinceId, victoryTargetId, "the victorious army must enter the captured province");
assert.equal(victoryArmy.lastActedTurn, victoryScenario.turn, "a successful attack must spend the attacker for the current turn");
assert.ok(victoryScenario.provinceState[victoryTargetId].fortification < victoryFortification, "battle damage must reduce fortification");
assert.equal(victoryScenario.signature, victorySignature, "sandbox combat must preserve the seeded scenario signature");
assert.notEqual(victoryPreviousController, victoryArmy.realmId, "the victory fixture must begin against another realm");

const guardedScenario = model.createScenario(data, geography, 1058);
const guardedArmy = guardedScenario.armies.find((army) => army.realmId === "player-realm");
const guardedOriginId = provinceIds.find((provinceId) => guardedScenario.controllerByProvince[provinceId] === guardedArmy.realmId
  && geography.neighbors[provinceId].some((neighborId) => {
    const controllerId = guardedScenario.controllerByProvince[neighborId];
    return controllerId !== guardedArmy.realmId
      && geography.neighbors[neighborId].some((retreatId) => guardedScenario.controllerByProvince[retreatId] === controllerId);
  }));
const guardedTargetId = geography.neighbors[guardedOriginId].find((neighborId) => {
  const controllerId = guardedScenario.controllerByProvince[neighborId];
  return controllerId !== guardedArmy.realmId
    && geography.neighbors[neighborId].some((retreatId) => guardedScenario.controllerByProvince[retreatId] === controllerId);
});
const guardedControllerId = guardedScenario.controllerByProvince[guardedTargetId];
const guardedDefender = guardedScenario.armies.find((army) => army.realmId === guardedControllerId);
guardedArmy.provinceId = guardedOriginId;
guardedArmy.force = 24000;
guardedArmy.attack = 240;
guardedDefender.provinceId = guardedTargetId;
guardedDefender.force = 10000;
guardedDefender.defense = 20;
const guardedResult = model.executeArmyBattle(guardedScenario, geography, guardedArmy.id, guardedTargetId);
const survivingGuard = guardedScenario.armies.find((army) => army.id === guardedDefender.id);
assert.equal(guardedResult.attackerWon, true, "an overwhelming guarded attack must win");
assert.ok(guardedResult.fieldDefenderCasualties > 0, "field defenders must take their share of casualties");
assert.ok(survivingGuard, "a surviving field defender must remain in the roster");
assert.notEqual(survivingGuard.provinceId, guardedTargetId, "a defeated field army must retreat from the captured province");
assert.equal(guardedScenario.controllerByProvince[survivingGuard.provinceId], guardedControllerId, "a retreat must end in friendly territory");

const defeatScenario = model.createScenario(data, geography, 1058);
const doomedArmy = defeatScenario.armies.find((army) => army.realmId === "player-realm");
const defeatOriginId = provinceIds.find((provinceId) => defeatScenario.controllerByProvince[provinceId] === doomedArmy.realmId
  && geography.neighbors[provinceId].some((neighborId) => defeatScenario.controllerByProvince[neighborId] !== doomedArmy.realmId));
const defeatTargetId = geography.neighbors[defeatOriginId]
  .find((provinceId) => defeatScenario.controllerByProvince[provinceId] !== doomedArmy.realmId);
const defeatControllerId = defeatScenario.controllerByProvince[defeatTargetId];
doomedArmy.provinceId = defeatOriginId;
doomedArmy.force = 1;
doomedArmy.attack = 0;
const defeatResult = model.executeArmyBattle(defeatScenario, geography, doomedArmy.id, defeatTargetId);
assert.equal(defeatResult.attackerWon, false, "a one-soldier attack must fail");
assert.equal(defeatScenario.controllerByProvince[defeatTargetId], defeatControllerId, "defeat must preserve province control");
assert.ok(!defeatScenario.armies.some((army) => army.id === doomedArmy.id), "a destroyed attacker must leave the roster");

const duplicateBattleScenario = model.createScenario(data, geography, 1);
const duplicateBattleArmy = duplicateBattleScenario.armies.find((army) => army.realmId === "player-realm");
const duplicateBattleOriginId = provinceIds.find((provinceId) => duplicateBattleScenario.controllerByProvince[provinceId] === duplicateBattleArmy.realmId
  && geography.neighbors[provinceId].some((neighborId) => duplicateBattleScenario.controllerByProvince[neighborId] !== duplicateBattleArmy.realmId));
const duplicateBattleTargetId = geography.neighbors[duplicateBattleOriginId]
  .find((provinceId) => duplicateBattleScenario.controllerByProvince[provinceId] !== duplicateBattleArmy.realmId);
const duplicateBattleDefenderRealmId = duplicateBattleScenario.controllerByProvince[duplicateBattleTargetId];
const duplicateBattleDefender = duplicateBattleScenario.armies.find((army) => army.realmId === duplicateBattleDefenderRealmId);
assert.ok(duplicateBattleDefender, "the duplicate attack fixture needs a defending army");
duplicateBattleArmy.provinceId = duplicateBattleOriginId;
duplicateBattleArmy.force = 6000;
duplicateBattleArmy.attack = 0;
duplicateBattleDefender.provinceId = duplicateBattleTargetId;
duplicateBattleDefender.force = 25000;
duplicateBattleDefender.defense = 300;
const firstDuplicateBattle = model.executeArmyBattle(duplicateBattleScenario, geography, duplicateBattleArmy.id, duplicateBattleTargetId);
assert.equal(firstDuplicateBattle.attacked, true, "the first click in the duplicate attack fixture must resolve a battle");
assert.equal(firstDuplicateBattle.attackerWon, false, "the duplicate attack fixture must leave the target hostile");
assert.ok(firstDuplicateBattle.attackerSurvivors > 0, "the duplicate attack fixture must leave the attacker alive for a meaningful second-click check");
assert.equal(duplicateBattleArmy.lastActedTurn, duplicateBattleScenario.turn, "a failed but resolved attack must still spend the attacker");
const afterFirstDuplicateBattle = JSON.stringify(duplicateBattleScenario);
const secondDuplicateBattle = model.executeArmyBattle(duplicateBattleScenario, geography, duplicateBattleArmy.id, duplicateBattleTargetId);
assert.equal(secondDuplicateBattle.attacked, false, "a duplicate attack click must not resolve a second battle");
assert.equal(secondDuplicateBattle.kind, "spent", "a duplicate attack click must report that the army is spent");
assert.equal(duplicateBattleScenario.battleCount, 1, "a duplicate attack click must increment the battle counter only once");
assert.equal(JSON.stringify(duplicateBattleScenario), afterFirstDuplicateBattle, "a duplicate attack click must not inflict additional casualties");

const eliminationScenario = model.createScenario(data, geography, 1058);
const eliminationArmy = eliminationScenario.armies.find((army) => army.realmId === "player-realm");
const eliminatedRealm = data.realms.find((realm) => realm.id !== eliminationArmy.realmId);
const eliminationTargetId = eliminationScenario.capitals[eliminatedRealm.id];
const eliminationOriginId = geography.neighbors[eliminationTargetId][0];
data.provinces.forEach((province) => {
  if (eliminationScenario.controllerByProvince[province.id] !== eliminatedRealm.id || province.id === eliminationTargetId) return;
  eliminationScenario.controllerByProvince[province.id] = eliminationArmy.realmId;
  eliminationScenario.provinceState[province.id].controllerId = eliminationArmy.realmId;
});
eliminationScenario.controllerByProvince[eliminationOriginId] = eliminationArmy.realmId;
eliminationScenario.provinceState[eliminationOriginId].controllerId = eliminationArmy.realmId;
eliminationScenario.armies.filter((army) => army.realmId === eliminatedRealm.id).forEach((army) => {
  army.provinceId = eliminationTargetId;
  army.force = 8000;
  army.defense = 10;
});
eliminationArmy.provinceId = eliminationOriginId;
eliminationArmy.force = 50000;
eliminationArmy.attack = 1000;
const eliminationResult = model.executeArmyBattle(eliminationScenario, geography, eliminationArmy.id, eliminationTargetId);
assert.equal(eliminationResult.attackerWon, true, "the final enemy province fixture must be captured");
assert.equal(eliminationResult.eliminatedRealmId, eliminatedRealm.id, "capturing a realm's final province must report elimination");
assert.equal(eliminationScenario.capitals[eliminatedRealm.id], null, "an eliminated realm must lose its capital marker");
assert.ok(!eliminationScenario.armies.some((army) => army.realmId === eliminatedRealm.id), "an eliminated realm must lose all armies");

const rejectedBattleScenario = model.createScenario(data, geography, 1058);
const rejectedForeignArmy = rejectedBattleScenario.armies.find((army) => army.realmId !== "player-realm");
const foreignBorderOrigin = provinceIds.find((provinceId) => rejectedBattleScenario.controllerByProvince[provinceId] === rejectedForeignArmy.realmId
  && geography.neighbors[provinceId].some((neighborId) => rejectedBattleScenario.controllerByProvince[neighborId] !== rejectedForeignArmy.realmId));
const foreignAttackTarget = geography.neighbors[foreignBorderOrigin]
  .find((provinceId) => rejectedBattleScenario.controllerByProvince[provinceId] !== rejectedForeignArmy.realmId);
rejectedForeignArmy.provinceId = foreignBorderOrigin;
const beforeRejectedForeignBattle = JSON.stringify(rejectedBattleScenario);
assert.equal(model.executeArmyBattle(rejectedBattleScenario, geography, rejectedForeignArmy.id, foreignAttackTarget).kind, "not-commandable", "foreign attacks must remain observer-only");
assert.equal(JSON.stringify(rejectedBattleScenario), beforeRejectedForeignBattle, "rejected foreign attacks must have no side effects");

const neutralAttackScenario = model.createScenario(data, geography, 1058);
const neutralAttackRealmId = neutralRealmIds.find((realmId) => provinceIds.some((provinceId) => neutralAttackScenario.controllerByProvince[provinceId] === realmId
  && geography.neighbors[provinceId].some((neighborId) => neutralAttackScenario.controllerByProvince[neighborId] === "player-realm")));
assert.ok(neutralAttackRealmId, "the neutrality fixture needs a neutral realm bordering the player");
const neutralAttackOriginId = provinceIds.find((provinceId) => neutralAttackScenario.controllerByProvince[provinceId] === neutralAttackRealmId
  && geography.neighbors[provinceId].some((neighborId) => neutralAttackScenario.controllerByProvince[neighborId] === "player-realm"));
const neutralAttackTargetId = geography.neighbors[neutralAttackOriginId]
  .find((provinceId) => neutralAttackScenario.controllerByProvince[provinceId] === "player-realm");
const neutralAttackArmy = neutralAttackScenario.armies.find((army) => army.realmId === neutralAttackRealmId);
neutralAttackArmy.provinceId = neutralAttackOriginId;
const beforeNeutralAttack = JSON.stringify(neutralAttackScenario);
const blockedNeutralAttack = model.executeArmyBattle(
  neutralAttackScenario,
  geography,
  neutralAttackArmy.id,
  neutralAttackTargetId,
  neutralAttackRealmId
);
assert.equal(blockedNeutralAttack.attacked, false, "an unprovoked neutral realm must not attack the player");
assert.equal(blockedNeutralAttack.kind, "neutrality", "a blocked neutral attack must identify the diplomatic restriction");
assert.equal(JSON.stringify(neutralAttackScenario), beforeNeutralAttack, "a blocked neutral attack must have no side effects");

function runNeutralProvocation() {
  const scenario = model.createScenario(data, geography, 1058);
  const originProvinceId = provinceIds.find((provinceId) => scenario.controllerByProvince[provinceId] === "player-realm"
    && geography.neighbors[provinceId].some((neighborId) => model.realmRelation(scenario, scenario.controllerByProvince[neighborId]) === "neutral"));
  const targetProvinceId = geography.neighbors[originProvinceId]
    .find((provinceId) => model.realmRelation(scenario, scenario.controllerByProvince[provinceId]) === "neutral");
  const neutralRealmId = scenario.controllerByProvince[targetProvinceId];
  const army = scenario.armies.find((candidate) => candidate.realmId === "player-realm");
  army.provinceId = originProvinceId;
  army.force = 40000;
  army.attack = 300;
  const signature = scenario.signature;
  const report = model.executeArmyBattle(scenario, geography, army.id, targetProvinceId);
  return { scenario, report, neutralRealmId, signature };
}

const provocationLeft = runNeutralProvocation();
const provocationRight = runNeutralProvocation();
assert.equal(JSON.stringify(provocationLeft.report), JSON.stringify(provocationRight.report), "provoking a neutral realm must produce a deterministic battle report");
assert.equal(JSON.stringify(provocationLeft.scenario), JSON.stringify(provocationRight.scenario), "provoking a neutral realm must produce deterministic scenario state");
assert.equal(provocationLeft.report.attacked, true, "the player must be able to choose an attack against a neutral realm");
assert.equal(provocationLeft.report.previousControllerId, provocationLeft.neutralRealmId, "the provocation fixture must attack neutral territory");
assert.equal(provocationLeft.report.provokedRealmId, provocationLeft.neutralRealmId, "an accepted player attack must report the provoked neutral realm");
assert.equal(JSON.stringify(provocationLeft.report.relationChanges), JSON.stringify([{
  realmId: provocationLeft.neutralRealmId,
  from: "neutral",
  to: "hostile",
  reason: "player-attack"
}]), "a player attack must report exactly one neutral-to-hostile relationship change");
assert.equal(model.realmRelation(provocationLeft.scenario, provocationLeft.neutralRealmId), "hostile", "an attacked neutral realm must become hostile immediately");
assert.equal(model.canRealmAttack(provocationLeft.scenario, provocationLeft.neutralRealmId, "player-realm"), true, "a provoked realm must be allowed to attack the player thereafter");
assert.equal(provocationLeft.scenario.signature, provocationLeft.signature, "provocation and relationship changes must preserve the seeded scenario signature");
for (let round = 1; round <= 3; round += 1) {
  const leftPhase = model.executeAiPhase(provocationLeft.scenario, geography);
  const rightPhase = model.executeAiPhase(provocationRight.scenario, geography);
  assert.equal(JSON.stringify(leftPhase), JSON.stringify(rightPhase), `provoked relationship round ${round} must keep AI decisions deterministic`);
  assert.equal(JSON.stringify(provocationLeft.scenario), JSON.stringify(provocationRight.scenario), `provoked relationship round ${round} must keep scenario state deterministic`);
  assert.equal(model.realmRelation(provocationLeft.scenario, provocationLeft.neutralRealmId), "hostile", `provoked relationship round ${round} must not revert to neutral`);
  assert.equal(provocationLeft.scenario.signature, provocationLeft.signature, `provoked relationship round ${round} must preserve the seeded signature`);
}

const aiRealmIds = data.realms.filter((realm) => realm.id !== "player-realm").map((realm) => realm.id).sort();
const repeatAiPhase = () => {
  const scenario = model.createScenario(data, geography, 1058);
  const initialArmyRealms = Object.fromEntries(scenario.armies.map((army) => [army.id, army.realmId]));
  const report = model.executeAiPhase(scenario, geography);
  return { scenario, report, initialArmyRealms };
};
const repeatedAiLeft = repeatAiPhase();
const repeatedAiRight = repeatAiPhase();
assert.equal(JSON.stringify(repeatedAiLeft.report), JSON.stringify(repeatedAiRight.report), "the same seed and turn must reproduce the same AI orders and battles");
assert.equal(JSON.stringify(repeatedAiLeft.scenario), JSON.stringify(repeatedAiRight.scenario), "the same seed and turn must reproduce the same post-AI scenario");
assert.equal(repeatedAiLeft.report.kind, "ai-phase", "ending the player phase must run one AI phase");
assert.equal(repeatedAiLeft.report.turn, 1, "the first AI phase must resolve turn one");
assert.equal(repeatedAiLeft.report.nextTurn, 2, "the first AI phase must open turn two");
assert.equal(repeatedAiLeft.scenario.turn, 2, "the scenario must advance exactly one turn after an AI phase");
assert.equal(JSON.stringify(repeatedAiLeft.report.actions.map((action) => action.realmId)), JSON.stringify(aiRealmIds), "every non-player realm must receive exactly one AI step in stable realm order");
assert.equal(new Set(repeatedAiLeft.report.actions.map((action) => action.realmId)).size, aiRealmIds.length, "an AI realm must not receive two steps in one phase");
assert.ok(repeatedAiLeft.report.actions.some((action) => action.kind === "battle"), "the standard AI fixture must exercise an attack");
assert.ok(repeatedAiLeft.report.actions.some((action) => action.kind === "move"), "the standard AI fixture must exercise a friendly march");
assert.equal(repeatedAiLeft.scenario.battleCount, repeatedAiLeft.report.actions.filter((action) => action.kind === "battle").length, "each reported AI attack must resolve exactly one battle");
repeatedAiLeft.report.actions.forEach((action) => {
  assert.ok(["move", "battle", "hold"].includes(action.kind), `${action.realmId} must produce one recognized AI result`);
  if (neutralRealmIds.includes(action.realmId) && action.kind === "battle") {
    assert.notEqual(action.battle.previousControllerId, "player-realm", `${action.realmId} must not choose the player as a battle target while neutral`);
  }
  if (action.armyId) {
    assert.equal(repeatedAiLeft.initialArmyRealms[action.armyId], action.realmId, `${action.realmId} must command only its own army`);
    const survivor = repeatedAiLeft.scenario.armies.find((army) => army.id === action.armyId);
    if (survivor) assert.equal(survivor.lastActedTurn, repeatedAiLeft.report.turn, `${action.armyId} must be spent after its AI action`);
    else assert.equal(action.kind, "battle", "only a defeated battle attacker may disappear during its AI action");
  }
});
repeatedAiLeft.scenario.armies.filter((army) => army.realmId === "player-realm").forEach((army) => {
  assert.equal(army.lastActedTurn, 0, "the AI phase must not spend a surviving player army merely for defending or retreating");
});

const recoveryScenario = model.createScenario(data, geography, 1058);
const recoveryArmy = recoveryScenario.armies.find((army) => army.realmId === "player-realm"
  && geography.neighbors[army.provinceId].some((provinceId) => recoveryScenario.controllerByProvince[provinceId] === army.realmId));
const recoveryOriginId = recoveryArmy.provinceId;
const recoveryFirstTargetId = geography.neighbors[recoveryOriginId]
  .find((provinceId) => recoveryScenario.controllerByProvince[provinceId] === recoveryArmy.realmId);
assert.equal(model.executeArmyMove(recoveryScenario, geography, recoveryArmy.id, recoveryFirstTargetId).moved, true, "the recovery fixture must spend a player army on turn one");
assert.equal(model.classifyArmyDestination(recoveryScenario, geography, recoveryArmy.id, recoveryOriginId).kind, "spent", "the recovery fixture army must remain spent until the turn ends");
const recoverySignature = recoveryScenario.signature;
const recoveryPhase = model.executeAiPhase(recoveryScenario, geography);
assert.equal(recoveryPhase.nextTurn, 2, "ending turn one must advance the recovery fixture to turn two");
const recoveredArmy = recoveryScenario.armies.find((army) => army.id === recoveryArmy.id);
assert.ok(recoveredArmy, "the recovery fixture player army must survive the AI phase");
assert.equal(recoveryScenario.controllerByProvince[recoveryOriginId], recoveredArmy.realmId, "the recovery fixture destination must remain friendly on turn two");
assert.equal(model.classifyArmyDestination(recoveryScenario, geography, recoveredArmy.id, recoveryOriginId).kind, "move", "a spent army must become ready again when the next turn opens");
assert.equal(model.executeArmyMove(recoveryScenario, geography, recoveredArmy.id, recoveryOriginId).moved, true, "the recovered army must be able to act on the new turn");
assert.equal(recoveredArmy.lastActedTurn, 2, "the recovered army must record its new turn action");
assert.equal(recoveryScenario.signature, recoverySignature, "advancing sandbox turns must preserve the seeded scenario signature");

const noArmyScenario = model.createScenario(data, geography, 1058);
noArmyScenario.armies = noArmyScenario.armies.filter((army) => army.realmId === "player-realm");
const noArmyControlBefore = JSON.stringify(noArmyScenario.controllerByProvince);
const noArmyPhase = model.executeAiPhase(noArmyScenario, geography);
assert.equal(JSON.stringify(noArmyPhase.actions.map((action) => action.realmId)), JSON.stringify(aiRealmIds), "AI realms without armies must still each receive one scheduler step");
assert.ok(noArmyPhase.actions.every((action) => action.kind === "hold" && action.reason === "no-army"), "a realm with territory but no army must hold without inventing a unit");
assert.equal(JSON.stringify(noArmyScenario.controllerByProvince), noArmyControlBefore, "an all-hold AI phase must not alter territorial control");
assert.equal(noArmyScenario.turn, 2, "an all-hold AI phase must still advance the turn");

const eliminatedAiScenario = model.createScenario(data, geography, 1058);
const eliminatedAiRealmId = aiRealmIds[0];
provinceIds.forEach((provinceId) => {
  if (eliminatedAiScenario.controllerByProvince[provinceId] !== eliminatedAiRealmId) return;
  eliminatedAiScenario.controllerByProvince[provinceId] = "player-realm";
  eliminatedAiScenario.provinceState[provinceId].controllerId = "player-realm";
});
eliminatedAiScenario.capitals[eliminatedAiRealmId] = null;
eliminatedAiScenario.armies = eliminatedAiScenario.armies.filter((army) => army.realmId !== eliminatedAiRealmId);
const eliminatedAiPhase = model.executeAiPhase(eliminatedAiScenario, geography);
const eliminatedAiAction = eliminatedAiPhase.actions.find((action) => action.realmId === eliminatedAiRealmId);
assert.equal(eliminatedAiAction.kind, "hold", "an eliminated AI realm must not receive a movement or attack order");
assert.equal(eliminatedAiAction.reason, "eliminated", "an eliminated AI realm must report why it was skipped");
assert.equal(JSON.stringify(eliminatedAiPhase.actions.map((action) => action.realmId)), JSON.stringify(aiRealmIds), "an eliminated realm must not prevent later AI realms from taking their steps");

for (let seed = 1; seed <= 30; seed += 1) {
  const left = model.createScenario(data, geography, seed);
  const right = model.createScenario(data, geography, seed);
  const initialSignature = left.signature;
  for (let round = 1; round <= 6; round += 1) {
    const leftReport = model.executeAiPhase(left, geography);
    const rightReport = model.executeAiPhase(right, geography);
    assert.equal(JSON.stringify(leftReport), JSON.stringify(rightReport), `seed ${seed} round ${round} AI report must be deterministic`);
    assert.equal(JSON.stringify(left), JSON.stringify(right), `seed ${seed} round ${round} AI state must be deterministic`);
    assert.equal(JSON.stringify(leftReport.actions.map((action) => action.realmId)), JSON.stringify(aiRealmIds), `seed ${seed} round ${round} must schedule each AI realm once`);
    assert.equal(left.turn, round + 1, `seed ${seed} round ${round} must advance exactly one turn`);
    assert.equal(left.signature, initialSignature, `seed ${seed} round ${round} must preserve its initial scenario signature`);
    neutralRealmIds.forEach((realmId) => {
      assert.equal(model.realmRelation(left, realmId), "neutral", `seed ${seed} round ${round} unprovoked ${realmId} must remain neutral`);
    });
    hostileRealmIds.forEach((realmId) => {
      assert.equal(model.realmRelation(left, realmId), "hostile", `seed ${seed} round ${round} ${realmId} must remain hostile`);
    });
    leftReport.actions.forEach((action) => {
      if (neutralRealmIds.includes(action.realmId) && action.kind === "battle") {
        assert.notEqual(action.battle.previousControllerId, "player-realm", `seed ${seed} round ${round} neutral AI must not attack the player`);
      }
    });
    assert.ok(left.recruitment.cooldown >= 0 && left.recruitment.cooldown <= model.RECRUITMENT_COOLDOWN, `seed ${seed} round ${round} recruitment cooldown must remain bounded`);
    assert.ok(Number.isInteger(left.recruitment.used) && left.recruitment.used >= 0, `seed ${seed} round ${round} recruitment use counter must remain a nonnegative integer`);
    left.armies.forEach((army) => {
      assert.ok(Number.isInteger(army.force) && army.force > 0, `seed ${seed} round ${round} must retain only living integer-strength armies`);
      assert.ok(army.force <= model.MILITARY_FORCE_CAP, `seed ${seed} round ${round} army force must remain at or below 120,000`);
      assert.equal(left.controllerByProvince[army.provinceId], army.realmId, `seed ${seed} round ${round} army must finish in friendly territory`);
      assert.ok(army.lastActedTurn < left.turn, `seed ${seed} round ${round} surviving army action stamps must never point into the future`);
    });
    provinceIds.forEach((provinceId) => {
      assert.equal(left.provinceState[provinceId].controllerId, left.controllerByProvince[provinceId], `seed ${seed} round ${round} province control indexes must stay synchronized`);
    });
  }
}

for (const scenario of [repeatedBattleLeft.scenario, victoryScenario, guardedScenario, defeatScenario, duplicateBattleScenario, repeatedAiLeft.scenario]) {
  scenario.armies.forEach((army) => {
    assert.ok(Number.isInteger(army.force) && army.force > 0, "every surviving army must retain a positive integer force");
    assert.equal(scenario.controllerByProvince[army.provinceId], army.realmId, "every surviving army must stand in friendly territory after battle");
  });
}

const viewBox = data.viewBox;
const camera = model.clampCamera({ cx: 600, cy: 380, zoom: 1 }, viewBox);
assert.equal(model.clampCamera({ cx: -999, cy: 9999, zoom: 99 }, viewBox).zoom, model.MAX_ZOOM, "camera must enforce maximum zoom");
assert.equal(model.clampCamera({ cx: 600, cy: 380, zoom: 0.01 }, viewBox).zoom, model.MIN_ZOOM, "camera must enforce minimum zoom");
const pointer = { x: 0.72, y: 0.34 };
const before = model.cameraView(camera, viewBox);
const zoomedCamera = model.zoomCameraAt(camera, 2, pointer, viewBox);
const after = model.cameraView(zoomedCamera, viewBox);
const beforeAnchor = [before.x + before.width * pointer.x, before.y + before.height * pointer.y];
const afterAnchor = [after.x + after.width * pointer.x, after.y + after.height * pointer.y];
assert.ok(Math.abs(beforeAnchor[0] - afterAnchor[0]) < 1e-7, "pointer-anchored zoom must preserve x");
assert.ok(Math.abs(beforeAnchor[1] - afterAnchor[1]) < 1e-7, "pointer-anchored zoom must preserve y");
const leftAnchoredCamera = model.zoomCameraAt({ cx: 600, cy: 380, zoom: 2 }, 3, { x: 0, y: 0.5 }, viewBox);
const leftBefore = model.cameraView({ cx: 600, cy: 380, zoom: 2 }, viewBox);
const leftAfter = model.cameraView(leftAnchoredCamera, viewBox);
assert.ok(Math.abs(leftBefore.x - leftAfter.x) < 1e-7, "zoom at the left edge must preserve a zero-valued pointer anchor");
const portraitAspect = 390 / 740;
const portraitView = model.cameraView({ cx: 600, cy: 380, zoom: 2.5 }, viewBox, portraitAspect);
assert.ok(Math.abs(portraitView.width / portraitView.height - portraitAspect) < 1e-7, "portrait camera view must match its container aspect");
const boundedCamera = model.clampCamera({ cx: -999, cy: 9999, zoom: 1 }, viewBox);
const boundedView = model.cameraView(boundedCamera, viewBox);
assert.ok(boundedView.x >= viewBox.x - viewBox.width * 0.081, "camera must not drag most of the continent off-screen horizontally");
assert.ok(boundedView.y + boundedView.height <= viewBox.y + viewBox.height * 1.081, "camera must not drag most of the continent off-screen vertically");

const html = read("map-lab/index.html");
const css = read("map-lab/map-lab.css");
const ui = read("map-lab/map-lab.js");
const mapModel = read("map-lab/map-model.js");
const reliefDepthSource = ui.match(/const RELIEF_DEPTHS = Object\.freeze\(\{([\s\S]*?)\}\);/u)?.[1];
assert.ok(reliefDepthSource, "map lab must define bounded per-terrain relief depths");
const reliefDepths = Object.fromEntries(
  Array.from(reliefDepthSource.matchAll(/^\s*([a-z]+):\s*(\d+),?\s*$/gmu), ([, terrain, depth]) => [terrain, Number(depth)])
);
assert.deepEqual(Object.keys(reliefDepths).sort(), Object.keys(data.terrainTypes).sort(), "every terrain family needs an explicit relief depth");
assert.ok(Object.values(reliefDepths).every((depth) => Number.isInteger(depth) && depth > 0 && depth <= 11), "relief depths must stay within the 11px interaction-safe budget");
assert.ok(new Set(Object.values(reliefDepths)).size >= 3, "terrain depth must visibly distinguish low, medium, and high ground");
assert.ok(reliefDepths.mountain > reliefDepths.plain, "mountains must project deeper than plains");
const reliefProfileSource = ui.match(/function reliefProfile\(\)\s*\{([\s\S]*?)\n\s*\}/u)?.[1];
const desktopReliefProfile = reliefProfileSource?.match(/:\s*\{\s*skewX:\s*(-?\d+(?:\.\d+)?),\s*scaleY:\s*(\d+(?:\.\d+)?),\s*landY:/u);
assert.ok(desktopReliefProfile, "map lab must define a desktop relief profile");
assert.ok(Number(desktopReliefProfile[2]) >= 0.9, "desktop relief scaleY must remain at least 0.90 so labels and hit targets stay aligned");
const reliefBuildSource = ui.match(/const reliefCells = geography\.cells[\s\S]*?(?=\n\s*geography\.cells\.forEach)/u)?.[0];
assert.ok(reliefBuildSource, "relief geometry must be derived once from the fixed province cells");
assert.equal((reliefBuildSource.match(/dom\.provinceReliefLayer\.append\(/gu) || []).length, 1, "each province relief group must be appended only once");
assert.doesNotMatch(reliefBuildSource, /role:|tabindex:|addEventListener/u, "decorative relief geometry must never duplicate province interaction handlers");
for (const mode of ["political", "terrain", "military"]) {
  assert.match(html, new RegExp(`data-map-mode="${mode}"`, "u"), `${mode} mode button is missing`);
  assert.match(css, new RegExp(`data-mode="${mode}"`, "u"), `${mode} mode styles are missing`);
}
assert.match(html, /id="languageToggle"/u, "map lab must expose a language toggle");
assert.match(html, /id="reliefToggle"/u, "map lab must expose a 3D/2D relief toggle");
assert.match(html, /id="battleReport"/u, "map lab must expose a visible battle report");
assert.match(html, /id="endPhaseButton"[^>]*type="button"/u, "map lab must expose a dedicated end-phase button");
assert.match(html, /id="endPhaseButton"[^>]*aria-keyshortcuts="E"/u, "the end-phase control must expose its keyboard shortcut");
assert.match(html, /id="phaseStatus"/u, "map lab must expose the current turn and player phase");
assert.match(html, /id="phaseReport"/u, "map lab must expose a visible AI phase report");
assert.match(html, /id="recruitPanel"/u, "map lab must expose recruitment in the province inspector");
assert.match(html, /id="recruitButton"[^>]*type="button"[^>]*aria-keyshortcuts="V"/u, "recruitment must use a dedicated button with its keyboard shortcut");
for (const layerId of ["worldLayer", "provinceLayer", "provinceReliefLayer"]) {
  assert.equal((html.match(new RegExp(`id="${layerId}"`, "gu")) || []).length, 1, `${layerId} must appear exactly once`);
}
assert.match(html, /id="provinceReliefLayer"[^>]*aria-hidden="true"/u, "decorative relief must stay outside the accessibility interaction tree");
assert.doesNotMatch(`${html}\n${ui}`, /<filter\b|<fe[a-z]+\b|svgElement\(\s*["'](?:filter|fe[a-z]+)["']/iu, "map relief must avoid SVG filters, including blur, drop-shadow, and turbulence primitives");
assert.match(html, /\.\.\/balance-model\.js\?v=/u, "map lab must reuse the formal deterministic casualty model");
assert.match(html, /map-model\.js\?v=/u, "map lab must load its isolated model");
assert.doesNotMatch(html, /src="(?:\.\.\/)?game\.js/u, "map lab must not load the formal game runtime");
assert.match(ui, /window\.history\.replaceState/u, "map lab should preserve scenario state in the URL");
assert.match(ui, /function activateProvince/u, "map lab needs a unified province command handler");
assert.match(ui, /MODEL\.executeArmyBattle/u, "hostile province activation must resolve a battle");
assert.match(ui, /MODEL\.executeAiPhase/u, "ending the player phase must execute the deterministic AI phase");
assert.match(ui, /MODEL\.executeRecruitment/u, "the inspector recruitment control must use the deterministic recruitment model");
assert.match(ui, /function executeRecruitment/u, "map lab must route recruitment through one guarded handler");
assert.match(ui, /recruitLockedUntil = now \+ 450/u, "recruitment must guard against accidental double activation");
assert.match(ui, /if \(!event\.repeat\) executeRecruitment/u, "holding the recruitment keyboard shortcut must not recruit more than once");
assert.match(ui, /function endPlayerPhase/u, "map lab must route end-phase input through one guarded handler");
assert.match(ui, /phaseLockedUntil = now \+ 650/u, "the end-phase handler must reject accidental double activation");
assert.match(ui, /if \(!event\.repeat\) endPlayerPhase/u, "holding the end-phase keyboard shortcut must not skip multiple turns");
assert.match(ui, /function renderBattleReport/u, "map lab must render bilingual battle feedback");
assert.match(ui, /function renderPhaseReport/u, "map lab must render bilingual AI movement, attack, and hold feedback");
assert.match(ui, /function renderRecruitment/u, "map lab must render recruitment availability and cooldown feedback");
assert.match(ui, /provokedRealmId/u, "battle feedback must explain when an attacked neutral realm becomes hostile");
assert.match(ui, /is-neutral-target/u, "neutral targets must remain visually distinct from hostile targets");
assert.match(ui, /classification\.kind === "spent"/u, "the UI must explain when a selected army has already acted");
assert.match(ui, /function renderMovementTargets[\s\S]*MODEL\.classifyArmyDestination[\s\S]*result\.kind === "move"[\s\S]*result\.kind === "attack"/u, "spent armies must expose neither movement nor attack target styling");
assert.doesNotMatch(ui, /result\.kind === "move" \|\| result\.kind === "attack"/u, "clicking another friendly army must select it instead of moving the current army");
assert.match(ui, /combatLockedUntil = Date\.now\(\) \+ 400/u, "battle activation must guard against accidental double resolution");
assert.match(ui, /lastPhaseReport = null;[\s\S]*phaseLockedUntil = 0;/u, "reshuffling a seed must reset the previous phase report and phase lock");
assert.match(ui, /lastRecruitReport = null;[\s\S]*recruitLockedUntil = 0;/u, "reshuffling a seed must reset recruitment feedback and its input lock");
assert.match(ui, /function reliefFacingEdges[\s\S]*function reliefWallPath/u, "map lab must limit sidewalls to visible-facing polygon edges");
assert.match(reliefBuildSource, /"data-relief-depth": depth/u, "each relief group must expose its per-terrain depth");
assert.equal((reliefBuildSource.match(/d:\s*reliefWallPath\(cell\.points, depth, "(?:side|front)"\)/gu) || []).length, 2, "relief must render exactly one side face and one front face per province");
assert.match(reliefBuildSource, /class:\s*"province-relief-rim"[\s\S]*d:\s*reliefRimPath\(cell\.points\)[\s\S]*reliefCell\.append\(side, front, rim\)/u, "relief must keep its three decorative paths inside one province group");
assert.equal((ui.match(/class:\s*"province-shape"/gu) || []).length, 1, "each province must have only one interactive top-face factory");
assert.match(ui, /function reliefProfile\(\)[\s\S]*window\.matchMedia\([\s\S]*skewX:[\s\S]*scaleY:/u, "oblique projection parameters must adapt to compact screens");
assert.match(ui, /function reliefWorldTransform\(\)[\s\S]*reliefProfile\(\)[\s\S]*return `matrix\(/u, "3D relief must derive its SVG projection from the active profile");
assert.match(ui, /function applyReliefProjection\(\)[\s\S]*landDepth\.setAttribute\("transform"[\s\S]*reliefMode === "3d"[\s\S]*worldLayer\.setAttribute\("transform", reliefWorldTransform\(\)\)[\s\S]*worldLayer\.removeAttribute\("transform"\)/u, "projection and depth offsets must apply in 3D and be removed in 2D");
assert.match(ui, /function setReliefMode[\s\S]*applyReliefProjection\(\)/u, "changing relief mode must immediately apply the selected projection");
assert.match(ui, /window\.addEventListener\("resize", \(\) => \{[\s\S]*applyReliefProjection\(\);[\s\S]*applyCamera\(\);[\s\S]*\}\);/u, "responsive projection parameters must be reapplied after resize");
assert.doesNotMatch(`${html}\n${ui}`, /<canvas\b|WebGL2?RenderingContext|THREE\.|getContext\(\s*["'](?:experimental-)?webgl2?["']/iu, "map relief must not require WebGL or a canvas renderer");
assert.match(mapModel, /lastActedTurn/u, "turn state must be stored per army in the deterministic model");
assert.match(mapModel, /executeAiPhase/u, "the deterministic model must export its AI phase runner");
assert.match(mapModel, /executeRecruitment/u, "the deterministic model must export recruitment");
assert.match(mapModel, /realmRelation[\s\S]*canRealmAttack/u, "the deterministic model must expose relationship-aware attack rules");
assert.doesNotMatch(mapModel, /Math\.random|Date\.now/u, "AI decisions must not depend on nondeterministic randomness or wall-clock time");
assert.match(css, /province-shape\.is-move-target/u, "map lab needs friendly movement target styling");
assert.match(css, /province-shape\.is-attack-target/u, "map lab needs hostile movement target styling");
assert.match(css, /province-shape\.is-neutral-target/u, "map lab needs distinct neutral target styling");
assert.match(css, /\.inspector-battle/u, "map lab needs visible battle report styling");
assert.match(css, /\.inspector-phase/u, "map lab needs visible AI phase report styling");
assert.match(css, /\.inspector-recruit/u, "map lab needs visible recruitment styling");
assert.match(css, /#endPhaseButton\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?border-radius:\s*0;/u, "the end-phase control must remain a square button");
assert.match(css, /#recruitButton\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;[\s\S]*?border-radius:\s*0;/u, "the recruitment control must remain a square button");
assert.doesNotMatch(`${html}\n${ui}`, /战斗待接|战斗尚未接入|combat pending|combat not connected/iu, "completed combat must not be described as pending");
assert.match(css, /data-zoom-band="far"/u, "map lab needs semantic zoom styles");
assert.match(css, /body\[data-relief="2d"\] \.land-depth,\s*body\[data-relief="2d"\] \.province-relief-layer\s*\{\s*display:\s*none;/u, "2D fallback must hide both land depth and province relief");
assert.match(css, /\.province-relief-layer(?:,\s*\.province-relief-cell)?\s*\{\s*pointer-events:\s*none;/u, "decorative relief must not intercept province input");
assert.match(css, /@media \(max-width: 820px\)/u, "map lab needs a mobile inspector layout");
assert.match(css, /--inspector-rail:\s*374px;/u, "desktop layout must reserve a 374px inspector rail");
assert.match(css, /\.map-surface\s*\{[^}]*width:\s*calc\(100% - var\(--inspector-rail\)\);/u, "the desktop map surface must exclude the expanded inspector rail");
assert.match(css, /body\[data-inspector-collapsed="true"\] \.map-surface\s*\{[^}]*width:\s*100%;/u, "collapsing the inspector must restore the full map width");
const compactInspectorCss = css.slice(
  css.indexOf("@media (max-width: 820px)"),
  css.indexOf("@media (max-width: 520px)")
);
assert.match(compactInspectorCss, /\.map-surface\s*\{[^}]*right:\s*0;[^}]*width:\s*100%;/u, "compact layouts must keep the map full width beneath the bottom inspector sheet");
const lowLandscapeCss = css.slice(
  css.indexOf("@media (max-height: 620px) and (orientation: landscape)"),
  css.indexOf("@media (prefers-reduced-motion: reduce)")
);
assert.match(lowLandscapeCss, /--inspector-rail:\s*318px;/u, "low landscape layouts must reserve the narrower 318px inspector rail");
assert.match(html, /id="inspectorToggle"[^>]*type="button"[^>]*aria-expanded="true"/u, "the inspector handle must remain an accessible toggle button");
const inspectorCollapseSource = ui.match(/function setInspectorCollapsed\(collapsed\)\s*\{([\s\S]*?)\n\s*\}/u)?.[1];
assert.ok(inspectorCollapseSource, "map lab must keep a unified inspector collapse handler");
assert.match(inspectorCollapseSource, /inspectorToggle\.setAttribute\("aria-expanded",[\s\S]*?window\.requestAnimationFrame\(applyCamera\);/u, "inspector collapse must update accessibility state before recalculating the camera on the next frame");
assert.match(ui, /inspectorToggle\.addEventListener\("click",\s*\(\)\s*=>\s*setInspectorCollapsed\(/u, "the inspector handle must remain wired to the collapse handler");
const packageScript = read("scripts/package-game.mjs");
assert.match(packageScript, /rmSync\(dist, \{ force: true, recursive: true \}\)/u, "packaging must clear obsolete outputs first");
assert.match(packageScript, /cpSync\(join\(root, "map-lab"\)/u, "offline package must include the map lab");

console.log(`Map lab checks passed: ${data.provinces.length} provinces, ${data.strategicRegions.length} regions, ${geography.sharedEdges.length} borders, 100 deterministic scenarios.`);
