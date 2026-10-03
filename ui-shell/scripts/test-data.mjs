import assert from "node:assert/strict";
import {
  civilizations,
  events,
  getSnapshot,
  formatYear,
  demoProvider,
  MIN_YEAR,
  MAX_YEAR,
  INITIAL_YEAR,
} from "../src/data/demo.js";

const expectedIds = ["egypt", "mesopotamia", "indus", "yellow-river"];
assert.deepEqual(
  civilizations.map(({ id }) => id),
  expectedIds,
);
assert.equal(new Set(events.map(({ id }) => id)).size, events.length);
assert.equal(demoProvider.mode, "synthetic");
assert.equal(demoProvider.getSnapshot, getSnapshot);
assert.equal(getSnapshot().year, INITIAL_YEAR);
assert.equal(getSnapshot(MIN_YEAR - 10_000).year, MIN_YEAR);
assert.equal(getSnapshot(MAX_YEAR + 10_000).year, MAX_YEAR);
assert.equal(getSnapshot(-2499.6).year, -2500);
for (const invalid of [NaN, Infinity, -Infinity, null, "-2500"]) {
  assert.throws(() => getSnapshot(invalid), TypeError);
}
assert.equal(formatYear(-2500), "2,500 BCE");
assert.equal(formatYear(2500), "2,500 CE");

const validPosition = ([longitude, latitude]) => {
  assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
  assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);
};
for (const civilization of civilizations) {
  assert.equal(civilization.synthetic, true);
  validPosition(civilization.position);
  civilization.territory.forEach(validPosition);
  civilization.cities.forEach(({ position }) => validPosition(position));
  assert.ok(civilization.territory.length >= 3);
  assert.equal(new Set(civilization.cities.map(({ id }) => id)).size, civilization.cities.length);
  assert.ok(events.filter(({ civilizationId }) => civilizationId === civilization.id).length >= 3);
  assert.ok(civilization.timeline.every(({ year }) => year >= MIN_YEAR && year <= MAX_YEAR));
  assert.ok(civilization.image.startsWith("/art/"));
}
for (const event of events) {
  assert.ok(expectedIds.includes(event.civilizationId));
  assert.ok(["Culture", "Discovery", "Trade"].includes(event.category));
  assert.ok(event.year >= MIN_YEAR && event.year <= MAX_YEAR);
  assert.equal(event.synthetic, true);
}

const originalData = JSON.stringify({ civilizations, events });
for (let year = MIN_YEAR; year <= MAX_YEAR; year += 25) {
  const snapshot = getSnapshot(year);
  assert.deepEqual(snapshot, getSnapshot(year), "Repeated snapshots must be deterministic.");
  assert.equal(snapshot.civilizations.length, 4, "All culture previews remain available.");
  assert.deepEqual(
    snapshot.events.map(({ id }) => id),
    events
      .filter((event) => event.year <= year)
      .reverse()
      .map(({ id }) => id),
  );
  for (const civilization of snapshot.civilizations) {
    assert.ok(civilization.population > 0 && Number.isInteger(civilization.population));
    for (const key of ["prosperity", "influence", "stability"]) {
      assert.ok(civilization[key] >= 0 && civilization[key] <= 100);
    }
  }
}
assert.equal(
  JSON.stringify({ civilizations, events }),
  originalData,
  "Evolution must never mutate the fixture source.",
);
const initial = getSnapshot();
assert.ok(initial.events.some(({ id }) => id === "egypt-eternity"));
assert.equal(initial.events[0].id, "egypt-eternity");
assert.ok(Object.isFrozen(initial));
assert.ok(Object.isFrozen(initial.civilizations[0].cities[0].position));
assert.throws(() => {
  initial.civilizations[0].population = 0;
}, TypeError);
assert.throws(() => {
  civilizations[0].territory[0][0] = 0;
}, TypeError);
assert.deepEqual(getSnapshot(MIN_YEAR).events, []);
assert.equal(getSnapshot(MAX_YEAR).events.length, events.length);
assert.ok(
  getSnapshot(MAX_YEAR).civilizations[0].population >
    getSnapshot(MIN_YEAR).civilizations[0].population,
);
console.log(
  `Data checks passed: ${civilizations.length} civilizations, ${events.length} events, 81 timeline snapshots.`,
);
