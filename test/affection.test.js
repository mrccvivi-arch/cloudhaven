import assert from "node:assert/strict";
import test from "node:test";
import { AFFECTION_RULES, LEVELS, affectionLevel, createAffection, readAffection } from "../src/affection.js";
import { DIALOGUE, SPECIAL_DIALOGUE } from "../src/dialogue.js";
import { readSave } from "../src/save.js";

const start = new Date(2026, 10, 23, 12);
const turn = (seconds = 0, overrides = {}) => ({
  now: new Date(start.getTime() + seconds * 1000), night: false, energy: 100, ...overrides,
});

test("the first touch gives the same uniformly sampled daily dialogue, even on a low-energy night", () => {
  assert.deepEqual(DIALOGUE[0], [
    "你好，我是月。", "我的能量来自月亮。", "可人类，你不一样，你得晒太阳。",
    "你在摸我吗？", "我的耳朵是真的，不是装饰。", "你为什么总是用手打招呼？",
    "你也住在这片森林里吗？", "我还不太认识你。不过没关系。",
    "你身上有太阳的味道。大概吧。", "我的耳朵今天很听话。",
  ]);
  DIALOGUE[0].forEach((text, index) => {
    const state = readAffection(null);
    const manager = createAffection(state, () => (index + .5) / DIALOGUE[0].length);
    assert.equal(manager.touch(turn(0, { night: true, energy: 3 })).text, text);
    assert.equal(state.affectionPoints, 3);
  });
});

test("legacy introductions are discarded while touch counts and previous dialogue stay valid", () => {
  const { affection, moonlightEnergy } = readSave({
    affection: { firstMeetingProgress: 1, firstMeetingStarted: true, firstMeetingCompleted: false,
      affectionPoints: 6, dailyTouchCount: 2, dailyTouchDate: "2026-11-23",
      lastTouchDate: "2026-11-23", lastDialogueId: "level-1-1" },
    moonlightEnergy: 47,
  });
  assert.ok(!Object.keys(affection).some((key) => key.startsWith("firstMeeting")));
  assert.equal(affection.dailyTouchCount, 2);
  assert.equal(affection.affectionPoints, 6);
  assert.equal(moonlightEnergy, 47);
  assert.equal(createAffection(affection, () => .37).touch(turn()).text, "我的耳朵是真的，不是装饰。");
  assert.equal(readAffection({ lastDialogueId: "level-1-4" }).lastDialogueId, null);
});

test("the shared save preserves the cooldown and caps daily touch gain at 16", () => {
  let state = readAffection(null);
  let manager = createAffection(state, () => 0);
  assert.equal(manager.touch(turn()).points, 3);
  manager = createAffection(state, () => 0);
  assert.equal(manager.touch(turn(1)), undefined);
  for (let i = 1; i < 12; i++) assert.equal(manager.touch(turn(i * 8)).points, i < 3 ? 3 : i < 10 ? 1 : 0);
  assert.equal(state.affectionPoints, 16);
  assert.equal(state.dailyTouchCount, AFFECTION_RULES.rewardedTouches);
  state = readSave({ affection: state, inventory: { wood: 3 }, moonlightEnergy: 53 }).affection;
  manager = createAffection(state, () => 0);
  assert.equal(manager.touch(turn(120)).points, 0);
  assert.equal(manager.touch(turn(0, { now: new Date(2026, 10, 24, 12) })).points, 3);
  assert.equal(state.affectionPoints, 19);
});

test("all levels unlock, current and older lines are selectable, and upgrades prefer a new line", () => {
  for (const [index, level] of LEVELS.entries()) {
    assert.equal(affectionLevel(level.minimum), index + 1);
    if (index) assert.equal(affectionLevel(level.minimum - 1), index);
    assert.ok(DIALOGUE[index].length >= 7);
  }
  const state = readAffection({ affectionPoints: 2499 });
  const manager = createAffection(state, () => .85);
  assert.deepEqual(manager.touch(turn()), { text: DIALOGUE[5][0], level: 6, points: 3, upgraded: true });
  assert.ok(DIALOGUE[5].includes(manager.touch(turn(8)).text));
  assert.ok(DIALOGUE.slice(0, 5).flat().includes(createAffection(state, () => .1).touch(turn(16)).text));
  const first = manager.touch(turn(24)).text;
  assert.notEqual(manager.touch(turn(32)).text, first);
});

test("contextual lines are prioritized and limited without extra affection", () => {
  const state = readAffection({ lastTouchDate: "2026-11-19" });
  const manager = createAffection(state, () => .94);
  assert.equal(manager.touch(turn()).text, SPECIAL_DIALOGUE.reunited);
  assert.equal(manager.touch(turn(2, { night: true, energy: 5 })).text, SPECIAL_DIALOGUE.lowEnergy);
  assert.notEqual(manager.touch(turn(4, { night: true, energy: 5 })).text, SPECIAL_DIALOGUE.lowEnergy);
  assert.equal(manager.touch(turn(4.3)), undefined);
  assert.equal(manager.touch(turn(4.6)).text, SPECIAL_DIALOGUE.busy);
  assert.equal(manager.touch(turn(4.8)), undefined);
  assert.equal(state.affectionPoints, 9);

  const legacy = readSave({ moonlightEnergy: 13, inventory: { wood: 2 }, affection: { dailyTouchDate: "2026-02-30", dailyTouchCount: 99, affectionPoints: -50 } });
  assert.equal(legacy.affection.affectionPoints, 0);
  assert.equal(legacy.affection.dailyTouchCount, 0);
  assert.equal(legacy.moonlightEnergy, 13);
  assert.equal(legacy.inventory.wood, 2);
});
