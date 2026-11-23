import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createBaseAnimations } from "../src/interactions.js";
import { BATH, BATH_CLEARANCE, POIS } from "../src/map.js";
import { createCottonCandy } from "../src/cotton-candy.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave, transferItem } from "../src/save.js";
import { createWorld } from "../src/world.js";

const dt = 1 / 60;
const bowl = POIS.find(({ id }) => id === "bowl");

function setup() {
  const scene = new THREE.Scene();
  const world = createWorld(scene);
  const avatar = createCottonCandy();
  scene.add(avatar.root, avatar.shadow);
  return { avatar, world, animations: createBaseAnimations(avatar, world.props) };
}

test("feeding lowers the head, raises the paws, chews and resets without restarting", () => {
  const { avatar, animations } = setup();
  const player = spawnPlayer({ ...bowl, z: bowl.z + 2 });
  assert.equal(animations.start("bowl", player), true);
  assert.equal(animations.start("bath", player), false);
  const body = avatar.root.getObjectByName("Cotton Candy body");
  const paw = avatar.root.getObjectByName("Left paw");
  const neutralPaw = paw.position.clone();
  for (let i = 0; i < 56; i++) animations.update(dt, player);
  assert.ok(body.rotation.x < -.18);
  assert.ok(paw.position.z < -.73);
  for (let i = 0; i < 52; i++) animations.update(dt, player);
  assert.ok(paw.position.y > .76);
  const chewingPose = body.rotation.x;
  animations.update(dt, player);
  assert.notEqual(body.rotation.x, chewingPose);
  let done;
  while (animations.active) done = animations.update(dt, player);
  assert.equal(done, "bowl");
  assert.ok(Math.abs(body.rotation.x) < .001);
  assert.deepEqual(paw.position.toArray(), neutralPaw.toArray());
});

test("bath clears the rim and sand, rolls both ways, then returns to a grounded pose", () => {
  const { avatar, world, animations } = setup();
  const meshVertices = [];
  avatar.bathRig.traverse((mesh) => {
    if (mesh.isMesh) meshVertices.push([mesh, mesh.geometry.attributes.position]);
  });
  const tub = world.props.bath;
  const panels = tub.children.filter((mesh) => mesh.geometry?.type === "BoxGeometry");
  world.props.bath.updateWorldMatrix(true, true);
  const inversePanels = panels.map((mesh) => mesh.matrixWorld.clone().invert());
  const point = new THREE.Vector3(), localPoint = new THREE.Vector3();
  for (const heading of [0, .3, 1.1, 2.2, Math.PI, -1.4]) {
    const player = spawnPlayer({
      ...BATH, x: BATH.x + Math.sin(heading) * 2.45, z: BATH.z + Math.cos(heading) * 2.45,
    });
    assert.equal(animations.start("bath", player), true);
    let left = false, right = false, done;
    for (let time = dt; animations.active; time += dt) {
      done = animations.update(dt, player);
      left ||= avatar.bathRig.rotation.z < -1;
      right ||= avatar.bathRig.rotation.z > 1;
      avatar.root.updateMatrixWorld(true);
      for (const [mesh, vertices] of meshVertices) {
        for (let i = 0; i < vertices.count; i++) {
          point.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld);
          assert.ok(point.y >= -.025, "avatar penetrates ground");
          const radius = Math.hypot(point.x - BATH.x, point.z - BATH.z);
          if (radius < .93) assert.ok(point.y >= tub.position.y + BATH.sand - .025, "avatar penetrates sand");
          if (point.y >= tub.position.y + BATH.rim || radius < 1.04 || radius > 1.3) continue;
          for (const matrix of inversePanels) {
            localPoint.copy(point).applyMatrix4(matrix);
            assert.ok(Math.max(Math.abs(localPoint.x), Math.abs(localPoint.y), Math.abs(localPoint.z)) >= .5,
              "avatar penetrates rim, time " + time + ", heading " + heading);
          }
        }
      }
    }
    assert.equal(done, "bath");
    assert.ok(left && right);
    assert.ok(Math.abs(avatar.bathRig.rotation.z) < .001);
    assert.equal(avatar.bathRig.scale.y, 1);
    assert.equal(player.y, 0);
    assert.ok(Math.hypot(player.x - BATH.x, player.z - BATH.z) >= BATH_CLEARANCE);
  }
});

test("ordinary movement and jumping stay out of the tub", () => {
  const player = spawnPlayer({ ...BATH, z: BATH.z + 2.65 });
  jump(player);
  for (let i = 0; i < 90; i++) movePlayer(player, 0, -.1, dt);
  assert.ok(player.z - BATH.z >= BATH_CLEARANCE);
  assert.equal(player.grounded, true);
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
