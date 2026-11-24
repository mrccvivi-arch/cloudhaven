import assert from "node:assert/strict";
import test from "node:test";
import { createAffection } from "../src/affection.js";
import { createFirstMeeting } from "../src/first-meeting.js";
import { HOME, skyStartPoint } from "../src/map.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { loadGame, readSave, saveGame } from "../src/save.js";

const ready = { nearby: true, idle: true, available: true, canSee: () => true };

test("the invitation waits two seconds, lasts six seconds and repeats only after 60 seconds at rest", () => {
  const meeting = createFirstMeeting(readSave(null));
  assert.equal(meeting.update(0, ready), false);
  assert.equal(meeting.hasPriority(true), true);
  assert.equal(meeting.update(1999, ready), false);
  assert.equal(meeting.update(2000, ready), true);
  assert.equal(meeting.elapsed(7999), 5999);
  assert.equal(meeting.elapsed(8000), undefined);
  assert.equal(meeting.update(61999, ready), false);
  assert.equal(meeting.update(62000, { ...ready, idle: false }), false);
  assert.equal(meeting.update(63000, { ...ready, nearby: false }), false);
  assert.equal(meeting.update(64000, ready), true);
  assert.equal(meeting.update(65000, { ...ready, nearby: false }), false);
  assert.equal(meeting.elapsed(65000), undefined);
});

test("refreshing before a touch permits the invitation and a completed meeting survives refresh and layer changes", () => {
  let stored;
  const storage = { getItem: () => stored ?? null, setItem: (_, value) => { stored = value; } };
  const original = loadGame(storage);
  createFirstMeeting(original).update(0, ready);
  saveGame(storage, original);
  const refreshed = loadGame(storage);
  const meeting = createFirstMeeting(refreshed);
  meeting.update(0, ready);
  assert.equal(meeting.update(2000, ready), true);
  assert.equal(meeting.meet(), true);
  const result = createAffection(refreshed.affection, () => 0)
    .touch({ night: false, energy: 100, now: new Date("2026-11-24T12:00:00Z") });
  assert.equal(result.points, 3);
  assert.equal(meeting.meet(), false);
  saveGame(storage, refreshed);
  const completed = loadGame(storage);
  assert.equal(completed.hasMetMoon, true);
  assert.equal(completed.affection.affectionPoints, 3);
  const revisit = createFirstMeeting(completed);
  revisit.update(0, { ...ready, nearby: false });
  assert.equal(revisit.update(2000, ready), false);
});

test("legacy affection history migrates without changing counters or explicit flags", () => {
  const original = { inventory: { wood: 4 }, affection: { lastTouchAt: 1795521600000 } };
  const result = readSave(original);
  assert.equal(result.hasMetMoon, true);
  assert.equal(result.materials.branch, 0);
  assert.equal(result.affection.lastTouchAt, original.affection.lastTouchAt);
  assert.equal(readSave({ affection: { affectionPoints: 12 } }).hasMetMoon, true);
  assert.equal(readSave({ affection: { lastGinkgoDialogueId: "ginkgo-2" } }).hasMetMoon, true);
  assert.equal(readSave({ ...original, hasMetMoon: false }).hasMetMoon, false);
  assert.equal(readSave({ inventory: { wood: 4 } }).hasMetMoon, false);
});

test("movement and jumping can continue while the invitation is active, and arrival in the sky hides it", () => {
  const state = readSave(null);
  const meeting = createFirstMeeting(state);
  const player = spawnPlayer(HOME);
  meeting.update(0, ready);
  assert.equal(meeting.update(2000, ready), true);
  const initialX = player.x;
  movePlayer(player, .25, 0, .016);
  assert.ok(player.x > initialX);
  assert.equal(jump(player), true);
  meeting.update(2100, { ...ready, idle: false });
  assert.notEqual(meeting.elapsed(2100), undefined);
  const skyPlayer = spawnPlayer(skyStartPoint);
  meeting.update(2200, { ...ready, nearby: skyPlayer.layer === "ground" });
  assert.equal(meeting.elapsed(2200), undefined);
  assert.equal(state.hasMetMoon, false);
});
