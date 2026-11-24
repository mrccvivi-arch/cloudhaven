import assert from "node:assert/strict";
import test from "node:test";
import { createAffection, readAffection } from "../src/affection.js";
import { GINKGO_DIALOGUE, LIVING_DIALOGUE } from "../src/dialogue.js";
import { MOON_LINES } from "../src/moon-lines.js";
import { createGinkgoInteraction } from "../src/ginkgo-interaction.js";
import { beijingDialogueTime, createLivingDialogue } from "../src/living-dialogue.js";
import { GOLDEN_GINKGO } from "../src/map.js";

const beforeMidnight = Date.parse("2026-11-24T15:59:59.999Z");
const midnight = beforeMidnight + 1;
const morning = Date.parse("2026-11-25T00:00:00Z");
const available = { blocked: false, idle: true, night: false };

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

const text = (number) => MOON_LINES[number - 1].text;

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
  assert.equal(readAffection(state).lastDialogueId, "moon-32");
  assert.equal(dialogue.ordinaryTouch(), undefined);
});

test("the daily welcome never repeats on refresh and a three-day difference can yield the reunion", () => {
  const storage = memoryStorage();
  let now = morning;
  function entry() {
    const { dialogue, lines } = session(storage, { now: () => now });
    dialogue.update(0, available);
    dialogue.update(3000, available);
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
  assert.equal(lines.at(-1).line, text(33));
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

test("all 44 official lines have unique IDs and original stored texts", () => {
  assert.equal(MOON_LINES.length, 44);
  assert.equal(new Set(MOON_LINES.map(({ text }) => text)).size, 44);
  assert.deepEqual(MOON_LINES.map(({ id }) => id), Array.from({ length: 44 }, (_, index) => `moon-${index + 1}`));
  assert.deepEqual(MOON_LINES.slice(38).map(({ text }) => text), [
    "你好，我是月。", "我的能量来自月亮。", "可人类，你不一样，你得晒太阳。",
    "摸摸我的耳朵", "我今天还没去云岛", "你来啦",
  ]);
});

test("unheard and older lines take precedence over recent ones, with bounded persistent history", () => {
  const storage = memoryStorage();
  const oldDate = "2026-11-17";
  const today = "2026-11-25";
  const history = Array.from({ length: 170 }, (_, index) => ({ line: `legacy-${index}`, time: morning, date: today }));
  // With the meeting already shown, make every eligible daily line recent except one.
  const recent = [
    ...MOON_LINES.filter(({ trigger, phase, scene }) => trigger === "daily" && phase !== "night" && scene !== "sky"),
    ...LIVING_DIALOGUE.general.map((text) => ({ text })),
    ...LIVING_DIALOGUE.morning.map((text) => ({ text })),
  ].map(({ text: line }) => ({ line, date: line === text(24) ? oldDate : today, time: morning }));
  storage.setItem("cloudhaven-living-dialogue-v1", JSON.stringify({ seed: 1, meetingDate: today, history: [...history, ...recent] }));
  const { dialogue, lines } = session(storage);
  dialogue.update(0, available);
  dialogue.update(3000, available);
  assert.equal(lines[0].line, text(24));
  assert.ok(JSON.parse(storage.getItem("cloudhaven-living-dialogue-v1")).history.length <= 160);
});
