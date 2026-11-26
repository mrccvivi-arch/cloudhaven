import assert from "node:assert/strict";
import test from "node:test";
import { Group, PerspectiveCamera, Vector3 } from "three";
import { BODY_RADIUS } from "../src/cotton-candy.js";
import { createLivingDialogue } from "../src/living-dialogue.js";
import { MOVE_SPEED, jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { createSummerBubbles } from "../src/summer-bubbles.js";
import { createSummerButterflies } from "../src/summer-butterflies.js";
import { addMeadowFlowers } from "../src/summer-flowers.js";
import {
  ISLAND_BRIDGE, SUMMER, TOWER, islandHeight, onRainbow, pierLocal, pierWidth, summerWalkable,
} from "../src/summer-layout.js";

test("summer bubbles stay reachable and can pop during normal running and jumping", () => {
  const root = new Group(), camera = new PerspectiveCamera(55, 4 / 3);
  const bubbles = createSummerBubbles(root, () => .38);
  const sprites = root.children.filter((object) => object.isSprite);
  const particles = root.children.find((object) => object.isInstancedMesh);
  const player = spawnPlayer({ layer: SUMMER, x: -8, z: 33 });
  const events = [];
  camera.position.set(player.x, player.y + 5, player.z + 9);
  camera.lookAt(-3, 2, 25);
  camera.updateMatrixWorld();
  const update = (dt, interactive = false, night = 0) => bubbles.update(dt, night, player, camera, interactive,
    (event) => events.push(event));
  update(3);
  assert.equal(sprites.filter((sprite) => sprite.visible).length, 0);
  update(2);
  update(.65);
  const active = sprites.filter((sprite) => sprite.visible);
  assert.ok(active.length >= 6 && active.length <= 12);
  for (const { position: { x, z } } of active) {
    assert.ok(summerWalkable({ x, z, y: 0 }, x, z, BODY_RADIUS + 1));
    assert.ok(!onRainbow(ISLAND_BRIDGE, x, z, 8));
    assert.ok(Math.hypot(x - TOWER.x, z - TOWER.z) > TOWER.gallery);
    const { along, across } = pierLocal(x, z);
    assert.ok(along < 0 || Math.abs(across) > pierWidth(along) / 2);
  }

  function approach(sprite, airborne) {
    Object.assign(player, spawnPlayer({ layer: SUMMER, x: sprite.position.x - 1.6, z: sprite.position.z }));
    if (airborne) assert.ok(jump(player));
    for (let i = 0; i < 34 && sprite.visible; i++) {
      const before = player.x;
      assert.equal(movePlayer(player, MOVE_SPEED * .008, 0, .008).fell, false);
      update(.008, true);
      assert.ok(player.x > before);
    }
    assert.equal(sprite.visible, false);
    assert.equal(player.grounded, !airborne);
    assert.ok(particles.count >= 5);
  }
  approach(active[0], false);
  // Identically seeded bubbles drift together, so regular-height neighbors pop in the first pass.
  approach(active.at(-1), true);
  assert.ok(events.filter((event) => event === "summer-bubble-pop").length >= 2);
  update(.85);
  assert.equal(particles.count, 0);

  update(45, false, 1);
  assert.ok(sprites.every((sprite) => !sprite.visible));

  const pooledChildren = [...root.children];
  for (let visit = 0; visit < 3; visit++) {
    bubbles.reset();
    assert.ok(sprites.every((sprite) => !sprite.visible));
    assert.deepEqual(root.children, pooledChildren);
    update(15, false, 1);
    assert.ok(sprites.every((sprite) => !sprite.visible));
  }
});

test("distant bubbles fade offscreen and release their pool slots while visible bubbles keep drifting", () => {
  const root = new Group(), camera = new PerspectiveCamera(55, 4 / 3, .1, 300);
  const bubbles = createSummerBubbles(root, () => .88);
  const player = spawnPlayer({ layer: SUMMER, x: 2, z: 1 });
  camera.position.set(player.x, player.y + 4, player.z + 8);
  camera.lookAt(player.x, player.y + 1, player.z - 4);
  const sprites = root.children.filter((object) => object.isSprite);
  const update = (dt, night = 0, moving = false) =>
    bubbles.update(dt, night, player, camera, true, () => {}, { dx: moving ? dt * 10 : 0, dz: 0, running: moving });
  assert.equal(sprites.length, 36);
  update(4.8);
  update(1.4);
  const group = sprites.filter((sprite) => sprite.visible);
  assert.equal(group.length, 12);
  const projected = new Vector3();
  assert.ok(group.some(({ position }) => {
    projected.copy(position).project(camera);
    return Math.abs(projected.x) < .95 && Math.abs(projected.y) < .95 && Math.abs(projected.z) < 1;
  }));
  const original = group[0].position.clone();
  Object.assign(player, spawnPlayer({ layer: SUMMER, x: -23, z: 25 }));
  camera.position.set(player.x, player.y + 5, player.z + 8);
  camera.lookAt(original);
  for (let i = 0; i < 25; i++) update(.08, 1, true);
  assert.ok(group.every((sprite) => sprite.visible && sprite.material.opacity === 1));
  assert.ok(group[0].position.distanceTo(original) < 1, "bubbles keep their own drift");

  camera.lookAt(-43, player.y + 1, 38);
  for (let i = 0; i < 8; i++) update(.08, 1, true);
  assert.ok(group.every((sprite) => sprite.visible && sprite.material.opacity < 1));
  for (let i = 0; i < 20; i++) update(.08, 1, true);
  assert.ok(group.every((sprite) => !sprite.visible));
  Object.assign(player, spawnPlayer({ layer: SUMMER, x: 2, z: 1 }));
  camera.position.set(player.x, player.y + 4, player.z + 8);
  camera.lookAt(player.x, player.y + 1, player.z - 4);
  update(20);
  update(1.4);
  assert.ok(group.every((sprite) => sprite.visible), "the next group reuses the retired sprites");
  assert.equal(root.children.filter((object) => object.isSprite).length, 36);
});

test("flower-bed butterflies startle, accompany and depart once per encounter, then pause at night", () => {
  const flowers = new Group(), root = new Group();
  const habitats = addMeadowFlowers(flowers, []);
  const butterflies = createSummerButterflies(root, habitats.slice(0, 1), () => .38);
  const bed = habitats[0], events = [];
  const player = spawnPlayer({ layer: SUMMER, x: bed.x, z: bed.z + .5 });
  const update = (dt, night = 0, interactive = true) => butterflies.update(dt, night, player, 0, interactive,
    (event) => events.push(event));
  update(.02, 0, false);
  assert.ok(root.children.every((batch) => batch.count > 0));
  for (let i = 0; i < 320; i++) {
    if (i > 30 && i < 210) {
      player.z -= .075;
      player.y = islandHeight(player.x, player.z);
    }
    update(.02);
    assert.ok(root.children.every((batch) => batch.count <= 16));
  }
  assert.deepEqual(events, ["summer-butterfly-startle", "summer-butterfly-follow", "summer-butterfly-leave"]);
  Object.assign(player, spawnPlayer({ layer: SUMMER, x: bed.x, z: bed.z + .5 }));
  update(.02);
  assert.equal(events.length, 3);
  update(.02, 1);
  assert.ok(root.children.every((batch) => batch.count === 0));
  butterflies.reset();
  assert.equal(root.children.length, 3);
});

test("summer dialogue shares the automatic cooldown and respects recent touch dialogue", () => {
  let now = 1_800_000_000_000;
  const shown = [];
  const dialogue = createLivingDialogue({ storage: () => undefined, wallTime: () => now,
    random: () => 0, show: (text) => shown.push(text), canSee: () => true });
  dialogue.summerSituation("summer-butterfly-startle", 100);
  dialogue.summerSituation("summer-butterfly-follow", 2100);
  dialogue.summerSituation("summer-butterfly-leave", 5100);
  assert.deepEqual(shown, ["原来花朵也会飞。"]);
  now += 60_000;
  dialogue.summerSituation("summer-butterfly-startle", 60_000);
  assert.equal(shown.length, 1);
  now += 60_000;
  dialogue.rememberTouch("摸摸我的耳朵。");
  dialogue.summerSituation("summer-butterfly-startle", 120_000);
  assert.equal(shown.length, 1);
  now += 10_000;
  dialogue.summerSituation("summer-butterfly-startle", 130_000);
  assert.deepEqual(shown, ["原来花朵也会飞。", "嘘……别吓到它们。"]);
});
