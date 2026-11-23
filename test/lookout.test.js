import assert from "node:assert/strict";
import test from "node:test";
import { Scene } from "three";
import { activeRunes, lookoutProgress } from "../src/lookout.js";
import { readSave } from "../src/save.js";
import { createWorld } from "../src/world.js";

test("lookout activation sequences runes over three seconds and cannot replay", () => {
  const world = createWorld(new Scene());
  const fired = [];
  assert.equal(world.lookout.lighting, false);
  assert.equal(activeRunes(-1), 0);
  assert.equal(activeRunes(0), 1);
  world.lookout.start();
  assert.equal(world.lookout.lighting, true);
  world.lookout.update(.2, 0, (index) => fired.push(index));
  assert.deepEqual(fired, []);
  world.lookout.update(.2, 0, (index) => fired.push(index));
  assert.deepEqual(fired, [1]);
  world.lookout.update(2.6, 1, (index) => fired.push(index));
  assert.deepEqual(fired, [1, 2, 3, 4, 5]);
  assert.equal(world.lookout.lighting, false);
  world.lookout.start();
  assert.equal(world.lookout.lighting, false);
  assert.equal(lookoutProgress(3), 1);
});

test("an old lit save restores the finished effect and sound options are normalized", () => {
  const scene = new Scene();
  const world = createWorld(scene);
  const state = readSave({ reachedLookout: true, audio: { enabled: false, volume: 1.8 } });
  assert.deepEqual(state.audio, { enabled: false, volume: 1 });
  assert.deepEqual(readSave(null).audio, { enabled: true, volume: .65 });
  world.sync(state);
  world.lookout.update(0, 1, () => assert.fail("A restored lookout must stay silent"));
  assert.equal(world.lookout.lighting, false);
  assert.ok(scene.children[1].children.some((node) => node.isPoints && node.visible));
});

test("the same cloud banks drift before activation and brighten in the finished day and night views", () => {
  const scene = new Scene();
  const world = createWorld(scene);
  const families = scene.children[1].children.filter((node) =>
    node.isGroup && node.children.some((cloud) => cloud.isInstancedMesh && cloud.material.transparent));
  assert.equal(families.length, 3);
  const cloud = families[0].children[0];
  world.lookout.update(0, 0);
  const before = cloud.material.color.clone();
  const position = families[0].position.clone();
  world.lookout.update(1, 0);
  assert.notDeepEqual(families[0].position, position);
  assert.equal(cloud.material.color.equals(before), true);

  world.lookout.start();
  world.lookout.update(3, 0);
  assert.equal(cloud.material.color.equals(before), false);
  assert.equal(cloud.material.opacity, 1);
  const day = cloud.material.emissiveIntensity;
  world.lookout.update(0, 1);
  assert.ok(cloud.material.emissiveIntensity > day);
});
