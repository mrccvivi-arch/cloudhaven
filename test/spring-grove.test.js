import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Raycaster, Scene, Vector3 } from "three";
import { createCameraRig } from "../src/camera.js";
import { PLAYER_RADIUS, blockingSolid, staticColliders } from "../src/collision.js";
import { BODY_RADIUS } from "../src/cotton-candy.js";
import { DAILY_WORLD, GOLDEN_GINKGO, GROUND_DECKS, HOME, MAP_FACILITIES, PIANO, ROUTE, SKY_GATE, WORLD_LIMIT, terrainHeight } from "../src/map.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { SEASONAL_SPACE } from "../src/seasonal-space.js";
import { HABITAT, MOON_STORAGE } from "../src/cloud-house-layout.js";
import { CONSTRUCTION_SITES } from "../src/construction-sites.js";
import { createSpringGrove } from "../src/spring-grove.js";
import { SPRING_BOULDERS, SPRING_PATH, SPRING_POOL, SPRING_REST_ROCK, SPRING_TREES, springPoint, springWaterDepth } from "../src/spring-layout.js";

test("seasonal planning fits the existing world with one relocated spring site and an untouched ginkgo anchor", () => {
  const { spring, summer, autumn, winter } = SEASONAL_SPACE;
  const contains = ({ xMin, zMin, xMax, zMax }, { x, z }) => x >= xMin && x <= xMax && z >= zMin && z <= zMax;
  const locations = [HOME, HABITAT, MOON_STORAGE, DAILY_WORLD, PIANO, SKY_GATE, ...GROUND_DECKS,
    ...ROUTE.map(([x, z]) => ({ x, z }))];
  for (const region of Object.values(SEASONAL_SPACE)) {
    const { xMin, zMin, xMax, zMax } = region.bounds;
    assert.ok([xMin, zMin, xMax, zMax].every((axis) => Math.abs(axis) <= WORLD_LIMIT));
    assert.ok(contains(region.bounds, region.center));
    assert.ok(!locations.some((position) => contains(region.bounds, position)));
    if (region !== autumn) assert.ok(!CONSTRUCTION_SITES.some((site) => contains(region.bounds, site)));
  }
  assert.deepEqual(autumn.center, { x: 65, z: 32 });
  assert.ok(contains(autumn.bounds, GOLDEN_GINKGO));
  assert.ok(spring.bounds.xMax + 70 < autumn.bounds.xMin);
  assert.equal(summer.status, "reserved");
  assert.equal(winter.status, "reserved");
  assert.ok(contains(winter.bounds, { x: winter.lakeStudy.xMin, z: winter.lakeStudy.zMin }));
  assert.ok(contains(winter.bounds, { x: winter.lakeStudy.xMax, z: winter.lakeStudy.zMax }));
  assert.ok([...SPRING_TREES, ...SPRING_BOULDERS, SPRING_REST_ROCK].every((spot) => contains(spring.bounds, spot)));
  assert.ok(SPRING_PATH.every(([x, z]) => contains(spring.bounds, { x, z })));
  const pools = staticColliders("ground").filter(({ kind }) => kind === "spring-pool");
  assert.equal(pools.length, 0);

  const scene = new Scene();
  const grove = createSpringGrove(scene, true);
  const camera = new PerspectiveCamera();
  const root = scene.getObjectByName("Spring grove");
  camera.position.set(autumn.center.x, 5, autumn.center.z);
  grove.update({ ...autumn.center, y: 1 }, camera, .016, 0, 0);
  assert.equal(root.visible, false);
  camera.position.set(spring.center.x, 5, spring.center.z + 12);
  grove.update({ ...spring.center, y: 1 }, camera, .016, 0, 0);
  assert.equal(root.visible, true);
});

function walk(player, x, z, inspect = () => {}) {
  for (let frame = 0; frame < 240; frame++) {
    const dx = x - player.x, dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < .04) return;
    const fraction = Math.min(1, .11 / distance);
    const { fell } = movePlayer(player, dx * fraction, dz * fraction, 1 / 60);
    assert.equal(fell, false);
    inspect(player);
  }
}

test("the spring footpath provides a grounded round trip to the rest rock", () => {
  const start = springPoint(37.5, 14.4), rest = springPoint(62.6, 10.4);
  const player = spawnPlayer({ layer: "ground", ...start });
  const waypoints = [...SPRING_PATH, [rest.x, rest.z], ...SPRING_PATH.toReversed(), [start.x, start.z]];
  for (const [x, z] of waypoints) {
    walk(player, x, z);
    assert.ok(Math.hypot(x - player.x, z - player.z) < .05, `path blocked at ${x},${z}`);
    assert.equal(player.grounded, true);
  }
  const { x, z } = SPRING_REST_ROCK;
  assert.equal(blockingSolid("ground", x, terrainHeight(x, z), z)?.kind, "rock");
  assert.ok(!MAP_FACILITIES.some(({ position }) => Math.hypot(position.x - x, position.z - z) < 16));
});

test("the hidden entrance has room on both sides of the turn", () => {
  const [from, to] = SPRING_PATH.slice(3, 5);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const nx = (from[1] - to[1]) / length, nz = (to[0] - from[0]) / length;
  for (const progress of [0, .25, .5, .75, 1]) {
    const cx = from[0] + (to[0] - from[0]) * progress;
    const cz = from[1] + (to[1] - from[1]) * progress;
    const free = [-1, 1].map((side) => {
      for (let distance = 0; distance < 3; distance += .05) {
        const x = cx + nx * distance * side, z = cz + nz * distance * side;
        if (blockingSolid("ground", x, terrainHeight(x, z), z)) return distance;
      }
      return 3;
    });
    assert.ok(free.every((side) => side >= .65), "the turn is pinched against a collider");
    assert.ok(free[0] + free[1] + PLAYER_RADIUS * 2 >= BODY_RADIUS * 2 * 2.5);
  }
});

test("the expanded banks connect to the front meadow on dry, walkable ground", () => {
  const start = springPoint(61, 11);
  const routes = [
    [[59.5, 8], [57.8, 6.5], [57.6, 5.5], [57, 4.5], [55.9, 3.5], [55.25, 2], [53, 2]],
    [[62.9, 12], [65.5, 11], [68.9, 10], [69.5, 5], [69.5, 1.55]],
  ];
  for (const route of routes) {
    const player = spawnPlayer({ ...start, layer: "ground" });
    for (const [x, z] of route) {
      const goal = springPoint(x, z);
      walk(player, goal.x, goal.z, (pose) => {
        assert.equal(pose.grounded, true);
        assert.equal(springWaterDepth(pose.x, pose.y, pose.z), 0);
      });
      assert.ok(Math.hypot(player.x - goal.x, player.z - goal.z) < .05);
    }
  }
});

test("the shallow pool supports walking in and out of three banks and jumping from its bed", () => {
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 36) {
    const x = SPRING_POOL.x + Math.sin(angle) * SPRING_POOL.radiusX;
    const z = SPRING_POOL.z + Math.cos(angle) * SPRING_POOL.radiusZ;
    assert.ok(terrainHeight(x, z) >= SPRING_POOL.y - .04);
  }
  const { x, z, y } = SPRING_POOL;
  for (const start of [springPoint(60.5, 14), springPoint(51.5, 1.55), springPoint(69.5, 1.55)]) {
    const player = spawnPlayer({ ...start, layer: "ground" });
    walk(player, x, z, (pose) => assert.equal(pose.grounded, true));
    assert.ok(Math.hypot(player.x - x, player.z - z) < .05);
    const depth = springWaterDepth(player.x, player.y, player.z);
    assert.ok(depth >= BODY_RADIUS * 2 * .10 && depth <= BODY_RADIUS * 2 * .20);
    assert.equal(jump(player), true);
    let highest = player.y;
    for (let frame = 0; frame < 80; frame++) {
      movePlayer(player, .025, 0, 1 / 60);
      highest = Math.max(highest, player.y);
    }
    assert.ok(highest > y + 1);
    assert.equal(player.grounded, true);
    assert.equal(player.y, terrainHeight(player.x, player.z));
    walk(player, start.x, start.z);
    assert.ok(Math.hypot(player.x - start.x, player.z - start.z) < .05);
    assert.equal(springWaterDepth(player.x, player.y, player.z), 0);
  }
});

test("walking in the pool creates ripples that expire while standing still", () => {
  const scene = new Scene(), camera = new PerspectiveCamera();
  const { x, z, y } = SPRING_POOL;
  const player = spawnPlayer({ layer: "ground", x, z });
  camera.position.set(x, y + 4, z + 6);
  const grove = createSpringGrove(scene, true);
  const ripples = scene.getObjectByName("Spring pool").material.uniforms.walkRipples.value;
  grove.update(player, camera, 0, 0, 0);
  grove.update(player, camera, .1, 0, .1);
  assert.ok(ripples.every(({ z }) => z === 1));
  player.x += .12;
  grove.update(player, camera, .02, 0, .12);
  assert.equal(ripples.filter(({ z }) => z === 0).length, 1);
  grove.update(player, camera, .1, 0, .22);
  assert.ok(ripples.some(({ z }) => z > 0 && z < 1));
  grove.update(player, camera, 1, 0, 1.22);
  assert.ok(ripples.every(({ z }) => z === 1));
});

test("a random breeze eases the bounded petal pool in and out", () => {
  for (const reduced of [true, false]) {
    const scene = new Scene(), camera = new PerspectiveCamera();
    const { x, z, y } = SPRING_POOL;
    const player = spawnPlayer({ layer: "ground", x, z });
    camera.position.set(x, y + 4, z + 6);
    const grove = createSpringGrove(scene, reduced, () => .5);
    const petals = scene.getObjectByName("Drifting cherry petals");
    const calm = reduced ? 51 : 84;
    const cap = calm * 8;
    let time = 0;
    function countAt(end) {
      while (time + .001 < end) {
        const dt = Math.min(.1, end - time);
        time += dt;
        grove.update(player, camera, dt, 0, time);
      }
      return petals.count;
    }
    assert.equal(countAt(44), calm);
    const rising = countAt(46);
    assert.ok(rising > calm && rising < cap);
    assert.equal(countAt(49), cap);
    assert.ok(countAt(61) > calm, "the wind stops while existing petals are still falling");
    assert.equal(countAt(85), calm);
    assert.equal(petals.instanceMatrix.count, cap);
  }
});

test("the cliff and both bends conceal the waterfall across ordinary approaches and camera angles", () => {
  for (const reduced of [false, true]) {
    const root = new Scene();
    createSpringGrove(root, reduced);
    root.updateMatrixWorld(true);
    const falls = root.getObjectByName("Spring waterfall");
    const vertices = falls.geometry.attributes.position;
    const { widthSegments, heightSegments } = falls.geometry.parameters;
    const samples = [];
    for (let row = 1; row < heightSegments; row += 2) {
      for (const col of [3, 5, 7]) {
        samples.push(falls.localToWorld(new Vector3().fromBufferAttribute(vertices, row * (widthSegments + 1) + col)));
      }
    }

    function visibleFalls(x, z, yaw, pitchDrag = -46, inFrame = false, distance = 8) {
      const camera = new PerspectiveCamera(51, 1.6, .1, 180);
      const rig = createCameraRig(camera, yaw, distance);
      rig.look(0, pitchDrag);
      rig.update(spawnPlayer({ ...springPoint(x, z), layer: "ground" }), 1 / 60, true);
      camera.updateMatrixWorld(true);
      return samples.filter((point) => {
        const projected = point.clone().project(camera);
        if (inFrame && Math.max(Math.abs(projected.x), Math.abs(projected.y), Math.abs(projected.z)) > 1) return false;
        const direction = point.clone().sub(camera.position);
        const ray = new Raycaster(camera.position, direction.clone().normalize(), 0, direction.length() - .1);
        return !ray.intersectObjects(root.children, true).some(({ object }) => !object.material.transparent);
      }).length;
    }

    for (const [x, z, yaw] of [
      [39, 14.25, -1.6], [48, 14, -1.4], [53.75, 11.95, -.35], [53.75, 11.95, -.78],
      [54.6, 9.5, -.43], [54.6, 9.5, -.9], [55.85, 7.95, -.6],
      [64, 24, .15], [73, 25, .49], [80, 13, 1.04], [81, 4, 1.45], [81, -3, 1.79],
      [47, -6, -1.2], [61, -13, 0],
    ]) {
      assert.equal(visibleFalls(x, z, yaw), 0, `waterfall exposed at ${x},${z} (yaw ${yaw})`);
    }
    for (const [x, z, yaw, distance] of [
      [48, 23, -.03, 12], [50, 23, .035, 5], [52, 23, -.30, 5],
      [54, 23, -.24, 8], [50, 15.7, -.48, 5], [53, 12.5, -.42, 5],
    ]) {
      assert.equal(visibleFalls(x, z, yaw, -50, true, distance), 0, `waterfall visible through a ridge at ${x},${z}`);
    }
    assert.ok(visibleFalls(59.4, 10, .10, -55, true) >= samples.length * .8);
    assert.ok(visibleFalls(62.4, 10.8, 0, -24, true, 10) >= samples.length * .9);
  }
});
