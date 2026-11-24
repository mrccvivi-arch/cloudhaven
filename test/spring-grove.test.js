import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Raycaster, Scene, Vector3 } from "three";
import { createCameraRig } from "../src/camera.js";
import { blockingSolid, staticColliders } from "../src/collision.js";
import { DAILY_WORLD, GOLDEN_GINKGO, GROUND_DECKS, HOME, MAP_FACILITIES, PIANO, ROUTE, SKY_GATE, WORLD_LIMIT, terrainHeight } from "../src/map.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { SEASONAL_SPACE } from "../src/seasonal-space.js";
import { HABITAT, MOON_STORAGE } from "../src/cloud-house-layout.js";
import { CONSTRUCTION_SITES } from "../src/construction-sites.js";
import { createSpringGrove } from "../src/spring-grove.js";
import { SPRING_BOULDERS, SPRING_PATH, SPRING_POOL, SPRING_REST_ROCK, SPRING_TREES, springPoint } from "../src/spring-layout.js";

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
  assert.deepEqual(pools.map(({ x, z }) => ({ x, z })), [spring.center]);

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

function walk(player, x, z) {
  for (let frame = 0; frame < 240; frame++) {
    const dx = x - player.x, dz = z - player.z;
    const distance = Math.hypot(dx, dz);
    if (distance < .04) return;
    const fraction = Math.min(1, .11 / distance);
    const { fell } = movePlayer(player, dx * fraction, dz * fraction, 1 / 60);
    assert.equal(fell, false);
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

test("the pool blocks entry at walking and jumping heights, while the banks dry out at the edge", () => {
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 36) {
    const x = SPRING_POOL.x + Math.sin(angle) * SPRING_POOL.radiusX;
    const z = SPRING_POOL.z + Math.cos(angle) * SPRING_POOL.radiusZ;
    assert.ok(terrainHeight(x, z) >= SPRING_POOL.y - .04);
  }
  const { x, z, radiusZ: radius } = SPRING_POOL;
  const start = z + radius + 1.9;
  const player = spawnPlayer({ layer: "ground", x, z: start });
  walk(player, x, z);
  assert.ok(player.z >= z + radius);
  assert.equal(jump(player), true);
  walk(player, x, z);
  assert.ok(player.z >= z + radius);
  walk(player, x, start);
  assert.ok(Math.abs(player.z - start) < .05);
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
      [64, 24, .15], [72, 13, 2.5], [74, 3, 1.75], [47, -6, -1.2], [61, -13, 0],
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
    assert.ok(visibleFalls(62.15, 10.5, .21, -55, true) >= samples.length * .9);
  }
});
