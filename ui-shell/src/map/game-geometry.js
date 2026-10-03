/** Pure helpers for the existing game's planar, seed-generated geography. */
export const MAX_MAP_SURFACE_PIXELS = 2_400_000;
export const TERRAIN_COLORS = Object.freeze({
  plain: "#bfb38e",
  basin: "#c5b790",
  river: "#aeb494",
  coast: "#b3b699",
  mountain: "#a09b83",
  canyon: "#ac9b7f",
  tundra: "#b6b8a4",
  waste: "#baa67f",
});

export function pointXY(point) {
  return Array.isArray(point)
    ? { x: Number(point[0]), y: Number(point[1]) }
    : { x: Number(point.x), y: Number(point.y) };
}

export function polygonBounds(points) {
  return points.reduce(
    (box, point) => ({
      left: Math.min(box.left, point.x),
      right: Math.max(box.right, point.x),
      top: Math.min(box.top, point.y),
      bottom: Math.max(box.bottom, point.y),
    }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  );
}

export function boundsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

export function prepareGameGeometry(geometry) {
  if (!geometry?.viewBox || !Array.isArray(geometry.cells)) return null;
  const provinces = geometry.provinces || [];
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const cells = geometry.cells
    .map((cell) => {
      const points = (cell.points || cell.polygon || []).map(pointXY);
      return {
        id: cell.provinceId || cell.id,
        points,
        bounds: polygonBounds(points),
        province: provinceById.get(cell.provinceId || cell.id),
      };
    })
    .filter((cell) => cell.points.length >= 3);
  const land = (geometry.landPolygon || []).map(pointXY);
  const box = geometry.viewBox;
  const landBounds = land.length
    ? polygonBounds(land)
    : { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height };
  return { ...geometry, cells, land, landBounds, provinceById };
}

export function mapLabel(record) {
  return record?.name || record?.nameZh || record?.nameEn || record?.id || "";
}

export function compactForce(force) {
  return force >= 10000
    ? `${Math.round(force / 1000)}k`
    : force >= 1000
      ? `${(force / 1000).toFixed(1)}k`
      : String(Math.max(0, Math.round(force || 0)));
}
