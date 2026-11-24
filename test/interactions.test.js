import assert from "node:assert/strict";
import test from "node:test";
import { HABITAT, MOON_STORAGE, cloudFloat, cloudFloor } from "../src/cloud-house-layout.js";
import { HOME, MAP_FACILITIES, availableSpot, hasMoonlight } from "../src/map.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave } from "../src/save.js";
import { addMaterial, transferMaterial } from "../src/materials.js";

test("the floating habitat can be jumped onto, carries the player and can be left", () => {
  const player = spawnPlayer({ ...HOME, z: 31.1, y: 0 });
  for (let i = 0; i < 30; i++) movePlayer(player, 0, -.08, .01);
  assert.equal(player.y, 0);
  assert.equal(availableSpot(player, []), undefined);
  assert.ok(jump(player));
  for (let i = 0; i < 103; i++) {
    movePlayer(player, 0, i < 51 ? -.08 : 0, .01, undefined, cloudFloat(i * .01));
  }
  assert.ok(player.grounded && player.z < HABITAT.z + 2);
  for (let i = 0; i < 440; i++) {
    const offset = cloudFloat(i * .027);
    movePlayer(player, 0, 0, .01, undefined, offset);
    assert.ok(player.grounded);
    assert.equal(player.y, cloudFloor(player.x, player.z, offset));
  }
  assert.ok(hasMoonlight(player));
  for (let i = 0; i < 130; i++) movePlayer(player, 0, .08, .01);
  assert.ok(player.grounded && player.z > HABITAT.z + 4 && player.y === 0);
  assert.equal(MAP_FACILITIES.find(({ id }) => id === "home").name, "悬浮栖息云");
});

test("the moon storage interaction is available on the cloud, with old ordinary materials retired", () => {
  const position = { ...MOON_STORAGE, x: MOON_STORAGE.x + 1, y: 1.5 };
  assert.equal(availableSpot(position, [])?.id, "chest");
  assert.equal(availableSpot({ ...position, y: 0 }, []), undefined);
  const migrated = readSave({ pose: position, chest: { wood: 4 } });
  assert.ok(spawnPlayer(migrated.pose, .04).y > 1.4);
  assert.equal(migrated.storedMaterials.branch, 0);
});

test("material transfers conserve counts and round-trip through saves", () => {
  const state = readSave({ inventory: { wood: 2 } });
  assert.equal(state.materials.branch, 0);
  assert.equal(addMaterial(state, "branch", 2), true);
  assert.equal(transferMaterial(state, "branch", true), true);
  assert.equal(transferMaterial(state, "branch", true), true);
  assert.equal(transferMaterial(state, "branch", true), false);
  assert.equal(transferMaterial(state, "constructor", false), false);
  const reloaded = readSave(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.storedMaterials.branch, 2);
  assert.equal(reloaded.materials.branch, 0);
  assert.equal(transferMaterial(reloaded, "branch", false), true);
  assert.equal(reloaded.storedMaterials.branch, 1);
  assert.equal(reloaded.materials.branch, 1);
  assert.equal(readSave({ storedMaterials: { branch: -4, stone: 1.5 } }).storedMaterials.branch, 0);
});
