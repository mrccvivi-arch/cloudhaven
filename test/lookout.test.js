import assert from "node:assert/strict";
import test from "node:test";
import { Scene } from "three";
import { LOOKOUT_ON_SECONDS, LOOKOUT_OFF_SECONDS, activeRunes } from "../src/lookout.js";
import { loadGame, readSave, saveGame } from "../src/save.js";
import { createWorld } from "../src/world.js";

test("the lookout toggles repeatedly and locks input during both transitions", () => {
  const scene = new Scene();
  const { lookout } = createWorld(scene);
  const sky = scene.children[1];
  const originalObjects = sky.children.length;
  const light = sky.children.find((object) => object.isPointLight);
  const particles = sky.children.filter((object) => object.isPoints);
  assert.equal(lookout.transitioning, false);
  assert.equal(activeRunes(-1), 0);
  assert.equal(activeRunes(0), 1);
  for (let cycle = 0; cycle < 5; cycle++) {
    const fired = [];
    assert.equal(lookout.toggle(), true);
    assert.equal(lookout.toggle(), null);
    lookout.update(0, 0);
    assert.ok(light.intensity > 0);
    assert.ok(particles.some((object) => object.visible));
    lookout.update(.25, 0, (index) => fired.push(index));
    assert.deepEqual(fired, [1]);
    lookout.update(LOOKOUT_ON_SECONDS - .251, 0, (index) => fired.push(index));
    assert.equal(lookout.transitioning, true);
    lookout.update(.002, 0);
    assert.equal(lookout.transitioning, false);
    assert.deepEqual(fired, [1, 2, 3, 4, 5]);
    assert.ok(particles.every((object) => object.visible));

    assert.equal(lookout.toggle(), false);
    assert.equal(lookout.toggle(), null);
    lookout.update(LOOKOUT_OFF_SECONDS - .001, 1);
    assert.equal(lookout.transitioning, true);
    lookout.update(.002, 1);
    assert.equal(lookout.transitioning, false);
    assert.equal(light.intensity, 0);
    assert.ok(particles.every((object) => !object.visible));
    assert.equal(sky.children.length, originalObjects);
  }
});

test("the existing save restores either stable state without replaying sounds", () => {
  assert.equal(readSave(null).reachedLookout, false);
  const scene = new Scene();
  const { lookout } = createWorld(scene);
  const state = readSave({ reachedLookout: true, audio: { enabled: false, volume: 1.8 } });
  assert.deepEqual(state.audio, { enabled: false, volume: 1 });
  assert.deepEqual(readSave(null).audio, { enabled: true, volume: .65 });
  let stored;
  const storage = { getItem: () => stored, setItem: (_, value) => { stored = value; } };
  const particles = scene.children[1].children.filter((node) => node.isPoints);
  for (const lit of [true, false]) {
    state.reachedLookout = lit;
    saveGame(storage, state);
    lookout.restore(loadGame(storage).reachedLookout);
    lookout.update(0, 1, () => assert.fail("A restored lookout must stay silent"));
    assert.equal(lookout.transitioning, false);
    assert.ok(particles.every((node) => node.visible === lit));
  }
});

test("cloud banks drift and return to their original colors after fading out", () => {
  const scene = new Scene();
  const { lookout } = createWorld(scene);
  const families = scene.children[1].children.filter((node) =>
    node.isGroup && node.children.some((cloud) => cloud.isInstancedMesh && cloud.material.transparent));
  assert.equal(families.length, 3);
  const { material } = families[0].children[0];
  lookout.update(0, 0);
  const before = material.color.clone();
  const position = families[0].position.clone();
  lookout.update(1, 0);
  assert.notDeepEqual(families[0].position, position);
  assert.ok(material.color.equals(before));

  lookout.toggle();
  lookout.update(LOOKOUT_ON_SECONDS, 0);
  assert.ok(!material.color.equals(before));
  assert.equal(material.opacity, 1);
  const day = material.emissiveIntensity;
  lookout.update(0, 1);
  assert.ok(material.emissiveIntensity > day);

  lookout.toggle();
  lookout.update(.75, 0);
  assert.ok(!material.color.equals(before));
  assert.ok(material.opacity < 1 && material.opacity > .94);
  lookout.update(.75, 0);
  assert.ok(material.color.equals(before));
  assert.equal(material.opacity, .94);
});
