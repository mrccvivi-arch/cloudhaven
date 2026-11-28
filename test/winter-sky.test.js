import assert from "node:assert/strict";
import test from "node:test";
import { Color, Fog, Group, PerspectiveCamera, Raycaster, Scene, ShaderLib, Vector2, Vector3 } from "three";
import { createObjectTap } from "../src/object-touch.js";
import { createCameraRig } from "../src/camera.js";
import { createMoonlight } from "../src/moonlight.js";
import { seeded } from "../src/map.js";
import { WINTER, WINTER_ENTRY, WINTER_LAKE, WINTER_TREE, winterHeight, winterLakeExtent } from "../src/winter-layout.js";
import { createWinterLakeEcho } from "../src/winter-lake-echo.js";
import { createWinterWhale } from "../src/winter-whale.js";
import { createWinterStarSnow } from "../src/winter-star-snow.js";
import { winterFlightClear, WINTER_LAKE_HULL_BELOW } from "../src/winter-flight.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
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

test("moving whale responds to a touch once per cooldown and respects an active voice", () => {
  const { player, camera } = entry(.75);
  const root = new Group();
  const whale = createWinterWhale(root, seeded(149016), true);
  const [model] = root.children;
  const material = model.children.find(child => child.isMesh).material;
  const shader = { ...ShaderLib.standard, uniforms: {} };
  material.onBeforeCompile(shader);
  let calls = 0;
  const voice = { busy: false, play() { calls++; } };
  whale.enter();
  assert(!whale.touch(() => true, voice));
  for (let i = 0; i < 40; i++) whale.update(.25, player, camera, 0);
  const firstPose = model.position.clone();
  assert(!whale.touch(() => false, voice));
  const ray = new Raycaster();
  const pointer = new Vector2();
  camera.lookAt(model.position);
  camera.updateMatrixWorld();
  ray.setFromCamera(pointer, camera);
  const hit = createObjectTap(camera, () => false, 20);
  assert(whale.touch((target) => hit({ width: 768, height: 1024 }, pointer, ray, undefined, target, WINTER), voice));
  assert.equal(calls, 1);
  whale.update(.25, player, camera, 0);
  assert(shader.uniforms.whaleTouch.value > 0);
  assert(firstPose.distanceTo(model.position) > 0);
  whale.touch(() => true, voice);
  assert.equal(calls, 1);
  for (let i = 0; i < 32; i++) whale.update(.25, player, camera, 1);
  assert.equal(shader.uniforms.whaleTouch.value, -1);
  voice.busy = true;
  whale.touch(() => true, voice);
  assert.equal(calls, 1);
  voice.busy = false;
  whale.touch(() => true, voice);
  assert.equal(calls, 2);
  whale.leave();
  assert(!whale.touch(() => true, voice));
});

test("the whale enters the default portrait view, visits the lake and repeats across twilight without jumping", () => {
  const { player, camera } = entry(.75);
  const root = new Group();
  const whale = createWinterWhale(root, seeded(149016), true);
  const [body, ...batches] = root.children;
  const stars = batches.filter(batch => batch.geometry.attributes.starMotion);
  const start = { ...player };
  const cues = [];
  const previous = new Vector3();
  const vertex = new Vector3();
  const lakeCamera = createCameraRig(camera, 0, 8);
  let first, phase, encounterAt, lowVisible = false, minBelly = Infinity, maxBelly = -Infinity;
  let continuedSnow = false, clearedSnow = false, treeOverflight = false, descentHeight, lowHeight;
  whale.enter();
  for (let i = 1; i <= 430; i++) {
    const dt = .25, time = i * dt;
    if (time > 12) {
      player.x = time < 19 ? start.x - (time - 12) * 7.3 : -51.1;
      player.y = winterHeight(player.x, player.z);
      lakeCamera.face(0, .055);
      lakeCamera.update(player, 0, true);
      camera.updateMatrixWorld();
    }
    whale.update(dt, player, camera, time < 54 ? 0 : 1);
    for (let cue; (cue = whale.takeCue());) {
      cues.push({ ...cue, time });
      if (cue.type === "descent" || cue.type === "encounter" || cue.type === "return") phase = cue.type;
      if (cue.type === "descent" && descentHeight === undefined) descentHeight = body.position.y;
      if (cue.type === "encounter") {
        encounterAt = time;
        lowHeight ??= body.position.y;
      }
    }
    if (!body.visible) continue;
    const screen = body.position.clone().project(camera);
    if (first === undefined) {
      first = time;
      assert(screen.z > -1 && screen.z < 1 && Math.abs(screen.x) < 1 && Math.abs(screen.y) < 1);
    } else assert(previous.distanceTo(body.position) < 3.3, "the route must join without a jump");
    previous.copy(body.position);
    assert(winterFlightClear(body, .7, WINTER_LAKE_HULL_BELOW));
    if (phase === undefined) assert(stars.every(batch => !batch.material.visible));
    if (phase === "encounter" && time < encounterAt + 24.8 && i % 4 === 0) {
      assert(winterLakeExtent(body.position.x, body.position.z) < .72);
      lowVisible ||= screen.z > -1 && screen.z < 1 && Math.abs(screen.x) < 1.15 && Math.abs(screen.y) < 1.15;
      body.updateMatrixWorld(true);
      body.traverse(part => {
        if (!part.isMesh) return;
        const positions = part.geometry.attributes.position;
        let lowest = Infinity;
        for (let j = 0; j < positions.count; j++) {
          vertex.fromBufferAttribute(positions, j).applyMatrix4(part.matrixWorld);
          lowest = Math.min(lowest, vertex.y - winterHeight(vertex.x, vertex.z));
        }
        assert(lowest > 1.15, "even the animated fin tips clear the ice");
        if (part === body.children[0]) {
          minBelly = Math.min(minBelly, lowest);
          maxBelly = Math.max(maxBelly, lowest);
        }
      });
    }
    const returned = cues.find(cue => cue.type === "return");
    if (returned && phase === "return") {
      treeOverflight ||= Math.hypot(body.position.x - WINTER_TREE.x, body.position.z - WINTER_TREE.z) < 7 &&
        body.position.y > 41;
      if (time - returned.time > 8 && time - returned.time < 9) continuedSnow ||= stars.some(batch => batch.material.visible);
      if (time - returned.time >= 16) clearedSnow ||= stars.every(batch => !batch.material.visible);
    }
  }

  const times = type => cues.filter(cue => cue.type === type).map(cue => cue.time);
  const [descent, repeat] = times("descent");
  const [encounter] = times("encounter");
  const [returned] = times("return");
  assert(first >= 5 && first <= 8);
  assert.equal(times("approach").length, 1);
  assert(descent - first >= 10 && descent - first <= 15);
  assert(encounter - descent >= 6 && encounter - descent <= 10);
  assert(descentHeight - lowHeight >= 6);
  assert(returned - encounter >= 29 && returned - encounter <= 36);
  assert(repeat - descent >= 45 && repeat - descent <= 75);
  assert(lowVisible && minBelly > 4 && maxBelly < 6.8, `visible=${lowVisible}, belly=${minBelly}–${maxBelly}`);
  assert(continuedSnow && clearedSnow && treeOverflight);
  whale.leave();
  assert(!body.visible && batches.every(batch => !batch.material.visible));
  whale.update(60, player, camera, 1);
  assert.equal(whale.takeCue(), undefined);
  whale.enter();
  whale.update(4.75, player, camera, 0);
  assert(!body.visible && stars.every(batch => !batch.material.visible));
});

test("champagne star snow follows a running player and only emits during the visit window", () => {
  const root = new Group();
  const anchor = new Vector3(WINTER_LAKE.x + 7, 12, 6);
  const effect = createWinterStarSnow(root, { snowPoint: target => target.copy(anchor) }, true);
  const { player, camera } = entry(1.33);
  player.x = WINTER_LAKE.x + 14;
  player.z = 12;
  const original = player.x;
  let local = false, aerial = false, gold = false;
  for (let frame = 1; frame <= 285; frame++) {
    player.x = original - Math.min(frame, 70) * .40;
    const time = frame * .10;
    effect.update(.10, time, time, player, camera, .72, frame < 70, frame < 170 ? 1 : 0);
    if (frame !== 65) continue;
    for (const batch of root.children.filter(batch => batch.material.visible)) {
      const { position, color } = batch.geometry.attributes;
      for (let i = 0; i < batch.geometry.drawRange.count; i++) {
        const x = position.getX(i), y = position.getY(i);
        local ||= Math.abs(x - player.x) < 8 && y < 6;
        aerial ||= Math.abs(x - anchor.x) < 8 && y > 7;
        gold ||= color.getX(i) > color.getY(i) && color.getY(i) > color.getZ(i);
      }
    }
  }
  assert(local && aerial && gold);
  assert(root.children.every(batch => !batch.material.visible));
  effect.reset();
});

test("winter whale phases queue in order while running and listening to music", () => {
  const dialogue = createWinterDialogue({ flower: true }, { random: () => 0 });
  const player = { x: -54, z: 15 };
  const line = (now, available = true) => dialogue.line(player, now, { available, playing: true });
  dialogue.enter(0);
  const welcome = line(0);
  assert.equal(welcome.text, "又见面了，真好。");
  dialogue.motion({ flower: true, dance: true, running: 3 }, player, 1000);
  for (const type of ["approach", "descent", "encounter", "return"]) dialogue.whaleCue({ type });
  dialogue.whaleCue({ type: "approach" });
  assert.equal(line(2000, false), undefined);
  assert.equal(line(welcome.duration + 1499), undefined);
  let now = welcome.duration + 1500;
  for (const text of [
    "雪地也会开花呢。", "雪花也在陪我们跑。", "看，天空里有什么！", "它好像也很喜欢有人陪伴。",
    "我喜欢看它自由自在的样子。", "它有自己的天空，就像你也有自己的世界。",
  ]) {
    const next = line(now);
    assert.equal(next.text, text);
    now += next.duration + 1500;
  }
  assert(now < 60000);
  assert.equal(line(now), undefined);
  dialogue.featherCue("near");
  dialogue.leave();
  assert.equal(line(100000), undefined);
  dialogue.enter(100000);
  assert.equal(line(100000).text, "一起看看雪吧。");
});

test("Moon's touch waits for the current line and leaves the same brief display gap", () => {
  const dialogue = createWinterDialogue({ flower: true }, { random: () => 0 });
  const player = { x: -54, z: 15 };
  const line = (now, available = true) => dialogue.line(player, now, { available, playing: false });
  dialogue.enter(0);
  line(0);
  assert.equal(dialogue.touch(1000, 5000, false), false);
  assert.equal(dialogue.touch(5000, 5000, true), true);
  dialogue.whaleCue({ type: "encounter" });
  assert.equal(line(9000, false), undefined);
  assert.equal(line(11499), undefined);
  assert.equal(line(11500).text, "我喜欢看它自由自在的样子。");
});

test("winter music dialogue queues gestures and keeps its independent playback-time cooldown", () => {
  const dialogue = createWinterDialogue({ flower: true }, { random: () => 0 });
  const player = { x: -54, z: 15 };
  const line = (now, playing, available = true) => dialogue.line(player, now, { available, playing });
  dialogue.enter(0);
  line(0, false);
  dialogue.featherCue("start");
  assert.equal(line(6500, true).text, "不是每一次想念，都需要一次见面。");
  assert.equal(line(40000, true), undefined);
  dialogue.featherCue("pause");
  dialogue.featherCue("pause");
  assert.equal(line(41000, false).text, "后来，我有了一个想要分享所有的人。");
  assert.equal(line(150000, false), undefined);
  assert.equal(line(160000, true), undefined);
  assert.equal(line(201499, true), undefined);
  assert.equal(line(201500, true, false), undefined);
  const first = line(201501, true);
  assert.equal(first.text, "我不知道你在人间过着怎样的生活，但我希望你过得很好。");
  assert(first.duration >= 7000);
  assert.equal(line(276499, true), undefined);
  assert.equal(line(276500, true).text, "我喜欢你，并不是因为你给了我什么。");
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

  const dialogue = createWinterDialogue({ flower: true }, { random: () => 0 });
  const line = (now) => dialogue.line(player, now, { available: true, playing: false });
  dialogue.enter(0);
  line(0);
  dialogue.whaleCue({ type: "lake-echo" });
  assert.equal(line(6500).text, "冰里也有一条鲸鱼。");
  dialogue.whaleCue({ type: "lake-echo" });
  assert.equal(line(69000), undefined);
  dialogue.enter(69000);
  line(69000);
  dialogue.whaleCue({ type: "lake-echo" });
  assert.equal(line(75500).text, "冰里也有一条鲸鱼。");
});

test("the player's normal jump still takes off and lands on the lake", () => {
  const player = spawnPlayer({ x: WINTER_LAKE.x, z: 12, layer: WINTER });
  assert(jump(player));
  assert(!jump(player));
  assert(!player.grounded);
  for (let i = 0; i < 75; i++) movePlayer(player, 0, 0, .02);
  assert(player.grounded);
  assert(Math.abs(player.y - WINTER_LAKE.shoreHeight) < .002);
});
