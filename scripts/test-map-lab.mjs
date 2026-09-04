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
  });
  if (previousSignature) assert.notEqual(scenario.signature, previousSignature, `adjacent seeds ${seed - 1}/${seed} should produce distinct scenarios`);
  previousSignature = scenario.signature;
  assert.equal(model.buildGeography(data).signature, geography.signature, `seed ${seed} must not mutate fixed geography`);
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
assert.match(html, /map-model\.js\?v=/u, "map lab must load its isolated model");
assert.doesNotMatch(html, /src="(?:\.\.\/)?game\.js/u, "map lab must not load the formal game runtime");
assert.match(ui, /window\.history\.replaceState/u, "map lab should preserve scenario state in the URL");
assert.match(css, /data-zoom-band="far"/u, "map lab needs semantic zoom styles");
assert.match(css, /@media \(max-width: 820px\)/u, "map lab needs a mobile inspector layout");
const packageScript = read("scripts/package-game.mjs");
assert.match(packageScript, /rmSync\(dist, \{ force: true, recursive: true \}\)/u, "packaging must clear obsolete outputs first");
assert.match(packageScript, /cpSync\(join\(root, "map-lab"\)/u, "offline package must include the map lab");

console.log(`Map lab checks passed: ${data.provinces.length} provinces, ${data.strategicRegions.length} regions, ${geography.sharedEdges.length} borders, 100 deterministic scenarios.`);
