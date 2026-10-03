import assert from "node:assert/strict";
import {
  projectionFor,
  projectOffset,
  unprojectOffset,
  projectedBounds,
  deterministicTerrainFeatures,
} from "../src/map/game-projection.js";

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
}

function closePoint(actual, expected, label) {
  close(actual.x, expected.x, `${label} x`);
  close(actual.y, expected.y, `${label} y`);
}

assert.equal(projectionFor("relief").topElevation, 14);
assert.equal(projectionFor("flat").topElevation, 0);
assert.equal(projectionFor("unsupported"), projectionFor("flat"));
assert.equal(projectionFor("constructor"), projectionFor("flat"));
assert.ok(Object.isFrozen(projectionFor("relief")), "Shared projection settings are immutable.");

for (const point of [
  { x: 0, y: 0 },
  { x: 183.2, y: -76.8 },
  { x: -925, y: 1250 },
  { x: 1.25, y: -0.05 },
]) {
  closePoint(projectOffset(point, "flat", 999), point, "Flat mode ignores elevation");
  for (const mode of ["flat", "relief"]) {
    for (const elevation of [undefined, 0, 14, 39]) {
      closePoint(
        unprojectOffset(projectOffset(point, mode, elevation), mode, elevation),
        point,
        `${mode} round trip at elevation ${elevation}`,
      );
    }
  }
}
closePoint(projectOffset({ x: 10, y: 100 }, "relief"), { x: 28, y: 58 }, "Known top projection");
closePoint(projectOffset({ x: 10, y: 100 }, "relief", 0), { x: 28, y: 72 }, "Sea-level projection");

// A pointer must stay over the same province while zooming, even far from the
// view center. This is the coordinate chain used for Canvas drag/hit testing.
for (const mode of ["flat", "relief"]) {
  for (const pointer of [
    { x: 47, y: 663 },
    { x: 1217, y: 31 },
    { x: 702, y: 388 },
  ]) {
    const origin = { x: 700, y: 350 };
    const before = { x: -211, y: 430, scale: 0.61 };
    const worldOffset = unprojectOffset(
      { x: (pointer.x - origin.x) / before.scale, y: (pointer.y - origin.y) / before.scale },
      mode,
    );
    const anchor = { x: before.x + worldOffset.x, y: before.y + worldOffset.y };
    for (const scale of [0.12, 1, 3.65]) {
      const nextOffset = unprojectOffset(
        { x: (pointer.x - origin.x) / scale, y: (pointer.y - origin.y) / scale },
        mode,
      );
      const camera = { x: anchor.x - nextOffset.x, y: anchor.y - nextOffset.y };
      const projected = projectOffset({ x: anchor.x - camera.x, y: anchor.y - camera.y }, mode);
      closePoint(
        { x: origin.x + projected.x * scale, y: origin.y + projected.y * scale },
        pointer,
        `${mode} zoom preserves pointer anchor`,
      );
    }
  }
}

for (const mode of ["flat", "relief"]) {
  for (const elevation of [0, 14, 42]) {
    const bounds = { left: -125, top: -230, right: 850, bottom: 480 };
    const projected = projectedBounds(bounds, mode, elevation);
    for (let row = 0; row <= 10; row += 1) {
      for (let column = 0; column <= 10; column += 1) {
        const point = projectOffset(
          {
            x: bounds.left + ((bounds.right - bounds.left) * column) / 10,
            y: bounds.top + ((bounds.bottom - bounds.top) * row) / 10,
          },
          mode,
          elevation,
        );
        assert.ok(point.x >= projected.left && point.x <= projected.right);
        assert.ok(point.y >= projected.top && point.y <= projected.bottom);
      }
    }
    if (mode === "flat") assert.deepEqual(projected, bounds);
    else {
      close(projected.right - projected.left, 1102.8, "Oblique fit includes shear width");
      close(projected.bottom - projected.top, 511.2, "Oblique fit includes compressed height");
    }
  }
}

const province = Object.freeze({
  id: "province-21",
  center: Object.freeze([104, 230]),
  terrain: "mountain",
});
const first = deterministicTerrainFeatures(province);
const second = deterministicTerrainFeatures(province);
assert.deepEqual(first, second, "Repeated views preserve the same terrain relief.");
assert.notDeepEqual(
  first,
  deterministicTerrainFeatures({ ...province, id: "province-22" }),
  "Distinct provinces receive distinct visual geometry.",
);
assert.deepEqual(
  first,
  deterministicTerrainFeatures({ ...province, center: { x: 104, y: 230 } }),
  "Coordinate representations do not change the visual result.",
);
assert.ok(first.length >= 3 && first.length <= 4);
for (const feature of first) {
  assert.equal(feature.kind, "mountain");
  assert.ok(feature.width > 0 && feature.depth > 0 && feature.height >= 14);
  assert.ok(Number.isFinite(feature.center.x) && Number.isFinite(feature.center.y));
}
const gameplayRandom = Math.random;
Math.random = () => {
  throw new Error("Visual relief must not consume gameplay randomness.");
};
try {
  for (const terrain of [
    "mountain",
    "canyon",
    "plain",
    "basin",
    "river",
    "coast",
    "tundra",
    "waste",
  ]) {
    const features = deterministicTerrainFeatures({ ...province, terrain });
    assert.ok(features.length <= 4, "Each province has a bounded decoration count.");
    assert.ok(
      features.every((feature) => feature.width > 0 && feature.depth > 0 && feature.height > 0),
    );
  }
} finally {
  Math.random = gameplayRandom;
}
assert.deepEqual(deterministicTerrainFeatures({ ...province, terrain: "unknown" }), []);
assert.deepEqual(deterministicTerrainFeatures({ id: "missing-center", terrain: "mountain" }), []);

console.log(
  "Map projection checks passed: inverse coordinates, zoom anchors, bounds, and stable visual relief.",
);
