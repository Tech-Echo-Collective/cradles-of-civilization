import { useEffect, useRef, useState } from "react";
import {
  LATITUDE_STRETCH,
  project,
  rivers,
  mountainRanges,
  geographicalLabels,
  fallbackLand,
  seededRandom,
  sampleLine,
} from "./map/geography";
import "./map/atlas.css";

const MAX_SURFACE_PIXELS = 2_400_000;
const INITIAL_CENTER = project([67, 32]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const displayName = (civ) => civ.shortName || civ.name;

function makeLandPath(rings) {
  const path = new Path2D();
  rings.forEach((ring) => {
    ring.forEach((coordinate, i) => {
      const [x, y] = project(coordinate);
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    });
    path.closePath();
  });
  return path;
}

function linePath(context, points) {
  points.forEach((coordinate, index) => {
    const [x, y] = project(coordinate);
    index ? context.lineTo(x, y) : context.moveTo(x, y);
  });
}

function paperTexture() {
  const surface = document.createElement("canvas");
  surface.width = surface.height = 160;
  const ctx = surface.getContext("2d");
  const random = seededRandom(1892);
  for (let i = 0; i < 6400; i += 1) {
    ctx.fillStyle =
      random() > 0.45 ? `rgba(48,37,20,${random() * 0.1})` : `rgba(255,245,212,${random() * 0.14})`;
    ctx.fillRect(random() * 160, random() * 160, 0.7 + random() * 1.4, 0.5 + random());
  }
  return surface;
}

function makeEngravingPaths() {
  const paths = Object.fromEntries(
    ["water", "mountainFill", "mountainLines", "mountainHatch", "desert", "rivers", "grid"].map(
      (name) => [name, new Path2D()],
    ),
  );
  const random = seededRandom(32904);
  for (let i = 0; i < 1600; i += 1) {
    const x = -25 + random() * 185,
      y = -85 + random() * 112;
    paths.water.moveTo(x, y);
    paths.water.quadraticCurveTo(x + 0.7, y - 0.16, x + 1.3 + random() * 0.5, y);
  }
  mountainRanges.forEach((range) => {
    for (let i = 0; i < range.count; i += 1) {
      const coordinate = sampleLine(range.points, i / range.count);
      coordinate[0] += (random() - 0.5) * range.spread;
      coordinate[1] += (random() - 0.5) * range.spread;
      const [x, y] = project(coordinate);
      const size = 0.35 + random() * 0.75,
        half = size * 0.58;
      const top = y - size * (0.7 + random() * 0.45);
      paths.mountainFill.moveTo(x - half, y);
      paths.mountainFill.lineTo(x, top);
      paths.mountainFill.lineTo(x + half, y);
      paths.mountainFill.closePath();
      paths.mountainLines.moveTo(x - half, y);
      paths.mountainLines.lineTo(x, top);
      paths.mountainLines.lineTo(x + half, y);
      paths.mountainLines.moveTo(x, top + size * 0.06);
      paths.mountainLines.lineTo(x + size * 0.05, y - size * 0.32);
      paths.mountainLines.lineTo(x + half * 0.5, y - size * 0.2);
      for (let hatch = 1; hatch < 4; hatch += 1) {
        paths.mountainHatch.moveTo(x + (half * hatch) / 5, top + (size * hatch) / 5);
        paths.mountainHatch.lineTo(x + (half * hatch) / 5 - size * 0.13, y - size * 0.1);
      }
    }
  });
  for (let i = 0; i < 210; i += 1) {
    const coordinate =
      i < 130 ? [-5 + random() * 32, 17 + random() * 13] : [39 + random() * 14, 17 + random() * 9];
    const [x, y] = project(coordinate);
    paths.desert.moveTo(x, y);
    paths.desert.quadraticCurveTo(x + 0.5, y - 0.4, x + 1.5, y - 0.15);
  }
  rivers.forEach((river) => linePath(paths.rivers, river.points));
  for (let lon = -20; lon <= 155; lon += 10)
    linePath(paths.grid, [
      [lon, -25],
      [lon, 80],
    ]);
  for (let lat = -20; lat <= 80; lat += 10)
    linePath(paths.grid, [
      [-25, lat],
      [155, lat],
    ]);
  return paths;
}

function civilizationLabelOffsets(civ, selected) {
  const below = civ.id === "egypt" || civ.id === "indus";
  return {
    nameY: below ? (selected ? 44 : 33) : -(selected ? 39 : 28),
    subtitleY: below ? (selected ? 60 : 48) : -(selected ? 57 : 43),
  };
}

function drawCompass(context, width, height) {
  const x = 55,
    y = height - 225,
    r = 29;
  context.save();
  context.translate(x, y);
  context.strokeStyle = "#56534475";
  context.fillStyle = "#555343a0";
  context.lineWidth = 0.65;
  context.beginPath();
  context.arc(0, 0, r * 0.74, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  context.stroke();
  for (let i = 0; i < 8; i += 1) {
    context.save();
    context.rotate((i * Math.PI) / 4);
    const length = i % 2 ? r * 0.53 : r;
    context.beginPath();
    context.moveTo(0, -length);
    context.lineTo(4, 0);
    context.lineTo(0, 4);
    context.closePath();
    context.fill();
    context.beginPath();
    context.moveTo(0, -length);
    context.lineTo(-4, 0);
    context.lineTo(0, 4);
    context.closePath();
    context.stroke();
    context.restore();
  }
  context.font = "11px Georgia, serif";
  context.textAlign = "center";
  context.fillText("N", 0, -r - 9);
  context.font = "8px Georgia, serif";
  context.fillText("S", 0, r + 13);
  context.fillText("W", -r - 10, 3);
  context.fillText("E", r + 10, 3);
  context.restore();
}

function capitalSymbol(context, id, size) {
  context.lineWidth = 1.2;
  if (id === "egypt") {
    context.beginPath();
    context.moveTo(-size, size * 0.6);
    context.lineTo(0, -size * 0.75);
    context.lineTo(size, size * 0.6);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(0, -size * 0.75);
    context.lineTo(size * 0.2, size * 0.6);
    context.stroke();
  } else if (id === "mesopotamia") {
    context.beginPath();
    context.moveTo(-size, size * 0.6);
    context.lineTo(-size, size * 0.15);
    context.lineTo(-size * 0.55, size * 0.15);
    context.lineTo(-size * 0.55, -size * 0.35);
    context.lineTo(-size * 0.2, -size * 0.35);
    context.lineTo(-size * 0.2, -size * 0.75);
    context.lineTo(size * 0.2, -size * 0.75);
    context.lineTo(size * 0.2, -size * 0.35);
    context.lineTo(size * 0.55, -size * 0.35);
    context.lineTo(size * 0.55, size * 0.15);
    context.lineTo(size, size * 0.15);
    context.lineTo(size, size * 0.6);
    context.closePath();
    context.stroke();
  } else {
    context.beginPath();
    context.arc(0, 0, size * 0.6, 0, Math.PI * 2);
    context.stroke();
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4;
      context.beginPath();
      context.moveTo(Math.cos(a) * size * 0.7, Math.sin(a) * size * 0.7);
      context.lineTo(Math.cos(a) * size, Math.sin(a) * size);
      context.stroke();
    }
  }
}

function createAtlasEngine(canvas, propsRef, setTooltip, setLoading) {
  const context = canvas.getContext("2d", { alpha: false });
  const base = document.createElement("canvas");
  const baseContext = base.getContext("2d", { alpha: false });
  const texture = paperTexture();
  const texturePattern = baseContext.createPattern(texture, "repeat");
  // Compile decorative world geometry once. Pan/zoom reuses seven grouped paths.
  const engravings = makeEngravingPaths();
  const abort = new AbortController();
  let landPath = makeLandPath(fallbackLand);
  let size = { width: 1, height: 1, ratio: 1 };
  let center = [...INITIAL_CENTER],
    scale = 1,
    baseScale = 1;
  let baseDirty = true,
    frame = null,
    drawCount = 0,
    destroyed = false;
  let lastStatsTime = 0,
    statsTimer = null,
    lastStats = null;
  let hitTargets = [],
    pointer = null,
    hoveredId = null;

  // Keep the geographic focus in the exposed stage between the heading and
  // event shelf. The entire Canvas still renders geography behind those panels.
  const exposedViewport = () => {
    const top = Math.min(150, size.height * 0.3);
    const bottom = Math.min(190, size.height * 0.36);
    return { top, bottom, height: size.height - top - bottom };
  };
  const viewOrigin = () => {
    const area = exposedViewport();
    return [size.width / 2, area.top + area.height / 2];
  };

  const toScreen = (coordinate) => {
    const [x, y] = project(coordinate);
    const origin = viewOrigin();
    return [(x - center[0]) * scale + origin[0], (y - center[1]) * scale + origin[1]];
  };
  const visible = ([x, y], padding = 30) =>
    x > -padding && x < size.width + padding && y > -padding && y < size.height + padding;
  const worldTransform = (ctx) => {
    const origin = viewOrigin();
    ctx.translate(...origin);
    ctx.scale(scale, scale);
    ctx.translate(-center[0], -center[1]);
  };

  function drawBase() {
    const ctx = baseContext,
      { width, height, ratio } = size;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const sea = ctx.createLinearGradient(0, 0, width, height);
    sea.addColorStop(0, "#96998a");
    sea.addColorStop(0.55, "#999d8c");
    sea.addColorStop(1, "#929685");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, width, height);
    // Sparse engraved water ripples, fixed to the geographic surface.
    ctx.save();
    worldTransform(ctx);
    ctx.strokeStyle = "rgba(60,82,75,.09)";
    ctx.lineWidth = 0.6 / scale;
    ctx.stroke(engravings.water);
    // Fine coastline contours evoke an original engraved paper atlas.
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(55,63,46,.12)";
    ctx.lineWidth = 7 / scale;
    ctx.stroke(landPath);
    ctx.strokeStyle = "rgba(225,218,178,.36)";
    ctx.lineWidth = 3 / scale;
    ctx.stroke(landPath);
    const land = ctx.createLinearGradient(0, -78, 115, 10);
    land.addColorStop(0, "#b1ac88");
    land.addColorStop(0.44, "#c8ba92");
    land.addColorStop(0.77, "#c4b78e");
    land.addColorStop(1, "#b5ae89");
    ctx.fillStyle = land;
    ctx.fill(landPath);
    ctx.strokeStyle = "#716c50a0";
    ctx.lineWidth = 0.75 / scale;
    ctx.stroke(landPath);
    ctx.save();
    ctx.clip(landPath);
    // Broad dry basins, each softened with a gradient instead of filter blur.
    [
      [14, 22, 25],
      [46, 22, 13],
      [60, 37, 14],
      [100, 43, 19],
    ].forEach(([lon, lat, radius]) => {
      const [x, y] = project([lon, lat]);
      const wash = ctx.createRadialGradient(x, y, 1, x, y, radius);
      wash.addColorStop(0, "#b29d6b50");
      wash.addColorStop(1, "#b29d6b00");
      ctx.fillStyle = wash;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    });
    ctx.lineWidth = 0.7 / scale;
    ctx.fillStyle = "rgba(109,99,70,.09)";
    ctx.fill(engravings.mountainFill);
    ctx.strokeStyle = "rgba(84,79,59,.34)";
    ctx.stroke(engravings.mountainLines);
    ctx.strokeStyle = "rgba(84,79,59,.19)";
    ctx.stroke(engravings.mountainHatch);
    ctx.strokeStyle = "rgba(104,86,50,.12)";
    ctx.lineWidth = 0.6 / scale;
    ctx.stroke(engravings.desert);
    // Approximate rivers share two strokes: parchment bank and blue-green water.
    ctx.strokeStyle = "#e0d5a972";
    ctx.lineWidth = 3.2 / scale;
    ctx.stroke(engravings.rivers);
    ctx.strokeStyle = "#688a8395";
    ctx.lineWidth = 1.35 / scale;
    ctx.stroke(engravings.rivers);
    ctx.restore();
    ctx.restore();
    // Geographic graticule, drawn beneath foreground labels and boundaries.
    ctx.save();
    worldTransform(ctx);
    ctx.strokeStyle = "#514d3514";
    ctx.lineWidth = 0.6 / scale;
    ctx.setLineDash([2 / scale, 4 / scale]);
    ctx.stroke(engravings.grid);
    ctx.restore();
    ctx.fillStyle = texturePattern;
    ctx.fillRect(0, 0, width, height);
    baseDirty = false;
  }

  function drawGeographicLabels() {
    geographicalLabels.forEach((label) => {
      const [x, y] = toScreen(label.position);
      if (!visible([x, y], 80)) return;
      context.save();
      context.translate(x, y);
      context.rotate(label.rotation);
      context.textAlign = "center";
      context.fillStyle = label.water ? "#4e655e9c" : "#655e3c89";
      context.font = `${label.water ? "italic " : ""}${label.size * clamp(scale / 7.2, 0.8, 1.45)}px Georgia, serif`;
      context.fillText(label.text, 0, 0);
      context.restore();
    });
  }

  function drawTerritory(civ, selected) {
    if (!civ.territory?.length) return;
    context.save();
    worldTransform(context);
    context.beginPath();
    linePath(context, civ.territory);
    context.closePath();
    context.globalAlpha = selected ? 0.33 : 0.22;
    context.fillStyle = civ.color;
    context.fill();
    context.globalAlpha = selected ? 0.95 : 0.6;
    context.strokeStyle = civ.color;
    context.lineWidth = (selected ? 2 : 1.1) / scale;
    context.stroke();
    context.globalAlpha = selected ? 0.68 : 0.36;
    context.strokeStyle = "#f2dfaa";
    context.lineWidth = 0.55 / scale;
    context.stroke();
    context.restore();
  }

  function drawRoutes(civilizations) {
    for (let i = 0; i < civilizations.length - 1; i += 1) {
      const a = toScreen(civilizations[i].position),
        b = toScreen(civilizations[i + 1].position);
      context.beginPath();
      context.moveTo(...a);
      context.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 28, ...b);
      context.strokeStyle = "#51462a80";
      context.lineWidth = 1.2;
      context.setLineDash([3, 5]);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 14, 3, 0, Math.PI * 2);
      context.fillStyle = "#8b7042";
      context.fill();
    }
  }

  function drawCivilizations(civilizations, selectedId, labels) {
    let visibleMarkers = 0,
      totalMarkers = 0;
    // Reserve all civilization emblems and captions before placing any city
    // name, so later-drawn emblems cannot cover already-rendered city text.
    const occupiedBoxes = [];
    const overlaps = (a, b) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    civilizations.forEach((civ) => {
      const [x, y] = toScreen(civ.position),
        selected = civ.id === selectedId;
      if (!visible([x, y], 80)) return;
      const radius = selected ? 32 : 18;
      occupiedBoxes.push({
        left: x - radius,
        right: x + radius,
        top: y - radius,
        bottom: y + radius,
      });
      if (!labels) return;
      const { nameY, subtitleY } = civilizationLabelOffsets(civ, selected);
      context.font = `${selected ? "600 " : ""}${selected ? 16 : 13}px Georgia, serif`;
      const nameWidth = context.measureText(displayName(civ).toUpperCase()).width;
      occupiedBoxes.push({
        left: x - nameWidth / 2 - 4,
        right: x + nameWidth / 2 + 4,
        top: y + nameY - 17,
        bottom: y + nameY + 5,
      });
      context.font = "8px Arial, sans-serif";
      const subWidth = context.measureText(
        selected ? "SELECTED CIVILIZATION" : "RIVER CIVILIZATION",
      ).width;
      occupiedBoxes.push({
        left: x - subWidth / 2 - 3,
        right: x + subWidth / 2 + 3,
        top: y + subtitleY - 10,
        bottom: y + subtitleY + 4,
      });
    });
    const placeCityLabel = (name, x, y, font, gap = 7) => {
      context.font = font;
      const width = context.measureText(name).width;
      const candidates = [
        [gap, 3],
        [-width - gap, 3],
        [gap, -11],
        [-width - gap, -11],
        [gap, 18],
        [-width - gap, 18],
      ];
      for (const [dx, dy] of candidates) {
        const box = {
          left: x + dx - 2,
          right: x + dx + width + 2,
          top: y + dy - 12,
          bottom: y + dy + 4,
        };
        if (
          box.left < 4 ||
          box.right > size.width - 4 ||
          occupiedBoxes.some((other) => overlaps(box, other))
        )
          continue;
        occupiedBoxes.push(box);
        return { x: x + dx, y: y + dy, font };
      }
      return null;
    };
    const focusPosition = propsRef.current.focusPosition;
    const focusedCity =
      focusPosition &&
      civilizations
        .find((civ) => civ.id === selectedId)
        ?.cities?.find((city) =>
          focusPosition.every((value, index) => Math.abs(value - city.position[index]) < 0.0001),
        );
    const focusedPoint = focusedCity ? toScreen(focusedCity.position) : null;
    const focusedLabel =
      labels && focusedPoint
        ? placeCityLabel(focusedCity.name, ...focusedPoint, "bold 11px Georgia, serif", 33)
        : null;
    hitTargets = [];
    civilizations.forEach((civ) => {
      const selected = civ.id === selectedId;
      (civ.cities || []).forEach((city) => {
        totalMarkers += 1;
        const [x, y] = toScreen(city.position);
        if (!visible([x, y], 8)) return;
        visibleMarkers += 1;
        context.beginPath();
        context.arc(x, y, selected ? 3 : 2.5, 0, Math.PI * 2);
        context.fillStyle = "#524834";
        context.fill();
        context.strokeStyle = "#ede1b6";
        context.lineWidth = 1;
        context.stroke();
        const nearFocus = focusedPoint && Math.hypot(x - focusedPoint[0], y - focusedPoint[1]) < 40;
        if (labels && scale > 5.5 && !nearFocus) {
          const placement = placeCityLabel(
            city.name,
            x,
            y,
            `${selected ? 11 : 10}px Georgia, serif`,
          );
          if (placement) {
            context.textAlign = "left";
            context.lineWidth = 2.5;
            context.strokeStyle = "#cabc94c0";
            context.strokeText(city.name, placement.x, placement.y);
            context.fillStyle = "#49412d";
            context.fillText(city.name, placement.x, placement.y);
          }
        }
        hitTargets.push({
          x,
          y,
          radius: 9,
          civId: civ.id,
          name: city.name,
          detail: displayName(civ),
        });
      });
      totalMarkers += 1;
      const [x, y] = toScreen(civ.position);
      if (!visible([x, y], 22)) return;
      visibleMarkers += 1;
      context.save();
      context.translate(x, y);
      if (selected) {
        context.beginPath();
        context.arc(0, 0, 24, 0, Math.PI * 2);
        context.strokeStyle = "#f9e3a6b3";
        context.lineWidth = 1;
        context.stroke();
        context.beginPath();
        context.arc(0, 0, 26.5, 0, Math.PI * 2);
        context.strokeStyle = "#5f4b3390";
        context.lineWidth = 0.6;
        context.stroke();
        for (let i = 0; i < 4; i += 1) {
          context.save();
          context.rotate((i * Math.PI) / 2);
          context.beginPath();
          context.moveTo(0, -31);
          context.lineTo(2.5, -27);
          context.lineTo(-2.5, -27);
          context.closePath();
          context.fillStyle = "#6c5536";
          context.fill();
          context.restore();
        }
      }
      const radius = selected ? 18 : 14;
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.fillStyle = selected ? "#4c4630" : "#565540";
      context.fill();
      context.strokeStyle = selected ? "#f0ce7a" : "#d9c99a";
      context.lineWidth = selected ? 1.5 : 1;
      context.stroke();
      context.strokeStyle = selected ? "#f2d58e" : "#dfd4ad";
      capitalSymbol(context, civ.id, selected ? 8 : 6.5);
      if (labels) {
        context.textAlign = "center";
        context.font = `${selected ? "600 " : ""}${selected ? 16 : 13}px Georgia, serif`;
        const text = displayName(civ).toUpperCase();
        // Alternating label sides keeps the adjacent Nile and Euphrates names
        // distinct even on narrower desktop viewports.
        const { nameY, subtitleY } = civilizationLabelOffsets(civ, selected);
        context.lineWidth = 3;
        context.strokeStyle = "#ccbf96e8";
        context.strokeText(text, 0, nameY);
        context.fillStyle = selected ? "#443720" : "#4e4537";
        context.fillText(text, 0, nameY);
        context.font = "8px Arial, sans-serif";
        context.fillStyle = "#665e43";
        context.fillText(selected ? "SELECTED CIVILIZATION" : "RIVER CIVILIZATION", 0, subtitleY);
      }
      context.restore();
      hitTargets.push({
        x,
        y,
        radius: 24,
        civId: civ.id,
        name: displayName(civ),
        detail: "Select civilization",
      });
    });
    // A city may geographically coincide with the large civilization emblem.
    // Its explicit focus indicator therefore belongs above all capital emblems.
    if (focusedPoint && visible(focusedPoint, 12)) {
      const [x, y] = focusedPoint;
      context.beginPath();
      context.arc(x, y, 8, 0, Math.PI * 2);
      context.fillStyle = "#3d4939";
      context.fill();
      context.strokeStyle = "#f1dc97";
      context.lineWidth = 1.5;
      context.stroke();
      context.beginPath();
      context.arc(x, y, 2.3, 0, Math.PI * 2);
      context.fillStyle = "#f1dc97";
      context.fill();
      if (focusedLabel) {
        context.font = focusedLabel.font;
        context.textAlign = "left";
        context.lineWidth = 3;
        context.strokeStyle = "#d3c79ef2";
        context.strokeText(focusedCity.name, focusedLabel.x, focusedLabel.y);
        context.fillStyle = "#393a25";
        context.fillText(focusedCity.name, focusedLabel.x, focusedLabel.y);
      }
    }
    return { visibleMarkers, totalMarkers };
  }

  function publishStats(stats) {
    lastStats = stats;
    const elapsed = performance.now() - lastStatsTime;
    const send = () => {
      if (destroyed) return;
      lastStatsTime = performance.now();
      statsTimer = null;
      propsRef.current.onStats?.(lastStats);
    };
    if (elapsed > 700) {
      if (statsTimer) clearTimeout(statsTimer);
      send();
    } else if (!statsTimer) statsTimer = setTimeout(send, 700 - elapsed);
  }

  function draw() {
    frame = null;
    if (destroyed || size.width < 2 || size.height < 2) return;
    const started = performance.now();
    const {
      civilizations = [],
      selectedId,
      layer = "civilizations",
      showLabels = true,
      showRoutes = false,
    } = propsRef.current;
    if (baseDirty) drawBase();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(base, 0, 0);
    context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    if (layer !== "terrain")
      civilizations.forEach((civ) => drawTerritory(civ, civ.id === selectedId));
    if (showLabels) drawGeographicLabels();
    if (layer === "trade" || showRoutes) drawRoutes(civilizations);
    const markers = drawCivilizations(civilizations, selectedId, showLabels);
    drawCompass(context, size.width, size.height);
    drawCount += 1;
    const stats = {
      drawMs: Math.round((performance.now() - started) * 100) / 100,
      ...markers,
      canvasPixels: canvas.width * canvas.height,
      drawCount,
    };
    // Passive browser diagnostics: no React updates or additional drawing.
    Object.entries(stats).forEach(([key, value]) => {
      canvas.dataset[key] = String(value);
    });
    canvas.dataset.zoom = (scale / baseScale).toFixed(3);
    canvas.dataset.centerLongitude = center[0].toFixed(3);
    canvas.dataset.centerLatitude = (-center[1] / LATITUDE_STRETCH).toFixed(3);
    canvas.dataset.markerPositions = JSON.stringify(
      hitTargets
        .filter((target) => target.detail === "Select civilization")
        .map((target) => ({ id: target.civId, x: Math.round(target.x), y: Math.round(target.y) })),
    );
    publishStats(stats);
  }

  function invalidate(geography = false) {
    if (destroyed) return;
    baseDirty ||= geography;
    if (frame === null) frame = requestAnimationFrame(draw);
  }
  function constrain() {
    center[0] = clamp(center[0], -2, 140);
    center[1] = clamp(center[1], -72, 8);
    scale = clamp(scale, baseScale * 0.8, baseScale * 4.5);
  }
  function zoom(factor, anchor = viewOrigin()) {
    const old = scale;
    scale = clamp(scale * factor, baseScale * 0.8, baseScale * 4.5);
    const origin = viewOrigin();
    center[0] += (anchor[0] - origin[0]) * (1 / old - 1 / scale);
    center[1] += (anchor[1] - origin[1]) * (1 / old - 1 / scale);
    constrain();
    hoveredId = null;
    setTooltip(null);
    invalidate(true);
  }
  function reset() {
    center = [...INITIAL_CENTER];
    scale = baseScale;
    hoveredId = null;
    setTooltip(null);
    invalidate(true);
  }
  function focus(id, position) {
    const civ = propsRef.current.civilizations?.find((item) => item.id === id);
    if (!civ) return;
    const target =
      Array.isArray(position) && position.length === 2 && position.every(Number.isFinite)
        ? position
        : null;
    center = project(target || civ.position);
    scale = Math.max(scale, baseScale * (target ? 1.6 : 1.15));
    constrain();
    hoveredId = null;
    setTooltip(null);
    invalidate(true);
  }
  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }
  function hit(point) {
    return [...hitTargets]
      .reverse()
      .find((target) => Math.hypot(target.x - point[0], target.y - point[1]) < target.radius);
  }
  function down(event) {
    if (event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointer = { id: event.pointerId, point, start: point, moved: false };
    hoveredId = null;
    setTooltip(null);
  }
  function move(event) {
    const point = localPoint(event);
    if (pointer?.id === event.pointerId) {
      const delta = [point[0] - pointer.point[0], point[1] - pointer.point[1]];
      if (Math.hypot(point[0] - pointer.start[0], point[1] - pointer.start[1]) > 4)
        pointer.moved = true;
      if (pointer.moved) {
        center[0] -= delta[0] / scale;
        center[1] -= delta[1] / scale;
        constrain();
        invalidate(true);
      }
      pointer.point = point;
      return;
    }
    const target = hit(point),
      key = target ? `${target.civId}-${target.name}` : null;
    canvas.style.cursor = target ? "pointer" : "grab";
    if (key !== hoveredId) {
      hoveredId = key;
      setTooltip(
        target
          ? {
              ...target,
              left: clamp(target.x + 18, 8, size.width - 190),
              top: clamp(target.y + 20, 8, size.height - 70),
            }
          : null,
      );
    }
  }
  function up(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.moved) {
      const target = hit(localPoint(event));
      if (target) propsRef.current.onSelect?.(target.civId);
    }
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function cancel() {
    pointer = null;
    hoveredId = null;
    setTooltip(null);
  }
  function leave() {
    if (!pointer) {
      hoveredId = null;
      setTooltip(null);
    }
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
      center[0] += arrows[event.key][0] / scale;
      center[1] += arrows[event.key][1] / scale;
      constrain();
      hoveredId = null;
      setTooltip(null);
      invalidate(true);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(1.2);
    } else if (event.key === "-") {
      event.preventDefault();
      zoom(1 / 1.2);
    } else if (event.key === "Home" || event.key === "0") {
      event.preventDefault();
      reset();
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
  const resizeObserver = new ResizeObserver(([entry]) => {
    const width = Math.max(1, Math.round(entry.contentRect.width)),
      height = Math.max(1, Math.round(entry.contentRect.height));
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      1.5,
      Math.sqrt(MAX_SURFACE_PIXELS / (width * height)),
    );
    if (size.width === width && size.height === height && size.ratio === ratio) return;
    const oldBase = baseScale;
    size = { width, height, ratio };
    baseScale = Math.min(
      Math.max(120, width - 40) / 120,
      Math.max(80, exposedViewport().height - 30) / 23,
    );
    scale = scale === 1 ? baseScale : (scale * baseScale) / oldBase;
    canvas.width = base.width = Math.floor(width * ratio);
    canvas.height = base.height = Math.floor(height * ratio);
    invalidate(true);
  });
  resizeObserver.observe(canvas.parentElement);
  fetch(`${import.meta.env.BASE_URL}map/land-polygons.json`, { signal: abort.signal })
    .then((response) => {
      if (!response.ok) throw new Error("Coastline data unavailable");
      return response.json();
    })
    .then((rings) => {
      if (destroyed) return;
      landPath = makeLandPath(rings);
      setLoading("");
      invalidate(true);
    })
    .catch((error) => {
      if (error.name !== "AbortError" && !destroyed) {
        setLoading("Simplified coastline · geographic detail unavailable");
        invalidate(true);
      }
    });
  return {
    invalidate,
    zoom,
    reset,
    focus,
    destroy() {
      destroyed = true;
      abort.abort();
      resizeObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      if (statsTimer) clearTimeout(statsTimer);
      Object.entries(handlers).forEach(([name, handler]) =>
        canvas.removeEventListener(name, handler),
      );
      canvas.removeEventListener("wheel", wheel);
      // Explicitly release backing stores on unmount.
      base.width = base.height = canvas.width = canvas.height = 1;
    },
  };
}

/** Canvas-only map. Civilizations are snapshots supplied by the parent's data layer. */
export default function AtlasMap(props) {
  const canvasRef = useRef(null),
    engineRef = useRef(null),
    propsRef = useRef(props);
  const lastFocusToken = useRef(0);
  const [tooltip, setTooltip] = useState(null),
    [loading, setLoading] = useState("Drawing the known world…");
  propsRef.current = props;
  useEffect(() => {
    const engine = createAtlasEngine(canvasRef.current, propsRef, setTooltip, setLoading);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);
  useEffect(() => {
    engineRef.current?.invalidate();
  }, [
    props.civilizations,
    props.selectedId,
    props.year,
    props.layer,
    props.showLabels,
    props.showRoutes,
    props.focusPosition,
  ]);
  useEffect(() => {
    if (props.focusId && props.focusToken && props.focusToken !== lastFocusToken.current) {
      lastFocusToken.current = props.focusToken;
      engineRef.current?.focus(props.focusId, props.focusPosition);
    }
  }, [props.focusId, props.focusToken, props.focusPosition]);
  return (
    <div className="atlas-map">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="img"
        aria-label="Interactive atlas of Egypt, Mesopotamia, the Indus Valley, and the Yellow River. Drag to pan, scroll or press plus and minus to zoom, arrow keys to pan, Home to reset. Select civilizations from the navigation or map markers."
      />
      <div className="atlas-controls" aria-label="Atlas controls">
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in (+)"
          onClick={() => engineRef.current?.zoom(1.25)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out (−)"
          onClick={() => engineRef.current?.zoom(0.8)}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset map view"
          title="Return to the four river valleys (Home)"
          onClick={() => engineRef.current?.reset()}
        >
          ⌖
        </button>
      </div>
      <div className="atlas-map-note">Illustrative atlas · Natural Earth</div>
      {loading && (
        <div className="atlas-map-loading" role="status">
          {loading}
        </div>
      )}
      {tooltip && (
        <div className="atlas-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          {tooltip.name}
          <small>{tooltip.detail}</small>
        </div>
      )}
    </div>
  );
}
