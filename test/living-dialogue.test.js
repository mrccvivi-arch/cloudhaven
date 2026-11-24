import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAffection, readAffection, STAGE_LINES } from "../src/affection.js";
import { DIALOGUE, GINKGO_DIALOGUE, LIVING_DIALOGUE } from "../src/dialogue.js";
import { MOON_LINES } from "../src/moon-lines.js";
import { createGinkgoInteraction } from "../src/ginkgo-interaction.js";
import { beijingDialogueTime, createLivingDialogue } from "../src/living-dialogue.js";
import { GOLDEN_GINKGO } from "../src/map.js";

const beforeMidnight = Date.parse("2026-11-24T15:59:59.999Z");
const midnight = beforeMidnight + 1;
const morning = Date.parse("2026-11-25T00:00:00Z");
const available = { blocked: false, idle: true, night: false, level: 2 };

function memoryStorage() {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}

function session(storage, { now = () => morning, random = () => 0, canSee = () => true } = {}) {
  const lines = [];
  const dialogue = createLivingDialogue({ storage: () => storage, wallTime: now, random, canSee,
    show: (line, time) => lines.push({ line, time }) });
  return { dialogue, lines };
}

test("Beijing time rolls over at UTC 16:00 and ignores the device time zone", () => {
  const dates = [beforeMidnight, midnight, morning,
    Date.parse("2026-11-25T04:00:00Z"), Date.parse("2026-11-25T10:00:00Z")];
  const expected = [
    { date: "2026-11-24", hour: 23, period: "night" },
    { date: "2026-11-25", hour: 0, period: "night" },
    { date: "2026-11-25", hour: 8, period: "morning" },
    { date: "2026-11-25", hour: 12, period: "afternoon" },
    { date: "2026-11-25", hour: 18, period: "evening" },
  ];
  assert.deepEqual(dates.map(beijingDialogueTime), expected);
  const previousZone = process.env.TZ;
  try {
    for (const [zone, localHour] of [["America/Los_Angeles", 8], ["Asia/Shanghai", 0], ["Pacific/Auckland", 5]]) {
      process.env.TZ = zone;
      assert.equal(new Date(midnight).getHours(), localHour);
      assert.deepEqual(dates.map(beijingDialogueTime), expected);
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

const line = (id) => MOON_LINES.find((entry) => entry.id === id);
const text = (number) => line(number <= 38 ? `F${String(number).padStart(2, "0")}` : `BASE-${String(number - 38).padStart(2, "0")}`).text;

test("entry waits for visibility and interactions and automatic cooldown survives reload", () => {
  let visible = false;
  let now = morning;
  const options = { now: () => now, canSee: () => visible };
  const storage = memoryStorage();
  const { dialogue, lines } = session(storage, options);
  dialogue.update(0, available);
  visible = true;
  dialogue.update(1000, available);
  dialogue.update(3900, available);
  dialogue.update(4200, { ...available, blocked: true });
  assert.equal(lines.length, 0);
  dialogue.update(4500, available);
  assert.deepEqual(lines, [{ line: text(1), time: 4500 }]);
  const refreshed = session(storage, options);
  now += 44_999;
  refreshed.dialogue.update(600, available);
  assert.equal(refreshed.lines.length, 0);
  now++;
  refreshed.dialogue.update(1000, available);
  refreshed.dialogue.update(4000, available);
  assert.equal(refreshed.lines.length, 1);
  assert.ok(![text(1), text(2)].includes(refreshed.lines[0].line));

  const state = readAffection(null);
  const result = createAffection(state, () => 0).touch({
    night: false, energy: 80, now: new Date(now), extra: dialogue.ordinaryTouch,
  });
  assert.equal(result.text, text(32));
  dialogue.rememberTouch(result.text);
  assert.equal(state.affectionPoints, 3);
  assert.equal(readAffection(state).lastDialogueId, "F32");
  assert.equal(dialogue.ordinaryTouch(), undefined);
});

test("the daily welcome never repeats on refresh and a three-day difference can yield the reunion", () => {
  const storage = memoryStorage();
  let now = morning;
  function entry() {
    const { dialogue, lines } = session(storage, { now: () => now });
    const context = { ...available, lastTouchDate: "2026-11-26" };
    dialogue.update(0, context);
    dialogue.update(3000, context);
    return lines[0]?.line;
  }
  assert.equal(entry(), text(1));
  now += 46_000;
  assert.notEqual(entry(), text(1));
  now += 86_400_000;
  assert.equal(entry(), text(2));
  now += 3 * 86_400_000;
  assert.equal(entry(), text(3));
});

test("context dialogue consults the active scene, phase and actual nearby nature", () => {
  function select(context, random = () => 0) {
    const storage = memoryStorage();
    storage.setItem("cloudhaven-living-dialogue-v1", JSON.stringify({ meetingDate: "2026-11-25", seed: 1 }));
    const { dialogue, lines } = session(storage, { random });
    dialogue.update(0, { ...available, ...context });
    dialogue.update(6000, { ...available, ...context });
    return lines[0].line;
  }
  assert.equal(select({ features: () => ({ butterfly: true }) }), text(16));
  assert.equal(select({ night: true, features: () => ({ firefly: true }) }), text(17));
  assert.equal(select({ features: () => ({ newFlower: true }) }), text(18));
  assert.equal(select({ features: () => ({ mushroom: true }) }), text(21));
  assert.equal(select({ scene: "sky", night: true }), text(12));
  const nature = [12, 13, 14, 15, 16, 17, 18, 20, 21, 22].map(text);
  assert.ok(!nature.includes(select({ features: () => ({ firefly: true }) })));
  assert.ok(![text(5), ...nature].includes(select({ night: true, features: () => ({}) })));
});

test("dedicated idle lines require a sustained pause, and recent context cannot repeat on re-entry", () => {
  const storage = memoryStorage();
  let now = morning;
  const { dialogue, lines } = session(storage, { now: () => now });
  const butterfly = { ...available, features: () => ({ butterfly: true }) };
  dialogue.update(0, butterfly);
  dialogue.update(3000, butterfly);
  now += 45_000;
  dialogue.update(48_000, butterfly);
  assert.equal(lines.at(-1).line, text(16));
  now += 45_000;
  dialogue.update(93_000, butterfly);
  assert.ok([text(33), text(34), line("B18").text].includes(lines.at(-1).line));
});

test("ginkgo welcomes have priority and touch remains exclusive to the ginkgo pool", () => {
  const ginkgo = createGinkgoInteraction(() => 0);
  const { dialogue, lines } = session(memoryStorage(), { now: () => midnight });
  ginkgo.update({ ...GOLDEN_GINKGO, layer: "ground" });
  assert.equal(dialogue.welcomeGinkgo(1000, () => ginkgo.welcome(false)), true);
  assert.equal(lines[0].line, text(44));
  dialogue.update(4000, { ...available, ginkgo: true });
  assert.equal(lines.length, 1);
  assert.ok([text(10), text(11), ...GINKGO_DIALOGUE].includes(ginkgo.touch(dialogue.ginkgoTouch)));
  ginkgo.update({ ...GOLDEN_GINKGO, layer: "sky" });
  assert.equal(ginkgo.touch(dialogue.ginkgoTouch), undefined);
});

test("Beijing ecology history compares only with a recorded previous day", () => {
  const storage = memoryStorage();
  let now = beforeMidnight;
  const make = () => session(storage, { now: () => now }).dialogue;
  const start = make();
  assert.deepEqual(start.forestDay(), { date: "2026-11-24", previousDate: undefined });
  now = midnight;
  assert.deepEqual(start.forestDay(), { date: "2026-11-25", previousDate: "2026-11-24" });
  assert.deepEqual(make().forestDay(), start.forestDay());
  assert.equal(make().seed, start.seed);
  now += 2 * 86_400_000;
  assert.deepEqual(make().forestDay(), { date: "2026-11-27", previousDate: undefined });
});

test("all 133 confirmed lines match the acceptance transcript, stages and unique runtime entries", () => {
  const fixture = readFileSync(new URL("./fixtures/moon-confirmed-lines.txt", import.meta.url), "utf8").trimEnd().split("\n");
  assert.equal(fixture.length, 133);
  assert.equal(MOON_LINES.length, 133);
  assert.equal(new Set(MOON_LINES.map(({ id }) => id)).size, 133);
  assert.equal(new Set(MOON_LINES.map(({ text }) => text)).size, 133);
  for (const row of fixture) {
    const split = row.indexOf(" ");
    const id = row.slice(0, split);
    assert.equal(line(id)?.text, row.slice(split + 1), id);
    const stage = /^[A-E][0-9]+$/.test(id)
      ? "ABCDE".indexOf(id[0]) + 1 + (id[0] === "E" && Number(id.slice(1)) >= 16 ? 1 : 0) : undefined;
    if (stage) assert.equal(line(id).minLevel, stage, id);
  }
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((stage) => MOON_LINES.filter((line) => line.stage === stage && !line.id.startsWith("BASE-")).length), [18, 12, 16, 16, 11, 11]);
  for (const [stage, entries] of STAGE_LINES.entries()) {
    for (const text of DIALOGUE[stage]) assert.ok(entries.some((entry) => entry.text === text), text);
    assert.equal(new Set(entries.map(({ text }) => text)).size, entries.length);
    if (stage === 0) for (const id of ["BASE-01", "BASE-02", "BASE-03"]) {
      assert.equal(entries.filter((entry) => entry.id === id).length, 1);
    }
  }
});

test("unheard and older lines take precedence over recent ones, with bounded persistent history", () => {
  const storage = memoryStorage();
  const oldDate = "2026-11-17";
  const today = "2026-11-25";
  const history = Array.from({ length: 250 }, (_, index) => ({ line: `legacy-${index}`, time: morning, date: today }));
  // With the meeting already shown, make every eligible daily line recent except one.
  const recent = [
    ...MOON_LINES.filter(({ trigger, phase, scene }) => trigger === "daily" && phase !== "night" && scene !== "sky"),
    ...LIVING_DIALOGUE.general.map((text) => ({ text })),
    ...LIVING_DIALOGUE.morning.map((text) => ({ text })),
  ].map(({ text: line }) => ({ line, date: line === text(24) ? oldDate : today, time: morning }));
  storage.setItem("cloudhaven-living-dialogue-v1", JSON.stringify({ seed: 1, meetingDate: today, history: [...history, ...recent] }));
  const { dialogue, lines } = session(storage, { random: () => .40 });
  dialogue.update(0, available);
  dialogue.update(6000, available);
  assert.equal(lines[0].line, text(24));
  assert.ok(JSON.parse(storage.getItem("cloudhaven-living-dialogue-v1")).history.length <= 240);
});

const key = "cloudhaven-living-dialogue-v1";
const date = "2026-11-25";

function skipMeeting(extra) {
  const storage = memoryStorage();
  storage.setItem(key, JSON.stringify({ seed: 42, meetingDate: date, ...extra }));
  return storage;
}

test("the automatic three-line memory and early acquaintance play in order and require their context", () => {
  const context = { ...available, met: true, daysKnown: 4 };
  const storage = skipMeeting();
  const { dialogue, lines } = session(storage);
  dialogue.update(0, context);
  dialogue.update(3000, context);
  dialogue.update(8000, context);
  assert.deepEqual(lines.map(({ line }) => line), [line("AUTO-01").text]);
  dialogue.update(8300, context);
  dialogue.update(13600, context);
  assert.deepEqual(lines.map(({ line }) => line), ["AUTO-01", "AUTO-02", "AUTO-03"].map((id) => line(id).text));
  const recent = session(storage, { now: () => morning + 46_000 });
  recent.dialogue.update(0, context);
  recent.dialogue.update(3000, context);
  assert.notEqual(recent.lines[0].line, line("AUTO-01").text);

  const early = session(skipMeeting());
  early.dialogue.update(0, { ...available, level: 1 });
  early.dialogue.update(3000, { ...available, level: 1 });
  early.dialogue.update(8300, { ...available, level: 1 });
  assert.deepEqual(early.lines.map(({ line }) => line), ["A95", "A96"].map((id) => line(id).text));

  const interrupted = session(skipMeeting());
  interrupted.dialogue.update(0, context);
  interrupted.dialogue.update(3000, context);
  interrupted.dialogue.update(5000, { ...context, blocked: true, interrupted: true });
  interrupted.dialogue.update(8300, context);
  assert.equal(interrupted.lines.length, 1);

  const tooSoon = session(skipMeeting());
  tooSoon.dialogue.update(0, { ...context, daysKnown: 3 });
  tooSoon.dialogue.update(3000, { ...context, daysKnown: 3 });
  assert.ok(!["AUTO-01", "AUTO-02", "AUTO-03"].map((id) => line(id).text).includes(tooSoon.lines[0].line));
});

test("automatic daily lines play without a touch, and secrets only follow an eligible invitation", () => {
  function make(id, level, random = .35) {
    const recent = [
      ...MOON_LINES.filter((entry) => entry.trigger === "daily" && entry.id !== id).map(({ text }) => text),
      ...Object.values(LIVING_DIALOGUE).flat(),
    ].map((entry) => ({ line: entry, date, time: morning - 1000 }));
    const history = recent.filter((entry) => entry.line !== line(id).text);
    const result = session(skipMeeting({ history }), { random: () => random });
    result.dialogue.update(0, { ...available, level });
    result.dialogue.update(6000, { ...available, level });
    return result;
  }
  assert.equal(make("AUTO-04", 2).lines[0].line, line("AUTO-04").text);
  // A high roll for stage selection and a low later roll permit the rarer line.
  const history = [...MOON_LINES.filter(({ trigger, id }) => trigger === "daily" && id !== "AUTO-05").map(({ text }) => text),
    ...Object.values(LIVING_DIALOGUE).flat()].map((text) => ({ line: text, date, time: morning - 1 }));
  const values = [.40, .40, .10, .40, .40, .40, .40];
  const rare = session(skipMeeting({ history }), { random: () => values.shift() ?? .40 });
  rare.dialogue.update(0, available);
  rare.dialogue.update(6000, available);
  assert.equal(rare.lines[0].line, line("AUTO-05").text);

  const low = make("F31", 3);
  assert.notEqual(low.lines[0].line, text(31));
  assert.equal(low.dialogue.pendingTouch(3), undefined);
  const high = make("F31", 4);
  assert.equal(high.lines[0].line, text(31));
  assert.ok(["D1", "D2", "D3", "D4"].includes(high.dialogue.pendingTouch(4).id));
  assert.equal(high.dialogue.pendingTouch(4), undefined);
  const moved = make("F31", 4);
  moved.dialogue.update(7000, { ...available, scene: "sky" });
  assert.equal(moved.dialogue.pendingTouch(4), undefined);
});

test("C7 follows C6 only on an effective touch and expires if the player does not continue", () => {
  let now = morning;
  const { dialogue } = session(skipMeeting(), { now: () => now });
  const state = readAffection({ affectionPoints: 52 });
  const affection = createAffection(state, () => 0);
  const touch = () => affection.touch({ now: new Date(now), night: false, energy: 100,
    pending: dialogue.pendingTouch, pick: (pool) => pool.find(({ id }) => id === "C6") ?? pool[0] });
  const first = touch();
  assert.equal(first.text, line("C6").text);
  dialogue.rememberTouch(first.text);
  now += 1000;
  assert.equal(touch(), undefined);
  now += 1000;
  assert.equal(touch().text, line("C7").text);
  dialogue.rememberTouch(line("C6").text);
  now += 38_000;
  assert.equal(dialogue.pendingTouch(3), undefined);
});


test("the confirmed contextual IDs carry explicit eligibility restrictions", () => {
  for (const id of ["F05", "F16", "F20", "B19"]) assert.equal(line(id).phase, "day", id);
  for (const id of ["F06", "F07", "F08", "F17", "F22"]) assert.equal(line(id).phase, "night", id);
  for (const [id, feature] of Object.entries({ F16: "butterfly", F20: "butterfly", F17: "firefly",
    F22: "firefly", F18: "newFlower", F21: "mushroom" })) assert.equal(line(id).feature, feature, id);
  for (const id of ["F10", "F11"]) assert.equal(line(id).trigger, "ginkgo", id);
  for (const id of ["F12", "F13", "F14", "F15"]) {
    assert.equal(line(id).scene, "sky", id);
    assert.equal(line(id).openSky, true, id);
  }
  assert.equal(line("F09").nightScene, "sky");
  assert.equal(line("F19").scene, "forest");
  assert.equal(line("A45").moving, true);
  assert.equal(line("B1").met, true);
  assert.equal(line("C25").daysKnown, 2);
  assert.equal(line("F31").minLevel, 4);
  assert.equal(line("F32").trigger, "touch");
});
