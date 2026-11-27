import assert from "node:assert/strict";
import test from "node:test";
import { Group, Matrix4, Vector3 } from "three";
import { createWinterMotion, permitsWinterMotion } from "../src/winter-motion.js";
import { createWinterDialogue } from "../src/winter-dialogue.js";
import { MOVE_SPEED } from "../src/motion.js";
import { SNOW_GATE, WINTER_TREE, winterHeight } from "../src/winter-layout.js";

function scenario(x = -46, z = 16) {
  const root = new Group();
  const clock = { value: 0 };
  const motion = createWinterMotion(root, { value: 1 }, clock, true);
  const trail = root.children.find(child => child.isInstancedMesh);
  const streams = root.children.filter(child => child.isPoints && child.renderOrder === 4);
  const player = { x, z, y: winterHeight(x, z), grounded: true };
  let time = 0;
  function frame(dx = 0, dz = 0, { grounded = true, landed = false, dt = 1 / 60 } = {}) {
    time += dt;
    clock.value = time;
    player.x += dx;
    player.z += dz;
    player.grounded = grounded;
    player.y = winterHeight(player.x, player.z) + Number(!grounded);
    return { ...motion.update(player, undefined, { dx, dz, dt, landed }, dt, time) };
  }
  return { root, trail, streams, player, motion, frame };
}

const pace = MOVE_SPEED / 60;

test("winter flowers follow running distance and skip stationary, walking, air and protected ground", () => {
  const { trail, player, motion, frame } = scenario();
  for (let i = 0; i < 80; i++) frame();
  assert.equal(trail.count, 0);
  for (let i = 0; i < 90; i++) frame(pace * .36);
  assert.equal(trail.count, 0);
  for (let i = 0; i < 80; i++) frame(pace, 0, { grounded: false });
  frame(0, 0, { landed: true });
  assert.equal(trail.count, 0);
  let first;
  for (let i = 1; i < 35; i++) {
    if (frame(0, -pace).flower) {
      first = i * pace;
      break;
    }
  }
  assert(first >= 1.28 && first <= 2.4 + pace);
  assert(trail.count >= 2 && trail.count <= 5);
  const point = new Vector3(), matrix = new Matrix4();
  for (let i = 0; i < trail.count; i++) {
    trail.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix);
    assert(permitsWinterMotion(point.x, point.z));
    assert(point.z > player.z);
  }
  motion.clear();
  for (const protectedPoint of [WINTER_TREE, SNOW_GATE]) {
    player.x = protectedPoint.x - 1;
    player.z = protectedPoint.z;
    for (let i = 0; i < 52; i++) frame(i < 25 ? pace : -pace);
    assert.equal(trail.count, 0);
  }
});

test("snow dance stays with a long turning run, fades nearby and clears on leaving", () => {
  const { player, trail, streams, root, motion, frame } = scenario();
  let firstDance;
  for (let i = 1; i <= 60 * 42; i++) {
    const turn = Math.PI * 2 * i / (60 * 15);
    const event = frame(Math.sin(turn) * pace, -Math.cos(turn) * pace);
    if (event.dance) firstDance ??= i / 60;
    if (i % 180 !== 0 || !firstDance) continue;
    let nearby = 0;
    for (const { geometry, material } of streams) {
      if (!material.visible) continue;
      const { color, position } = geometry.attributes;
      for (let j = 0; j < position.count; j++) {
        if (color.getW(j) < .1) continue;
        nearby++;
        assert(Math.hypot(position.getX(j) - player.x, position.getZ(j) - player.z) < 3.2);
      }
    }
    assert(nearby >= 20);
    assert(trail.count <= trail.instanceMatrix.count);
  }
  assert(firstDance >= 1 && firstDance <= 2);
  frame();
  assert(streams.every(batch => batch.material.visible));
  for (let i = 0; i < 200; i++) frame();
  assert(streams.every(batch => !batch.material.visible));
  for (let i = 0; i < 60 * 31; i++) frame();
  assert.equal(trail.count, 0);
  motion.clear();
  assert(root.children.every(child => child.isInstancedMesh ? child.count === 0 : !child.material.visible));
});

test("winter first lines queue once per visit and yield to whale dialogue", () => {
  const discovery = { whale: false, tree: false, flower: false };
  const dialogue = createWinterDialogue(discovery, () => 0);
  const player = { x: -46, z: 10 };
  dialogue.enter();
  assert.equal(dialogue.line(player, 0, true), "你看，整个世界都变白了。");
  dialogue.motion({ flower: true, dance: true, running: 3 }, 2400);
  dialogue.whaleCue({ type: "look" }, 4700);
  assert.equal(dialogue.line(player, 4900, false), undefined);
  assert.equal(dialogue.look(4900, false), undefined);
  assert.equal(dialogue.look(5000, true), "快抬头看！");
  assert.equal(dialogue.look(9200, true), undefined);
  assert.equal(dialogue.line(player, 9900, true), "你看，雪地开花了。");
  assert.equal(dialogue.line(player, 14800, true), "好像连雪花都在陪我们跑。");
  dialogue.motion({ flower: true, dance: true, running: 3 }, 17000);
  assert.equal(dialogue.line(player, 20000, true), undefined);
  assert.equal(discovery.flower, true);
});
