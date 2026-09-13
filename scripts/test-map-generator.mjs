import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const context = vm.createContext({ console });
for (const filename of ["map-data.js", "map-model.js", "map-generator.js"]) {
  vm.runInContext(fs.readFileSync(path.join(projectRoot, "map-lab", filename), "utf8"), context, { filename });
}
const base = context.CRADLES_MAP_LAB_DATA;
const model = context.CRADLES_MAP_LAB_MODEL;
const generator = context.CRADLES_MAP_GENERATOR;
const original = JSON.stringify(base);
const baseIds = Array.from(base.provinces, (province) => province.id).sort();
const entities = ["player-realm", "free-cities", "coastal-republic", "solar-court", "ash-confederacy"];
const seeds = [1, 13, 22, 42, 52, 62, 87, 1058];
const signatures = new Set();
const coastlines = new Set();
const terrainPatterns = new Set();
let checkedCapitals = 0;

assert.equal(model.buildGeography(base).signature, "342bf330", "legacy saves must retain the reviewed fixed geometry");
assert.throws(() => generator.generate(base, 1058, "unknown-map-version"), /Unsupported map generator version/u, "unknown generation versions must not silently reinterpret saved worlds");

function withinLand(point, polygon, tolerance = 0.003) {
  return polygon.every((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    return cross / Math.hypot(end.x - start.x, end.y - start.y) >= -tolerance;
  });
}

for (const seed of seeds) {
  const data = generator.generate(base, seed);
  const geography = model.buildGeography(data);
  assert.equal(data.generatorVersion, generator.VERSION);
  assert.equal(data.geometrySeed, seed);
  assert.equal(JSON.stringify(data), JSON.stringify(generator.generate(base, seed)), `seed ${seed} must rebuild byte-identical data`);
  assert.equal(Object.isFrozen(data), true);
  assert.equal(Object.isFrozen(data.provinces[0].center), true);
  assert.deepEqual(Array.from(data.provinces, (province) => province.id).sort(), baseIds, "generation must retain all 64 stable province identifiers");
  assert.equal(data.provinces.length, 64);
  assert.equal(data.strategicRegions.length, 10);
  assert.equal(model.connectedComponents(baseIds, geography.neighbors).length, 1);
  assert.equal(geography.sharedEdges.some((edge) => edge.synthetic), false, "random maps must not invent a road across disconnected land");
  assert.ok(data.landPolygon.length >= 3);
  signatures.add(geography.signature);
  coastlines.add(data.landPath);
  terrainPatterns.add(data.provinces.map((province) => province.terrain).join("|"));

  data.provinces.forEach((province, index) => {
    assert.equal(JSON.stringify(province.base), JSON.stringify(base.provinces[index].base), "geography must not alter province economy or fortification baselines");
    assert.equal(province.nameZh, base.provinces[index].nameZh);
    assert.equal(province.nameEn, base.provinces[index].nameEn);
    assert.ok(data.terrainTypes[province.terrain]);
    assert.ok(withinLand({ x: province.center[0], y: province.center[1] }, data.landPolygon));
    assert.ok(model.polygonArea(geography.cellByProvinceId[province.id].points) > 1, "every province must retain a playable nonempty cell");
  });
  geography.cells.forEach((cell) => {
    cell.points.forEach((point) => assert.ok(withinLand(point, data.landPolygon), "province cells must not extend beyond the generated coastline"));
  });
  const provinceArea = geography.cells.reduce((sum, cell) => sum + model.polygonArea(cell.points), 0);
  assert.ok(Math.abs(provinceArea - model.polygonArea(data.landPolygon)) < 2, "province polygons must tile the continent without gaps or overlaps");
  data.strategicRegions.forEach((region) => {
    const ids = data.provinces.filter((province) => province.strategicRegionId === region.id).map((province) => province.id);
    assert.ok(ids.length > 0);
    assert.ok(model.isConnectedSubset(ids, geography.neighbors), `${region.id} must remain a contiguous geographic region`);
  });
  data.rivers.forEach((river) => {
    const coordinates = river.path.match(/-?\d+(?:\.\d+)?/gu).map(Number);
    for (let index = 0; index < coordinates.length; index += 2) {
      assert.ok(withinLand({ x: coordinates[index], y: coordinates[index + 1] }, data.landPolygon), "river segments must flow through land to the coast");
    }
  });

  for (const province of data.provinces) {
    const result = generator.partitionControllers(geography, seed, province.id, entities);
    assert.equal(Object.keys(result).length, 64);
    assert.equal(result[province.id], entities[0], "the selected capital must belong to the player");
    assert.equal(JSON.stringify(result), JSON.stringify(generator.partitionControllers(geography, seed, province.id, entities)), "fallback ownership must be deterministic");
    entities.forEach((entityId, index) => {
      const ids = Object.keys(result).filter((id) => result[id] === entityId);
      assert.equal(ids.length, index === 4 ? 12 : 13, "fallback must retain the original 13/13/13/13/12 opening balance");
      assert.ok(model.isConnectedSubset(ids, geography.neighbors), `seed ${seed}, capital ${province.id}: ${entityId} must start connected`);
    });
    checkedCapitals += 1;
  }
}

assert.equal(signatures.size, seeds.length, "different seeds must produce distinct physical geography");
assert.equal(coastlines.size, seeds.length, "different seeds must change coastlines, not just ownership colors");
assert.equal(terrainPatterns.size, seeds.length, "different seeds must change actual terrain distribution");
assert.equal(JSON.stringify(base), original, "generating new worlds must not mutate the legacy map catalog");
assert.equal(model.buildGeography(base).signature, "342bf330");
console.log(`Map generator checks passed: ${seeds.length} deterministic continents, ${checkedCapitals} valid starting capitals, unchanged legacy geography.`);
