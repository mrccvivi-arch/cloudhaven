import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4, Scene, Vector3 } from "three";
import { createForestEcology } from "../src/forest-ecology.js";
import { canDecorateForest, forestLayout } from "../src/forest-layout.js";
import { terrainHeight } from "../src/map.js";

const date = "2026-11-25";
const previousDate = "2026-11-24";
const seed = 42;

test("forest layout is stable per save and Beijing day, and avoids existing routes and facilities", () => {
  const { plants } = forestLayout(date, seed);
  assert.deepEqual(forestLayout(date, seed), forestLayout(date, seed));
  assert.notDeepEqual(plants, forestLayout(previousDate, seed).plants);
  assert.notDeepEqual(plants, forestLayout(date, seed + 1).plants);
  assert.deepEqual([...new Set(plants.map(({ kind }) => kind))].sort(), ["clover", "dandelion", "flower", "mushroom"]);
  assert.ok(plants.every(({ x, y, z }) => canDecorateForest(x, z) && y === terrainHeight(x, z)));
  assert.ok(plants.filter(({ kind }) => kind === "clover").length < plants.filter(({ kind }) => kind === "flower").length / 4);
});

test("forest ecology uses capped instancing, real nearby insects and recorded flower history", () => {
  const scene = new Scene();
  const ecology = createForestEcology(scene, seed, true);
  const { plants } = forestLayout(date, seed);
  const yesterday = new Set(forestLayout(previousDate, seed).plants.filter(({ kind }) => kind === "flower").map(({ id }) => id));
  const flower = plants.find(({ kind, id }) => kind === "flower" && !yesterday.has(id));
  const player = { ...flower, layer: "ground" };
  const getDay = () => ({ date, previousDate });
  ecology.update(player, .016, false, getDay);
  const wings = scene.getObjectByName("Butterfly wings");
  const fireflies = scene.getObjectByName("Fireflies");
  assert.ok(wings.isInstancedMesh && wings.count > 0 && wings.count <= 8);
  assert.equal(fireflies.count, 0);
  assert.equal(ecology.features(player).butterfly, true);
  assert.equal(ecology.features(player).newFlower, true);
  const firstVisit = createForestEcology(new Scene(), seed, true);
  firstVisit.update(player, .016, false, () => ({ date }));
  assert.equal(firstVisit.features(player).newFlower, false);
  const initial = new Matrix4();
  wings.getMatrixAt(0, initial);
  ecology.update(player, .016, false, getDay);
  const animated = new Matrix4();
  wings.getMatrixAt(0, animated);
  assert.notDeepEqual(animated.elements, initial.elements);
  ecology.update(player, .016, true, getDay);
  assert.equal(wings.count, 0);
  assert.ok(fireflies.count > 0 && fireflies.count <= 8);
  fireflies.getMatrixAt(0, animated);
  const { x, y, z } = new Vector3().setFromMatrixPosition(animated);
  assert.equal(ecology.features({ x, y, z }).firefly, true);
  assert.equal(ecology.features({ x: 73, y: 0, z: 73 }).firefly, false);
  ecology.update({ ...player, layer: "sky" }, .016, true, getDay);
  assert.equal(scene.getObjectByName("Forest ecology").visible, false);
  assert.equal(ecology.features(player).firefly, false);
});
