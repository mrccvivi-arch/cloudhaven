import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4, PerspectiveCamera, Scene } from "three";
import { createAffection, readAffection } from "../src/affection.js";
import { GINKGO_DIALOGUE, DIALOGUE } from "../src/dialogue.js";
import { createGinkgoInteraction } from "../src/ginkgo-interaction.js";
import { createGinkgo } from "../src/ginkgo.js";
import { GOLDEN_GINKGO, SKY_GATE, terrainHeight } from "../src/map.js";

const { x, z } = GOLDEN_GINKGO;
const near = { x, z: z + 4, y: terrainHeight(x, z + 4), layer: "ground" };

test("ginkgo welcomes once per visit, tolerates boundary movement, and rearms after teleport", () => {
  const interaction = createGinkgoInteraction(() => 0);
  const atDistance = (distance) => ({ ...near, z: z + distance });
  interaction.update(atDistance(6.5));
  assert.equal(interaction.welcome(), undefined);
  interaction.update(atDistance(6.3));
  interaction.update(atDistance(6.6));
  assert.equal(interaction.welcome(), "你来啦。");
  assert.equal(interaction.welcome(), undefined);
  assert.equal(interaction.touch(), GINKGO_DIALOGUE[0]);
  assert.equal(interaction.touch(), GINKGO_DIALOGUE[1]);
  interaction.update(atDistance(7.3));
  assert.equal(interaction.touch(), undefined);
  interaction.update(atDistance(6.3));
  assert.equal(interaction.touch(), GINKGO_DIALOGUE[0]);
  assert.equal(interaction.welcome(), "你来啦。");
  interaction.reset();
  interaction.update({ ...near, layer: "sky" });
  assert.equal(interaction.touch(), undefined);
  interaction.update(near);
  assert.equal(interaction.welcome(), "你来啦。");
});

test("legacy ginkgo metadata does not reset affection or replace ordinary dialogue elsewhere", () => {
  const state = readAffection({
    affectionPoints: 7, dailyTouchCount: 2, dailyTouchDate: "2026-08-01",
    lastDialogueId: "ginkgo-1", lastGinkgoDialogueId: "ginkgo-1",
  });
  const affection = createAffection(state, () => 0);
  const result = affection.touch({ now: new Date(2026, 7, 1, 12), night: false, energy: 100 });
  assert.ok(DIALOGUE[0].includes(result.text));
  assert.equal(state.affectionPoints, 10);
  assert.equal(state.dailyTouchCount, 3);
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
