import assert from "node:assert/strict";
import test from "node:test";
import { Color, Matrix4, PerspectiveCamera, Scene } from "three";
import { createAffection, readAffection } from "../src/affection.js";
import { GINKGO_DIALOGUE, DIALOGUE } from "../src/dialogue.js";
import { createGinkgoInteraction } from "../src/ginkgo-interaction.js";
import { createGinkgo } from "../src/ginkgo.js";
import { GOLDEN_GINKGO, SKY_GATE, terrainHeight } from "../src/map.js";
import { MOON_LINES } from "../src/moon-lines.js";

const { x, z } = GOLDEN_GINKGO;
const near = { x, z: z + 4, y: terrainHeight(x, z + 4), layer: "ground" };

test("ginkgo welcomes once per actual entry and waits behind active dialogue", () => {
  const interaction = createGinkgoInteraction(() => 0);
  const atDistance = (distance) => ({ ...near, z: z + distance });
  interaction.update(atDistance(6.5));
  assert.equal(interaction.welcome(true), undefined);
  interaction.update(atDistance(6.3));
  assert.equal(interaction.welcome(false), undefined);
  assert.equal(interaction.awaitingWelcome, true);
  interaction.update(atDistance(6.6));
  assert.equal(interaction.welcome(true), "你来啦");
  assert.equal(interaction.welcome(true), undefined);
  assert.equal(interaction.touch(), GINKGO_DIALOGUE[0]);
  assert.equal(interaction.touch(), GINKGO_DIALOGUE[1]);
  assert.equal(interaction.welcome(true), undefined);
  interaction.update(atDistance(7.3));
  assert.equal(interaction.touch(), undefined);
  interaction.update(atDistance(6.3));
  assert.equal(interaction.touch(), GINKGO_DIALOGUE[0]);
  assert.equal(interaction.welcome(true), "你来啦");
  interaction.reset(near);
  interaction.update(near);
  assert.equal(interaction.welcome(true), undefined);
  interaction.update({ ...near, layer: "sky" });
  assert.equal(interaction.touch(), undefined);
  interaction.update(near);
  assert.equal(interaction.welcome(true), "你来啦");
});

test("ginkgo touch can still draw every special line except the welcome", () => {
  const touchLines = [...GINKGO_DIALOGUE, ...MOON_LINES.filter(({ trigger }) => trigger === "ginkgo").map(({ text }) => text)];
  assert.ok(touchLines.every((line) => !/^你来啦[。！!？?]*$/.test(line)));
  for (const [index, line] of touchLines.entries()) {
    const interaction = createGinkgoInteraction(() => (index + .5) / touchLines.length);
    interaction.reset(near);
    assert.equal(interaction.touch(), line);
    assert.equal(interaction.welcome(true), undefined);
  }
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

test("listening waits for five continuous seconds and the welcome, then resets on re-entry", () => {
  const interaction = createGinkgoInteraction(() => .65);
  const ready = () => true;
  interaction.update(near);
  assert.equal(interaction.listen(5, true, false, ready), undefined);
  assert.equal(interaction.welcome(true), "你来啦");
  assert.equal(interaction.listen(0, true, false, () => false), undefined);
  interaction.listen(.1, false);
  assert.equal(interaction.listen(4.99, true, false, ready), undefined);
  assert.equal(interaction.listen(.02, true, false, ready), "我们不赶时间吧？");
  interaction.update(near);
  interaction.listen(.1, false);
  assert.equal(interaction.listen(20, true, true, ready), undefined, "dusk does not rearm listening");

  interaction.update({ ...near, ...SKY_GATE });
  interaction.update(near);
  assert.equal(interaction.welcome(true), "你来啦");
  assert.equal(interaction.listen(5, true, true, ready), "它们好像从树上落下来的星星。");
});

test("the canopy assigns the champagne palette in the specified proportions", () => {
  const scene = new Scene();
  createGinkgo(scene);
  const canopy = scene.getObjectByName("Ginkgo canopy");
  const color = new Color();
  const counts = new Map();
  for (let i = 0; i < canopy.count; i++) {
    canopy.getColorAt(i, color);
    const tint = color.getHex();
    counts.set(tint, (counts.get(tint) ?? 0) + 1);
  }
  assert.deepEqual(counts, new Map([
    [0xfff0c4, 144], [0xffe49a, 336], [0xf8d875, 336], [0xeac46a, 96], [0xfff5dc, 48],
  ]));
});

test("ginkgo night effects dim at dawn and luminous leaves share the falling pool", () => {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.set(x, 5, z + 8);
  const ginkgo = createGinkgo(scene);
  const falling = scene.getObjectByName("Falling ginkgo leaves");
  const glow = falling.geometry.getAttribute("leafGlow");
  const fireflies = scene.getObjectByName("Ginkgo fireflies");
  const light = scene.getObjectByName("Ginkgo warm clearing light");
  const crown = scene.getObjectByName("Ginkgo canopy").material;
  const bark = scene.getObjectByName("Ginkgo trunk and branches").material;
  const roots = scene.getObjectByName("Exposed ginkgo roots").material;
  ginkgo.update(near, camera, .1, 0);
  assert.equal(light.intensity, 0);
  assert.equal(fireflies.visible, false);
  assert.equal(glow.array.filter(Boolean).length, 0);
  const dayCrown = crown.emissiveIntensity;
  assert.equal(bark.emissiveIntensity, 0);
  assert.equal(roots.emissiveIntensity, 0);

  ginkgo.update(near, camera, .1, 1);
  assert.equal(fireflies.geometry.getAttribute("position").count, 21);
  assert.equal(fireflies.visible, true);
  const luminous = glow.array.filter(Boolean).length;
  assert.ok(luminous >= 8 && luminous <= 13);
  const fullLight = light.intensity;
  assert.ok(fullLight > 0);
  const [nightCrown, nightBark, nightRoots] = [crown, bark, roots].map((material) => material.emissiveIntensity);
  assert.ok(nightCrown > dayCrown && nightBark > 0 && nightRoots > 0);
  ginkgo.update(near, camera, .1, .5);
  assert.equal(light.intensity, fullLight / 2);
  assert.equal(crown.emissiveIntensity, (dayCrown + nightCrown) / 2);
  assert.equal(bark.emissiveIntensity, nightBark / 2);
  assert.equal(roots.emissiveIntensity, nightRoots / 2);
  ginkgo.update({ ...near, ...SKY_GATE }, camera, .1, 1);
  assert.equal(fireflies.visible, false);
  ginkgo.update(near, camera, .1, 0);
  assert.equal(light.intensity, 0);
  assert.equal(glow.array.filter(Boolean).length, 0);
});
