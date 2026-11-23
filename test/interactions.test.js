import assert from "node:assert/strict";
import test from "node:test";
import { HABITAT, MOON_STORAGE, cloudFloat, cloudFloor } from "../src/cloud-house-layout.js";
import { HOME, MAP_FACILITIES, POIS, availableSpot, hasMoonlight } from "../src/map.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave, transferItem } from "../src/save.js";

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

test("the moon storage interaction is available on the cloud, with legacy chest inventory unchanged", () => {
  const position = { ...MOON_STORAGE, x: MOON_STORAGE.x + 1, y: 1.5 };
  assert.equal(availableSpot(position, [])?.id, "chest");
  assert.equal(availableSpot({ ...position, y: 0 }, []), undefined);
  const migrated = readSave({ pose: position, chest: { wood: 4 } });
  assert.ok(spawnPlayer(migrated.pose, .04).y > 1.4);
  assert.equal(migrated.chest.wood, 4);
});

test("storage transfers conserve counts, round-trip through saves and load old saves with an empty chest", () => {
  const state = readSave({ inventory: { wood: 2 } });
  assert.deepEqual(state.chest, { wood: 0, stone: 0, seed: 0 });
  assert.equal(transferItem(state, "wood", true), true);
  assert.equal(transferItem(state, "wood", true), true);
  assert.equal(transferItem(state, "wood", true), false);
  assert.equal(transferItem(state, "constructor", false), false);
  const reloaded = readSave(JSON.parse(JSON.stringify(state)));
  assert.equal(reloaded.chest.wood, 2);
  assert.equal(reloaded.inventory.wood, 0);
  assert.ok(reloaded.discovered.includes("wood"));
  assert.equal(transferItem(reloaded, "wood", false), true);
  assert.equal(reloaded.chest.wood, 1);
  assert.equal(reloaded.inventory.wood, 1);
  assert.equal(readSave({ chest: { wood: -4, stone: 1.5 } }).chest.wood, 0);
});
