import assert from "node:assert/strict";
import test from "node:test";
import { Group, Matrix4, Object3D, Vector3 } from "three";
import { createWhale } from "../previews/snow-whale/whale.js";
import { seeded } from "../src/map.js";
import { createWinterFlight, WINTER_CROWN, WINTER_WHALE_HULL } from "../src/winter-flight.js";
import { movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave } from "../src/save.js";
import { SNOW_GATE, WINTER, WINTER_ENTRY, WINTER_LAKE, WINTER_LIMIT, WINTER_LOOP, WINTER_TREE, winterHeight, winterLakeExtent,
  winterWalkable } from "../src/winter-layout.js";
import { createWinterTree } from "../src/winter-tree.js";

test("the expanded loop and reserved shore are walkable, with room around the whole lake", () => {
  assert.equal(WINTER_LIMIT, 138);
  let field = 0;
  let lake = 0;
  let shoreRadius = 0;
  for (let x = -WINTER_LIMIT; x <= WINTER_LIMIT; x += 2) {
    for (let z = -WINTER_LIMIT; z <= WINTER_LIMIT; z += 2) {
      const r = Math.hypot(x, z);
      if (r > WINTER_LIMIT) continue;
      field++;
      const extent = winterLakeExtent(x, z);
      if (extent <= 1) {
        lake++;
        shoreRadius = Math.max(shoreRadius, r);
      }
      if (r < WINTER_LIMIT - 1) {
        const angle = x * .27 + z * .43;
        const nx = x + Math.sin(angle) * .55;
        const nz = z + Math.cos(angle) * .55;
        if (Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z) > 3) {
          assert(winterWalkable(x, z, nx, nz));
        }
      }
    }
  }
  assert(lake / field >= .30 && lake / field <= .35);
  assert(shoreRadius < WINTER_LIMIT - 9);
  for (const { x, z } of [WINTER_ENTRY, SNOW_GATE]) {
    assert(winterLakeExtent(x - 3, z) > 1.02);
  }
  for (const [index, [x, z]] of WINTER_LOOP.entries()) {
    assert(winterLakeExtent(x, z) > 1.02);
    if (index > 0) {
      assert(winterWalkable(...WINTER_LOOP[index - 1], x, z));
      assert(winterWalkable(x, z, ...WINTER_LOOP[index - 1]));
    }
  }
  assert(winterWalkable(130, 0, 136, 0));
  assert(!winterWalkable(137, 0, 139, 0));

  const pose = readSave({ pose: { layer: WINTER, x: 97, z: 0 } }).pose;
  assert.equal(pose.x, 97);
  const player = spawnPlayer(pose);
  for (let i = 0; i < 350; i++) movePlayer(player, .135, 0, 1 / 60);
  assert(player.x > 137.8 && player.x <= WINTER_LIMIT && player.grounded);
  for (let i = 0; i < 70; i++) movePlayer(player, -.135, 0, 1 / 60);
  assert(player.x < 129 && player.grounded);
  assert(spawnPlayer({ layer: WINTER, x: WINTER_LIMIT + .4, z: 0 }).x > 137);

});

test("the three courses cross their landmarks and clear the terrain and animated model", () => {
  const tree = new Group();
  createWinterTree(tree);
  tree.updateMatrixWorld(true);
  const vertex = new Vector3();
  const matrix = new Matrix4();
  tree.traverse(part => {
    if (!part.isMesh) return;
    const positions = part.geometry.attributes.position;
    for (let instance = 0; instance < (part.isInstancedMesh ? part.count : 1); instance++) {
      if (part.isInstancedMesh) part.getMatrixAt(instance, matrix);
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        if (part.isInstancedMesh) vertex.applyMatrix4(matrix);
        vertex.applyMatrix4(part.matrixWorld);
        assert(vertex.y <= WINTER_CROWN.top);
        assert(Math.hypot(vertex.x - WINTER_TREE.x, vertex.z - WINTER_TREE.z) <= WINTER_CROWN.radius);
      }
    }
  });

  const whale = createWhale(seeded(19));
  whale.group.scale.multiplyScalar(1.88);
  const pose = new Object3D();
  const axis = new Vector3();
  const { length, width, below } = WINTER_WHALE_HULL;
  for (const [kind, variations, landmark] of [["pass", 16, { x: 0, z: 0 }],
    ["cruise", 2, WINTER_TREE], ["climb", 2, WINTER_LAKE]]) {
    for (let variant = 0; variant < variations; variant++) {
      const flight = createWinterFlight(kind, kind === "pass" ? { angle: variant * Math.PI / 8 } : { opposite: !!variant });
      let landmarkDistance = Infinity;
      let startHeight;
      for (let i = 0; i <= 200; i++) {
        const time = .27 * i;
        flight(pose, i / 200, time);
        const { x, y, z } = pose.position;
        startHeight ??= y;
        landmarkDistance = Math.min(landmarkDistance, Math.hypot(x - landmark.x, z - landmark.z));
        axis.set(1, 0, 0).applyQuaternion(pose.quaternion).setY(0).normalize();
        for (let u = -length; u <= length; u += length / 5) {
          for (let v = -width; v <= width; v += width / 5) {
            const px = x + u * axis.x - v * axis.z;
            const pz = z + u * axis.z + v * axis.x;
            assert(y - below > winterHeight(px, pz) + 1);
          }
        }
        const dx = WINTER_TREE.x - x, dz = WINTER_TREE.z - z;
        const edge = Math.hypot(Math.max(0, Math.abs(dx * axis.x + dz * axis.z) - length),
          Math.max(0, Math.abs(dz * axis.x - dx * axis.z) - width));
        if (edge <= WINTER_CROWN.radius) assert(y - below > WINTER_CROWN.top + 3);
        if (i % 13 !== 0) continue;
        whale.group.position.copy(pose.position);
        whale.group.quaternion.copy(pose.quaternion);
        whale.swim(time);
        whale.group.updateMatrixWorld(true);
        whale.group.traverse(part => {
          if (!part.isMesh) return;
          const positions = part.geometry.attributes.position;
          for (let j = 0; j < positions.count; j++) {
            vertex.fromBufferAttribute(positions, j).applyMatrix4(part.matrixWorld).sub(pose.position);
            assert(Math.abs(vertex.x * axis.x + vertex.z * axis.z) <= length);
            assert(Math.abs(vertex.z * axis.x - vertex.x * axis.z) <= width);
            assert(vertex.y >= -below);
          }
        });
      }
      assert(landmarkDistance < 1);
      if (kind === "climb") assert(pose.position.y - startHeight > 25);
    }
  }
});
