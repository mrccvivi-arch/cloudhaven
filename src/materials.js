import { CONSTRUCTION_SITES } from "./construction-sites.js";
import { HABITAT } from "./cloud-house-layout.js";
import { blockingSolid } from "./collision.js";
import { isNight } from "./day-night.js";
import { BRIDGE_RAMPS, DAILY_WORLD, FOREST_DECOR, GOLDEN_GINKGO, GROVE_PATH, GROUND_DECKS, PIANO,
  ROUTE, SKY_GATE, TREES, creekZ, seeded, terrainHeight, WORLD_LIMIT } from "./map.js";

const minute = 60_000;
const STARDUST_CYCLE_SECONDS = 20 * 60;
export const MATERIALS = Object.freeze({
  stone: { name: "石块", icon: "🪨", limit: 25, refreshMs: 30 * minute },
  branch: { name: "枯枝", icon: "🪵", limit: 25, refreshMs: 30 * minute },
  golden_leaf: { name: "金叶", icon: "🍂", limit: 15, refreshMs: 15 * minute },
  wildflower: { name: "野花", icon: "🌸", limit: 20, refreshMs: 30 * minute },
  stardust: { name: "星屑", icon: "⭐", limit: 6, refreshMs: null },
});
export const GATHERING = Object.freeze({
  reach: 3, verticalReach: 1.1, hitRadius: .49, repeatTapRadius: 14, repeatTapMs: 1800, checkMs: 1500,
});

const materialIds = Object.keys(MATERIALS);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isAmount = (value) => isCount(value) && value > 0;
const knownMaterial = (id) => Object.prototype.hasOwnProperty.call(MATERIALS, id);

export function readMaterialCounts(raw) {
  return Object.fromEntries(materialIds.map((id) => [id, isCount(raw?.[id]) ? raw[id] : 0]));
}

export function materialCount(state, id) {
  return knownMaterial(id) ? state.materials[id] : 0;
}

export function hasMaterials(state, amounts) {
  return Boolean(amounts && typeof amounts === "object" && !Array.isArray(amounts) &&
    Object.entries(amounts).every(([id, count]) => knownMaterial(id) && isAmount(count) && materialCount(state, id) >= count));
}

export function spendMaterials(state, amounts) {
  if (!hasMaterials(state, amounts)) return false;
  for (const [id, count] of Object.entries(amounts)) state.materials[id] -= count;
  return true;
}

export function addMaterial(state, id, count = 1) {
  if (!knownMaterial(id) || !isAmount(count) || !isCount(state.materials[id] + count)) return false;
  state.materials[id] += count;
  return true;
}

export function transferMaterial(state, id, deposit) {
  if (!knownMaterial(id)) return false;
  const [source, target] = deposit ? [state.materials, state.storedMaterials] : [state.storedMaterials, state.materials];
  if (!source[id] || !isCount(target[id] + 1)) return false;
  source[id]--;
  target[id]++;
  return true;
}

function near(x, z, point, radius) {
  return Math.hypot(x - point.x, z - point.z) < radius;
}

function nearPath(x, z, path, clearance) {
  return path.slice(1).some(([endX, endZ], i) => {
    const [startX, startZ] = path[i];
    const dx = endX - startX, dz = endZ - startZ;
    const t = Math.max(0, Math.min(1, ((x - startX) * dx + (z - startZ) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - startX - t * dx, z - startZ - t * dz) < clearance;
  });
}

function grassAt(x, z) {
  const y = terrainHeight(x, z);
  return Math.max(Math.abs(x), Math.abs(z)) < WORLD_LIMIT - 7 &&
    CONSTRUCTION_SITES.every(({ footprint: site }) => site.w
      ? Math.hypot(Math.max(0, Math.abs(x - site.x) - site.w / 2), Math.max(0, Math.abs(z - site.z) - site.d / 2)) > .44
      : !near(x, z, site, site.radius + .44)) &&
    Math.abs(z - creekZ(x)) > 6 &&
    !near(x, z, HABITAT, 8) && !near(x, z, SKY_GATE, 5) &&
    !near(x, z, DAILY_WORLD, 3) && !near(x, z, PIANO, 3) &&
    !GROUND_DECKS.some((deck) => Math.abs(x - deck.x) < deck.w / 2 + 1 && Math.abs(z - deck.z) < deck.d / 2 + 1) &&
    !BRIDGE_RAMPS.some((ramp) => Math.abs(x - ramp.x) < ramp.w / 2 + 1 &&
      z > Math.min(ramp.bridgeZ, ramp.landZ) - 1 && z < Math.max(ramp.bridgeZ, ramp.landZ) + 1) &&
    !FOREST_DECOR.some((decor) => near(x, z, decor, 1.15)) &&
    !nearPath(x, z, ROUTE, 1.8) && !nearPath(x, z, GROVE_PATH, 1.05) &&
    !ROUTE.slice(1).some(([rx, rz]) => near(x, z, { x: rx + 1.8, z: rz }, 1)) &&
    [[0, 0], [.65, 0], [-.65, 0], [0, .65], [0, -.65]].every(([dx, dz]) =>
      !blockingSolid("ground", x + dx, y, z + dz) && Math.abs(terrainHeight(x + dx, z + dz) - y) < .35);
}

function spawnSlots() {
  const random = seeded(481506);
  const slots = [];
  const trees = TREES.filter(({ x, z }) => Math.abs(x) < 60 && z > -55 && z < 60);
  const route = ROUTE.map(([x, z]) => ({ x, z }));
  function around(point, min, max) {
    const angle = random() * Math.PI * 2;
    const radius = min + random() * (max - min);
    return [point.x + Math.cos(angle) * radius, point.z + Math.sin(angle) * radius];
  }
  for (const [id, { limit }] of Object.entries(MATERIALS)) {
    let count = 0;
    for (let attempt = 0; count < limit && attempt < 2000; attempt++) {
      let position;
      if (id === "golden_leaf") position = around(GOLDEN_GINKGO, 1.7, GOLDEN_GINKGO.canopyRadius);
      else if (id === "branch") position = around(trees[attempt % trees.length], 1.4, 3.4);
      else if (id === "stardust") position = around(trees[attempt % trees.length], 2, 5);
      else position = around(route[attempt % route.length], 2.2, 12);
      const [x, z] = position;
      if (!grassAt(x, z) || slots.some((slot) => near(x, z, slot, 1.55))) continue;
      slots.push(Object.freeze({ key: `${id}:${count++}`, id, x, z, y: terrainHeight(x, z), yaw: random() * Math.PI * 2 }));
    }
  }
  return Object.freeze(slots);
}

export const MATERIAL_SLOTS = spawnSlots();
const slotsByKey = new Map(MATERIAL_SLOTS.map((slot) => [slot.key, slot]));

export function readGathering(raw, worldPhase = 0) {
  return {
    cycle: isCount(raw?.cycle) ? raw.cycle : 0,
    elapsed: Number.isFinite(raw?.elapsed) && raw.elapsed >= 0 && raw.elapsed < STARDUST_CYCLE_SECONDS
      ? raw.elapsed : worldPhase * STARDUST_CYCLE_SECONDS,
    collected: Object.fromEntries(MATERIAL_SLOTS.flatMap(({ key }) =>
      isCount(raw?.collected?.[key]) ? [[key, raw.collected[key]]] : [])),
  };
}

export function advanceGatheringCycle(gathering, seconds) {
  // Keep the stardust quota on its original active-play schedule.
  const elapsed = gathering.elapsed + seconds;
  gathering.cycle += Math.floor(elapsed / STARDUST_CYCLE_SECONDS);
  gathering.elapsed = elapsed % STARDUST_CYCLE_SECONDS;
}

export function materialAvailable(state, slot, now) {
  const { cycle, collected } = state.gathering;
  const { refreshMs } = MATERIALS[slot.id];
  const mark = collected[slot.key];
  return refreshMs === null ? isNight(state.worldTime) && (mark === undefined || mark < cycle)
    : mark === undefined || now >= mark;
}

export function refreshGathering(state, now) {
  const { cycle, collected } = state.gathering;
  let changed = false;
  for (const [key, mark] of Object.entries(collected)) {
    const slot = slotsByKey.get(key);
    const expired = MATERIALS[slot.id].refreshMs === null ? mark < cycle : now >= mark;
    if (!expired) continue;
    delete collected[key];
    changed = true;
  }
  return changed;
}

export function canReachMaterial(player, slot) {
  return player.layer === "ground" && player.grounded &&
    Math.abs(player.y - slot.y) <= GATHERING.verticalReach && near(player.x, player.z, slot, GATHERING.reach);
}

export function collectMaterial(state, key, player, now) {
  const slot = slotsByKey.get(key);
  if (!slot || !canReachMaterial(player, slot) || !materialAvailable(state, slot, now) ||
      !addMaterial(state, slot.id)) return false;
  const { refreshMs } = MATERIALS[slot.id];
  state.gathering.collected[key] = refreshMs === null ? state.gathering.cycle : now + refreshMs;
  return true;
}
