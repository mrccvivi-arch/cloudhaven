import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Scene } from "three";
import { createCameraRig } from "../src/camera.js";
import { PLAYER_RADIUS, blockingSolid } from "../src/collision.js";
import { BODY_RADIUS } from "../src/cotton-candy.js";
import { DAY_CYCLE_SECONDS } from "../src/day-night.js";
import { MAP_FACILITIES } from "../src/map.js";
import { MOVE_SPEED, jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave } from "../src/save.js";
import { createRainbowGateTrigger } from "../src/summer-island.js";
import { CAPE_ROCKS, FOREST_BRIDGE, FOREST_RETURN, ISLAND_BRIDGE, PIER, POND, SUMMER, SUMMER_ENTRY, SUMMER_PATH, TOWER, TOWER_CAP_RADIUS, TOWER_LANDING,
  TOWER_TURNS, bridgeCenter, coastDistance, coastPoint, pierLocal, pierPoint, pondDistance, towerPoint, towerRadiusAt, towerRise, towerShellAt, islandHeight } from "../src/summer-layout.js";
import { createWorld } from "../src/world.js";

const dt = .008;

function walkTo(player, x, z, onStep) {
  const initialDistance = Math.hypot(x - player.x, z - player.z);
  const limit = Math.ceil(initialDistance / (MOVE_SPEED * dt)) + 10;
  for (let i = 0; i < limit; i++) {
    const dx = x - player.x, dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < .002) return;
    const scale = Math.min(1, MOVE_SPEED * dt / distance);
    const before = { ...player };
    assert.equal(movePlayer(player, dx * scale, dz * scale, dt).fell, false);
    onStep?.(before, player);
  }
  assert.fail(`Blocked while moving from ${JSON.stringify(player)} toward ${x}, ${z}`);
}

test("the existing gate mechanism crosses both rainbow decks from their walkable entry points", () => {
  const trigger = createRainbowGateTrigger();
  let time = 100;
  function cross(bridge, pose, startZ) {
    const player = spawnPlayer(pose);
    let crossed = 0;
    const goal = bridge.gate + bridge.direction * .25;
    for (let z = startZ; (goal - z) * bridge.direction > 0; z += bridge.direction * .15) {
      walkTo(player, bridgeCenter(bridge, z), z, (before, after) => {
        if (trigger.crossed({ ...before, y: before.y + BODY_RADIUS }, { ...after, y: after.y + BODY_RADIUS }, time)) crossed++;
        time += 8;
      });
      assert.equal(player.grounded, true);
    }
    assert.equal(crossed, 1);
    // Trying to walk sideways while on the raised deck cannot leave it.
    for (let i = 0; i < 100; i++) movePlayer(player, .06, 0, dt);
    assert.ok(Math.abs(player.x - bridgeCenter(bridge, player.z)) < 3);
  }
  cross(FOREST_BRIDGE, { x: FOREST_BRIDGE.x, z: FOREST_BRIDGE.start + .5, layer: "ground" }, FOREST_BRIDGE.start);
  time += 960; // The fade plus the walk from the island spawn outlasts the cooldown.
  cross(ISLAND_BRIDGE, SUMMER_ENTRY, SUMMER_ENTRY.z);
  const returnPlayer = spawnPlayer(FOREST_RETURN);
  walkTo(returnPlayer, FOREST_BRIDGE.x, FOREST_BRIDGE.start + 1);
  assert.ok(returnPlayer.grounded);
});

test("the lighthouse door, helix, gallery and return route are continuously walkable", () => {
  const player = spawnPlayer({ layer: SUMMER, x: -8, z: 36 });
  for (const [x, z] of SUMMER_PATH) walkTo(player, x, z);
  walkTo(player, TOWER.x, TOWER.z + 3.55);
  for (let a = .024; a <= TOWER_TURNS + .06; a += .024) {
    const { x, z } = towerPoint(3.55, a);
    walkTo(player, x, z);
    assert.equal(player.grounded, true);
  }
  const landing = towerPoint(5.9, Math.PI + .075);
  const restoredUpperRamp = 4 * Math.PI + .8;
  const upperEntry = towerPoint(3.55, restoredUpperRamp);
  const upperPlayer = spawnPlayer({ layer: SUMMER, ...upperEntry, y: towerRise(restoredUpperRamp) });
  const outward = towerPoint(towerRadiusAt(upperPlayer.y), restoredUpperRamp);
  assert.equal(blockingSolid(SUMMER, outward.x, upperPlayer.y, outward.z)?.kind, "tower-wall");
  for (let i = 0; i < 45; i++) {
    movePlayer(upperPlayer, .06 * Math.sin(restoredUpperRamp), .06 * Math.cos(restoredUpperRamp), dt);
  }
  assert.ok(Math.hypot(upperPlayer.x - TOWER.x, upperPlayer.z - TOWER.z) < towerRadiusAt(upperPlayer.y) - PLAYER_RADIUS);
  assert.ok(upperPlayer.grounded);
  walkTo(player, landing.x, landing.z);
  assert.equal(player.y, TOWER_LANDING);
  assert.ok(jump(player));
  for (let i = 0; i < 220; i++) movePlayer(player, 0, -.06, dt);
  assert.equal(player.y, TOWER_LANDING);
  assert.ok(Math.hypot(player.x - TOWER.x, player.z - TOWER.z) <= TOWER.gallery);
  for (let a = TOWER_TURNS + .075; a >= 0; a -= .024) {
    const { x, z } = towerPoint(3.55, a);
    walkTo(player, x, z);
  }
  walkTo(player, TOWER.x, TOWER.z + 8);
  assert.ok(player.y < TOWER.y + .1);
  assert.ok(player.grounded);
});

test("the camera stays inside the shaft when Moon walks beside the tapered wall", () => {
  for (const angle of [1.2, 7.5, 13.8]) {
    const y = towerRise(angle);
    const radius = towerRadiusAt(y + 1) - PLAYER_RADIUS - .01;
    const player = spawnPlayer({ layer: SUMMER, ...towerPoint(radius, angle), y });
    const camera = new PerspectiveCamera(51, 1.6, .35, 305);
    const rig = createCameraRig(camera, angle, 9);
    rig.face(angle);
    rig.update(player, 1, true);
    const p = camera.position;
    assert.ok(Math.hypot(p.x - TOWER.x, p.z - TOWER.z) < towerRadiusAt(p.y));
    assert.equal(towerShellAt(p.x, p.y, p.z, .04), false);
  }
});

test("the exposed cape outcrops have solid, terrain-aligned collision bounds", () => {
  for (const rock of CAPE_ROCKS) {
    const { x, y, z, h } = rock;
    assert.ok(y < islandHeight(x, z) && y + h > islandHeight(x, z));
    assert.equal(blockingSolid(SUMMER, x, y + .35, z)?.kind, "cape-rock");
  }
});

test("wading and the pier are traversable, with invisible limits against deep water", () => {
  const [x, z] = coastPoint(2.36, .94);
  const beach = spawnPlayer({ layer: SUMMER, x, z });
  const [sx, sz] = coastPoint(2.36, 1.033);
  walkTo(beach, sx, sz);
  assert.ok(beach.y < 0 && beach.grounded);
  for (let i = 0; i < 160; i++) movePlayer(beach, -.05, .05, dt);
  assert.ok(coastDistance(beach.x, beach.z) < 1.068);

  const pier = spawnPlayer({ layer: SUMMER, ...pierPoint(0, 0) });
  const overlook = pierPoint(0, PIER.length - 1);
  walkTo(pier, overlook.x, overlook.z);
  assert.equal(pier.y, PIER.y);
  for (let i = 0; i < 180; i++) movePlayer(pier, .05, .055, dt);
  assert.ok(pierLocal(pier.x, pier.z).along <= PIER.length && pier.grounded);
  const edge = spawnPlayer({ layer: SUMMER, x: POND.x, z: POND.z + POND.rz + 1 });
  for (let i = 0; i < 180; i++) movePlayer(edge, 0, -.06, dt);
  assert.ok(pondDistance(edge.x, edge.z) >= .76);
});

test("summer persistence keeps the correct spiral floor and preserves existing save data", () => {
  const restore = towerPoint(4, 1.2);
  const raw = {
    pose: { layer: SUMMER, ...restore, y: TOWER.y + 1.2 * TOWER.rise / TOWER_TURNS },
    worldTime: 120, worldCycleSeconds: DAY_CYCLE_SECONDS, moonlightEnergy: 67,
    affection: { affectionPoints: 55 }, materials: { stone: 3 }, storedMaterials: { branch: 2 },
  };
  const state = readSave(raw);
  assert.equal(spawnPlayer(state.pose).y, raw.pose.y);
  assert.equal(state.worldTime, 120);
  assert.equal(state.moonlightEnergy, 67);
  assert.equal(state.affection.affectionPoints, 55);
  assert.equal(state.materials.stone, 3);
  assert.equal(state.storedMaterials.branch, 2);
  assert.equal(MAP_FACILITIES.filter(({ layer }) => layer === SUMMER).length, 5);
  assert.equal(MAP_FACILITIES.find(({ id }) => id === "summer-entry").icon, "🌈");
});

test("existing tower saves outside the new tapered walls stay on the same flight or gallery", () => {
  const oldAngle = 4 * Math.PI + .64;
  const oldFloor = towerRise(oldAngle);
  const ramp = readSave({ pose: { layer: SUMMER, ...towerPoint(4.9, oldAngle), y: oldFloor } }).pose;
  const resumed = spawnPlayer(ramp);
  assert.ok(Math.abs(resumed.y - oldFloor) < 1e-9);
  assert.ok(Math.hypot(resumed.x - TOWER.x, resumed.z - TOWER.z) < towerRadiusAt(oldFloor) - PLAYER_RADIUS);
  const balcony = readSave({ pose: { layer: SUMMER, ...towerPoint(6.48, 1.57), y: TOWER_LANDING } }).pose;
  assert.equal(spawnPlayer(balcony).y, TOWER_LANDING);
});

test("forest and sky groups are detached while the independently created island is active", () => {
  const scene = new Scene();
  const world = createWorld(scene);
  assert.equal(scene.getObjectByName(SUMMER), undefined);
  world.showLayer(SUMMER);
  const island = scene.getObjectByName(SUMMER);
  assert.ok(island);
  const lens = island.getObjectByName("lighthouse-lantern-core");
  assert.equal(lens.geometry.parameters.radius, TOWER_CAP_RADIUS * .43);
  assert.equal(lens.position.x, TOWER.x);
  assert.equal(lens.position.z, TOWER.z);
  assert.equal(scene.children.length, 1);
  world.updateSummer(14, 1);
  world.showLayer("sky");
  assert.equal(island.parent, null);
  assert.equal(world.ground.visible, false);
  world.showLayer("ground");
  assert.equal(world.ground.visible, true);
  world.showLayer(SUMMER);
  assert.equal(scene.children[0], island);
});
