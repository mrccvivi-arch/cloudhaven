import assert from "node:assert/strict";
import test from "node:test";
import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, SphereGeometry, Vector2, Vector3 } from "three";
import { createObjectTap } from "../src/object-touch.js";
import { createLighthouse } from "../src/summer-lighthouse.js";
import { createTowerReturn } from "../src/summer-tower-return.js";
import { createLivingDialogue } from "../src/living-dialogue.js";
import { createPierLight, createSummerBeacon, nearSummerLantern } from "../src/summer-beacon.js";
import { createSummerEffects } from "../src/summer-effects.js";
import { createPondFireflies } from "../src/summer-fireflies.js";
import { summerNightGlow } from "../src/summer-glow.js";
import { createSummerLight } from "../src/summer-light.js";
import { coastPoint, PIER, POND, SUMMER, TOWER, TOWER_LANDING, towerPoint, towerRise } from "../src/summer-layout.js";
import { createSummerRunGuide, summerSpeechDuration } from "../src/summer-run-guide.js";

test("water lights rise at dusk, leave the daytime pool alone and expire without movement", () => {
  const light = createSummerLight();
  const glowAt = (time) => summerNightGlow(0, light.update(time));
  assert.equal(glowAt(74), 0);
  assert.equal(glowAt(155), 0);
  assert.ok(glowAt(181) > 0 && glowAt(181) < 1);
  assert.equal(glowAt(221), 1);
  assert.equal(glowAt(4), 0);
  const root = new Group();
  const effects = createSummerEffects(root);
  const [x, z] = coastPoint(1.26, 1.058);
  const step = { x, z, grounded: true, surface: "water", dx: .1, dz: 0, landed: true, running: true };
  const [spray, rings] = root.children;
  const layers = root.getObjectByName("summer-water-glow").children;
  effects.update(0, .016, 0, step);
  assert.ok(spray.count > 0 && rings.count > 0);
  assert.ok(layers.every((mesh) => mesh.count === 0));
  effects.clear();
  effects.setWaterGlow(0x5beeff, 1);
  effects.update(0, .016, 1, step);
  assert.ok(layers.every((mesh) => mesh.count > 0));
  step.landed = false;
  step.dx = 0;
  for (let i = 1; i <= 45; i++) effects.update(i / 10, .1, 1, step);
  assert.ok(layers.every((mesh) => mesh.count === 0));
});

test("the beacon lights only from a safe gallery position and keeps its session state", () => {
  const root = new Group();
  const core = new Mesh(new SphereGeometry(1), new MeshBasicMaterial());
  core.position.set(TOWER.x, TOWER_LANDING + 2.15, TOWER.z);
  const beacon = createSummerBeacon(root, core);
  const beam = root.getObjectByName("summer-lighthouse-beam");
  const at = { layer: SUMMER, x: TOWER.x + 4.7, y: TOWER_LANDING, z: TOWER.z, grounded: true };
  assert.ok(nearSummerLantern(at));
  assert.ok(!beacon.light(0, { ...at, x: TOWER.x + TOWER.gallery }));
  assert.ok(!beacon.light(0, { ...at, y: TOWER_LANDING - 1 }));
  assert.ok(beacon.light(2, at));
  assert.ok(!beacon.light(2, at));
  beacon.update(3, 1, at);
  assert.ok(beam.material.uniforms.reach.value < 1);
  beacon.update(5, 1, at);
  assert.equal(beam.material.uniforms.reach.value, 1);
  const angle = beam.rotation.y;
  beacon.pause();
  beacon.update(30, 1, at);
  assert.equal(beacon.lit, true);
  assert.ok(Math.abs(beam.rotation.y - angle - 2 * Math.PI) < 1e-8);
  const brightness = beam.material.uniforms.gain.value;
  beacon.update(30, 0, at);
  assert.ok(brightness > 0 && !beam.visible);
  assert.equal(beam.material.uniforms.gain.value, 0);
  assert.equal(core.material.color.getHex(), 0xffffff);
  beacon.update(32, .42, at);
  assert.ok(beam.visible && beam.material.uniforms.gain.value < brightness);
});

test("fireflies stay local and the existing pier lamp fades with dusk", () => {
  const root = new Group();
  const ecology = createPondFireflies(root);
  const points = root.getObjectByName("summer-pond-fireflies");
  const player = { x: POND.x + 6, y: POND.y, z: POND.z };
  const lines = [];
  ecology.update(5, 0, player, (kind) => lines.push(kind));
  assert.equal(points.visible, false);
  ecology.update(6, 1, player, (kind) => lines.push(kind));
  ecology.update(7.5, 1, player, (kind) => lines.push(kind));
  assert.ok(points.visible && points.geometry.attributes.position.count <= 30);
  assert.deepEqual(lines, ["summer-fireflies-near", "summer-fireflies-around"]);
  ecology.update(11, 1, { x: 60, y: 0, z: 40 });
  assert.equal(points.visible, false);
  ecology.pause();
  assert.equal(root.children.length, 1);

  const lamp = new Mesh();
  lamp.material.emissive = lamp.material.color.clone();
  lamp.position.set(PIER.x, PIER.y + 2.37, PIER.z);
  const update = createPierLight(root, lamp);
  const patch = root.getObjectByName("summer-pier-light");
  update(0);
  assert.equal(patch.visible, false);
  update(.45);
  assert.ok(patch.visible && lamp.material.emissiveIntensity > 0 && lamp.material.emissiveIntensity < 1);
  update(1);
  assert.ok(lamp.material.emissiveIntensity > 1);
  update(0);
  assert.equal(lamp.material.emissiveIntensity, 0);
});

test("the deliberate lighthouse action waits for touch dialogue, and running uses the summer-night invitation", () => {
  let now = 1_700_000_000_000;
  const lines = [];
  const dialogue = createLivingDialogue({
    storage: () => undefined, random: () => 0, wallTime: () => now,
    show: (line) => lines.push(line), canSee: () => true,
  });
  dialogue.rememberTouch("月在这里。");
  assert.equal(dialogue.summerSituation("summer-lantern-lit", 0, { explicit: true }), undefined);
  now += 9000;
  assert.equal(dialogue.summerSituation("summer-lantern-lit", 9000, { explicit: true }), true);
  assert.deepEqual(lines, ["这样，迷路的星星就能找到家啦。"]);
  assert.equal(dialogue.summerSituation("summer-running-glow", 9200), undefined);
  const guide = createSummerRunGuide(() => 0);
  guide.enter();
  guide.welcomed(0, "大海！");
  assert.equal(guide.update(summerSpeechDuration("大海！") + 3000, { canSpeak: () => true, glowingNight: true }),
    "走呀，我们去踩星星！");
});

test("the tower return is available on the gallery or after sustained blocked stair movement", () => {
  const escape = createTowerReturn();
  const floor = { layer: SUMMER, ...towerPoint(3.8, 1.1), y: towerRise(1.1), grounded: true };
  const gallery = { ...floor, y: TOWER_LANDING };
  assert.equal(escape.available(gallery), true);
  assert.equal(escape.available(floor), false);
  for (let i = 0; i < 220; i++) escape.update(floor, .01, 1, .05);
  assert.equal(escape.available(floor), false, "normal stair travel");
  for (let i = 0; i < 220; i++) escape.update(floor, .01, 0, 0);
  assert.equal(escape.available(floor), false, "looking around or letting go");
  for (let i = 0; i < 150; i++) escape.update(floor, .01, 1, 0);
  assert.equal(escape.available(floor), false);
  escape.update(floor, .01, 0, 0);
  for (let i = 0; i < 181; i++) escape.update(floor, .01, 1, 0);
  assert.equal(escape.available(floor), true);
  escape.update(floor, .01, 0, 0);
  assert.equal(escape.available(floor), true, "the player can release the joystick to tap");
  for (let i = 0; i < 510; i++) escape.update(floor, .01, 0, 0);
  assert.equal(escape.available(floor), false);
});

test("the glass and lens share a scene touch target, with foreground avatar taps preserved", () => {
  const root = new Group();
  createLighthouse(root);
  const core = root.getObjectByName("lighthouse-lantern-core");
  const beacon = createSummerBeacon(root, core);
  const camera = new PerspectiveCamera(49, 4 / 3, .35, 305);
  camera.position.set(TOWER.x, core.position.y, TOWER.z + 11);
  camera.lookAt(core.position);
  root.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  const hitTarget = createObjectTap(camera, () => false, 15);
  const lens = new Vector2();
  const glass = new Vector3(TOWER.x + 2.2, core.position.y + .5, TOWER.z + 1.5).project(camera);
  const through = (pointer, avatarHit) => {
    const ray = new Raycaster();
    ray.setFromCamera(pointer, camera);
    return hitTarget({ width: 1024, height: 768 }, pointer, ray, avatarHit, beacon.target, SUMMER);
  };
  assert.equal(through(lens), true);
  assert.equal(through(new Vector2(glass.x, glass.y)), true);
  assert.equal(through(lens, { distance: 3 }), false);
});
