import assert from "node:assert/strict";
import test from "node:test";
import { AFFECTION_RULES, LEVELS, affectionLevel, createAffection, readAffection } from "../src/affection.js";
import { DIALOGUE, FIRST_MEETING, SPECIAL_DIALOGUE } from "../src/dialogue.js";
import { readSave } from "../src/save.js";

const start = new Date(2026, 10, 23, 12);
const turn = (seconds = 0, overrides = {}) => ({
  now: new Date(start.getTime() + seconds * 1000), night: false, energy: 100, ...overrides,
});

test("first meeting is ordered and only charges one touch across restores", () => {
  let state = readAffection(null);
  let manager = createAffection(state, () => 0);
  assert.equal(manager.touch(turn()).intro, FIRST_MEETING[0]);
  assert.equal(state.affectionPoints, 3);
  state = readAffection(JSON.parse(JSON.stringify(state)));
  manager = createAffection(state, () => 0);
  assert.equal(manager.touch(turn(4)).intro, FIRST_MEETING[0]);
  assert.equal(manager.advanceIntro(), FIRST_MEETING[1]);
  state = readSave({ affection: state, moonlightEnergy: 47 }).affection;
  manager = createAffection(state, () => 0);
  assert.equal(manager.introLine(), FIRST_MEETING[1]);
  assert.equal(manager.advanceIntro(), FIRST_MEETING[2]);
  assert.equal(manager.advanceIntro(), undefined);
  assert.equal(state.affectionPoints, 3);
  assert.equal(state.firstMeetingCompleted, true);
  assert.equal(manager.touch(turn(6)).text, DIALOGUE[0][0]);
});

test("the shared save preserves the cooldown and caps daily touch gain at 16", () => {
  let state = readAffection({ firstMeetingCompleted: true });
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
  const state = readAffection({ affectionPoints: 2499, firstMeetingCompleted: true });
  const manager = createAffection(state, () => .85);
  assert.deepEqual(manager.touch(turn()), { text: DIALOGUE[5][0], level: 6, points: 3, upgraded: true });
  assert.ok(DIALOGUE[5].includes(manager.touch(turn(8)).text));
  assert.ok(DIALOGUE.slice(0, 5).flat().includes(createAffection(state, () => .1).touch(turn(16)).text));
  const first = manager.touch(turn(24)).text;
  assert.notEqual(manager.touch(turn(32)).text, first);
});

test("contextual lines are prioritized and limited without extra affection", () => {
  const state = readAffection({ firstMeetingCompleted: true, lastTouchDate: "2026-11-19" });
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
