import { pointXY } from "./game-geometry.js";
import { deterministicTerrainFeatures, projectionFor } from "./game-projection.js";

const projection = projectionFor("relief");

function pathFor(points, close = true) {
  const path = new Path2D();
  points.forEach((point, index) =>
    index ? path.lineTo(point.x, point.y) : path.moveTo(point.x, point.y),
  );
  if (close) path.closePath();
  return path;
}

/** Cancel the top-plane shear so a height change projects vertically upward. */
function lifted(point, height) {
  return {
    x: point.x + (projection.shearX * height) / projection.scaleY,
    y: point.y - height / projection.scaleY,
  };
}

const interpolate = (a, b, ratio) => ({
  x: a.x + (b.x - a.x) * ratio,
  y: a.y + (b.y - a.y) * ratio,
});

function compileFeature(feature) {
  const { center, width, depth, height, kind } = feature;
  const faces = [],
    edges = [];
  const face = (color, points) => faces.push({ color, path: pathFor(points) });
  const edge = (color, points, width = 0.6) =>
    edges.push({ color, width, path: pathFor(points, false) });
  const point = (x, y) => ({ x: center.x + x * width, y: center.y + y * depth });

  if (kind === "canyon") {
    // A narrow, jagged incision keeps canyons legible without visually raising
    // whole provinces or hiding ownership borders under large cliffs.
    const bank = [
      point(-0.5, -0.24),
      point(-0.18, -0.4),
      point(0.08, -0.18),
      point(0.32, -0.32),
      point(0.5, -0.12),
    ];
    const front = bank.map((value, index) => ({
      x: value.x + (index % 2 ? 1.3 : -0.8),
      y: value.y + depth * 0.48,
    }));
    const backFloor = bank.map((value) => lifted(value, -height * 0.4)),
      frontFloor = front.map((value) => lifted(value, -height * 0.24));
    face("#71604a", [...bank, ...front.slice().reverse()]);
    face("#5d513f", [...backFloor, ...frontFloor.slice().reverse()]);
    face("#c3ad83", [...bank, ...backFloor.slice().reverse()]);
    face("#8a7153", [...frontFloor, ...front.slice().reverse()]);
    edge("#ded0a16e", bank, 0.7);
    edge("#5a4c36a8", front, 0.6);
  } else {
    const north = point(-0.06, -0.5),
      east = point(0.5, 0),
      south = point(0.04, 0.5),
      west = point(-0.5, 0);
    const summit = lifted(point(kind === "hill" ? -0.04 : -0.1, -0.04), height);
    // The subdued ground shadow is geometry, not a blur or a second surface.
    face("#5b503125", [
      point(-0.32, 0.24),
      point(0.12, -0.02),
      point(0.69, 0.32),
      point(0.48, 0.72),
      point(-0.17, 0.62),
    ]);
    const colors =
      kind === "mountain"
        ? ["#c6bea0", "#a59f8a", "#797963", "#b9ae88"]
        : ["#cbbf93", "#b7ac83", "#968e6d", "#beb38c"];
    // Back faces are painted first. The northwest face catches the light;
    // the southeast face and the central ridge define the visible volume.
    face(colors[0], [west, north, summit]);
    face(colors[1], [north, east, summit]);
    face(colors[2], [east, south, summit]);
    face(colors[3], [south, west, summit]);
    if (kind === "mountain" && height > 18) {
      const cap = (base) => interpolate(summit, base, 0.24);
      face("#c7c8b9", [summit, cap(east), cap(south)]);
      face("#e0deca", [summit, cap(south), cap(west)]);
      edge("#ece7ca7a", [cap(west), summit, cap(east)], 0.55);
    }
    edge(kind === "mountain" ? "#dfd6ab88" : "#d8ca9b50", [west, summit], 0.65);
    edge(kind === "mountain" ? "#68664faa" : "#83795b64", [summit, south, east], 0.65);
  }
  return { bottom: center.y + depth / 2, faces, edges };
}

/**
 * Precompile once per map revision. Every decoration is clipped to its real
 * province, and uses the visual hash rather than the simulation's RNG.
 */
export function compileRelief(geography) {
  const provinceById =
    geography?.provinceById ||
    new Map((geography?.provinces || []).map((province) => [province.id, province]));
  const groups = [];
  let featureCount = 0,
    faceCount = 0;
  for (const cell of geography?.cells || []) {
    const points = (cell.points || cell.polygon || []).map(pointXY);
    if (points.length < 3) continue;
    const province = cell.province || provinceById.get(cell.id || cell.provinceId);
    const features = deterministicTerrainFeatures(province)
      .slice(0, 4)
      .map(compileFeature)
      .sort((a, b) => a.bottom - b.bottom);
    if (!features.length) continue;
    featureCount += features.length;
    faceCount += features.reduce((sum, feature) => sum + feature.faces.length, 0);
    groups.push({ id: province.id, clipPath: pathFor(points), features });
  }
  return { groups, featureCount, faceCount };
}

/** Call inside the cached base pass, after applying the continent top affine. */
export function paintRelief(context, compiled, scale) {
  if (!compiled?.groups.length) return;
  const inverseScale = 1 / Math.max(0.05, scale || 1);
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  for (const group of compiled.groups) {
    context.save();
    context.clip(group.clipPath);
    for (const feature of group.features) {
      for (const face of feature.faces) {
        context.fillStyle = face.color;
        context.fill(face.path);
      }
      for (const edge of feature.edges) {
        context.strokeStyle = edge.color;
        context.lineWidth = edge.width * inverseScale;
        context.stroke(edge.path);
      }
    }
    context.restore();
  }
  context.restore();
}
