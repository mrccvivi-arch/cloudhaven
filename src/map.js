import { HABITAT_MARKER, MOON_STORAGE, canReachMoon } from "./cloud-house-layout.js";
export const WORLD_LIMIT = 77;
export const HOME = { x: -43, z: 35.5, layer: "ground" };
export const skyStartPoint = Object.freeze({ x: 0, z: 13, layer: "sky" });
export const SKY = skyStartPoint;
export const SKY_GATE = { x: 24, z: -43 };
export const GOLDEN_GINKGO = { x: 65, z: 32, trunkRadius: .58, canopyRadius: 6.4 };

export function underGoldenGinkgo({ layer, x, y, z }) {
  return layer === "ground" && Math.hypot(x - GOLDEN_GINKGO.x, z - GOLDEN_GINKGO.z) <= GOLDEN_GINKGO.canopyRadius &&
    y < terrainHeight(GOLDEN_GINKGO.x, GOLDEN_GINKGO.z) + 4.5;
}

export const ROUTE = [
  [-43, 32], [-31, 33], [-20, 29], [-8, 24], [5, 15], [14, 4], [23, -10], [24, -23], [24, -43],
];

export const PLATFORMS = [
  { id: "arrival", x: 0, z: 12, w: 13, d: 10, y: 29, checkpoint: skyStartPoint },
  { id: "bridge", x: 0, z: 4.5, w: 3.4, d: 5, y: 29 },
  { id: "landing", x: 0, z: -2, w: 11, d: 8, y: 29, checkpoint: { x: 0, z: -1, layer: "sky" } },
  { id: "drift", x: 1.5, z: -13, w: 8, d: 8, y: 29.65, checkpoint: { x: 1.5, z: -12, layer: "sky" } },
  { id: "overlook", x: -.8, z: -23.7, w: 10, d: 8, y: 30.4, checkpoint: { x: -.8, z: -23, layer: "sky" } },
];

export const FOREST_LEDGES = [
  { id: "stump-path", x: 4, z: 6, w: 3.8, d: 3.4, lift: .76 },
  { id: "lookout", x: 3, z: 1.6, w: 3.7, d: 3, lift: 1.22 },
];

export const PIANO = { id: "piano", layer: "ground", x: 9, z: 19, radius: 1.57, label: "月光演奏区 · 点击开始演奏", range: 3.5 };

export const PIANO_APPROACH = [ROUTE[4], [PIANO.x - 1.9, PIANO.z - 1.9]];

export const cloudActivationPoint = Object.freeze({
  id: "end", layer: "sky", x: -.8, z: -25, label: "点亮观景台", range: 3.6,
});

export const POIS = [
  PIANO,
  MOON_STORAGE,
  { id: "build", layer: "ground", x: -31, z: 35.5, label: "查看建造区", range: 4.2 },
  { id: "log", layer: "ground", x: -5, z: 22, label: "捡起木材", item: "wood" },
  { id: "chips", layer: "ground", x: 12.5, z: 8.5, label: "捡起小石头", item: "stone" },
  { id: "seed", layer: "ground", x: 24.5, z: -13, label: "捡起种子", item: "seed" },
  { id: "grove-log", layer: "ground", x: -3.5, z: -12, label: "捡起木材", item: "wood" },
  { id: "gate", layer: "ground", ...SKY_GATE, label: "前往天空群岛", range: 4.2 },
  { id: "return", layer: "sky", x: -4, z: 15, label: "返回森林", range: 3.4 },
  cloudActivationPoint,
  { id: "return-end", layer: "sky", x: 2.4, z: -25, label: "从观景台返回森林", range: 2 },
];

export const MAP_FACILITIES = [
  { id: "home", name: "悬浮栖息云", icon: "🏠", layer: HOME.layer, position: HABITAT_MARKER },
  { id: PIANO.id, name: "月光演奏区", icon: "♫", layer: PIANO.layer, position: PIANO },
  { id: "lookout", name: "天空观景台", icon: "✨", layer: "sky", position: cloudActivationPoint },
].map((facility) => ({
  ...facility,
  visibleOn: (layer) => layer === facility.layer,
}));

export function creekZ(x) {
  return -24 + 1.8 * Math.sin((x - 24) / 12);
}

export function rawHeight(x, z) {
  const home = Math.min(1, Math.max(0, (Math.hypot(x + 41, z - 29) - 21) / 13));
  const river = Math.abs(z - creekZ(x));
  const bank = Math.min(1, Math.max(0, (river - 2.3) / 4));
  const hill = 1.55 + 1.38 * Math.sin(x * .083) * Math.cos(z * .088) + .65 * Math.sin((x + z) * .11);
  return home * (hill * bank - (1 - bank) * 1.15);
}

export function terrainHeight(x, z) {
  const ix = Math.floor(x / 2) * 2;
  const iz = Math.floor(z / 2) * 2;
  const u = (x - ix) / 2;
  const v = (z - iz) / 2;
  const b = rawHeight(ix, iz + 2);
  const d = rawHeight(ix + 2, iz);
  return u + v <= 1
    ? rawHeight(ix, iz) * (1 - u - v) + b * v + d * u
    : rawHeight(ix + 2, iz + 2) * (u + v - 1) + b * (1 - u) + d * (1 - v);
}

export const CREEK_BRIDGE = { id: "creek-bridge", x: 24, z: -24, w: 4.8, d: 12, y: 1.92 };
export const BRIDGE_RAMPS = [-1, 1].map((side) => {
  const bridgeZ = CREEK_BRIDGE.z + side * CREEK_BRIDGE.d / 2;
  const landZ = side < 0 ? -36 : -16;
  const { x, w, y } = CREEK_BRIDGE;
  const xs = [x - w / 2, x - 2, x, x + 2, x + w / 2];
  return { id: side < 0 ? "north-ramp" : "south-ramp", x, w, y, bridgeZ, landZ,
    xs, heights: xs.map((px) => terrainHeight(px, landZ)) };
});

// Use the same diagonal as the rendered ramp triangles.
export function rampHeight(ramp, x, z) {
  const { xs, heights, y, bridgeZ, landZ } = ramp;
  const index = xs.findIndex((edge) => x <= edge);
  const i = Math.min(xs.length - 2, Math.max(0, index < 0 ? xs.length - 2 : index - 1));
  const u = Math.max(0, Math.min(1, (x - xs[i]) / (xs[i + 1] - xs[i])));
  const v = (z - bridgeZ) / (landZ - bridgeZ);
  return u + v <= 1 ? y * (1 - v) + heights[i] * v
    : heights[i + 1] * (u + v - 1) + heights[i] * (1 - u) + y * (1 - v);
}

export const GROUND_DECKS = [CREEK_BRIDGE, ...FOREST_LEDGES.map((ledge) => ({
  ...ledge, y: terrainHeight(ledge.x, ledge.z) + ledge.lift,
}))];

export function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const random = seeded(511);
export const TREES = [];
for (let i = 0; i < 320; i++) {
  const x = random() * 152 - 76;
  const z = random() * 152 - 76;
  const size = .7 + random() * 1.55;
  if (Math.hypot(x + 41, z - 29) < 24 || Math.abs(z - creekZ(x)) < 5.5 ||
      ROUTE.some(([rx, rz]) => Math.hypot(x - rx, z - rz) < 9) ||
      POIS.some((spot) => spot.layer === "ground" && spot !== PIANO && Math.hypot(x - spot.x, z - spot.z) < 4.5) ||
      FOREST_LEDGES.some((ledge) => Math.hypot(x - ledge.x, z - ledge.z) < 4) ||
      TREES.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 3.0)) continue;
  TREES.push({ x, z, size, style: i % 4, radius: .24 * size });
}

export const FOREST_DECOR = [];
const decorRandom = seeded(778);
for (let i = 0; i < 105; i++) {
  const x = decorRandom() * 148 - 74;
  const z = decorRandom() * 148 - 74;
  if (Math.hypot(x + 41, z - 29) < 20 || Math.abs(z - creekZ(x)) < 3.5) continue;
  FOREST_DECOR.push({ x, z, y: terrainHeight(x, z), kind: i % 4 === 0 ? "flower" : i % 3 === 0 ? "rock" : "mushroom" });
}

export const BORDER_ROCKS = [-1, 1].flatMap((edge) => Array.from({ length: 8 }, (_, i) => ({
  x: edge * (83 + (i % 3) * 7), y: 0, z: i * 22 - 79, sx: 17, sy: 6 + i % 3 * 4, sz: 14,
  yaw: i, color: i % 2 ? 0x9caf9c : 0x96ada6,
})));
export const ROCK_SCALE = { x: .81, y: .44, z: .65 };
export const SKY_TREES = PLATFORMS.filter(({ id }) => id === "arrival" || id === "overlook")
  .map(({ x, y, z, w }) => ({ x: x - w * .31, y, z, size: 1.1, style: 2 }));

export function railPositions({ x, y, z, w, d }) {
  return [-1, 1].map((side) => ({ x: x + side * w * .49, y, z, d }));
}

export function regionFor(player) {
  if (player.layer === "sky") return "sky";
  return Math.hypot(player.x + 41, player.z - 29) < 25 ? "home" : "forest";
}

export function availableSpot(player, collected) {
  let closest;
  let nearest = Infinity;
  for (const spot of POIS) {
    if (spot.layer !== player.layer || collected.includes(spot.id)) continue;
    if (spot === MOON_STORAGE && !canReachMoon(player)) continue;
    const distance = Math.hypot(spot.x - player.x, spot.z - player.z);
    if (distance < (spot.range ?? 2.6) && distance < nearest) {
      closest = spot;
      nearest = distance;
    }
  }
  return closest;
}

// Vertical footprints approximate cover without touching the movement colliders.
export function hasMoonlight({ layer, x, y, z }) {
  if (layer === "sky") {
    return !PLATFORMS.some(({ id, x: px, y: py, z: pz, w }) =>
      (id === "arrival" || id === "overlook") &&
      underCanopy(x, y, z, px - w * .31, py, pz, 1.1, 2));
  }
  return !underGoldenGinkgo({ layer, x, y, z }) && !TREES.some((tree) => {
    const size = tree.size;
    if (Math.abs(x - tree.x) > size * 1.5 || Math.abs(z - tree.z) > size * 1.5) return false;
    return underCanopy(x, y, z, tree.x, terrainHeight(tree.x, tree.z), tree.z, size, tree.style);
  });
}

function underCanopy(x, y, z, tx, ty, tz, size, style) {
  const dx = (x - tx) / size;
  const dz = (z - tz) / size;
  const height = (y + 1 - ty) / size;
  if (style % 2 === 0) {
    const distance = dx * dx + dz * dz;
    for (let i = 0; i < 3; i++) {
      const top = 3.31 + i * .75;
      const radius = (1.45 - i * .32) * Math.max(0, Math.min(1, (top - height) / 1.9));
      if (distance < radius * radius) return true;
    }
    return false;
  }
  return (height < 3.85 && (dx / 1.16) ** 2 + (dz / 1.09) ** 2 < 1) ||
    (height < 4.2 && ((dx - .43) / .85) ** 2 + (dz / .82) ** 2 < 1);
}
