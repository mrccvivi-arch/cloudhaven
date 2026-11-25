import assert from "node:assert/strict";
import test from "node:test";
import { blockingSolid } from "../src/collision.js";
import { DAY_CYCLE_SECONDS, DAY_LENGTH, NIGHT_LENGTH, advanceCycle } from "../src/day-night.js";
import { GOLDEN_GINKGO, TREES, creekZ } from "../src/map.js";
import { MATERIALS, MATERIAL_SLOTS, addMaterial, advanceGatheringCycle, collectMaterial, hasMaterials,
  materialAvailable, materialCount, refreshGathering, spendMaterials } from "../src/materials.js";
import { readSave } from "../src/save.js";

const reload = (state, pose = state.pose) => readSave(JSON.parse(JSON.stringify({ ...state, pose })));
const now = 1_800_000_000_000;
const nearest = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (slot) => ({ ...slot, layer: "ground", grounded: true });

test("forest has the configured caps and slots clear the ground colliders, creek and tree trunks", () => {
  for (const id of Object.keys(MATERIALS)) {
    assert.equal(MATERIAL_SLOTS.filter((slot) => slot.id === id).length, MATERIALS[id].limit);
  }
  for (const slot of MATERIAL_SLOTS) {
    assert.equal(blockingSolid("ground", slot.x, slot.y, slot.z), undefined);
    assert.ok(Math.abs(slot.z - creekZ(slot.x)) > 6);
    if (slot.id === "branch") assert.ok(TREES.some((tree) => nearest(slot, tree) < 3.4));
    if (slot.id === "golden_leaf") assert.ok(nearest(slot, GOLDEN_GINKGO) <= GOLDEN_GINKGO.canopyRadius);
  }
});

test("all four ordinary materials use per-slot wall-time cooldowns across reload and layer changes", () => {
  let state = readSave({ inventory: { stone: 99 }, chest: { stone: 42 }, collected: ["chips"] });
  for (const id of ["stone", "branch", "golden_leaf", "wildflower"]) {
    const slot = MATERIAL_SLOTS.find((entry) => entry.id === id);
    const dueAt = now + MATERIALS[id].refreshMs;
    assert.equal(materialCount(state, id), 0);
    assert.equal(collectMaterial(state, slot.key, { ...near(slot), layer: "sky" }, now), false);
    assert.equal(collectMaterial(state, slot.key, { ...near(slot), x: slot.x + 4 }, now), false);
    assert.equal(collectMaterial(state, slot.key, near(slot), now), true);
    state = reload(state, { x: 0, z: 13, y: 29, layer: "sky" });
    assert.equal(state.pose.layer, "sky");
    assert.equal(collectMaterial(state, slot.key, near(slot), dueAt - 1), false);
    assert.equal(materialCount(state, id), 1);
    assert.equal(refreshGathering(state, dueAt), true);
    assert.equal(collectMaterial(state, slot.key, near(slot), dueAt), true);
    assert.equal(materialCount(state, id), 2);
  }
});

test("six stars refresh on the original twenty-minute play schedule across faster nights and reloads", () => {
  let state = readSave({ worldTime: 0, worldCycleSeconds: DAY_CYCLE_SECONDS });
  const stars = MATERIAL_SLOTS.filter(({ id }) => id === "stardust");
  function play(seconds) {
    advanceCycle(state, seconds, false);
    advanceGatheringCycle(state.gathering, seconds);
  }
  assert.equal(stars.some((slot) => materialAvailable(state, slot, now)), false);
  play(DAY_LENGTH);
  assert.equal(stars.every((slot) => materialAvailable(state, slot, now)), true);
  for (const slot of stars) assert.equal(collectMaterial(state, slot.key, near(slot), now), true);

  state = reload(state);
  const nextDayWallTime = now + 86_400_000;
  assert.equal(stars.some((slot) => materialAvailable(state, slot, nextDayWallTime)), false);
  for (let i = 0; i < 3; i++) {
    play(DAY_CYCLE_SECONDS);
    assert.equal(state.worldTime, DAY_LENGTH);
    assert.equal(refreshGathering(state, nextDayWallTime), false);
    assert.equal(stars.some((slot) => materialAvailable(state, slot, nextDayWallTime)), false);
  }
  play(NIGHT_LENGTH);
  assert.equal(state.gathering.cycle, 1);
  assert.equal(refreshGathering(state, nextDayWallTime), true);
  assert.equal(stars.some((slot) => materialAvailable(state, slot, nextDayWallTime)), false);
  play(DAY_LENGTH);
  assert.equal(stars.every((slot) => materialAvailable(state, slot, nextDayWallTime)), true);
  assert.equal(materialCount(state, "stardust"), 6);
});

test("construction cost checks are atomic and invalid material changes are rejected", () => {
  const state = readSave({ materials: { stone: 3, branch: 2, wildflower: -3 } });
  assert.equal(addMaterial(state, "constructor"), false);
  assert.equal(addMaterial(state, "stone", -1), false);
  assert.equal(materialCount(state, "wildflower"), 0);
  assert.equal(hasMaterials(state, { stone: 4 }), false);
  assert.equal(spendMaterials(state, { stone: 2, branch: 3 }), false);
  assert.equal(materialCount(state, "stone"), 3);
  assert.equal(spendMaterials(state, { stone: 2, branch: 2 }), true);
  assert.equal(materialCount(state, "stone"), 1);
  assert.equal(materialCount(state, "branch"), 0);
  assert.equal(materialCount(readSave(null), "stone"), 0);
  assert.deepEqual(readSave(null).gathering, { cycle: 0, elapsed: 180, collected: {} });
});
