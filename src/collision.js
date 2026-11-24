import { CHERRY_FORK_HEIGHT, SPRING_BOULDERS, SPRING_POOL, SPRING_REST_ROCK, SPRING_TREES } from "./spring-layout.js";
import { BORDER_ROCKS, CREEK_BRIDGE, FOREST_DECOR,
  GOLDEN_GINKGO, PIANO, PLATFORMS, ROCK_SCALE, SKY_TREES, TREES, railPositions, terrainHeight } from "./map.js";

export const PLAYER_RADIUS = .44;
export const PLAYER_HEIGHT = .95;
const CELL = 4;

function circle(kind, { x, z }, radius, bottom, top) {
  return { kind, x, z, radius, bottom, top };
}

function box(kind, { x, y, z, w, h, d }, yaw = 0) {
  return { kind, x, z, w, d, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), bottom: y - h / 2, top: y + h / 2 };
}

function railColliders(deck) {
  return railPositions(deck).map(({ x, y, z, d }) =>
    box("rail", { x, y: y + .34, z, w: .16, d, h: .8 }));
}

const layers = {
  ground: [
    circle("ginkgo-trunk", GOLDEN_GINKGO, GOLDEN_GINKGO.trunkRadius,
      terrainHeight(GOLDEN_GINKGO.x, GOLDEN_GINKGO.z) - .12, terrainHeight(GOLDEN_GINKGO.x, GOLDEN_GINKGO.z) + 7),
    ...TREES.map((tree) => circle("tree", tree, tree.radius,
      terrainHeight(tree.x, tree.z) - .1, terrainHeight(tree.x, tree.z) + tree.size * 2.34)),
    ...FOREST_DECOR.filter(({ kind }) => kind === "rock").map((rock) =>
      box("rock", { ...rock, y: rock.y + .23, w: ROCK_SCALE.x * 1.56, d: ROCK_SCALE.z * 1.56, h: .85 }, rock.x)),
    ...BORDER_ROCKS.map((rock) => box("rock", {
      ...rock, w: rock.sx * 1.54, d: rock.sz * 1.54, h: rock.sy * 1.8,
    }, rock.yaw)),
    ...SPRING_TREES.map((tree) => {
      const y = terrainHeight(tree.x, tree.z);
      return circle("cherry-trunk", tree, tree.size * .34, y - .15, y + tree.size * CHERRY_FORK_HEIGHT);
    }),
    ...[...SPRING_BOULDERS, SPRING_REST_ROCK].map((rock) => {
      const y = terrainHeight(rock.x, rock.z) - .16;
      return box("rock", { ...rock, y: y + rock.height / 2, w: rock.sx * 1.63,
        d: rock.sz * 1.63, h: rock.height }, rock.yaw);
    }),
    {
      ...circle("spring-pool", SPRING_POOL, SPRING_POOL.radiusX - .28, -Infinity, Infinity),
      radiusZ: SPRING_POOL.radiusZ - .28,
    },
    ...railColliders(CREEK_BRIDGE),
    circle("piano", PIANO, PIANO.radius, -Infinity, Infinity),
  ],
  sky: [
    ...SKY_TREES.map((tree) => circle("tree", tree, tree.size * .24, tree.y - .1, tree.y + tree.size * 2.34)),
    ...railColliders(PLATFORMS.find(({ id }) => id === "bridge")),
  ],
};

export function staticColliders(layer) { return layers[layer] ?? []; }

const grids = Object.fromEntries(Object.entries(layers).map(([layer, solids]) => {
  const grid = new Map();
  for (const solid of solids) {
    const rx = (solid.radius ?? (Math.abs(solid.cos) * solid.w + Math.abs(solid.sin) * solid.d) / 2) + PLAYER_RADIUS;
    const rz = (solid.radiusZ ?? solid.radius ?? (Math.abs(solid.sin) * solid.w + Math.abs(solid.cos) * solid.d) / 2) + PLAYER_RADIUS;
    for (let x = Math.floor((solid.x - rx) / CELL); x <= Math.floor((solid.x + rx) / CELL); x++) {
      for (let z = Math.floor((solid.z - rz) / CELL); z <= Math.floor((solid.z + rz) / CELL); z++) {
        const key = x + "," + z;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(solid);
      }
    }
  }
  return [layer, grid];
}));

export function blockingSolid(layer, x, y, z, extraSolids = []) {
  const candidates = grids[layer]?.get(Math.floor(x / CELL) + "," + Math.floor(z / CELL));
  function overlaps(solid) {
    if (y >= solid.top || y + PLAYER_HEIGHT <= solid.bottom) return false;
    const dx = x - solid.x, dz = z - solid.z;
    if (solid.radiusZ !== undefined) {
      return (dx / (solid.radius + PLAYER_RADIUS)) ** 2 + (dz / (solid.radiusZ + PLAYER_RADIUS)) ** 2 < 1;
    }
    if (solid.radius !== undefined) return dx * dx + dz * dz < (solid.radius + PLAYER_RADIUS) ** 2;
    const localX = Math.max(0, Math.abs(dx * solid.cos - dz * solid.sin) - solid.w / 2);
    const localZ = Math.max(0, Math.abs(dx * solid.sin + dz * solid.cos) - solid.d / 2);
    return localX * localX + localZ * localZ < PLAYER_RADIUS ** 2;
  }
  return candidates?.find(overlaps) ?? (layer === "ground" ? extraSolids.find(overlaps) : undefined);
}

export function contactNormal(solid, x, z) {
  let dx = x - solid.x, dz = z - solid.z;
  if (solid.radiusZ !== undefined) {
    dx /= (solid.radius + PLAYER_RADIUS) ** 2;
    dz /= (solid.radiusZ + PLAYER_RADIUS) ** 2;
  } else if (solid.radius === undefined) {
    const lx = dx * solid.cos - dz * solid.sin;
    const lz = dx * solid.sin + dz * solid.cos;
    const cx = lx - Math.max(-solid.w / 2, Math.min(solid.w / 2, lx));
    const cz = lz - Math.max(-solid.d / 2, Math.min(solid.d / 2, lz));
    dx = cx * solid.cos + cz * solid.sin;
    dz = -cx * solid.sin + cz * solid.cos;
  }
  const length = Math.hypot(dx, dz);
  return length ? [dx / length, dz / length] : [0, 0];
}
