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
assert.deepEqual(
  Object.fromEntries(movementScenario.armies.filter((army) => army.id !== commandArmy.id).map((army) => [army.id, army.provinceId])),
  otherArmyPositions,
  "movement must not relocate other armies"
);
assert.equal(JSON.stringify(movementScenario.controllerByProvince), controllersBeforeMove, "sandbox movement must not alter political control");
assert.equal(JSON.stringify(movementScenario.provinceState), provinceStateBeforeMove, "sandbox movement must not alter province values");
assert.equal(movementScenario.signature, scenarioSignatureBeforeMove, "sandbox movement must preserve the seeded scenario signature");

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

for (const scenario of [repeatedBattleLeft.scenario, victoryScenario, guardedScenario, defeatScenario]) {
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
for (const mode of ["political", "terrain", "military"]) {
  assert.match(html, new RegExp(`data-map-mode="${mode}"`, "u"), `${mode} mode button is missing`);
  assert.match(css, new RegExp(`data-mode="${mode}"`, "u"), `${mode} mode styles are missing`);
}
assert.match(html, /id="languageToggle"/u, "map lab must expose a language toggle");
assert.match(html, /id="reliefToggle"/u, "map lab must expose a 3D/2D relief toggle");
assert.match(html, /id="battleReport"/u, "map lab must expose a visible battle report");
assert.match(html, /id="provinceReliefLayer"/u, "map lab must expose a static relief layer");
assert.doesNotMatch(html, /feDropShadow|feTurbulence/u, "map relief must avoid expensive SVG filters");
assert.match(html, /\.\.\/balance-model\.js\?v=/u, "map lab must reuse the formal deterministic casualty model");
assert.match(html, /map-model\.js\?v=/u, "map lab must load its isolated model");
assert.doesNotMatch(html, /src="(?:\.\.\/)?game\.js/u, "map lab must not load the formal game runtime");
assert.match(ui, /window\.history\.replaceState/u, "map lab should preserve scenario state in the URL");
assert.match(ui, /function activateProvince/u, "map lab needs a unified province command handler");
assert.match(ui, /MODEL\.executeArmyBattle/u, "hostile province activation must resolve a battle");
assert.match(ui, /function renderBattleReport/u, "map lab must render bilingual battle feedback");
assert.doesNotMatch(ui, /result\.kind === "move" \|\| result\.kind === "attack"/u, "clicking another friendly army must select it instead of moving the current army");
assert.match(ui, /combatLockedUntil = Date\.now\(\) \+ 400/u, "battle activation must guard against accidental double resolution");
assert.match(ui, /function reliefWallPath/u, "map lab must build lightweight vector sidewalls");
assert.match(ui, /function reliefWorldTransform/u, "3D relief must include a lightweight oblique projection");
assert.match(ui, /worldLayer\.setAttribute\("transform"/u, "3D relief must apply its projection to the SVG world layer");
assert.doesNotMatch(ui, /WebGLRenderingContext|THREE\.|getContext\(["']webgl/u, "map relief must not require WebGL");
assert.match(css, /province-shape\.is-move-target/u, "map lab needs friendly movement target styling");
assert.match(css, /province-shape\.is-attack-target/u, "map lab needs hostile movement target styling");
assert.match(css, /\.inspector-battle/u, "map lab needs visible battle report styling");
assert.doesNotMatch(`${html}\n${ui}`, /战斗待接|战斗尚未接入|combat pending|combat not connected/iu, "completed combat must not be described as pending");
assert.match(css, /data-zoom-band="far"/u, "map lab needs semantic zoom styles");
assert.match(css, /data-relief="2d"/u, "map lab needs a flat fallback mode");
assert.match(css, /@media \(max-width: 820px\)/u, "map lab needs a mobile inspector layout");
const packageScript = read("scripts/package-game.mjs");
assert.match(packageScript, /rmSync\(dist, \{ force: true, recursive: true \}\)/u, "packaging must clear obsolete outputs first");
assert.match(packageScript, /cpSync\(join\(root, "map-lab"\)/u, "offline package must include the map lab");

console.log(`Map lab checks passed: ${data.provinces.length} provinces, ${data.strategicRegions.length} regions, ${geography.sharedEdges.length} borders, 100 deterministic scenarios.`);
