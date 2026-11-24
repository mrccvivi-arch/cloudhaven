import { HABITAT } from "./cloud-house-layout.js";
import { FOREST_DECOR, GOLDEN_GINKGO, GROUND_DECKS, HOME, PIANO_APPROACH, POIS, ROUTE, SKY_GATE, TREES,
  creekZ, seeded, terrainHeight } from "./map.js";

function pathDistance(x, z, route) {
  let nearest = Infinity;
  for (let i = 1; i < route.length; i++) {
    const [ax, az] = route[i - 1];
    const dx = route[i][0] - ax, dz = route[i][1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return nearest;
}

export function canDecorateForest(x, z) {
  return pathDistance(x, z, ROUTE) > 2.9 && pathDistance(x, z, PIANO_APPROACH) > 2.7 &&
    Math.abs(z - creekZ(x)) > 4 &&
    ![HOME, HABITAT, SKY_GATE, GOLDEN_GINKGO, ...POIS.filter(({ layer }) => layer === "ground")]
      .some((spot) => Math.hypot(x - spot.x, z - spot.z) < Math.max(4, spot.range ?? 0, spot.rx ? 8 : 0, spot.canopyRadius ?? 0)) &&
    !GROUND_DECKS.some((deck) => Math.abs(x - deck.x) < deck.w / 2 + .9 && Math.abs(z - deck.z) < deck.d / 2 + .9) &&
    !TREES.some((tree) => Math.hypot(x - tree.x, z - tree.z) < tree.radius + .42) &&
    !FOREST_DECOR.some((plant) => Math.hypot(x - plant.x, z - plant.z) < 1.1);
}

const grass = [];
for (let x = -59; x <= 67; x += 6) {
  for (let z = -57; z <= 57; z += 6) {
    if (pathDistance(x, z, ROUTE) > 24 && (x < 25 || z < 12 || z > 42)) continue;
    if (canDecorateForest(x, z)) grass.push({ x, z });
  }
}
const roots = TREES.filter(({ x, z }) => pathDistance(x, z, ROUTE) < 24);
const fixedMushrooms = FOREST_DECOR.filter(({ kind }) => kind === "mushroom");
export const FOREST_MUSHROOMS = fixedMushrooms;

export function forestLayout(date, seed) {
  const random = seeded(seed ^ Number(date.replaceAll("-", "")));
  const plants = [];
  const add = (kind, x, z, id) => plants.push({
    kind, x, z, id, y: terrainHeight(x, z), style: Math.floor(random() * 3),
    size: .76 + random() * .43, yaw: random() * Math.PI * 2,
  });

  for (const { x, z } of grass) {
    const roll = random();
    const px = x + (random() - .5) * 1.9;
    const pz = z + (random() - .5) * 1.9;
    if (!canDecorateForest(px, pz)) continue;
    const id = `${x},${z}`;
    if (roll < .42) add("flower", px, pz, id);
    else if (roll < .55) add("dandelion", px, pz, id);
    else if (roll < .575) add("clover", px, pz, id);
  }
  for (const [index, tree] of roots.entries()) {
    if (random() > .27) continue;
    const angle = random() * Math.PI * 2;
    const x = tree.x + Math.cos(angle) * (tree.radius + .95);
    const z = tree.z + Math.sin(angle) * (tree.radius + .95);
    if (canDecorateForest(x, z)) add("mushroom", x, z, `tree-${index}`);
  }
  return {
    plants,
    // Stable glades also keep night activity scattered between the day's plants.
    glades: grass,
  };
}
