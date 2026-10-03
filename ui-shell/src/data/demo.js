/**
 * Synthetic content for the Cunabula Civilitatis UI prototype.
 * Names and visual motifs evoke ancient cultures. Dates, boundaries, cities,
 * statistics, events, and their effects are illustrative UI fixtures, not a
 * historical reconstruction. All four cultures stay visible at every date.
 *
 * A future historical provider can implement the same small contract:
 * { id: string, mode: string, getSnapshot(year): Snapshot }.
 * Geography uses [longitude, latitude]; population uses persons; scores use
 * 0–100. A snapshot is immutable, contains a normalized year, all civilization
 * profiles, and only events reached by that year, newest first.
 */

export const MIN_YEAR = -3500;
export const MAX_YEAR = -1500;
export const INITIAL_YEAR = -2500;
export const DEMO_NOTICE = "Illustrative world · synthetic dates, borders, events & statistics";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const civilizations = deepFreeze([
  {
    id: "egypt",
    name: "Ancient Egypt",
    shortName: "Egypt",
    subtitle: "Children of the Nile",
    period: "The Old Kingdom",
    color: "#c5a36a",
    glyph: "𓂀",
    position: [31.1, 27.8],
    cities: [
      { id: "memphis", name: "Memphis", position: [31.25, 29.85] },
      { id: "thebes", name: "Thebes", position: [32.65, 25.7] },
      { id: "abydos", name: "Abydos", position: [31.92, 26.18] },
    ],
    territory: [
      [29.3, 31.3],
      [32.25, 31.4],
      [33, 29.8],
      [33.2, 26],
      [33.3, 23.6],
      [31.5, 23.6],
      [30.5, 27.1],
      [29.3, 29.6],
    ],
    capital: "Memphis",
    river: "The Nile",
    government: "Divine kingship",
    writing: "Hieroglyphs",
    religion: "The solar pantheon",
    population: 1_640_000,
    prosperity: 78,
    influence: 86,
    stability: 84,
    description:
      "Between desert and river, a kingdom builds for eternity. The flood brings grain; stone carries the memory of kings.",
    achievements: [
      {
        title: "Monumental architecture",
        description: "Stone gives the kingdom a lasting silhouette.",
      },
      {
        title: "River agriculture",
        description: "The floodplain sustains a chain of thriving settlements.",
      },
      {
        title: "The written word",
        description: "Scribes preserve accounts, ritual, and royal memory.",
      },
    ],
    timeline: [
      {
        year: -3100,
        title: "A crown above the river",
        description: "River settlements enter a shared chapter.",
      },
      {
        year: -2700,
        title: "The age of stone",
        description: "Builders gather around an ambitious royal workshop.",
      },
      {
        year: -2500,
        title: "A monument to eternity",
        description: "A new stone monument rises above the western bank.",
      },
      {
        year: -1900,
        title: "Caravans at the frontier",
        description: "Distant goods arrive along a desert trading route.",
      },
    ],
    image: "/art/egypt.webp",
    synthetic: true,
  },
  {
    id: "mesopotamia",
    name: "Mesopotamia",
    shortName: "Mesopotamia",
    subtitle: "Between Two Rivers",
    period: "The City-State Era",
    color: "#77a69a",
    glyph: "𒀭",
    position: [44.4, 32.5],
    cities: [
      { id: "uruk", name: "Uruk", position: [45.64, 31.32] },
      { id: "ur", name: "Ur", position: [46.1, 30.96] },
      { id: "kish", name: "Kish", position: [44.6, 32.54] },
    ],
    territory: [
      [41.6, 35.8],
      [43.8, 35.4],
      [45.7, 33.3],
      [47.1, 30.6],
      [45.6, 29.6],
      [43.8, 31.8],
      [42, 33.3],
    ],
    capital: "Uruk",
    river: "Tigris & Euphrates",
    government: "Temple city-states",
    writing: "Cuneiform",
    religion: "Gods of city & sky",
    population: 1_120_000,
    prosperity: 82,
    influence: 75,
    stability: 66,
    description:
      "Cities of clay and reed rise between two restless rivers. Every storehouse, market, and temple adds a line to the first urban story.",
    achievements: [
      {
        title: "Clay-tablet archives",
        description: "A reed stylus turns everyday trade into a lasting record.",
      },
      {
        title: "Temple cities",
        description: "Dense neighborhoods gather beneath the city sanctuary.",
      },
      { title: "Irrigation networks", description: "Canals carry the rivers into the dry plain." },
    ],
    timeline: [
      {
        year: -3050,
        title: "The tablet house",
        description: "Scribes gather the city’s accounts into an archive.",
      },
      {
        year: -2650,
        title: "A canal to the fields",
        description: "A shared waterway links new farms to the city.",
      },
      {
        year: -2350,
        title: "The river market",
        description: "Boats and merchants meet at a growing quay.",
      },
      {
        year: -1800,
        title: "Words set in stone",
        description: "A public inscription gives the city a common voice.",
      },
    ],
    image: "/art/mesopotamia.webp",
    synthetic: true,
  },
  {
    id: "indus",
    name: "Indus Valley",
    shortName: "Indus",
    subtitle: "Cities of the Great River",
    period: "The Harappan Horizon",
    color: "#809db9",
    glyph: "◇",
    position: [69.4, 28.4],
    cities: [
      { id: "mohenjo-daro", name: "Mohenjo-daro", position: [68.14, 27.33] },
      { id: "harappa", name: "Harappa", position: [72.87, 30.63] },
      { id: "dholavira", name: "Dholavira", position: [70.21, 23.89] },
    ],
    territory: [
      [66.6, 28.5],
      [69, 31],
      [73.7, 31.4],
      [75.5, 29.2],
      [73.2, 26.9],
      [72.2, 23.2],
      [69.1, 23.2],
      [67.1, 25.8],
    ],
    capital: "Mohenjo-daro",
    river: "The Indus",
    government: "Urban councils",
    writing: "Seal inscriptions",
    religion: "Ritual & river",
    population: 1_350_000,
    prosperity: 85,
    influence: 67,
    stability: 79,
    description:
      "Brick by brick, orderly cities take shape along the river. Reservoirs, workshops, and distant sea routes bind their quiet prosperity.",
    achievements: [
      {
        title: "Planned settlements",
        description: "Streets and courtyards form a carefully ordered city.",
      },
      {
        title: "Water engineering",
        description: "Reservoirs and drains make water part of urban life.",
      },
      {
        title: "Maritime exchange",
        description: "Seals and measures accompany cargo bound for distant shores.",
      },
    ],
    timeline: [
      {
        year: -3000,
        title: "A village becomes a town",
        description: "Craft workshops gather beside a new brick street.",
      },
      {
        year: -2600,
        title: "The water court",
        description: "A civic reservoir opens at the heart of the settlement.",
      },
      {
        year: -2200,
        title: "Beyond the delta",
        description: "A cargo vessel returns with news of a distant harbor.",
      },
      {
        year: -1750,
        title: "New settlements upstream",
        description: "Families establish a chain of smaller river communities.",
      },
    ],
    image: "/art/indus.webp",
    synthetic: true,
  },
  {
    id: "yellow-river",
    name: "Yellow River",
    shortName: "Yellow River",
    subtitle: "The Loess & the Hearth",
    period: "The Early Bronze Horizon",
    color: "#b98771",
    glyph: "鼎",
    position: [112.8, 35.1],
    cities: [
      { id: "taosi", name: "Taosi", position: [111.5, 35.88] },
      { id: "erlitou", name: "Erlitou", position: [112.69, 34.69] },
      { id: "chengziya", name: "Chengziya", position: [117.4, 36.75] },
    ],
    territory: [
      [108.7, 36.2],
      [111.5, 37.6],
      [115.2, 37.5],
      [118.3, 36.9],
      [117.7, 34.4],
      [114.2, 33.5],
      [110.1, 34],
    ],
    capital: "Erlitou",
    river: "The Yellow River",
    government: "Regional chiefdoms",
    writing: "Ritual marks",
    religion: "Ancestors & the earth",
    population: 980_000,
    prosperity: 69,
    influence: 62,
    stability: 75,
    description:
      "Across the ochre earth, walled settlements follow the river’s course. Harvest, kinship, and the craft of bronze shape an emerging world.",
    achievements: [
      {
        title: "Earthen city walls",
        description: "Rammed earth encloses workshops, homes, and granaries.",
      },
      {
        title: "Fine ceramic craft",
        description: "Patient hands turn river clay into delicate vessels.",
      },
      {
        title: "Bronze workshops",
        description: "New casting techniques give ritual a different form.",
      },
    ],
    timeline: [
      {
        year: -2950,
        title: "The shared granary",
        description: "River communities pool the season’s harvest.",
      },
      {
        year: -2550,
        title: "Vessels of black clay",
        description: "A workshop perfects a striking new ceremonial form.",
      },
      {
        year: -2050,
        title: "The walled settlement",
        description: "A new enclosure gathers homes around a central court.",
      },
      {
        year: -1700,
        title: "Fire in the bronze house",
        description: "Metalworkers cast a vessel for a communal ceremony.",
      },
    ],
    image: "/art/yellow-river.webp",
    synthetic: true,
  },
]);

export const events = deepFreeze([
  {
    id: "egypt-crown",
    year: -3100,
    civilizationId: "egypt",
    title: "A crown above the river",
    category: "Culture",
    summary: "The Nile finds a common banner.",
    description:
      "In this imagined chapter, river towns bring their offerings beneath a single royal standard. The court marks the occasion with a season of ceremony.",
    effect: "Shared identity · Stability +4",
    synthetic: true,
  },
  {
    id: "mesopotamia-archive",
    year: -3050,
    civilizationId: "mesopotamia",
    title: "The tablet house",
    category: "Discovery",
    summary: "A city learns to remember.",
    description:
      "Clay records from the market are gathered beneath one roof. Scribes begin an archive of grain, labor, and exchange.",
    effect: "Administration · Influence +3",
    synthetic: true,
  },
  {
    id: "indus-town",
    year: -3000,
    civilizationId: "indus",
    title: "A village becomes a town",
    category: "Culture",
    summary: "A new street connects the workshops.",
    description:
      "Builders lay a line of fired brick through a growing settlement. Potters and bead-makers open their doors along the new road.",
    effect: "Urban life · Prosperity +3",
    synthetic: true,
  },
  {
    id: "yellow-river-granary",
    year: -2950,
    civilizationId: "yellow-river",
    title: "The shared granary",
    category: "Trade",
    summary: "The harvest becomes a common reserve.",
    description:
      "Neighboring communities bring their surplus to a central storehouse, making a place of exchange beside the fields.",
    effect: "Food reserve · Stability +4",
    synthetic: true,
  },
  {
    id: "egypt-stone",
    year: -2700,
    civilizationId: "egypt",
    title: "The age of stone",
    category: "Discovery",
    summary: "Builders imagine a lasting monument.",
    description:
      "A royal workshop experiments with cut stone. Architects assemble a plan that will outlast the season of its making.",
    effect: "Stonecraft · Influence +4",
    synthetic: true,
  },
  {
    id: "mesopotamia-canal",
    year: -2650,
    civilizationId: "mesopotamia",
    title: "A canal to the fields",
    category: "Discovery",
    summary: "River water reaches a new plain.",
    description:
      "Work crews open a channel between the river and distant fields. The first water arrives with a gathering of farmers and city officials.",
    effect: "Irrigation · Prosperity +5",
    synthetic: true,
  },
  {
    id: "indus-water",
    year: -2600,
    civilizationId: "indus",
    title: "The water court",
    category: "Discovery",
    summary: "A reservoir anchors the growing city.",
    description:
      "Masons complete a civic reservoir surrounded by shaded courts. Water becomes a shared presence at the center of urban life.",
    effect: "Waterworks · Stability +4",
    synthetic: true,
  },
  {
    id: "yellow-river-pottery",
    year: -2550,
    civilizationId: "yellow-river",
    title: "Vessels of black clay",
    category: "Culture",
    summary: "A delicate craft earns new renown.",
    description:
      "Potters unveil thin-walled vessels with a dark, polished surface. Visitors carry the new style to nearby settlements.",
    effect: "Ceramic craft · Influence +4",
    synthetic: true,
  },
  {
    id: "egypt-eternity",
    year: -2500,
    civilizationId: "egypt",
    title: "A monument to eternity",
    category: "Culture",
    summary: "The western horizon gains a new silhouette.",
    description:
      "At sunrise, workers set the final stone above the desert. Along the Nile, the court celebrates a monument built to carry a royal name beyond memory.",
    effect: "Monument raised · Influence +6",
    synthetic: true,
  },
  {
    id: "mesopotamia-market",
    year: -2350,
    civilizationId: "mesopotamia",
    title: "The river market",
    category: "Trade",
    summary: "A busy quay welcomes distant merchants.",
    description:
      "Timber, wool, and copper pass through a new riverside market. The city’s seal appears on cargo traveling far beyond its walls.",
    effect: "River exchange · Prosperity +5",
    synthetic: true,
  },
  {
    id: "indus-voyage",
    year: -2200,
    civilizationId: "indus",
    title: "Beyond the delta",
    category: "Trade",
    summary: "A vessel returns from a distant harbor.",
    description:
      "Merchants unload unfamiliar stones and share stories of a far western shore. A new sea route enters the city’s imagination.",
    effect: "Maritime exchange · Influence +5",
    synthetic: true,
  },
  {
    id: "yellow-river-walls",
    year: -2050,
    civilizationId: "yellow-river",
    title: "The walled settlement",
    category: "Culture",
    summary: "A common boundary encloses a new community.",
    description:
      "Layers of compacted earth rise around homes and workshops. At the gate, a growing settlement meets the surrounding fields.",
    effect: "Urban community · Stability +3",
    synthetic: true,
  },
  {
    id: "egypt-caravan",
    year: -1900,
    civilizationId: "egypt",
    title: "Caravans at the frontier",
    category: "Trade",
    summary: "The desert carries news and precious goods.",
    description:
      "A long caravan reaches the river with fragrant resins, copper, and stories from beyond the eastern hills.",
    effect: "Desert exchange · Prosperity +4",
    synthetic: true,
  },
  {
    id: "mesopotamia-inscription",
    year: -1800,
    civilizationId: "mesopotamia",
    title: "Words set in stone",
    category: "Culture",
    summary: "An inscription addresses the whole city.",
    description:
      "A carved stone is raised near the temple court. Citizens gather to hear its words spoken aloud beneath the afternoon sun.",
    effect: "Civic tradition · Stability +4",
    synthetic: true,
  },
  {
    id: "indus-upstream",
    year: -1750,
    civilizationId: "indus",
    title: "New settlements upstream",
    category: "Trade",
    summary: "Small communities build new connections.",
    description:
      "Families and craftspeople establish homes farther along the river. Familiar seals travel with them, linking old streets to new markets.",
    effect: "Local networks · Prosperity +2",
    synthetic: true,
  },
  {
    id: "yellow-river-bronze",
    year: -1700,
    civilizationId: "yellow-river",
    title: "Fire in the bronze house",
    category: "Discovery",
    summary: "A new vessel emerges from the casting mold.",
    description:
      "Metalworkers lift a finished bronze vessel from its mold. The community gathers to see the object that will anchor its next ceremony.",
    effect: "Bronze casting · Influence +5",
    synthetic: true,
  },
]);

function normalizeYear(year) {
  if (typeof year !== "number" || !Number.isFinite(year)) {
    throw new TypeError("A snapshot year must be a finite number.");
  }
  return Math.max(MIN_YEAR, Math.min(MAX_YEAR, Math.round(year)));
}

const clampScore = (score) => Math.max(0, Math.min(100, Math.round(score)));

/** Deterministic fixture evolution; event effects are narrative labels only. */
export function getSnapshot(requestedYear = INITIAL_YEAR) {
  const year = normalizeYear(requestedYear);
  const progress = (year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR);
  const profiles = civilizations.map((civilization, index) => {
    const wave = Math.sin((progress - 0.5) * Math.PI * 2 + index * 0.8);
    return {
      ...civilization,
      population: Math.round((civilization.population * (0.65 + 0.7 * progress)) / 1000) * 1000,
      prosperity: clampScore(civilization.prosperity + (progress - 0.5) * 12),
      influence: clampScore(civilization.influence + (progress - 0.5) * 10),
      stability: clampScore(civilization.stability + wave * 5),
    };
  });
  return deepFreeze({
    year,
    civilizations: profiles,
    events: events.filter((event) => event.year <= year).reverse(),
    mode: "synthetic",
    notice: DEMO_NOTICE,
  });
}

/** Values use signed historical years: -2500 displays as 2,500 BCE. */
export function formatYear(year) {
  if (typeof year !== "number" || !Number.isFinite(year)) {
    throw new TypeError("A display year must be a finite number.");
  }
  const roundedYear = Math.round(year);
  return `${Math.abs(roundedYear).toLocaleString("en-US")} ${roundedYear < 0 ? "BCE" : "CE"}`;
}

export const demoProvider = Object.freeze({
  id: "cunabula-demo-v1",
  mode: "synthetic",
  bounds: Object.freeze({ min: MIN_YEAR, max: MAX_YEAR, initial: INITIAL_YEAR }),
  notice: DEMO_NOTICE,
  getSnapshot,
});
