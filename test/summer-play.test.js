import assert from "node:assert/strict";
import test from "node:test";
import { Group } from "three";
import { createCottonCandy } from "../src/cotton-candy.js";
import { PLAYER_RADIUS } from "../src/collision.js";
import { MOVE_SPEED, jump, spawnPlayer } from "../src/motion.js";
import { createSummerDialogue } from "../src/summer-dialogue.js";
import { createSummerEffects } from "../src/summer-effects.js";
import { ISLAND_BRIDGE, SUMMER, SUMMER_ENTRY, TOWER_LANDING, bridgeCenter, coastPoint, pierPoint,
  summerSurface, summerWalkable, towerPoint, towerRise, wadePoint } from "../src/summer-layout.js";
import { createSummerRunGuide, summerSpeechDuration } from "../src/summer-run-guide.js";
import { createSummerRun } from "../src/summer-run.js";
import { waveReachesSand } from "../src/summer-sea.js";

const dt = .01;
const at = (x, z, y) => spawnPlayer({ layer: SUMMER, x, z, y });

test("two seconds of actual travel starts a smooth boost on the meadow, sand and shallows", () => {
  for (const [x, z, surface] of [[-12, 10, "grass"], [2, 38, "sand"], [7, 51, "water"]]) {
    const player = at(x, z);
    assert.equal(summerSurface(x, z), surface);
    const run = createSummerRun();
    for (let i = 0; i < 200; i++) {
      run.move(player, MOVE_SPEED, 0, dt);
      assert.equal(run.running, false);
    }
    assert.ok(Math.abs(player.x - x - 2 * MOVE_SPEED) < 1e-8);
    run.move(player, MOVE_SPEED, 0, dt);
    assert.ok(run.running && run.poseWeight > 0 && run.poseWeight < .1);
    for (let i = 0; i < 42; i++) run.move(player, MOVE_SPEED, 0, dt);
    const before = player.x;
    run.move(player, MOVE_SPEED, 0, dt);
    assert.ok(Math.abs(player.x - before - MOVE_SPEED * 1.25 * dt) < 1e-8);
    const release = player.x;
    run.move(player, 0, 0, dt);
    assert.ok(!run.running && player.x > release);
    for (let i = 0; i < 25; i++) run.move(player, 0, 0, dt);
    assert.ok(player.x - release < 1);
    const stopped = player.x;
    run.move(player, 0, 0, dt);
    assert.equal(player.x, stopped);
  }
});

test("reapplying input during deceleration starts a new walking interval", () => {
  const player = at(-12, 10);
  const run = createSummerRun();
  for (let i = 0; i < 245; i++) run.move(player, MOVE_SPEED, 0, dt);
  run.move(player, 0, 0, dt);
  const before = player.x;
  run.move(player, -MOVE_SPEED, 0, dt);
  assert.ok(!run.running && run.poseWeight === 0);
  assert.ok(Math.abs(player.x - before + MOVE_SPEED * dt) < 1e-8);
});

test("a running jump can turn and land, while the bridge, tower, pier and shore edge stay at walking speed", () => {
  const run = createSummerRun();
  const player = at(-12, 10);
  for (let i = 0; i < 245; i++) run.move(player, MOVE_SPEED, 0, dt);
  assert.ok(jump(player));
  const takeoff = player.y;
  for (let i = 0; i < 35; i++) run.move(player, 0, -MOVE_SPEED, dt);
  assert.ok(run.running && !player.grounded && player.y > takeoff + 1);
  for (let i = 0; i < 80; i++) run.move(player, 0, -MOVE_SPEED, dt);
  assert.ok(player.grounded && player.z < 2);

  const [edgeX, edgeZ] = wadePoint(1.2, PLAYER_RADIUS + .02);
  const ramp = 7;
  const restricted = [
    [at(bridgeCenter(ISLAND_BRIDGE, 51.5), 51.5), [0, 1]],
    [spawnPlayer(SUMMER_ENTRY), [0, -1]],
    [spawnPlayer({ layer: SUMMER, ...pierPoint(0, 7) }), [0, 1]],
    [spawnPlayer({ layer: SUMMER, ...towerPoint(3.55, ramp), y: towerRise(ramp) }), [1, 0]],
    [spawnPlayer({ layer: SUMMER, ...towerPoint(5.5, 1.3), y: TOWER_LANDING }), [1, 0]],
    [at(edgeX, edgeZ), [edgeX, edgeZ]],
    [at(-23, 9), [0, -1]], // Into the pond boundary.
  ];
  for (const [pose, axis] of restricted) {
    const [x, z] = axis.map((component) => component / Math.hypot(...axis));
    for (let i = 0; i < 300; i++) {
      const before = { ...pose };
      run.move(pose, x * MOVE_SPEED, z * MOVE_SPEED, dt);
      assert.equal(run.running, false);
      assert.ok(Math.hypot(pose.x - before.x, pose.z - before.z) <= MOVE_SPEED * dt + 1e-7);
    }
    assert.ok(pose.grounded && summerWalkable(pose, pose.x, pose.z, PLAYER_RADIUS));
  }
});

test("pooled footprints age and wash away, while shallow landings splash even without input", () => {
  const root = new Group();
  const effects = createSummerEffects(root);
  const [droplets, ripples, tracks] = root.children;
  const sand = (x, z) => ({ x, z, surface: "sand", grounded: true, dx: 1, dz: 0 });
  effects.update(0, .01, 0, sand(12, 38));
  assert.equal(tracks.count, 1);
  effects.update(16, 16, 0);
  assert.equal(tracks.count, 1);
  effects.update(24, 8, 0);
  assert.equal(tracks.count, 0);

  const angle = 1.35;
  const [x, z] = coastPoint(angle, .991);
  let time = 0;
  while (waveReachesSand(time, angle, -.01)) time += .02;
  effects.update(time, .01, 0, { ...sand(x, z), dx: 3 });
  assert.equal(tracks.count, 1);
  while (!waveReachesSand(time, angle, -.01)) time += .02;
  effects.update(time + .1, .01, 0);
  effects.update(time + .42, .32, 0);
  assert.equal(tracks.count, 0);

  const water = { x: 12, z: 51, surface: "water", grounded: true, dx: 1, dz: 0 };
  effects.update(time, .01, 0, water);
  assert.equal(droplets.count, 5);
  assert.equal(ripples.count, 1);
  effects.update(time + 2, 2, 0, { ...water, dx: 0 });
  assert.equal(droplets.count + ripples.count, 0);
  effects.update(time + 2.01, .01, 1, { ...water, dx: 0, landed: true });
  assert.equal(droplets.count, 13);
  effects.clear();
  assert.equal(droplets.count + ripples.count + tracks.count, 0);
});

test("summer greetings wait for space, and a new visit avoids repeating the last line", () => {
  const speech = createSummerDialogue(() => 0);
  const step = (surface) => ({ surface, grounded: true, running: false, dx: 1, dz: 0 });
  const sample = (time, surface, options) =>
    speech.update(time, { step: step(surface), dt: .02, canSpeak: () => true, ...options });
  speech.enter();
  assert.equal(sample(0, "grass", { canSpeak: () => false }), undefined);
  assert.equal(sample(300, "grass"), "大海！是大海！");
  assert.equal(sample(1000, "sand"), undefined);
  assert.equal(sample(6000, "water"), "哈哈，脚湿啦！");
  assert.equal(sample(6500, "sand"), undefined);
  assert.equal(sample(6600, "water"), undefined);
  assert.equal(sample(80000, "grass"), undefined);
  assert.equal(sample(81000, "sand", { night: true, atSea: true }), "原来大海也藏着星星。");
  speech.leave();
  assert.equal(sample(81500, "water"), undefined);
  speech.enter();
  assert.equal(sample(82000, "grass"), "大海！是大海！");
  speech.leave();
  speech.enter();
  assert.equal(sample(83000, "grass"), "今天适合到处乱跑。");
});


test("run, rest and beach dialogue each wait for a valid opening", () => {
  const speech = createSummerDialogue(() => 0);
  speech.enter();
  const step = { surface: "grass", grounded: true, running: false, dx: 0, dz: 0 };
  const sample = (time, speaking = true) => speech.update(time, { step, dt: .1, canSpeak: () => speaking });
  assert.ok(sample(0));
  step.surface = "sand";
  assert.equal(sample(2000), undefined);
  assert.equal(sample(8000, false), undefined);
  assert.equal(sample(8001), undefined);
  assert.equal(sample(8251), undefined);
  step.surface = "grass";
  sample(9000);
  step.surface = "sand";
  assert.equal(sample(10000, false), undefined);
  assert.equal(sample(10300), "这里可以跑很远很远。");

  step.running = true;
  step.dx = .8;
  let line;
  for (let time = 60000; time < 63000; time += 100) line = sample(time) ?? line;
  assert.equal(line, "跑起来的时候，风也是朋友。");
  step.running = false;
  step.dx = 0;
  assert.equal(sample(63000), undefined);
  step.running = true;
  step.dx = .8;
  for (let time = 110000; time < 112000; time += 100) assert.equal(sample(time), undefined);
  step.running = false;
  step.dx = 0;
  assert.equal(sample(112000), "呼……今天好开心。");
});

test("the run guide waits for the actual welcome, teaches once and queues a single success line", () => {
  const guide = createSummerRunGuide(() => 0);
  const speech = createSummerDialogue(() => 0);
  const step = { surface: "grass", grounded: true, running: false, dx: 0, dz: 0 };
  const guideStep = (time, running = false, canSpeak = () => true) => guide.update(time, { running, canSpeak });
  guide.enter();
  speech.enter();
  assert.equal(guideStep(10_000), undefined, "time alone does not start the guide");
  const welcome = speech.update(10_000, {
    step, dt: .01, canSpeak: () => true, onWelcome: (line) => guide.welcomed(10_000, line),
  });
  const inviteAt = 10_000 + summerSpeechDuration(welcome) + 3000;
  assert.equal(guideStep(inviteAt - 1), undefined);
  assert.equal(guideStep(inviteAt, false, () => false), undefined, "another bubble can keep its place");
  const invite = guideStep(inviteAt + 200);
  assert.equal(invite, "我们沿着大海跑一圈吧！");
  assert.equal(guide.showHint(inviteAt + 200), true);
  assert.equal(guideStep(inviteAt + 450, true), undefined);
  assert.equal(guide.showHint(inviteAt + 450), false);
  const followAt = inviteAt + 200 + summerSpeechDuration(invite);
  const follow = guideStep(followAt);
  assert.equal(follow, "走呀，我们去海边撒欢！");
  const successAt = followAt + summerSpeechDuration(follow);
  assert.equal(guideStep(successAt, false, (scripted) => scripted), undefined, "success waits for the regular cooldown");
  assert.equal(guideStep(successAt + 500), "对啦，就是这样！");
  assert.equal(guideStep(successAt + 15_000, true), undefined);
});

test("the guide is optional, skips a prior run or tower visit and resets on re-entry", () => {
  const guide = createSummerRunGuide(() => .9);
  const welcome = "大海！是大海！";
  const start = () => {
    guide.enter();
    guide.welcomed(0, welcome);
  };
  const update = (time, options) => guide.update(time, { canSpeak: () => true, ...options });
  for (const options of [{ running: true }, { atTower: true }]) {
    start();
    assert.equal(update(2000, options), undefined);
    assert.equal(update(9000), undefined);
    assert.equal(guide.showHint(9000), false);
  }
  start();
  assert.equal(update(8000), undefined);
  const invite = update(9000);
  assert.equal(invite, "我们沿着大海跑一圈吧！");
  assert.equal(guide.showHint(16999), true);
  assert.equal(guide.showHint(17000), false);
  assert.equal(update(9000 + summerSpeechDuration(invite)), "今天不用慢慢走，我们跑起来吧！");
  assert.equal(update(28000), undefined);
  assert.equal(guide.holdsSpeech, false);
  guide.leave();
  assert.equal(update(30000, { running: true }), undefined);
  start();
  assert.equal(update(9000), "我们沿着大海跑一圈吧！");
});

test("running pose moves the render model and settles without moving the avatar root", () => {
  const avatar = createCottonCandy();
  avatar.root.position.set(2, .3, 5);
  const body = avatar.root.getObjectByName("Round body").parent;
  for (let i = 0; i < 35; i++) avatar.update(.016, true, true, 0, 0, 0, 1);
  assert.ok(body.rotation.x < -.08);
  assert.ok(body.position.y > .03);
  assert.deepEqual(avatar.root.position.toArray(), [2, .3, 5]);
  for (let i = 0; i < 63; i++) avatar.update(.016, false, true, 0);
  assert.ok(Math.abs(body.rotation.x) < .001 && body.position.y < .001);
});
