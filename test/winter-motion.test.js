import assert from "node:assert/strict";
import test from "node:test";
import { Group, Matrix4, Vector3 } from "three";
import { createWinterMotion, permitsWinterMotion } from "../src/winter-motion.js";
import { createWinterDialogue } from "../src/winter-dialogue.js";
import { MOVE_SPEED } from "../src/motion.js";
import { SNOW_GATE, WINTER_LAKE, WINTER_TREE, winterHeight } from "../src/winter-layout.js";

function scenario(x = 30, z = 46) {
  const root = new Group();
  const clock = { value: 0 };
  const motion = createWinterMotion(root, { value: 1 }, clock, true);
  const trail = root.children.find(child => child.isInstancedMesh);
  const streams = root.children.filter(child => child.isPoints && child.renderOrder === 4);
  const player = { x, z, y: winterHeight(x, z), grounded: true };
  let time = 0;
  function frame(dx = 0, dz = 0, { grounded = true, landed = false, dt = 1 / 60 } = {}) {
    time += dt;
    clock.value = time;
    player.x += dx;
    player.z += dz;
    player.grounded = grounded;
    player.y = winterHeight(player.x, player.z) + Number(!grounded);
    return { ...motion.update(player, undefined, { dx, dz, dt, landed }, dt, time) };
  }
  return { root, trail, streams, player, motion, frame };
}

const pace = MOVE_SPEED / 60;

test("winter flowers follow running distance and skip stationary, walking, air and protected ground", () => {
  const { trail, player, motion, frame } = scenario();
  for (let i = 0; i < 80; i++) frame();
  assert.equal(trail.count, 0);
  for (let i = 0; i < 90; i++) frame(pace * .36);
  assert.equal(trail.count, 0);
  for (let i = 0; i < 80; i++) frame(pace, 0, { grounded: false });
  frame(0, 0, { landed: true });
  assert.equal(trail.count, 0);
  let first;
  for (let i = 1; i < 35; i++) {
    if (frame(0, -pace).flower) {
      first = i * pace;
      break;
    }
  }
  assert(first >= 1.28 && first <= 2.4 + pace);
  assert(trail.count >= 2 && trail.count <= 5);
  const point = new Vector3(), matrix = new Matrix4();
  for (let i = 0; i < trail.count; i++) {
    trail.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix);
    assert(permitsWinterMotion(point.x, point.z));
    assert(point.z > player.z);
  }
  motion.clear();
  for (const protectedPoint of [WINTER_TREE, SNOW_GATE]) {
    player.x = protectedPoint.x - 1;
    player.z = protectedPoint.z;
    for (let i = 0; i < 52; i++) frame(i < 25 ? pace : -pace);
    assert.equal(trail.count, 0);
  }
});

test("snow dance stays with a long turning run, fades nearby and clears on leaving", () => {
  const { player, trail, streams, root, motion, frame } = scenario();
  let firstDance;
  for (let i = 1; i <= 60 * 42; i++) {
    const turn = Math.PI * 2 * i / (60 * 15);
    const event = frame(Math.sin(turn) * pace, -Math.cos(turn) * pace);
    if (event.dance) firstDance ??= i / 60;
    if (i % 180 !== 0 || !firstDance) continue;
    let nearby = 0;
    for (const { geometry, material } of streams) {
      if (!material.visible) continue;
      const { color, position } = geometry.attributes;
      for (let j = 0; j < position.count; j++) {
        if (color.getW(j) < .1) continue;
        nearby++;
        assert(Math.hypot(position.getX(j) - player.x, position.getZ(j) - player.z) < 3.2);
      }
    }
    assert(nearby >= 20);
    assert(trail.count <= trail.instanceMatrix.count);
  }
  assert(firstDance >= 1 && firstDance <= 2);
  frame();
  assert(streams.every(batch => batch.material.visible));
  for (let i = 0; i < 200; i++) frame();
  assert(streams.every(batch => !batch.material.visible));
  for (let i = 0; i < 60 * 31; i++) frame();
  assert.equal(trail.count, 0);
  motion.clear();
  assert(root.children.every(child => child.isInstancedMesh ? child.count === 0 : !child.material.visible));
});

test("winter first lines queue once per visit and running chatter keeps its own interval", () => {
  const discovery = { whale: false, tree: false, flower: false };
  const dialogue = createWinterDialogue(discovery, { random: () => 0 });
  const player = { x: -46, z: 10 };
  const line = (now) => dialogue.line(player, now, { available: true, playing: false });
  dialogue.enter(0);
  const welcome = line(0);
  assert.equal(welcome.text, "又见面了，真好。");
  assert.equal(line(welcome.duration + 1500), undefined);
  const guide = line(6500);
  assert.equal(guide.text, "要不要试试在雪地里跑起来？");

  dialogue.motion({ flower: true, dance: true, running: 3 }, player, 7000);
  const flowerAt = 6500 + guide.duration + 1500;
  const flower = line(flowerAt);
  assert.equal(flower.text, "雪地也会开花呢。");
  assert.equal(line(flowerAt + flower.duration + 1500).text, "雪花也在陪我们跑。");
  assert.equal(discovery.flower, true);
  dialogue.motion({ flower: true, dance: true, running: 3 }, player, 20000);
  assert.equal(line(32000), undefined);
  dialogue.motion({ running: 7 }, player, 43000);
  assert.equal(line(44999), undefined);
  assert.equal(line(45000).text, "我喜欢这样毫无理由的快乐。");
  const ordinary = line(89999);
  assert.equal(ordinary.text, "到处都是雪，我想玩一整天。");
  assert.equal(line(90000), undefined);
  assert.equal(line(89999 + ordinary.duration + 1500).text, "如果回忆有形状，我希望它是一朵不会融化的雪花。");
});

test("ice keeps airborne snow dance and suppresses footsteps, landing powder and blooms", () => {
  const { root, trail, streams, frame } = scenario(WINTER_LAKE.x, WINTER_LAKE.z);
  const powder = root.children.find(child => child.isPoints && child.geometry.attributes.position.count === 220);
  frame(0, 0, { landed: true });
  assert(!powder.material.visible);
  for (let i = 0; i < 130; i++) {
    const a = i * .025;
    frame(Math.cos(a) * pace, Math.sin(a) * pace);
    assert(!powder.material.visible);
    assert.equal(trail.count, 0);
  }
  assert(streams.every(batch => batch.material.visible));
});

test("whale guidance takes the next free slot, repeats, and slows only after playback", () => {
  const player = { x: -46, z: 10 };
  const dialogue = createWinterDialogue({ flower: true }, { random: () => 0 });
  const tip = "想听听鲸鱼的声音吗？点点它试试。";
  let visible = false;
  const line = (now, available = true) =>
    dialogue.line(player, now, { available, playing: false, whaleReady: () => visible });

  dialogue.enter(0);
  const welcome = line(0);
  dialogue.whaleCue({ type: "approach" });
  visible = true;
  assert.equal(line(welcome.duration), undefined);
  assert.equal(line(7000, false), undefined);
  const first = line(7100);
  assert.equal(first.text, tip);
  assert.equal(line(7100 + first.duration + 1500).text, "看，天空里有什么！");
  assert.equal(line(27099), undefined);
  assert.equal(line(27100).text, tip);
  dialogue.hearWhale(30000);
  assert.equal(line(45000).text, "到处都是雪，我想玩一整天。");
  assert.equal(line(55999), undefined);
  visible = false;
  assert.equal(line(62000), undefined);
  visible = true;
  assert.equal(line(63000).text, tip);
  dialogue.leave();
  assert.equal(line(70000), undefined);
  dialogue.enter(71000);
  line(71000);
  assert.equal(line(78000).text, tip);
});

test("ordinary winter dialogue rotates without depending on movement or music", () => {
  const player = { x: -46, z: 10 };
  const dialogue = createWinterDialogue({ flower: true }, { random: () => 0 });
  dialogue.enter(0);
  const read = now => dialogue.line(player, now, { available: true, playing: true });
  read(0);
  const expected = [
    "到处都是雪，我想玩一整天。",
    "要是跑累了，我们就躺在雪地上吧。",
    "要不要再陪我跑一圈？",
    "奇怪，明明什么都没做，却觉得好开心。",
    "它那么大，声音却那么温柔。",
    "要是我也会飞，就能和它一起玩了。",
    "我的小脚都快跟不上我啦。",
    "你来之前，我已经偷偷玩了好久。",
  ];
  const ordinary = [];
  for (let now = 1000; now < 450000 && ordinary.length < expected.length; now += 500) {
    const entry = read(now);
    if (expected.includes(entry?.text)) ordinary.push(entry.text);
  }
  assert.deepEqual(ordinary, expected);
});
