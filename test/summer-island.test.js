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
import { CAPE_ROCKS, FOREST_BRIDGE, FOREST_RETURN, GALLERY_WALK_RADIUS, ISLAND_BRIDGE, PIER, PIER_PATH, POND, SHORE_X, SHORE_Z,
  SUMMER, SUMMER_ENTRY, SUMMER_PATH, TOWER, TOWER_CAP_RADIUS, TOWER_EXIT, TOWER_LANDING, TOWER_TURNS, bridgeCenter,
  coastPoint, inlandCoastPoint, islandHeight, onTowerGallery, pierLocal, pierPoint, pondDistance, summerWalkable,
  towerPoint, towerRadiusAt, towerRise, towerShellAt, wadePoint } from "../src/summer-layout.js";
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
  for (let trip = 0; trip < 2; trip++) {
    walkTo(player, TOWER.x, TOWER.z + 3.55);
    for (let a = .024; a <= TOWER_TURNS + .06; a += .024) {
      const { x, z } = towerPoint(3.55, a);
      walkTo(player, x, z);
      assert.equal(player.grounded, true);
    }
    const landing = towerPoint(5.65, Math.PI + .075);
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
  }
});

test("the gallery rail retains full body clearance and supports a complete lap, retreat, and jump", () => {
  const radius = (player) => Math.hypot(player.x - TOWER.x, player.z - TOWER.z);
  const player = spawnPlayer({ layer: SUMMER, ...towerPoint(GALLERY_WALK_RADIUS, Math.PI / 2), y: TOWER_LANDING });
  const startZ = player.z;
  for (let i = 0; i < 15; i++) movePlayer(player, 0, -.065, dt);
  assert.ok(player.z < startZ - .8, "tangential input at the rim advances");
  for (let a = Math.PI / 2 + .17; a < Math.PI * 2.5; a += .02) {
    const onRim = towerPoint(GALLERY_WALK_RADIUS - .008, a);
    walkTo(player, onRim.x, onRim.z);
    movePlayer(player, Math.sin(a) * .065, Math.cos(a) * .065, dt);
    assert.ok(radius(player) + BODY_RADIUS + .07 <= TOWER.gallery - .18 + 1e-8);
    assert.equal(player.y, TOWER_LANDING);
  }
  assert.ok(jump(player));
  assert.ok(onTowerGallery(player));
  for (let i = 0; i < 160; i++) {
    const r = radius(player);
    movePlayer(player, (player.x - TOWER.x) / r * .06, (player.z - TOWER.z) / r * .06, dt);
    assert.ok(radius(player) <= GALLERY_WALK_RADIUS + 1e-8);
    assert.ok(onTowerGallery(player));
  }
  assert.ok(player.grounded && player.y === TOWER_LANDING);
  const inward = towerPoint(4.8, Math.PI / 2 - .003);
  walkTo(player, inward.x, inward.z);
});

test("the hatch rail blocks side entry while the high end remains walkable in both directions", () => {
  const angle = Math.PI - .37;
  const player = spawnPlayer({ layer: SUMMER, ...towerPoint(5.6, angle), y: TOWER_LANDING });
  for (let i = 0; i < 80; i++) movePlayer(player, -Math.sin(angle) * .055, -Math.cos(angle) * .055, dt);
  assert.ok(Math.hypot(player.x - TOWER.x, player.z - TOWER.z) > 5.4);
  assert.equal(player.y, TOWER_LANDING);
  assert.ok(player.grounded);
  const upper = towerPoint(3.55, Math.PI + .13);
  for (let step = angle; step <= Math.PI + .13; step += .035) {
    const point = towerPoint(5.6, step);
    walkTo(player, point.x, point.z);
  }
  walkTo(player, upper.x, upper.z);
  for (let step = Math.PI + .11; step > angle; step -= .018) {
    const point = towerPoint(3.55, step);
    walkTo(player, point.x, point.z);
  }
  assert.ok(player.grounded && player.y < TOWER_LANDING - .3);
  assert.ok(!onTowerGallery(player));
  assert.ok(jump(player));
  for (let i = 0; i < 160; i++) movePlayer(player, 0, 0, dt);
  assert.ok(player.grounded && player.y < TOWER_LANDING - .3);
  for (let step = angle; step <= Math.PI + .13; step += .018) {
    const point = towerPoint(3.55, step);
    walkTo(player, point.x, point.z);
  }
  assert.ok(player.grounded && player.y === TOWER_LANDING);
  const exit = spawnPlayer(TOWER_EXIT);
  assert.equal(exit.y, islandHeight(exit.x, exit.z));
  assert.equal(exit.vy, 0);
  assert.ok(exit.grounded && !blockingSolid(exit.layer, exit.x, exit.y, exit.z));
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

test("the widened dry beach connects the rainbow landing, meadow and pier trail", () => {
  const distance = ([ax, az], [bx, bz]) => Math.hypot(ax - bx, az - bz);
  for (const angle of [.60, .85, 1.15, 1.45, 1.75, 2.03]) {
    const grass = inlandCoastPoint(angle, .85);
    const originalWidth = distance(grass, inlandCoastPoint(angle));
    const width = distance(grass, coastPoint(angle));
    assert.ok(width >= 2 * originalWidth && width <= 3 * originalWidth);
  }
  const player = spawnPlayer(SUMMER_ENTRY);
  for (let z = player.z; z > ISLAND_BRIDGE.start; z -= .18) {
    walkTo(player, bridgeCenter(ISLAND_BRIDGE, z), z);
  }
  walkTo(player, -7, 31);
  walkTo(player, -4, 17);
  walkTo(player, ...inlandCoastPoint(1.24, .86));
  walkTo(player, ...coastPoint(1.24, .88));
  assert.ok(jump(player));
  for (let i = 0; i < 139; i++) {
    assert.equal(movePlayer(player, -.064, 0, dt).fell, false);
    assert.ok(islandHeight(player.x, player.z) > .25);
  }
  assert.ok(player.grounded);
  for (let a = 1.43; a < 1.90; a += .035) walkTo(player, ...coastPoint(a, .90));
  walkTo(player, ...inlandCoastPoint(1.90, .83));
  assert.ok(player.grounded && player.y > .75);
});

test("the expanded shallow shelf allows wading, edge sliding, turning and returning to dry sand", () => {
  const angle = 1.18;
  const [sx, sz] = coastPoint(angle);
  const [x, z] = coastPoint(angle, .91);
  const [ex, ez] = wadePoint(angle, PLAYER_RADIUS + .01);
  const width = Math.hypot(ex - sx, ez - sz);
  assert.ok(width >= 5 * BODY_RADIUS * 2 && width <= 8 * BODY_RADIUS * 2);
  const player = spawnPlayer({ layer: SUMMER, x, z });
  walkTo(player, ex, ez, (before, after) => {
    assert.ok(after.grounded && Math.abs(after.y - before.y) < .06);
  });
  const bodyHeight = 2 * BODY_RADIUS;
  assert.ok(-player.y > .1 * bodyHeight && -player.y < .2 * bodyHeight);
  const start = { ...player };
  for (const sign of [1, -1]) {
    for (let i = 0; i < 100; i++) {
      const a = Math.atan2(player.z / SHORE_Z, player.x / SHORE_X);
      const [tx, tz] = wadePoint(a + sign * .0016, PLAYER_RADIUS - .02);
      assert.equal(movePlayer(player, tx - player.x, tz - player.z, dt).fell, false);
      assert.ok(summerWalkable(player, player.x, player.z, PLAYER_RADIUS));
      assert.ok(player.grounded && player.y >= -.32);
    }
    const lateral = Math.atan2(player.z / SHORE_Z, player.x / SHORE_X) - angle;
    assert.ok(sign === 1 ? lateral > .10 : Math.abs(lateral) < .03);
  }
  assert.ok(Math.hypot(start.x - player.x, start.z - player.z) < 1.5);
  walkTo(player, x, z);
  assert.ok(player.y > .25 && player.grounded);

  const bridgeZ = 51.5, bridgeX = bridgeCenter(ISLAND_BRIDGE, bridgeZ);
  const underBridge = spawnPlayer({ layer: SUMMER, x: bridgeX - 4, z: bridgeZ, y: -.12 });
  walkTo(underBridge, bridgeX + 4, bridgeZ);
  assert.ok(underBridge.grounded && underBridge.y < 0);
});

test("the new shore paths connect to both ends of the existing pier ramp and leave the boat afloat", () => {
  const pier = spawnPlayer({ layer: SUMMER, x: PIER_PATH[0][0], z: PIER_PATH[0][1] });
  for (const [x, z] of PIER_PATH.slice(1)) walkTo(pier, x, z);
  const overlook = pierPoint(0, PIER.length - 1);
  walkTo(pier, overlook.x, overlook.z);
  assert.equal(pier.y, PIER.y);
  for (let i = 0; i < 180; i++) movePlayer(pier, .05, .055, dt);
  assert.ok(pierLocal(pier.x, pier.z).along <= PIER.length && pier.grounded);
  walkTo(pier, overlook.x, overlook.z);
  walkTo(pier, PIER.x, PIER.z);
  const [landX, landZ] = PIER_PATH.at(-2);
  walkTo(pier, landX, landZ);
  assert.ok(pier.grounded && Math.abs(pier.y - islandHeight(landX, landZ)) < .01);

  const boat = pierPoint(5.5, PIER.length - 5.5);
  assert.ok(islandHeight(boat.x, boat.z) < -.6);
  const beneath = pierPoint(-3.6, 13.2);
  const wader = spawnPlayer({ layer: SUMMER, ...beneath, y: -.2 });
  const farSide = pierPoint(3.6, 13.2);
  walkTo(wader, farSide.x, farSide.z);
  assert.ok(wader.y < 0 && wader.grounded);
});

test("the pond keeps its existing collision boundary", () => {
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
  const restoredBalcony = spawnPlayer(balcony);
  assert.equal(restoredBalcony.y, TOWER_LANDING);
  assert.ok(Math.hypot(restoredBalcony.x - TOWER.x, restoredBalcony.z - TOWER.z) <= GALLERY_WALK_RADIUS + 1e-8);
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
