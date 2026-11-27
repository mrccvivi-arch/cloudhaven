import assert from "node:assert/strict";
import test from "node:test";
import { Color, Fog, Group, PerspectiveCamera, Scene } from "three";
import { createCameraRig } from "../src/camera.js";
import { createMoonlight } from "../src/moonlight.js";
import { seeded } from "../src/map.js";
import { WINTER, WINTER_ENTRY, WINTER_TREE, winterHeight } from "../src/winter-layout.js";
import { createWinterWhale } from "../src/winter-whale.js";
import { createWinterDialogue } from "../src/winter-dialogue.js";

function entry(aspect) {
  const player = { ...WINTER_ENTRY, y: winterHeight(WINTER_ENTRY.x, WINTER_ENTRY.z) };
  const camera = new PerspectiveCamera(49, aspect, .35, 310);
  const rig = createCameraRig(camera, 0, 8);
  rig.face(0, .055);
  rig.update(player, 0, true);
  camera.updateMatrixWorld();
  return { player, camera };
}

test("winter hides sky objects while keeping stars, light, and the avatar charge icon", () => {
  const scene = new Scene();
  scene.background = new Color();
  scene.fog = new Fog(0xffffff, 28, 86);
  const sky = createMoonlight(scene);
  const [, key, dome] = sky.objects;
  const sprites = dome.children.filter(child => child.isSprite);
  const stars = dome.children.find(child => child.isPoints);
  const avatar = new Group();
  const charge = sky.attachCharge(avatar);
  const { camera } = entry(1.33);
  for (const time of [60, 218]) {
    sky.update(time, WINTER, camera);
    assert(sprites.every(child => !child.visible));
    assert(key.intensity > 0);
  }
  assert(stars.visible && stars.geometry.drawRange.count > 0);
  charge(true, .5);
  assert(avatar.children.some(child => child.visible && child.children.some(icon => icon.isSprite && icon.visible)));
  sky.update(218, "ground", camera);
  assert(sprites.some(child => child.visible));
});

test("first low pass faces the default portrait view and survives twilight", () => {
  const { player, camera } = entry(.75);
  const root = new Group();
  const whale = createWinterWhale(root, seeded(149016), true);
  const [body, ...wake] = root.children;
  const initialObjects = root.children.length;
  const cues = [];
  let first, ending, next, visibleTime = 0, tailAfterPass = false;
  whale.enter();
  for (let tick = 1; tick <= 410; tick++) {
    const time = tick * .25;
    whale.update(.25, player, camera, time / 103);
    for (let cue; (cue = whale.takeCue());) cues.push({ ...cue, time });
    if (body.visible && ending === undefined) {
      first ??= time;
      const projected = body.position.clone().project(camera);
      if (Math.abs(projected.x) <= 1.09 && Math.abs(projected.y) <= 1.09 && projected.z < 1) visibleTime += .25;
    } else if (!body.visible && first !== undefined) {
      ending ??= time;
      if (time === ending) tailAfterPass = wake.some(points => points.material.visible);
    }
    if (ending !== undefined && body.visible) {
      next = time;
      break;
    }
  }
  const approach = cues.find(cue => cue.type === "approach");
  const look = cues.find(cue => cue.type === "look");
  const sighting = cues.find(cue => cue.type === "sighting");
  assert(first >= 8 && first <= 12.5);
  assert(first - approach.time >= 2 && first - approach.time <= 3);
  assert(look.time - first < 3);
  assert.equal(sighting.kind, "pass");
  assert(visibleTime >= 40 && visibleTime <= 60);
  assert(next - ending >= 15 && next - ending <= 25.5);
  assert(tailAfterPass);

  whale.leave();
  assert(!body.visible && wake.every(points => !points.material.visible));
  whale.update(40, player, camera, 1);
  assert.equal(whale.takeCue(), undefined);
  whale.enter();
  whale.update(7.5, player, camera, 0);
  assert(!body.visible);
  assert.equal(root.children.length, initialObjects);
});

test("look prompt outranks casual winter lines and waits for an active tree line", () => {
  const dialogue = createWinterDialogue({}, () => 0);
  const outside = { x: -21, z: 32 };
  dialogue.enter();
  assert.equal(dialogue.line(outside, 0, true), "你看，整个世界都变白了。");
  dialogue.whaleCue({ type: "approach" }, 6500);
  assert.equal(dialogue.line(outside, 6500, true), "嘘，好像有什么要来了。");
  assert.equal(dialogue.line(WINTER_TREE, 8500, true), "这里收藏了好多场雪。");
  dialogue.whaleCue({ type: "look" }, 9000);
  assert.equal(dialogue.look(9000, true), undefined);
  assert.equal(dialogue.look(12700, true), "快抬头看！");
  assert.equal(dialogue.look(13200, true), undefined);
});
