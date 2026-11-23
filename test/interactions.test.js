import assert from "node:assert/strict";
import test from "node:test";
import { CLOUD_HOUSE, STAR_CHEST } from "../src/cloud-house-layout.js";
import { HOME, MAP_FACILITIES, POIS, availableSpot, hasMoonlight } from "../src/map.js";
import { movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave, transferItem } from "../src/save.js";

test("the cloud home retains an open entrance, a covered cavity and a reachable chest", () => {
  const player = spawnPlayer(HOME);
  for (let i = 0; i < 115; i++) movePlayer(player, 0, -.08, .01);
  assert.ok(Math.abs(player.z - CLOUD_HOUSE.z) < .5);
  assert.equal(player.y, 0);
  assert.equal(hasMoonlight(player), false);
  for (let i = 0; i < 24; i++) movePlayer(player, -.08, 0, .01);
  assert.equal(availableSpot(player, [])?.id, STAR_CHEST.id);
  for (let i = 0; i < 24; i++) movePlayer(player, .08, 0, .01);
  for (let i = 0; i < 115; i++) movePlayer(player, 0, .08, .01);
  assert.ok(player.z > CLOUD_HOUSE.z + 4 && hasMoonlight(player));
  assert.ok(!POIS.some(({ id }) => ["bowl", "bath", "bed"].includes(id)));
  assert.equal(MAP_FACILITIES.find(({ id }) => id === "home").name, "云朵小屋");
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
