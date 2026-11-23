import assert from "node:assert/strict";
import test from "node:test";
import { HOME, POIS, ROUTE, SKY, TREES, availableSpot, regionFor, terrainHeight } from "../src/map.js";
import { MOVE_SPEED, floorAt, jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { SAVE_KEY, loadGame, readSave, saveGame } from "../src/save.js";

const dt = 1 / 120;

function travel(player, seconds, x, z) {
  let event;
  for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
    event = movePlayer(player, x * MOVE_SPEED * dt, z * MOVE_SPEED * dt, dt);
    if (event.fell) return event;
  }
  return event;
}

test("the arrival bridge is walkable and both required sky gaps can be jumped", () => {
  const player = spawnPlayer(SKY);
  travel(player, 2.26, 0, -1);
  assert.ok(player.grounded && Math.abs(player.z + 5.3) < .14);
  assert.equal(jump(player), true);
  assert.equal(jump(player), false);
  let event = travel(player, 1, 0, -1);
  assert.equal(event.checkpoint.z, -12);
  assert.equal(player.y, 29.65);
  travel(player, .36, 0, -1);
  assert.equal(jump(player), true);
  event = travel(player, 1, 0, -1);
  assert.equal(event.checkpoint.z, -23);
  assert.equal(player.y, 30.4);
});

test("walking off an island falls and triggers a checkpoint respawn", () => {
  const player = spawnPlayer(SKY);
  const event = travel(player, 3, 1, 0);
  assert.equal(event.fell, true);
  Object.assign(player, spawnPlayer(SKY));
  assert.equal(player.z, 13);
  assert.equal(player.grounded, true);
  assert.equal(player.y, 29);
});

test("tree collisions, world edges and ground-deck heights constrain movement", () => {
  const tree = TREES.find((entry) => entry.x > -50 && entry.x < 50);
  const player = spawnPlayer({ x: tree.x, z: tree.z + 1.75, layer: "ground" });
  travel(player, .6, 0, -1);
  assert.ok(player.z - tree.z >= tree.radius + .43);
  const edge = spawnPlayer({ x: 76, z: 0, layer: "ground" });
  travel(edge, .6, 1, 0);
  assert.ok(edge.x <= 77);
  assert.equal(floorAt("ground", 24, -24).id, "creek-bridge");
  assert.ok(floorAt("ground", 4, 6).y > terrainHeight(4, 6));
});

test("the marked route connects the home spawn to the sky gate on foot", () => {
  const player = spawnPlayer(HOME);
  for (const [x, z] of ROUTE) {
    let steps = 0;
    while (Math.hypot(x - player.x, z - player.z) > .15 && steps++ < 600) {
      const length = Math.hypot(x - player.x, z - player.z);
      const stride = Math.min(length, MOVE_SPEED * dt);
      movePlayer(player, (x - player.x) / length * stride, (z - player.z) / length * stride, dt);
    }
    assert.ok(steps < 600, "Blocked on the route near " + x + ", " + z);
  }
  assert.equal(availableSpot(player, []).id, "gate");
});

test("connected regions, nearby interactions and collected-object filtering", () => {
  assert.equal(regionFor(HOME), "home");
  assert.equal(regionFor({ x: 12, z: 8, layer: "ground" }), "forest");
  assert.equal(regionFor(SKY), "sky");
  const log = POIS.find((spot) => spot.id === "log");
  assert.equal(availableSpot(log, []).item, "wood");
  assert.equal(availableSpot(log, ["log"]), undefined);
});

test("saves persist independently and invalid in-air positions recover", () => {
  const records = new Map([["little-chinchilla:v1", "untouched"]]);
  const storage = { getItem: (key) => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const first = loadGame(storage);
  first.inventory.wood = 3;
  first.collected.push("log");
  first.worldTime = 740;
  first.moonlightEnergy = 67.5;
  first.placements.push({ id: "fence-1", type: "fence", position: { x: 1, y: 0, z: 2 }, rotation: 0 });
  saveGame(storage, first);
  const next = loadGame(storage);
  assert.equal(next.inventory.wood, 3);
  assert.deepEqual(next.collected, ["log"]);
  assert.ok(!("fed" in readSave({ fed: 123 })));
  assert.equal(next.worldTime, 740);
  assert.equal(next.moonlightEnergy, 67.5);
  assert.deepEqual(next.placements, first.placements);
  assert.ok(records.has(SAVE_KEY));
  assert.equal(records.get("little-chinchilla:v1"), "untouched");
  const fallback = readSave({ pose: { x: 28, y: 27, z: 13, layer: "sky" } });
  assert.equal(fallback.pose.layer, "sky");
  assert.equal(fallback.pose.x, SKY.x);
});

test("the practice floor supports jumping and keeps the avatar inside its rendered bounds", () => {
  const player = spawnPlayer(HOME);
  const area = { x: HOME.x, z: HOME.z, halfWidth: 17 };
  assert.equal(jump(player), true);
  for (let i = 0; i < 55; i++) movePlayer(player, MOVE_SPEED * dt, 0, dt, area);
  assert.ok(player.y > 1);
  assert.equal(player.grounded, false);
  for (let i = 0; i < 350; i++) movePlayer(player, MOVE_SPEED * dt, 0, dt, area);
  assert.equal(player.x, HOME.x + 17);
  assert.equal(player.y, 0);
  assert.equal(player.grounded, true);
});
