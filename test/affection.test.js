import assert from "node:assert/strict";
import test from "node:test";
import { AFFECTION_RULES, LEVELS, STAGE_LINES, eligibleStageLine, affectionLevel, createAffection, readAffection } from "../src/affection.js";
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
  const pool = STAGE_LINES[0].filter((line) => line.trigger === "stage" || line.id.startsWith("BASE-")).filter((line) => eligibleStageLine(line, 1, { night: true }));
  pool.forEach(({ text }, index) => {
    const state = readAffection(null);
    const manager = createAffection(state, () => (index + .5) / pool.length);
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
  assert.equal(createAffection(affection, () => 0).touch(turn()).text, "你好，我是月。");
  assert.equal(readAffection({ lastDialogueId: "level-1-4" }).lastDialogueId, null);
});

test("the shared save preserves the cooldown and caps daily touch gain at 16", () => {
  let state = readAffection(null);
  let manager = createAffection(state, () => 0, false);
  assert.equal(manager.touch(turn()).points, 3);
  manager = createAffection(state, () => 0, false);
  assert.equal(manager.touch(turn(1)), undefined);
  for (let i = 1; i < 12; i++) assert.equal(manager.touch(turn(i * 8)).points, i < 3 ? 3 : i < 10 ? 1 : 0);
  assert.equal(state.affectionPoints, 16);
  assert.equal(state.dailyTouchCount, AFFECTION_RULES.rewardedTouches);
  state = readSave({ affection: state, inventory: { wood: 3 }, moonlightEnergy: 53 }).affection;
  manager = createAffection(state, () => 0, false);
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
  assert.deepEqual(LEVELS.map(({ minimum }) => minimum), [0, 16, 48, 96, 176, 288]);
  const state = readAffection({ affectionPoints: 287 });
  const manager = createAffection(state, () => .85);
  const upgraded = manager.touch(turn());
  assert.deepEqual({ ...upgraded, text: undefined }, { text: undefined, level: 6, points: 3, upgraded: true });
  assert.ok(STAGE_LINES[5].some(({ text }) => text === upgraded.text));
  const earlier = manager.touch(turn(8));
  assert.ok(STAGE_LINES.slice(0, 5).flat().some(({ text }) => text === earlier.text));
  const current = createAffection(state, () => .1).touch(turn(16));
  assert.ok(STAGE_LINES[5].some(({ text }) => text === current.text));
  const first = manager.touch(turn(24)).text;
  assert.notEqual(manager.touch(turn(32)).text, first);
});

test("contextual lines are prioritized and limited without extra affection", () => {
  const state = readAffection({ lastTouchDate: "2026-11-19" });
  const manager = createAffection(state, () => .94, false);
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
  assert.equal(legacy.materials.branch, 0);
});


test("the touch quota migrates without losing points and resets at Beijing midnight", () => {
  const before = new Date("2026-11-24T15:59:56Z");
  const state = readAffection({ affectionPoints: 999, dailyTouchDate: "2026-11-24",
    dailyTouchCount: 10, lastTouchAt: before.getTime() - 2000, lastDialogueId: "moon-32" });
  const manager = createAffection(state, () => .5, false);
  assert.equal(state.lastDialogueId, "F32");
  assert.equal(manager.touch(turn(0, { now: before })).points, 0);
  assert.equal(manager.touch(turn(0, { now: new Date("2026-11-24T16:00:00Z") })).points, 3);
  assert.equal(state.dailyTouchDate, "2026-11-25");
  assert.equal(state.affectionPoints, 1002);
  assert.equal(affectionLevel(state.affectionPoints), 6);
  assert.equal(state.firstMetDate, null);
});

test("rapid test touches retain the usual rewards and unlock stages during an active bubble", () => {
  const state = readAffection(null);
  const manager = createAffection(state, () => 0);
  const first = manager.touch(turn());
  const firstLine = state.lastDialogueId;
  const upgradedAt = [];
  assert.equal(first.points, 3);
  for (let i = 1; i < 282; i++) {
    const result = manager.touch(turn(i * .01, { quiet: true, pick: () => assert.fail("active dialogue was replaced") }));
    assert.equal(result.points, i < 3 ? 3 : 1);
    if (result.upgraded) upgradedAt.push(state.affectionPoints);
  }
  assert.deepEqual(upgradedAt, LEVELS.slice(1).map(({ minimum }) => minimum));
  assert.equal(state.lastDialogueId, firstLine);
  const line = manager.upgradeDialogue({ night: false, met: true });
  assert.ok(STAGE_LINES[5].some(({ text }) => text === line));
  assert.equal(state.dailyTouchCount, AFFECTION_RULES.rewardedTouches);
});

test("returning to normal mode keeps test progress and enforces the saved Beijing quota", () => {
  const before = Date.parse("2026-11-24T15:59:57Z");
  const state = readSave(null).affection;
  const manager = createAffection(state, () => 0);
  for (let i = 0; i < 20; i++) manager.touch(turn(0, { now: new Date(before + i * 10) }));
  const saved = readSave(JSON.parse(JSON.stringify({ affection: state }))).affection;
  assert.equal(saved.affectionPoints, 26);
  const restored = createAffection(saved, () => 0, false);
  assert.equal(restored.touch(turn(0, { now: new Date(before + 1000) })), undefined);
  assert.equal(restored.touch(turn(0, { now: new Date(before + 2200) })).points, 0);
  assert.equal(restored.touch(turn(0, { now: new Date(before + 4500) })).points, 3);
  assert.equal(saved.dailyTouchDate, "2026-11-25");
  assert.equal(saved.affectionPoints, 29);
});
