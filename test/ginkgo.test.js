import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4, PerspectiveCamera, Scene } from "three";
import { createAffection, readAffection } from "../src/affection.js";
import { GINKGO_DIALOGUE, DIALOGUE, SPECIAL_DIALOGUE } from "../src/dialogue.js";
import { createGinkgo } from "../src/ginkgo.js";
import { GOLDEN_GINKGO, SKY_GATE, terrainHeight, underGoldenGinkgo } from "../src/map.js";

const { x, z } = GOLDEN_GINKGO;
const near = { x, z: z + 4, y: terrainHeight(x, z + 4), layer: "ground" };

test("ginkgo lines preserve first touch, priority, cooldown, and affection points", () => {
  const state = readAffection(null);
  const affection = createAffection(state, () => 0);
  function touch(seconds, { player = near, night = false, energy = 100 } = {}) {
    return affection.touch({ now: new Date(2026, 7, 1, 12, 0, seconds), night, energy,
      underGinkgo: underGoldenGinkgo(player) });
  }
  assert.ok(DIALOGUE[0].includes(touch(0).text));
  const first = touch(3);
  assert.equal(first.text, GINKGO_DIALOGUE[0]);
  assert.equal(first.points, 3);
  assert.ok(DIALOGUE[0].includes(touch(7).text));
  assert.equal(touch(22, { night: true, energy: 1 }).text, SPECIAL_DIALOGUE.lowEnergy);
  assert.equal(touch(25).text, GINKGO_DIALOGUE[1]);
  assert.ok(DIALOGUE[0].includes(touch(45, { player: { ...near, ...SKY_GATE } }).text));
  assert.equal(underGoldenGinkgo({ ...near, layer: "sky" }), false);
  assert.equal(readAffection(state).lastGinkgoDialogueId, "ginkgo-1");
});

test("one pool keeps recycling leaves for five minutes and resumes after leaving", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.set(x, 5, z + 8);
  const ginkgo = createGinkgo(scene);
  const falling = scene.getObjectByName("Falling ginkgo leaves");
  assert.ok(falling.isInstancedMesh && falling.count >= 40 && falling.count <= 60);
  const initial = new Matrix4(), updated = new Matrix4();
  ginkgo.update(near, camera, .1, 0);
  falling.getMatrixAt(0, initial);
  for (let frame = 0; frame < 3000; frame++) ginkgo.update(near, camera, .1, .8);
  falling.getMatrixAt(0, updated);
  assert.ok(falling.visible && !initial.equals(updated));
  ginkgo.update({ ...near, ...SKY_GATE }, camera, .1, .8);
  assert.equal(falling.visible, false);
  falling.getMatrixAt(0, initial);
  ginkgo.update(near, camera, .1, .8);
  falling.getMatrixAt(0, updated);
  assert.ok(falling.visible && !initial.equals(updated));
});
