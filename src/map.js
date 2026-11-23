export const WORLD_LIMIT = 77;
export const HOME = { x: -43, z: 35.5, layer: "ground" };
export const SKY = { x: 0, z: 13, layer: "sky" };
export const CABIN = { x: -43, z: 32 };
export const CABIN_ROOF = { offsetX: 2.85, offsetZ: -9.35, y: 4.30, w: 6.15, d: 3.7, thickness: .32, tilt: .31 };
export const SKY_GATE = { x: 24, z: -43 };

export const ROUTE = [
  [-43, 32], [-31, 33], [-20, 29], [-8, 24], [5, 15], [14, 4], [23, -10], [24, -23], [24, -43],
];

export const PLATFORMS = [
  { id: "arrival", x: 0, z: 12, w: 13, d: 10, y: 29, checkpoint: SKY },
  { id: "bridge", x: 0, z: 4.5, w: 3.4, d: 5, y: 29 },
  { id: "landing", x: 0, z: -2, w: 11, d: 8, y: 29, checkpoint: { x: 0, z: -1, layer: "sky" } },
  { id: "drift", x: 1.5, z: -13, w: 8, d: 8, y: 29.65, checkpoint: { x: 1.5, z: -12, layer: "sky" } },
  { id: "overlook", x: -.8, z: -23.7, w: 10, d: 8, y: 30.4, checkpoint: { x: -.8, z: -23, layer: "sky" } },
];

export const FOREST_LEDGES = [
  { id: "stump-path", x: 4, z: 6, w: 3.8, d: 3.4, lift: .76 },
  { id: "lookout", x: 3, z: 1.6, w: 3.7, d: 3, lift: 1.22 },
];

export const POIS = [
  { id: "bowl", layer: "ground", x: -40.6, z: 26.5, label: "给棉花糖喂食" },
  { id: "bath", layer: "ground", x: -38, z: 26, label: "洗澡", range: 2.9 },
  { id: "chest", layer: "ground", x: -45.3, z: 25, label: "打开储物箱" },
  { id: "build", layer: "ground", x: -31, z: 35.5, label: "查看建造区", range: 4.2 },
  { id: "log", layer: "ground", x: -5, z: 22, label: "捡起木材", item: "wood" },
  { id: "chips", layer: "ground", x: 12.5, z: 8.5, label: "捡起小石头", item: "stone" },
  { id: "seed", layer: "ground", x: 24.5, z: -13, label: "捡起种子", item: "seed" },
  { id: "grove-log", layer: "ground", x: -3.5, z: -12, label: "捡起木材", item: "wood" },
  { id: "gate", layer: "ground", ...SKY_GATE, label: "前往天空群岛", range: 4.2 },
  { id: "return", layer: "sky", x: -4, z: 15, label: "返回森林", range: 3.4 },
  { id: "end", layer: "sky", x: -.8, z: -25, label: "点亮观景台", range: 3.6 },
  { id: "return-end", layer: "sky", x: 2.4, z: -25, label: "从观景台返回森林", range: 2 },
];

export const BATH = { ...POIS.find(({ id }) => id === "bath"), radius: 1.19, rim: .53, sand: .21 };
export const BATH_CLEARANCE = BATH.radius + 1.13;

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

const bridge = { id: "creek-bridge", x: 24, z: -24, w: 4.8, d: 12, y: 1.24 };
export const GROUND_DECKS = [bridge, ...FOREST_LEDGES.map((ledge) => ({
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
      POIS.some((spot) => spot.layer === "ground" && Math.hypot(x - spot.x, z - spot.z) < 4.5) ||
      FOREST_LEDGES.some((ledge) => Math.hypot(x - ledge.x, z - ledge.z) < 4) ||
      TREES.some((tree) => Math.hypot(x - tree.x, z - tree.z) < 3.0)) continue;
  TREES.push({ x, z, size, style: i % 4, radius: .33 * size });
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
  const roof = CABIN_ROOF;
  const roofX = Math.abs(x - CABIN.x);
  const roofHalfWidth = (roof.w * Math.cos(roof.tilt) + roof.thickness * Math.sin(roof.tilt)) / 2;
  if (layer === "ground" &&
      Math.abs(z - CABIN.z - roof.offsetZ) <= roof.d / 2 &&
      roofX <= roof.offsetX + roofHalfWidth &&
      y + 1 < roof.y - (roofX - roof.offsetX) * Math.tan(roof.tilt)) return false;

  if (layer === "sky") {
    return !PLATFORMS.some(({ id, x: px, y: py, z: pz, w }) =>
      (id === "arrival" || id === "overlook") &&
      underCanopy(x, y, z, px - w * .31, py, pz, 1.1, 2));
  }
  return !TREES.some((tree) => {
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
