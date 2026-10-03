/** Visual-only map projection; geography, simulation, and save data stay planar. */
const PROJECTIONS = Object.freeze({
  flat: Object.freeze({ mode: "flat", shearX: 0, scaleY: 1, topElevation: 0 }),
  relief: Object.freeze({ mode: "relief", shearX: 0.18, scaleY: 0.72, topElevation: 14 }),
});

export function projectionFor(mode) {
  return mode === "relief" ? PROJECTIONS.relief : PROJECTIONS.flat;
}

export function projectOffset(point, mode, elevation) {
  const projection = projectionFor(mode);
  const z = projection.mode === "flat" ? 0 : (elevation ?? projection.topElevation);
  return {
    x: point.x + projection.shearX * point.y,
    y: projection.scaleY * point.y - z,
  };
}

export function unprojectOffset(point, mode, elevation) {
  const projection = projectionFor(mode);
  const z = projection.mode === "flat" ? 0 : (elevation ?? projection.topElevation);
  const y = (point.y + z) / projection.scaleY;
  return { x: point.x - projection.shearX * y, y };
}

/** All four corners matter: the oblique projection couples each axis. */
export function projectedBounds(bounds, mode, elevation) {
  const corners = [
    { x: bounds.left, y: bounds.top },
    { x: bounds.right, y: bounds.top },
    { x: bounds.right, y: bounds.bottom },
    { x: bounds.left, y: bounds.bottom },
  ].map((point) => projectOffset(point, mode, elevation));
  return {
    left: Math.min(...corners.map((point) => point.x)),
    top: Math.min(...corners.map((point) => point.y)),
    right: Math.max(...corners.map((point) => point.x)),
    bottom: Math.max(...corners.map((point) => point.y)),
  };
}

function hash(text) {
  let result = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  }
  result = Math.imul(result ^ (result >>> 16), 0x85ebca6b);
  result = Math.imul(result ^ (result >>> 13), 0xc2b2ae35);
  result ^= result >>> 16;
  return result >>> 0;
}

/**
 * Small, stable relief accents. Dimensions use world units; height is above
 * the continent's top surface. Callers clip them to the province polygon.
 * This independent visual hash never consumes the gameplay RNG.
 */
export function deterministicTerrainFeatures(province) {
  const center = Array.isArray(province?.center)
    ? { x: Number(province.center[0]), y: Number(province.center[1]) }
    : { x: Number(province?.center?.x), y: Number(province?.center?.y) };
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return [];
  const terrain = province.terrain;
  const key = `${province.id ?? ""}:${center.x}:${center.y}:${terrain ?? ""}`;
  const sample = (index) => hash(`${key}:${index}`) / 4294967296;
  let kind, count;
  if (terrain === "mountain") {
    kind = "mountain";
    count = 3 + Math.floor(sample(0) * 2);
  } else if (terrain === "canyon") {
    kind = "canyon";
    count = 3;
  } else if (["plain", "basin"].includes(terrain)) {
    kind = "hill";
    count = Math.floor(sample(0) * 3);
  } else if (["river", "coast", "tundra", "waste"].includes(terrain)) {
    kind = "hill";
    count = Math.floor(sample(0) * 2);
  } else return [];

  return Array.from({ length: count }, (_, index) => {
    const offset = index * 7 + 1;
    return {
      kind,
      center: {
        x: center.x + (index - (count - 1) / 2) * 21 + (sample(offset) - 0.5) * 8,
        y: center.y + (sample(offset + 1) - 0.5) * 24,
      },
      width: (kind === "hill" ? 18 : 20) + sample(offset + 2) * 10,
      depth: (kind === "hill" ? 8 : 12) + sample(offset + 3) * 8,
      height:
        kind === "mountain"
          ? 14 + sample(offset + 4) * 12
          : kind === "canyon"
            ? 5 + sample(offset + 4) * 5
            : 3 + sample(offset + 4) * 4,
    };
  });
}
