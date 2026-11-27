import assert from "node:assert/strict";
import test from "node:test";
import { Color, Fog, Group, PerspectiveCamera, Scene, Vector3 } from "three";
import { createCameraRig } from "../src/camera.js";
import { createMoonlight } from "../src/moonlight.js";
import { seeded } from "../src/map.js";
import { WINTER, WINTER_ENTRY, WINTER_LAKE, WINTER_TREE, winterHeight } from "../src/winter-layout.js";
import { createWinterLakeEcho } from "../src/winter-lake-echo.js";
import { createWinterWhale } from "../src/winter-whale.js";
import { createWinterStarSnow } from "../src/winter-star-snow.js";
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
  let earlySide, openingOnScreen;
  whale.enter();
  for (let tick = 1; tick <= 410; tick++) {
    const time = tick * .25;
    whale.update(.25, player, camera, time / 103);
    for (let cue; (cue = whale.takeCue());) cues.push({ ...cue, time });
    if (body.visible && ending === undefined) {
      if (first === undefined) {
        first = time;
        const axis = new Vector3(1, 0, 0).applyQuaternion(body.quaternion);
        const towardWhale = body.position.clone().sub(camera.position).normalize();
        earlySide = Math.abs(axis.dot(towardWhale));
        const center = body.position.clone().project(camera);
        openingOnScreen = center.z < 1 && Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1;
      }
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
  const snow = cues.find(cue => cue.type === "star-snow");
  assert(first >= 3 && first <= 5, `first appeared at ${first}s`);
  assert(openingOnScreen);
  assert(earlySide < .71, `opening silhouette side alignment was ${earlySide}`);
  assert(snow && snow.time > first && snow.time < first + 5,
    `local star snow appeared at ${snow?.time}s after whale at ${first}s`);
  assert(first - approach.time >= 2 && first - approach.time <= 3);
  assert(look.time - first < 3);
  assert.equal(look.waitForStarSnow, true);
  assert.equal(sighting.kind, "pass");
  // A central flyover is allowed to leave a stationary chase camera's framing.
  assert(visibleTime >= 9, `default portrait view held the whale for only ${visibleTime}s`);
  assert(ending - first >= 40 && ending - first <= 68);
  assert(next - ending >= 15 && next - ending <= 25.5);
  assert(tailAfterPass);

  whale.leave();
  assert(!body.visible && wake.every(points => !points.material.visible));
  whale.update(40, player, camera, 1);
  assert.equal(whale.takeCue(), undefined);
  whale.enter();
  whale.update(2.75, player, camera, 0);
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

test("star snow reaches a running player, leaves older flakes in world space and clears on exit", () => {
  const root = new Group();
  const anchor = new Vector3(0, 21, -89);
  const effect = createWinterStarSnow(root, { snowPoint: target => target.copy(anchor) }, true);
  const { player, camera } = entry(1.33);
  const origin = player.x;
  let notified = 0;
  for (let frame = 1; frame <= 200; frame++) {
    player.x = origin - frame * .40;
    camera.position.x -= .40;
    camera.updateMatrixWorld();
    const time = frame * .10;
    if (effect.update(.10, time, time, player, camera, .72, frame < 70, frame === 1)) notified++;
    if (frame === 80) {
      const data = root.children[0].geometry;
      const flakes = data.getAttribute("position");
      const xs = Array.from({ length: data.drawRange.count }, (_, i) => flakes.getX(i));
      assert(xs.some(x => Math.abs(x - anchor.x) < 8));
      assert(xs.some(x => Math.abs(x - player.x) < 7));
    }
  }
  assert.equal(notified, 1);
  effect.reset();
  assert(root.children.every(batch => !batch.material.visible));
});

test("first local star snow gets the first priority line without interrupting the tree", () => {
  const dialogue = createWinterDialogue({}, () => 0);
  dialogue.enter();
  assert.equal(dialogue.line(WINTER_TREE, 0, true), "这里收藏了好多场雪。");
  dialogue.whaleCue({ type: "look", waitForStarSnow: true }, 3100);
  assert.equal(dialogue.look(3600, true), undefined);
  dialogue.whaleCue({ type: "star-snow" }, 3900);
  assert.equal(dialogue.look(3900, true), undefined);
  assert.equal(dialogue.look(4200, false), undefined);
  assert.equal(dialogue.look(4300, true), "咦，雪花变了。");
  assert.equal(dialogue.look(7600, true), undefined);
  assert.equal(dialogue.look(8200, true), "快抬头看！");
});

test("lake echo uses the whale silhouette, follows its axis and clears or cues once per visit", () => {
  const root = new Group();
  const echo = createWinterLakeEcho();
  createWinterWhale(root, seeded(19), true, echo);
  const [body] = root.children;
  const { winterWhaleStamp, winterWhaleEcho, winterWhaleEchoStrength } = echo.uniforms;
  const mask = winterWhaleStamp.value.image.data;
  assert(mask.some((value, index) => index % 4 === 0 && value > 210));
  assert(mask.some((value, index) => index % 4 === 1 && value > 10 && value < 170));
  const player = { x: WINTER_LAKE.x, z: 20 };
  const camera = new PerspectiveCamera(49, 1.3, .35, 310);
  camera.position.set(player.x, 7, player.z + 7);
  camera.lookAt(player.x, 1.62, -7);
  camera.updateMatrixWorld();
  body.visible = true;
  body.position.set(WINTER_LAKE.x, 26, -7);
  body.rotation.y = Math.PI * .5;
  assert(echo.update(.25, body, 1, player, camera));
  assert.deepEqual(winterWhaleEcho.value.toArray().slice(0, 2), [WINTER_LAKE.x, -7]);
  assert(Math.abs(winterWhaleEcho.value.w + 1) < 1e-6);
  assert(!echo.update(.25, body, 1, player, camera));
  const before = winterWhaleEchoStrength.value;
  body.position.x += 190;
  assert(!echo.update(.25, body, 1, player, camera));
  assert(winterWhaleEchoStrength.value < before && winterWhaleEchoStrength.value > 0);
  echo.reset();
  assert.equal(winterWhaleEchoStrength.value, 0);
  body.position.x = WINTER_LAKE.x;
  assert(echo.update(.25, body, 1, player, camera));

  const dialogue = createWinterDialogue({}, () => 0);
  dialogue.enter();
  dialogue.whaleCue({ type: "lake-echo" }, 1000);
  assert.equal(dialogue.line(player, 2000, false), undefined);
  assert.equal(dialogue.line(player, 3000, true), "你看，冰里也有一条鲸鱼。");
  dialogue.whaleCue({ type: "lake-echo" }, 7750);
  assert.notEqual(dialogue.line(player, 8000, true), "你看，冰里也有一条鲸鱼。");
  dialogue.enter();
  dialogue.whaleCue({ type: "lake-echo" }, 1000);
  assert.equal(dialogue.line(player, 2000, true), "你看，冰里也有一条鲸鱼。");
});
