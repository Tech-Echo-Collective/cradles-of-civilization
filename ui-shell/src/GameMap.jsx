import { useEffect, useRef, useState } from "react";
import {
  MAX_MAP_SURFACE_PIXELS,
  TERRAIN_COLORS,
  pointXY,
  boundsIntersect,
  pointInPolygon,
  prepareGameGeometry,
  mapLabel,
  compactForce,
} from "./map/game-geometry.js";
import {
  projectionFor,
  projectOffset,
  unprojectOffset,
  projectedBounds,
} from "./map/game-projection.js";
import { compileRelief, paintRelief } from "./map/game-relief.js";
import "./map/game-map.css";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const palette = ["#b7955d", "#8384aa", "#b56758", "#a67a4e", "#6c9b91"];

function polygonPath(points) {
  const path = new Path2D();
  points.forEach((point, i) => (i ? path.lineTo(point.x, point.y) : path.moveTo(point.x, point.y)));
  path.closePath();
  return path;
}

function makePaperPattern(context) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const ink = tile.getContext("2d");
  let seed = 137;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 2600; i += 1) {
    ink.fillStyle = random() > 0.5 ? "#302b1915" : "#fff2c617";
    ink.fillRect(random() * 128, random() * 128, random() + 0.5, random() + 0.5);
  }
  return context.createPattern(tile, "repeat");
}

function compilePaths(geography) {
  const land = geography.land.length
    ? polygonPath(geography.land)
    : new Path2D(geography.landPath || "");
  const cells = geography.cells.map((cell) => ({ ...cell, path: polygonPath(cell.points) }));
  const roads = new Path2D(),
    rivers = new Path2D(),
    mountains = new Path2D();
  (geography.connections || []).forEach((connection) => {
    const a = geography.provinceById.get(connection.a),
      b = geography.provinceById.get(connection.b);
    if (!a || !b) return;
    roads.moveTo(...a.center);
    roads.lineTo(...b.center);
  });
  (geography.rivers || []).forEach((river) => {
    if (river.path) rivers.addPath(new Path2D(river.path));
  });
  geography.provinceById.forEach((province) => {
    if (!["mountain", "canyon"].includes(province.terrain)) return;
    for (let i = 0; i < 3; i += 1) {
      const x = province.center[0] + (i - 1) * 17,
        y = province.center[1] + (i % 2) * 9;
      mountains.moveTo(x - 10, y + 8);
      mountains.lineTo(x, y - 12);
      mountains.lineTo(x + 11, y + 8);
      mountains.moveTo(x, y - 12);
      mountains.lineTo(x + 2, y + 7);
    }
  });
  const projection = projectionFor("relief");
  const raised = (p) => ({
    x: p.x + (projection.shearX * projection.topElevation) / projection.scaleY,
    y: p.y - projection.topElevation / projection.scaleY,
  });
  const coastSides = geography.land
    .map((a, i) => {
      const b = geography.land[(i + 1) % geography.land.length];
      const start = projectOffset(a, "relief", 0),
        end = projectOffset(b, "relief", 0);
      return {
        path: polygonPath([a, b, raised(b), raised(a)]),
        depth: (start.y + end.y) / 2,
        color: end.x > start.x ? "#8a7b59" : "#625d46",
      };
    })
    .sort((a, b) => a.depth - b.depth);
  return { land, cells, roads, rivers, mountains, coastSides, relief: compileRelief(geography) };
}

function createEngine(canvas, propsRef, setTooltip) {
  const context = canvas.getContext("2d", { alpha: false });
  const cache = document.createElement("canvas");
  const ink = cache.getContext("2d", { alpha: false });
  const paper = makePaperPattern(ink);
  let projectionMode = propsRef.current.projection === "flat" ? "flat" : "relief";
  let geography = null,
    paths = null;
  let size = { width: 1, height: 1, ratio: 1 };
  let camera = { x: 0, y: 0, scale: 1 },
    baseScale = 1;
  let cached = null,
    cacheDirty = true,
    frame = null,
    destroyed = false;
  let drawCount = 0,
    baseBuildCount = 0,
    lastStatsAt = 0,
    statsTimer = null,
    lastStats = null;
  let pointer = null,
    hoverKey = null,
    armyTargets = [],
    provinceTargets = [];

  function usableArea() {
    const top = Math.min(38, size.height * 0.08),
      bottom = Math.min(48, size.height * 0.1);
    return { top, bottom, height: Math.max(80, size.height - top - bottom) };
  }
  function origin() {
    const area = usableArea();
    return { x: size.width / 2, y: area.top + area.height / 2 };
  }
  function toScreen(coordinate) {
    const point = pointXY(coordinate),
      o = origin();
    const projected = projectOffset(
      { x: point.x - camera.x, y: point.y - camera.y },
      projectionMode,
    );
    return { x: projected.x * camera.scale + o.x, y: projected.y * camera.scale + o.y };
  }
  function toWorld(point) {
    const o = origin();
    const world = unprojectOffset(
      { x: (point.x - o.x) / camera.scale, y: (point.y - o.y) / camera.scale },
      projectionMode,
    );
    return { x: world.x + camera.x, y: world.y + camera.y };
  }
  function viewportBounds() {
    // Oblique projection couples x/y: all four corners must be inverted.
    const corners = [
      { x: -35, y: -35 },
      { x: size.width + 35, y: -35 },
      { x: size.width + 35, y: size.height + 35 },
      { x: -35, y: size.height + 35 },
    ].map(toWorld);
    return {
      left: Math.min(...corners.map((p) => p.x)),
      top: Math.min(...corners.map((p) => p.y)),
      right: Math.max(...corners.map((p) => p.x)),
      bottom: Math.max(...corners.map((p) => p.y)),
    };
  }
  const inView = (point, padding = 20) =>
    point.x > -padding &&
    point.x < size.width + padding &&
    point.y > -padding &&
    point.y < size.height + padding;
  function transform(target, extra = 0, elevation = projectionFor(projectionMode).topElevation) {
    const o = origin(),
      projection = projectionFor(projectionMode);
    target.translate(o.x + extra, o.y + extra - elevation * camera.scale);
    target.transform(
      camera.scale,
      0,
      camera.scale * projection.shearX,
      camera.scale * projection.scaleY,
      0,
      0,
    );
    target.translate(-camera.x, -camera.y);
  }
  function fitScale() {
    if (!geography) return 1;
    const b = projectedBounds(geography.landBounds, projectionMode);
    const reliefMargin = projectionMode === "relief" ? 50 : 0;
    return Math.max(
      0.05,
      Math.min(
        Math.max(120, size.width - 95) / (b.right - b.left),
        Math.max(100, usableArea().height - 38) / (b.bottom - b.top + reliefMargin),
      ),
    );
  }
  function updateProjection(value) {
    const mode = value === "flat" ? "flat" : "relief";
    if (mode === projectionMode) return;
    const oldZoom = camera.scale / baseScale;
    projectionMode = mode;
    baseScale = fitScale();
    camera.scale = baseScale * oldZoom;
    constrain();
    clearHover();
    cached = null;
    invalidate(true);
  }
  function constrain() {
    if (!geography) return;
    const box = geography.viewBox;
    camera.scale = clamp(camera.scale, baseScale * 0.8, baseScale * 5);
    camera.x = clamp(camera.x, box.x, box.x + box.width);
    camera.y = clamp(camera.y, box.y, box.y + box.height);
  }
  function invalidate(force = false) {
    if (destroyed) return;
    cacheDirty ||= force;
    if (frame === null) frame = requestAnimationFrame(draw);
  }
  function reset() {
    if (!geography) return;
    const b = geography.landBounds;
    camera = { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2, scale: baseScale };
    hoverKey = null;
    setTooltip(null);
    invalidate();
  }
  function updateGeometry(value) {
    const revision = value?.revision || value?.geometryRevision || value?.signature;
    if (geography && revision === geography.revision) return;
    geography = prepareGameGeometry(value);
    if (geography) {
      geography.revision = revision;
      paths = compilePaths(geography);
      baseScale = fitScale();
      reset();
    } else paths = null;
    cached = null;
    invalidate(true);
  }

  function drawBase() {
    // Overscan permits repeated pans to copy this bounded surface rather than
    // regenerating terrain. It has its own pixel-budget-constrained density.
    const margin = Math.min(128, Math.max(64, Math.min(size.width, size.height) * 0.17));
    const width = size.width + margin * 2,
      height = size.height + margin * 2;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      1.5,
      Math.sqrt(MAX_MAP_SURFACE_PIXELS / (width * height)),
    );
    const pixelWidth = Math.floor(width * ratio),
      pixelHeight = Math.floor(height * ratio);
    if (cache.width !== pixelWidth || cache.height !== pixelHeight) {
      cache.width = pixelWidth;
      cache.height = pixelHeight;
    }
    ink.setTransform(ratio, 0, 0, ratio, 0, 0);
    const water = ink.createLinearGradient(0, 0, width, height);
    water.addColorStop(0, "#344841");
    water.addColorStop(1, "#253a36");
    ink.fillStyle = water;
    ink.fillRect(0, 0, width, height);
    if (projectionMode === "relief") {
      ink.save();
      transform(ink, margin, 0);
      ink.lineJoin = "round";
      ink.strokeStyle = "#152d2940";
      ink.lineWidth = 15 / camera.scale;
      ink.stroke(paths.land);
      ink.fillStyle = "#2a3830";
      ink.fill(paths.land);
      paths.coastSides.forEach((side) => {
        ink.fillStyle = side.color;
        ink.fill(side.path);
      });
      // Fixed legacy geography supplies an SVG path rather than a polygon.
      // A few cached silhouettes provide the same continental thickness.
      if (!paths.coastSides.length) {
        const projection = projectionFor(projectionMode);
        for (let elevation = 2; elevation < projection.topElevation; elevation += 2) {
          ink.save();
          ink.translate(
            (projection.shearX * elevation) / projection.scaleY,
            -elevation / projection.scaleY,
          );
          ink.fillStyle = "#756c50";
          ink.fill(paths.land);
          ink.restore();
        }
      }
      ink.restore();
    }
    ink.save();
    transform(ink, margin);
    ink.lineJoin = "round";
    ink.strokeStyle = "#cfc39425";
    ink.lineWidth = 9 / camera.scale;
    ink.stroke(paths.land);
    ink.strokeStyle = "#ccb98670";
    ink.lineWidth = 3 / camera.scale;
    ink.stroke(paths.land);
    ink.fillStyle = "#bcb18b";
    ink.fill(paths.land);
    paths.cells.forEach((cell) => {
      ink.fillStyle = TERRAIN_COLORS[cell.province?.terrain] || TERRAIN_COLORS.plain;
      ink.fill(cell.path);
    });
    ink.save();
    ink.clip(paths.land);
    if (projectionMode === "relief") paintRelief(ink, paths.relief, camera.scale);
    else {
      ink.strokeStyle = "#675d403b";
      ink.lineWidth = 0.85 / camera.scale;
      ink.stroke(paths.mountains);
    }
    ink.strokeStyle = "#e1d2a6ae";
    ink.lineWidth = 4 / camera.scale;
    ink.stroke(paths.rivers);
    ink.strokeStyle = "#6b8d838c";
    ink.lineWidth = 1.8 / camera.scale;
    ink.stroke(paths.rivers);
    ink.restore();
    ink.strokeStyle = "#7b704e";
    ink.lineWidth = 0.7 / camera.scale;
    ink.stroke(paths.land);
    ink.restore();
    ink.fillStyle = paper;
    ink.fillRect(0, 0, width, height);
    cached = { ...camera, margin, width, height, ratio };
    cacheDirty = false;
    baseBuildCount += 1;
  }

  function ensureBase() {
    const displacement = () =>
      cached
        ? projectOffset({ x: cached.x - camera.x, y: cached.y - camera.y }, projectionMode, 0)
        : { x: Infinity, y: Infinity };
    const shift = displacement();
    if (
      cacheDirty ||
      !cached ||
      Math.abs(cached.scale - camera.scale) > 0.00001 ||
      Math.abs(shift.x * camera.scale) > cached.margin * 0.82 ||
      Math.abs(shift.y * camera.scale) > cached.margin * 0.82
    )
      drawBase();
    const offset = displacement();
    context.drawImage(
      cache,
      offset.x * camera.scale - cached.margin,
      offset.y * camera.scale - cached.margin,
      cached.width,
      cached.height,
    );
  }

  function stateLookups() {
    const props = propsRef.current;
    return {
      regions: new Map((props.regions || []).map((region) => [region.id, region])),
      entities: new Map(
        (props.entities || []).map((entity, index) => [
          entity.id,
          { ...entity, color: entity.color || palette[index % palette.length] },
        ]),
      ),
      available: new Set(props.availableProvinceIds || []),
    };
  }

  function drawProvinces(lookups, visibleCells) {
    const { layer = "political", selectedProvinceId, selectedArmyId } = propsRef.current;
    const army = (propsRef.current.armies || []).find((item) => item.id === selectedArmyId);
    context.save();
    transform(context);
    visibleCells.forEach((cell) => {
      const state = lookups.regions.get(cell.id),
        entity = lookups.entities.get(state?.controllerId);
      if (layer !== "terrain") {
        context.globalAlpha =
          layer === "military"
            ? entity && army && entity.id === army.entityId
              ? 0.37
              : 0.19
            : 0.31;
        context.fillStyle = entity?.color || "#655850";
        context.fill(cell.path);
      }
      context.globalAlpha = 1;
      context.strokeStyle = "#5c593774";
      context.lineWidth = 0.65 / camera.scale;
      context.stroke(cell.path);
    });
    // Roads use the actual connection graph consumed by the existing game.
    context.strokeStyle = "#56472e68";
    context.lineWidth = 0.8 / camera.scale;
    context.setLineDash([3 / camera.scale, 4 / camera.scale]);
    context.stroke(paths.roads);
    context.setLineDash([]);
    if (army && lookups.available.size) {
      const source = geography.provinceById.get(army.regionId);
      if (source) {
        context.beginPath();
        (geography.connections || []).forEach((connection) => {
          const id =
            connection.a === army.regionId
              ? connection.b
              : connection.b === army.regionId
                ? connection.a
                : null;
          const destination = id && lookups.available.has(id) && geography.provinceById.get(id);
          if (!destination) return;
          context.moveTo(...source.center);
          context.lineTo(...destination.center);
        });
        context.strokeStyle = "#efd191";
        context.lineWidth = 2 / camera.scale;
        context.stroke();
      }
    }
    visibleCells.forEach((cell) => {
      if (lookups.available.has(cell.id)) {
        context.strokeStyle = "#d9bd748f";
        context.lineWidth = 1.5 / camera.scale;
        context.stroke(cell.path);
      }
      if (cell.id === selectedProvinceId) {
        context.fillStyle = "#fff0b921";
        context.fill(cell.path);
        context.strokeStyle = "#4d3d25b0";
        context.lineWidth = 4 / camera.scale;
        context.stroke(cell.path);
        context.strokeStyle = "#ffe4a0";
        context.lineWidth = 2 / camera.scale;
        context.stroke(cell.path);
      }
    });
    context.restore();
  }

  function drawMarkers(lookups, visibleCells) {
    const { armies = [], selectedArmyId, selectedProvinceId, showLabels = true } = propsRef.current;
    const visibleArmies = [];
    const stacks = new Map();
    const occupied = [];
    armyTargets = [];
    provinceTargets = [];
    // Inputs are already filtered by the authoritative engine's military fog.
    armies.forEach((army) => {
      const province = geography.provinceById.get(army.regionId);
      if (!province || army.force <= 0) return;
      const stack = stacks.get(army.regionId) || 0;
      stacks.set(army.regionId, stack + 1);
      const anchor = toScreen(province.center);
      const point = {
        x: anchor.x + ((stack % 3) - 1) * 23 + 23,
        y: anchor.y - 18 - Math.floor(stack / 3) * 29,
      };
      if (!inView(point, 20)) return;
      const target = { ...point, id: army.id, army, entity: lookups.entities.get(army.entityId) };
      visibleArmies.push(target);
      occupied.push({
        left: point.x - 19,
        right: point.x + 19,
        top: point.y - 18,
        bottom: point.y + 20,
      });
    });
    const ordered = [...visibleCells].sort(
      (a, b) => Number(b.id === selectedProvinceId) - Number(a.id === selectedProvinceId),
    );
    ordered.forEach((cell) => {
      if (!cell.province) return;
      const point = toScreen(cell.province.label || cell.province.center);
      if (!inView(point, 3)) return;
      provinceTargets.push({ id: cell.id, x: point.x, y: point.y });
      context.beginPath();
      context.arc(point.x, point.y, cell.id === selectedProvinceId ? 3.2 : 1.8, 0, Math.PI * 2);
      context.fillStyle = "#645032";
      context.fill();
      if (!showLabels) return;
      const selected = cell.id === selectedProvinceId;
      const region = lookups.regions.get(cell.id) || cell.province;
      const label = mapLabel(region);
      context.font = `${selected ? "600 " : ""}${selected ? 12 : 10}px Georgia, serif`;
      const width = context.measureText(label).width;
      const positions = [
        [point.x - width / 2, point.y + 15],
        [point.x - width / 2, point.y - 9],
        [point.x + 7, point.y + 4],
      ];
      const candidate = positions
        .map(([x, y]) => ({ x, y, left: x - 3, right: x + width + 3, top: y - 12, bottom: y + 4 }))
        .find(
          (box) =>
            box.left > 4 &&
            box.right < size.width - 4 &&
            !occupied.some((other) => boundsIntersect(box, other)),
        );
      if (!candidate) return;
      occupied.push(candidate);
      context.textAlign = "left";
      context.strokeStyle = "#c6ba93ed";
      context.lineWidth = 2.5;
      context.strokeText(label, candidate.x, candidate.y);
      context.fillStyle = selected ? "#3d3525" : "#4d4735";
      context.fillText(label, candidate.x, candidate.y);
    });
    visibleArmies.forEach((target) => {
      const selected = target.id === selectedArmyId;
      context.save();
      context.translate(target.x, target.y);
      context.beginPath();
      context.moveTo(-13, -14);
      context.lineTo(13, -14);
      context.lineTo(11, 7);
      context.lineTo(0, 15);
      context.lineTo(-11, 7);
      context.closePath();
      context.fillStyle = selected ? "#263a2b" : "#354238";
      context.fill();
      context.strokeStyle = selected ? "#ffe1a0" : target.entity?.color || "#c6b581";
      context.lineWidth = selected ? 2 : 1.4;
      context.stroke();
      context.strokeStyle = "#dbc595";
      context.lineWidth = 1.1;
      context.beginPath();
      context.moveTo(-4, -9);
      context.lineTo(4, -2);
      context.moveTo(4, -9);
      context.lineTo(-4, -2);
      context.stroke();
      context.font = "bold 8px Arial,sans-serif";
      context.fillStyle = "#f0dfb8";
      context.textAlign = "center";
      context.fillText(compactForce(target.army.force), 0, 8);
      context.restore();
      armyTargets.push(target);
    });
    return {
      visibleMarkers: provinceTargets.length + armyTargets.length,
      totalMarkers: geography.cells.length + armies.length,
    };
  }

  function drawCompass() {
    const x = 42,
      y = size.height - 50;
    context.save();
    context.translate(x, y);
    const north = projectOffset({ x: 0, y: -1 }, projectionMode, 0);
    context.rotate(Math.atan2(north.y, north.x) + Math.PI / 2);
    context.strokeStyle = "#bfaf7b80";
    context.fillStyle = "#d0bc8a";
    context.lineWidth = 0.8;
    context.beginPath();
    context.arc(0, 0, 16, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(0, -24);
    context.lineTo(5, 7);
    context.lineTo(0, 3);
    context.lineTo(-5, 7);
    context.closePath();
    context.fill();
    context.font = "9px Georgia,serif";
    context.textAlign = "center";
    context.fillText("N", 0, -30);
    context.restore();
  }

  function sendStats(stats) {
    lastStats = stats;
    const send = () => {
      if (destroyed) return;
      lastStatsAt = performance.now();
      statsTimer = null;
      propsRef.current.onStats?.(lastStats);
    };
    const elapsed = performance.now() - lastStatsAt;
    if (elapsed > 700) {
      if (statsTimer) clearTimeout(statsTimer);
      send();
    } else if (!statsTimer) statsTimer = setTimeout(send, 700 - elapsed);
  }

  function draw() {
    frame = null;
    if (destroyed || !geography || size.width < 2 || size.height < 2) return;
    const started = performance.now();
    context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    ensureBase();
    const lookups = stateLookups(),
      view = viewportBounds();
    const visibleCells = paths.cells.filter((cell) => boundsIntersect(cell.bounds, view));
    drawProvinces(lookups, visibleCells);
    const markers = drawMarkers(lookups, visibleCells);
    drawCompass();
    drawCount += 1;
    const stats = {
      drawMs: Math.round((performance.now() - started) * 100) / 100,
      ...markers,
      canvasPixels: canvas.width * canvas.height,
      cachePixels: cache.width * cache.height,
      drawCount,
      baseBuildCount,
      projection: projectionMode,
      terrainFeatures: projectionMode === "relief" ? paths.relief.featureCount : 0,
      visibleProvinces: visibleCells.length,
      provinceCount: geography.cells.length,
    };
    Object.entries(stats).forEach(([key, value]) => {
      canvas.dataset[key] = String(value);
    });
    canvas.dataset.geometryRevision = geography.revision || "";
    canvas.dataset.geometrySignature = geography.signature || "";
    canvas.dataset.zoom = (camera.scale / baseScale).toFixed(3);
    canvas.dataset.centerX = camera.x.toFixed(3);
    canvas.dataset.centerY = camera.y.toFixed(3);
    canvas.dataset.provincePositions = JSON.stringify(
      provinceTargets.map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) })),
    );
    canvas.dataset.armyPositions = JSON.stringify(
      armyTargets.map(({ id, x, y }) => ({ id, x: Math.round(x), y: Math.round(y) })),
    );
    sendStats(stats);
  }

  function clearHover() {
    hoverKey = null;
    setTooltip(null);
  }
  function zoom(factor, anchor = origin()) {
    if (!geography) return;
    const world = toWorld(anchor);
    camera.scale = clamp(camera.scale * factor, baseScale * 0.8, baseScale * 5);
    const after = toWorld(anchor);
    camera.x += world.x - after.x;
    camera.y += world.y - after.y;
    constrain();
    clearHover();
    invalidate();
  }
  function focus() {
    if (!geography) return;
    const props = propsRef.current;
    const army = (props.armies || []).find((item) => item.id === props.selectedArmyId);
    const province = geography.provinceById.get(props.selectedProvinceId || army?.regionId);
    if (!province) return;
    camera.x = province.center[0];
    camera.y = province.center[1];
    camera.scale = Math.max(camera.scale, baseScale * 1.6);
    constrain();
    clearHover();
    invalidate();
  }
  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function hit(point) {
    const army = [...armyTargets]
      .reverse()
      .find((target) => Math.abs(target.x - point.x) <= 17 && Math.abs(target.y - point.y) <= 18);
    if (army)
      return {
        kind: "army",
        id: army.id,
        title: mapLabel(army.army),
        detail: `${mapLabel(army.entity)} · ${compactForce(army.army.force)}`,
        x: army.x,
        y: army.y,
      };
    if (!paths) return null;
    const world = toWorld(point);
    const cell = paths.cells.find(
      (item) =>
        world.x >= item.bounds.left &&
        world.x <= item.bounds.right &&
        world.y >= item.bounds.top &&
        world.y <= item.bounds.bottom &&
        pointInPolygon(world, item.points),
    );
    if (!cell) return null;
    const lookups = stateLookups(),
      region = lookups.regions.get(cell.id) || cell.province,
      entity = lookups.entities.get(region?.controllerId);
    return {
      kind: "province",
      id: cell.id,
      title: mapLabel(region),
      detail: `${mapLabel(entity) || "无主地"} · ${region?.fortification ?? "—"} 工事`,
      x: point.x,
      y: point.y,
    };
  }
  function down(event) {
    if (event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointer = { id: event.pointerId, start: point, last: point, moved: false };
    clearHover();
    canvas.style.cursor = "grabbing";
  }
  function move(event) {
    const point = localPoint(event);
    if (pointer?.id === event.pointerId) {
      if (Math.hypot(point.x - pointer.start.x, point.y - pointer.start.y) > 4)
        pointer.moved = true;
      if (pointer.moved) {
        const delta = unprojectOffset(
          {
            x: (point.x - pointer.last.x) / camera.scale,
            y: (point.y - pointer.last.y) / camera.scale,
          },
          projectionMode,
          0,
        );
        camera.x -= delta.x;
        camera.y -= delta.y;
        constrain();
        invalidate();
      }
      pointer.last = point;
      return;
    }
    const target = hit(point),
      key = target ? `${target.kind}:${target.id}` : null;
    canvas.style.cursor = target ? "pointer" : "grab";
    if (key !== hoverKey) {
      hoverKey = key;
      setTooltip(
        target
          ? {
              ...target,
              left: clamp(point.x + 15, 8, size.width - 235),
              top: clamp(point.y + 18, 8, size.height - 70),
            }
          : null,
      );
    }
  }
  function up(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.moved) {
      const target = hit(localPoint(event));
      if (target?.kind === "army") propsRef.current.onSelectArmy?.(target.id);
      else if (target) propsRef.current.onSelectProvince?.(target.id);
    }
    pointer = null;
    canvas.style.cursor = "grab";
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function cancel() {
    pointer = null;
    clearHover();
    canvas.style.cursor = "grab";
  }
  function leave() {
    if (!pointer) clearHover();
  }
  function wheel(event) {
    event.preventDefault();
    zoom(Math.exp(-clamp(event.deltaY, -200, 200) * 0.0015), localPoint(event));
  }
  function keydown(event) {
    const arrows = {
      ArrowLeft: [-60, 0],
      ArrowRight: [60, 0],
      ArrowUp: [0, -60],
      ArrowDown: [0, 60],
    };
    if (arrows[event.key]) {
      event.preventDefault();
      const delta = unprojectOffset(
        { x: arrows[event.key][0] / camera.scale, y: arrows[event.key][1] / camera.scale },
        projectionMode,
        0,
      );
      camera.x += delta.x;
      camera.y += delta.y;
      constrain();
      clearHover();
      invalidate();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(1.2);
    } else if (event.key === "-") {
      event.preventDefault();
      zoom(1 / 1.2);
    } else if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      reset();
    } else if (event.key === "f" || event.key === "F") {
      event.preventDefault();
      focus();
    }
  }
  const handlers = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointercancel: cancel,
    pointerleave: leave,
    keydown,
  };
  Object.entries(handlers).forEach(([name, handler]) => canvas.addEventListener(name, handler));
  canvas.addEventListener("wheel", wheel, { passive: false });
  const observer = new ResizeObserver(([entry]) => {
    const width = Math.max(1, Math.round(entry.contentRect.width)),
      height = Math.max(1, Math.round(entry.contentRect.height));
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      1.5,
      Math.sqrt(MAX_MAP_SURFACE_PIXELS / (width * height)),
    );
    if (size.width === width && size.height === height && size.ratio === ratio) return;
    const oldZoom = camera.scale / baseScale;
    size = { width, height, ratio };
    baseScale = fitScale();
    camera.scale = baseScale * oldZoom;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    cached = null;
    invalidate(true);
  });
  observer.observe(canvas.parentElement);
  updateGeometry(propsRef.current.geometry);
  return {
    invalidate,
    updateGeometry,
    updateProjection,
    zoom,
    reset,
    focus,
    destroy() {
      destroyed = true;
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (statsTimer) clearTimeout(statsTimer);
      Object.entries(handlers).forEach(([name, handler]) =>
        canvas.removeEventListener(name, handler),
      );
      canvas.removeEventListener("wheel", wheel);
      cache.width = cache.height = canvas.width = canvas.height = 1;
    },
  };
}

/** Presentation only: rules, visibility filtering and save-state belong to the existing engine. */
export default function GameMap(props) {
  const canvasRef = useRef(null),
    engineRef = useRef(null),
    propsRef = useRef(props),
    lastFocusToken = useRef(0);
  const [tooltip, setTooltip] = useState(null);
  propsRef.current = props;
  useEffect(() => {
    const engine = createEngine(canvasRef.current, propsRef, setTooltip);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);
  useEffect(() => {
    engineRef.current?.updateGeometry(props.geometry);
  }, [props.geometry]);
  useEffect(() => {
    engineRef.current?.updateProjection(props.projection);
  }, [props.projection]);
  useEffect(() => {
    engineRef.current?.invalidate();
  }, [
    props.regions,
    props.entities,
    props.armies,
    props.selectedProvinceId,
    props.selectedArmyId,
    props.layer,
    props.showLabels,
    props.availableProvinceIds,
  ]);
  useEffect(() => {
    if (props.focusToken && props.focusToken !== lastFocusToken.current) {
      lastFocusToken.current = props.focusToken;
      engineRef.current?.focus();
    }
  }, [props.focusToken]);
  return (
    <div className="game-map" data-projection={props.projection || "relief"}>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="随机世界战略地图。点选省份与可见军队；拖动或方向键平移，滚轮或加减号缩放，Home 重置，F 定位选择。省份和军队也可从侧栏选择。"
      />
      <div className="game-map-controls" aria-label="Map controls">
        <button
          type="button"
          aria-label="Zoom in"
          title="放大 (+)"
          onClick={() => engineRef.current?.zoom(1.25)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="缩小 (−)"
          onClick={() => engineRef.current?.zoom(0.8)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Focus selected province"
          title="定位当前省份 (F)"
          onClick={() => engineRef.current?.focus()}
        >
          ⌖
        </button>
        <button
          type="button"
          aria-label="Reset map view"
          title="重置视野 (Home)"
          onClick={() => engineRef.current?.reset()}
        >
          ↺
        </button>
      </div>
      {!props.geometry && (
        <div className="game-map-loading" role="status">
          正在展开世界地图…
        </div>
      )}
      {tooltip && (
        <div className="game-map-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          {tooltip.title}
          <small>{tooltip.detail}</small>
        </div>
      )}
    </div>
  );
}
