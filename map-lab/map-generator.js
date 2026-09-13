"use strict";

(function installMapGenerator(global) {
  // Once released, keep this algorithm available unchanged for saved worlds;
  // future geometry changes need a new version, not a rewrite of this one.
  const VERSION = "seeded-continent-v1";
  const EPSILON = 1e-7;
  const partitionCache = new Map();

  function normalizeSeed(value) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (Number.isFinite(parsed)) return Math.max(1, Math.abs(parsed) % 2147483647);
    let hash = 2166136261;
    for (const character of String(value || "1058")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.max(1, (hash >>> 0) % 2147483647);
  }

  function seededRandom(seed) {
    let state = normalizeSeed(seed);
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }

  function distanceSquared(left, right) {
    return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
  }

  function cross(origin, left, right) {
    return (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  }

  function convexHull(points) {
    const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
    const half = (values) => {
      const result = [];
      values.forEach((point) => {
        while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
        result.push(point);
      });
      return result.slice(0, -1);
    };
    return [...half(sorted), ...half([...sorted].reverse())];
  }

  function polygonClearance(point, polygon) {
    return Math.min(...polygon.map((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      return cross(start, end, point) / Math.hypot(end.x - start.x, end.y - start.y);
    }));
  }

  function createLand(viewBox, random) {
    const center = { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 };
    const angleOffset = (random() - 0.5) * 0.7;
    const widthScale = 0.8 + random() * 0.16;
    const heightScale = 0.78 + random() * 0.18;
    const phase = random() * Math.PI * 2;
    const candidates = Array.from({ length: 36 }, (_, index) => {
      const angle = index / 36 * Math.PI * 2;
      const radius = 0.87 + random() * 0.13 + Math.sin(angle * 3 + phase) * 0.11;
      const horizontal = Math.cos(angle) * radius;
      const vertical = Math.sin(angle) * radius;
      return {
        x: round(center.x + (horizontal * Math.cos(angleOffset) - vertical * Math.sin(angleOffset)) * viewBox.width * widthScale * 0.45),
        y: round(center.y + (horizontal * Math.sin(angleOffset) + vertical * Math.cos(angleOffset)) * viewBox.height * heightScale * 0.45)
      };
    });
    return convexHull(candidates);
  }

  function generateSites(count, polygon, viewBox, random) {
    const clearance = Math.min(viewBox.width, viewBox.height) * 0.035;
    const minimumX = Math.min(...polygon.map((point) => point.x));
    const maximumX = Math.max(...polygon.map((point) => point.x));
    const minimumY = Math.min(...polygon.map((point) => point.y));
    const maximumY = Math.max(...polygon.map((point) => point.y));
    const candidate = () => {
      for (let attempt = 0; attempt < 1000; attempt += 1) {
        const point = {
          x: minimumX + random() * (maximumX - minimumX),
          y: minimumY + random() * (maximumY - minimumY)
        };
        if (polygonClearance(point, polygon) >= clearance) return point;
      }
      throw new Error("Unable to sample a province inside the generated continent.");
    };
    const sites = [candidate()];
    while (sites.length < count) {
      let best = null;
      let bestSpacing = -1;
      for (let index = 0; index < 120; index += 1) {
        const point = candidate();
        const spacing = Math.min(...sites.map((site) => distanceSquared(point, site)));
        if (spacing > bestSpacing) {
          best = point;
          bestSpacing = spacing;
        }
      }
      sites.push(best);
    }
    return sites.map((point) => ({ x: round(point.x), y: round(point.y) }));
  }

  // Start with compact spatial groups, then repair any disconnected fringe
  // against the actual Voronoi adjacency rather than inventing extra roads.
  function assignSites(groups, sites, assigned) {
    if (groups.length === 1) {
      const group = groups[0];
      const provinces = [...group.provinces].sort((left, right) => left.center[1] - right.center[1] || left.center[0] - right.center[0]);
      const orderedSites = [...sites].sort((left, right) => left.y - right.y || left.x - right.x);
      provinces.forEach((province, index) => assigned.set(province.id, orderedSites[index]));
      return;
    }
    const spanX = Math.max(...groups.map((group) => group.x)) - Math.min(...groups.map((group) => group.x));
    const spanY = Math.max(...groups.map((group) => group.y)) - Math.min(...groups.map((group) => group.y));
    const axis = spanX > spanY ? "x" : "y";
    const orderedGroups = [...groups].sort((left, right) => left[axis] - right[axis] || left.id.localeCompare(right.id));
    const midpoint = Math.floor(orderedGroups.length / 2);
    const leftGroups = orderedGroups.slice(0, midpoint);
    const leftCount = leftGroups.reduce((sum, group) => sum + group.provinces.length, 0);
    const orderedSites = [...sites].sort((left, right) => left[axis] - right[axis] || left.x - right.x || left.y - right.y);
    assignSites(leftGroups, orderedSites.slice(0, leftCount), assigned);
    assignSites(orderedGroups.slice(midpoint), orderedSites.slice(leftCount), assigned);
  }

  function segmentDistance(point, start, end) {
    const length = distanceSquared(start, end);
    const projection = length > EPSILON
      ? Math.max(0, Math.min(1, ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / length))
      : 0;
    return Math.sqrt(distanceSquared(point, {
      x: start.x + (end.x - start.x) * projection,
      y: start.y + (end.y - start.y) * projection
    }));
  }

  function polylineDistance(point, points) {
    return Math.min(...points.slice(1).map((end, index) => segmentDistance(point, points[index], end)));
  }

  function pathFor(points, closed = false) {
    return points.map((point, index) => `${index ? "L" : "M"} ${round(point.x)} ${round(point.y)}`).join(" ") + (closed ? " Z" : "");
  }

  function geographicFeatures(polygon, viewBox, random) {
    const center = { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 };
    const ridgeAngle = random() * Math.PI;
    const ridgeOffset = (random() - 0.5) * viewBox.height * 0.25;
    const ridge = [-0.28, -0.12, 0.04, 0.2].map((distance, index) => {
      const point = {
        x: center.x + Math.cos(ridgeAngle) * distance * viewBox.width + Math.sin(ridgeAngle) * ridgeOffset,
        y: center.y + Math.sin(ridgeAngle) * distance * viewBox.height + (index % 2 ? 15 : -15) - Math.cos(ridgeAngle) * ridgeOffset
      };
      while (polygonClearance(point, polygon) < viewBox.height * 0.035) {
        point.x = point.x * 0.8 + center.x * 0.2;
        point.y = point.y * 0.8 + center.y * 0.2;
      }
      return point;
    });
    const rivers = Array.from({ length: 3 }, (_, index) => {
      const source = ridge[index];
      const coastIndex = (Math.floor(random() * polygon.length) + index * 3) % polygon.length;
      const mouth = polygon[coastIndex];
      const next = polygon[(coastIndex + 1) % polygon.length];
      const endpoint = { x: (mouth.x + next.x) / 2, y: (mouth.y + next.y) / 2 };
      const points = [source];
      [0.25, 0.5, 0.75].forEach((ratio) => {
        const bend = (random() - 0.5) * 0.2;
        // Convex combinations of interior points keep rivers on land.
        const direct = { x: source.x * (1 - ratio) + endpoint.x * ratio, y: source.y * (1 - ratio) + endpoint.y * ratio };
        points.push({ x: direct.x * (1 - Math.abs(bend)) + center.x * Math.abs(bend), y: direct.y * (1 - Math.abs(bend)) + center.y * Math.abs(bend) });
      });
      points.push(endpoint);
      return { id: `generated-river-${index + 1}`, major: index === 0, points };
    });
    return { ridge, rivers, dryCenter: { x: center.x + (random() - 0.5) * viewBox.width * 0.6, y: center.y + (random() - 0.5) * viewBox.height * 0.5 } };
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function connectStrategicRegions(baseData, provinces, landPolygon) {
    const model = global.CRADLES_MAP_LAB_MODEL;
    if (!model?.buildGeography) throw new Error("Load the map model before generating a continent.");
    const geography = model.buildGeography({ ...baseData, provinces, landPolygon });
    const owners = new Map();
    const regionCenters = new Map();
    baseData.strategicRegions.forEach((region) => {
      const members = provinces.filter((province) => province.strategicRegionId === region.id);
      const components = model.connectedComponents(members.map((province) => province.id), geography.neighbors)
        .sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
      components[0].forEach((provinceId) => owners.set(provinceId, region.id));
      regionCenters.set(region.id, {
        x: members.reduce((sum, province) => sum + province.center[0], 0) / members.length,
        y: members.reduce((sum, province) => sum + province.center[1], 0) / members.length
      });
    });
    while (owners.size < provinces.length) {
      let best = null;
      provinces.forEach((province) => {
        if (owners.has(province.id)) return;
        geography.neighbors[province.id].forEach((neighborId) => {
          const regionId = owners.get(neighborId);
          if (!regionId) return;
          const score = distanceSquared({ x: province.center[0], y: province.center[1] }, regionCenters.get(regionId));
          if (!best || score < best.score) best = { provinceId: province.id, regionId, score };
        });
      });
      if (!best) throw new Error("The generated continent has disconnected land.");
      owners.set(best.provinceId, best.regionId);
    }
    return provinces.map((province) => ({ ...province, strategicRegionId: owners.get(province.id) }));
  }

  function splitSpatialGroups(points, sizes, random, attempt) {
    if (sizes.length === 1) return [points.map((point) => point.id)];
    const spanX = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const spanY = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
    const angle = (spanX >= spanY ? 0 : Math.PI / 2) + (attempt === 0 ? 0 : (random() - 0.5) * Math.PI * 0.85);
    const midpoint = Math.floor(sizes.length / 2);
    const leftSizes = sizes.slice(0, midpoint);
    const leftCount = leftSizes.reduce((sum, size) => sum + size, 0);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const ordered = [...points].sort((left, right) => left.x * cosine + left.y * sine - right.x * cosine - right.y * sine || left.id.localeCompare(right.id));
    return [
      ...splitSpatialGroups(ordered.slice(0, leftCount), leftSizes, random, attempt),
      ...splitSpatialGroups(ordered.slice(leftCount), sizes.slice(midpoint), random, attempt)
    ];
  }

  // This is a family of verified geometric cuts, not a second set of political
  // owners. Every possible capital must occur in a 13-province connected group
  // in at least one cut before a generated continent is offered to the player.
  function partitionFamily(geography) {
    const key = geography.signature;
    if (partitionCache.has(key)) return partitionCache.get(key);
    const model = global.CRADLES_MAP_LAB_MODEL;
    const points = Object.values(geography.provinceById).map((province) => ({ id: province.id, x: province.center[0], y: province.center[1] }));
    if (points.length !== 64) return null;
    const random = seededRandom(Number.parseInt(key, 16) || 1058);
    const covered = new Set();
    const family = [];
    const accept = (groups) => {
      if (!groups.every((group) => model.isConnectedSubset(group, geography.neighbors))) return false;
      const eligible = groups.filter((group) => group.length === 13).flat();
      if (!eligible.some((id) => !covered.has(id))) return false;
      family.push(groups);
      eligible.forEach((id) => covered.add(id));
      return covered.size === points.length;
    };
    for (let attempt = 0; attempt < 256 && covered.size < points.length; attempt += 1) {
      accept(splitSpatialGroups(points, [13, 13, 13, 13, 12], random, attempt));
    }
    for (let attempt = 0; attempt < 512 && covered.size < points.length; attempt += 1) {
      const angle = attempt / 512 * Math.PI * 2;
      const ordered = [...points].sort((left, right) => (left.x - right.x) * Math.cos(angle) + (left.y - right.y) * Math.sin(angle) || left.id.localeCompare(right.id));
      accept([ordered.slice(0, 13), ordered.slice(13, 26), ordered.slice(26, 39), ordered.slice(39, 52), ordered.slice(52)].map((group) => group.map((point) => point.id)));
    }
    if (covered.size < points.length) return null;
    if (partitionCache.size >= 8) partitionCache.delete(partitionCache.keys().next().value);
    partitionCache.set(key, deepFreeze(family));
    return family;
  }

  function partitionControllers(geography, seedValue, capitalId, entityIds) {
    if (!Array.isArray(entityIds) || entityIds.length !== 5 || new Set(entityIds).size !== 5) throw new Error("A strategic partition requires five distinct political entities.");
    if (!geography.provinceById[capitalId]) throw new Error("The starting province is not on this continent.");
    const family = partitionFamily(geography);
    if (!family) throw new Error("This geography has not passed starting-territory validation.");
    const choices = family.filter((groups) => groups.some((group) => group.length === 13 && group.includes(capitalId)));
    const random = seededRandom(seedValue);
    const groups = choices[Math.floor(random() * choices.length)];
    const playerGroup = groups.find((group) => group.length === 13 && group.includes(capitalId));
    const smallerGroup = groups.find((group) => group.length === 12);
    const others = groups.filter((group) => group !== playerGroup && group !== smallerGroup)
      .map((group) => ({ group, order: random() }))
      .sort((left, right) => left.order - right.order);
    const orderedGroups = [playerGroup, ...others.map((entry) => entry.group), smallerGroup];
    return Object.fromEntries(orderedGroups.flatMap((group, index) => group.map((provinceId) => [provinceId, entityIds[index]])));
  }

  function generate(baseData, seedValue, version = VERSION, generationAttempt = 0) {
    if (version !== VERSION) throw new Error(`Unsupported map generator version: ${version}`);
    if (!baseData?.provinces?.length || !baseData?.strategicRegions?.length) throw new Error("Map generator requires the base province catalog.");
    const seed = normalizeSeed(seedValue);
    const random = seededRandom(seed + generationAttempt * 104729);
    const viewBox = { ...baseData.viewBox };
    const landPolygon = createLand(viewBox, random);
    const sites = generateSites(baseData.provinces.length, landPolygon, viewBox, random);
    const groups = baseData.strategicRegions.map((region) => ({
      id: region.id,
      x: region.label[0],
      y: region.label[1],
      provinces: baseData.provinces.filter((province) => province.strategicRegionId === region.id)
    }));
    const assigned = new Map();
    assignSites(groups, sites, assigned);
    const features = geographicFeatures(landPolygon, viewBox, random);
    const coastWidth = viewBox.height * 0.07;
    const riverWidth = viewBox.height * 0.04;
    const ridgeWidth = viewBox.height * 0.045;
    const sampledProvinces = baseData.provinces.map((province) => {
      const point = assigned.get(province.id);
      const coastDistance = polygonClearance(point, landPolygon);
      const riverDistance = Math.min(...features.rivers.map((river) => polylineDistance(point, river.points)));
      const ridgeDistance = polylineDistance(point, features.ridge);
      let terrain = "plain";
      if (coastDistance < coastWidth) terrain = "coast";
      else if (ridgeDistance < ridgeWidth) terrain = "mountain";
      else if (riverDistance < riverWidth) terrain = "river";
      else if (point.y < viewBox.y + viewBox.height * 0.27) terrain = "tundra";
      else if (Math.sqrt(distanceSquared(point, features.dryCenter)) < viewBox.height * 0.17) terrain = "waste";
      else if (ridgeDistance < ridgeWidth * 1.9) terrain = "canyon";
      else if (riverDistance < riverWidth * 2.1) terrain = "basin";
      return { ...province, center: [point.x, point.y], label: [point.x, point.y], terrain, base: { ...province.base } };
    });
    const provinces = connectStrategicRegions(baseData, sampledProvinces, landPolygon);
    const strategicRegions = baseData.strategicRegions.map((region) => {
      const members = provinces.filter((province) => province.strategicRegionId === region.id);
      return { ...region, label: [round(members.reduce((sum, province) => sum + province.center[0], 0) / members.length), round(members.reduce((sum, province) => sum + province.center[1], 0) / members.length)] };
    });
    const generated = {
      ...baseData,
      id: `${VERSION}-${seed}`,
      geometryRevision: `${VERSION}-${seed}`,
      generatorVersion: VERSION,
      geometrySeed: seed,
      generationAttempt,
      viewBox,
      landPolygon,
      landPath: pathFor(landPolygon, true),
      provinces,
      strategicRegions,
      rivers: features.rivers.map((river) => ({ id: river.id, major: river.major, path: pathFor(river.points) })),
      routes: []
    };
    const geography = global.CRADLES_MAP_LAB_MODEL.buildGeography(generated);
    if (!partitionFamily(geography)) {
      if (generationAttempt >= 31) throw new Error("Unable to generate a continent with valid starting territories.");
      return generate(baseData, seed, version, generationAttempt + 1);
    }
    return deepFreeze(generated);
  }

  global.CRADLES_MAP_GENERATOR = Object.freeze({ VERSION, normalizeSeed, generate, partitionControllers });
})(typeof window !== "undefined" ? window : globalThis);
