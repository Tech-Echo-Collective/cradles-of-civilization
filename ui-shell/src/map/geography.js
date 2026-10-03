// Decorative geography is intentionally illustrative. Coastline geometry is
// loaded separately from the public-domain Natural Earth 1:110m dataset.
export const LATITUDE_STRETCH = 1.18;
export const project = ([longitude, latitude]) => [longitude, -latitude * LATITUDE_STRETCH];

export const rivers = [
  {
    name: "N I L E",
    points: [
      [31.2, 31.5],
      [31.1, 30],
      [31.2, 28.8],
      [30.8, 27.8],
      [31.5, 26.6],
      [32.7, 25.3],
      [32.9, 24],
      [33.7, 22],
      [34.1, 19.7],
      [33.8, 18.3],
      [32.5, 17],
      [32.5, 15.5],
      [31.6, 13],
      [30.5, 10],
    ],
  },
  {
    name: "",
    points: [
      [31.1, 30],
      [30.4, 31.4],
    ],
  },
  {
    name: "",
    points: [
      [31.1, 30],
      [31.9, 31.5],
    ],
  },
  {
    name: "E U P H R A T E S",
    points: [
      [39.1, 39],
      [38.3, 37.5],
      [38.1, 36.6],
      [39.2, 35.8],
      [40.7, 35.1],
      [41.8, 34.4],
      [43.2, 33.1],
      [44.3, 32.5],
      [45.5, 31.3],
      [47.6, 30.4],
      [48.5, 29.9],
    ],
  },
  {
    name: "T I G R I S",
    points: [
      [39.7, 38.5],
      [41.1, 37.6],
      [42.6, 37],
      [43.2, 35.9],
      [43.5, 34.6],
      [44.4, 33.3],
      [45.5, 32.5],
      [46.4, 31.8],
      [47.6, 30.4],
    ],
  },
  {
    name: "I N D U S",
    points: [
      [79.7, 32.7],
      [76.8, 34.1],
      [74.6, 35.2],
      [73.2, 35.1],
      [72.1, 34.1],
      [71.5, 32.9],
      [70.9, 31.1],
      [70.4, 29.5],
      [69.4, 28.2],
      [68.4, 27],
      [68.3, 25.4],
      [67.5, 23.8],
    ],
  },
  {
    name: "",
    points: [
      [76.8, 32.7],
      [75, 31.3],
      [73.7, 30.2],
      [72.1, 29.1],
      [70.4, 29.5],
    ],
  },
  {
    name: "Y E L L O W   R I V E R",
    points: [
      [96.2, 35.1],
      [98.2, 34.5],
      [100.1, 35.4],
      [102, 36],
      [103.8, 36.5],
      [104.2, 37.5],
      [105.7, 38.5],
      [106.9, 40.3],
      [109.7, 40.9],
      [111.1, 40.3],
      [110.5, 38.2],
      [110.5, 36.7],
      [110.5, 35.2],
      [112.2, 34.8],
      [114.2, 35.1],
      [116.1, 36.5],
      [118.2, 37.6],
    ],
  },
  {
    name: "",
    points: [
      [90.1, 29.4],
      [92.5, 29.3],
      [94.5, 29.6],
      [96.2, 29],
      [96.7, 27.8],
      [94.8, 27.6],
      [92.5, 26.7],
      [90.5, 26.2],
      [90, 24.4],
      [90.8, 22.2],
    ],
  },
  {
    name: "",
    points: [
      [79, 30.7],
      [79.1, 29],
      [80.3, 27.8],
      [82.5, 26.3],
      [85.7, 25.4],
      [88.3, 25.2],
      [89.8, 23.6],
      [90.8, 22.2],
    ],
  },
];

export const mountainRanges = [
  {
    points: [
      [-9, 30],
      [-4, 33],
      [2, 34],
      [9, 35],
    ],
    count: 33,
    spread: 2.8,
  },
  {
    points: [
      [28, 40],
      [33, 39.5],
      [38, 40],
      [42, 39],
    ],
    count: 34,
    spread: 2.4,
  },
  {
    points: [
      [39, 43],
      [44, 42],
      [48, 42],
    ],
    count: 20,
    spread: 1.6,
  },
  {
    points: [
      [45, 36],
      [48, 33.5],
      [51, 30.8],
      [55, 28.7],
    ],
    count: 31,
    spread: 2.5,
  },
  {
    points: [
      [58, 35],
      [63, 35.5],
      [70, 36],
      [76, 35],
    ],
    count: 35,
    spread: 2.6,
  },
  {
    points: [
      [70, 34],
      [76, 33],
      [82, 30],
      [88, 28.7],
      [95, 29],
    ],
    count: 65,
    spread: 4.0,
  },
  {
    points: [
      [66, 42],
      [73, 43],
      [80, 42],
      [88, 43],
    ],
    count: 38,
    spread: 2.5,
  },
  {
    points: [
      [87, 47],
      [93, 49],
      [100, 48],
      [106, 45],
    ],
    count: 40,
    spread: 3,
  },
  {
    points: [
      [102, 39],
      [106, 38],
      [110, 40],
      [116, 41],
      [123, 43],
    ],
    count: 39,
    spread: 2,
  },
  {
    points: [
      [98, 27],
      [101, 24],
      [103, 21],
    ],
    count: 27,
    spread: 2.5,
  },
  {
    points: [
      [37, 16],
      [39, 12],
      [37, 8],
    ],
    count: 20,
    spread: 2.5,
  },
  {
    points: [
      [14, 46],
      [20, 44],
      [23, 41],
    ],
    count: 22,
    spread: 1.9,
  },
];

export const geographicalLabels = [
  {
    text: "M E D I T E R R A N E A N   S E A",
    position: [17.5, 35.2],
    size: 10,
    rotation: -0.06,
    water: true,
  },
  { text: "A R A B I A N   S E A", position: [61.8, 13.8], size: 12, rotation: 0.06, water: true },
  { text: "B A Y   O F   B E N G A L", position: [89.5, 16], size: 10, rotation: 0, water: true },
  { text: "C A S P I A N", position: [51.3, 43], size: 8, rotation: -1.0, water: true },
  { text: "S A H A R A", position: [12, 23], size: 17, rotation: 0.03 },
  { text: "A R A B I A", position: [45.7, 21.7], size: 14, rotation: -0.2 },
  { text: "P E R S I A", position: [57.2, 31.5], size: 14, rotation: -0.22 },
  { text: "H I M A L A Y A", position: [86, 32], size: 11, rotation: 0.17 },
  { text: "G O B I   D E S E R T", position: [106, 45], size: 12, rotation: -0.07 },
  { text: "D E C C A N", position: [77.6, 17.8], size: 11, rotation: 0 },
];

// Used only if the small local coastline file cannot be loaded.
export const fallbackLand = [
  [
    [-17, 36],
    [-5, 36],
    [8, 37],
    [12, 33],
    [22, 32],
    [32, 31],
    [35, 23],
    [43, 12],
    [51, 12],
    [44, 2],
    [40, -10],
    [32, -25],
    [15, -25],
    [10, -10],
    [0, 5],
    [-15, 10],
    [-17, 25],
    [-17, 36],
  ],
  [
    [-10, 36],
    [0, 44],
    [10, 44],
    [15, 41],
    [22, 40],
    [27, 36],
    [35, 36],
    [35, 31],
    [43, 12],
    [51, 13],
    [57, 23],
    [50, 29],
    [49, 30],
    [55, 25],
    [61, 25],
    [66, 24],
    [69, 21],
    [73, 9],
    [77, 8],
    [81, 17],
    [88, 22],
    [91, 22],
    [95, 16],
    [99, 10],
    [104, 2],
    [109, 5],
    [106, 15],
    [110, 21],
    [117, 23],
    [122, 31],
    [120, 39],
    [130, 42],
    [141, 50],
    [150, 60],
    [150, 80],
    [-10, 80],
    [-10, 36],
  ],
];

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function sampleLine(points, progress) {
  const at = Math.min(progress * (points.length - 1), points.length - 1 - 0.0001);
  const i = Math.floor(at),
    f = at - i;
  return [
    points[i][0] + (points[i + 1][0] - points[i][0]) * f,
    points[i][1] + (points[i + 1][1] - points[i][1]) * f,
  ];
}
