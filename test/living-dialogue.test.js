import assert from "node:assert/strict";
import test from "node:test";
import { createAffection, readAffection } from "../src/affection.js";
import { LIVING_DIALOGUE } from "../src/dialogue.js";
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

test("entry waits for visibility and interactions, then idle chatter waits at least 90 seconds", () => {
  let visible = false;
  const affection = readAffection(null);
  const { dialogue, lines } = session(memoryStorage(), { canSee: () => visible });
  dialogue.update(0, available);
  visible = true;
  dialogue.update(1000, available);
  dialogue.update(3999, available);
  assert.equal(lines.length, 0);
  dialogue.update(4000, { ...available, blocked: true });
  assert.equal(lines.length, 0);
  dialogue.update(5000, available);
  assert.deepEqual(lines.map(({ time }) => time), [5000]);
  dialogue.update(94_999, available);
  assert.equal(lines.length, 1);
  dialogue.update(95_000, { ...available, idle: false });
  dialogue.update(100_000, available);
  dialogue.update(115_000, available);
  assert.deepEqual(lines.map(({ time }) => time), [5000, 115_000]);
  assert.equal(affection.affectionPoints, 0);
  const response = createAffection(affection, () => 0).touch({ night: false, energy: 80, now: new Date(morning) });
  assert.equal(response.points, 3);
  dialogue.rememberTouch(response.text);
  assert.equal(affection.affectionPoints, 3);
});

test("refreshes avoid all lines heard that day and the daily candidate group changes at midnight", () => {
  function drawDay(storage, date) {
    return Array.from({ length: 10 }, () => {
      const { dialogue, lines } = session(storage, { now: () => date });
      dialogue.update(0, available);
      dialogue.update(3000, available);
      return lines[0].line;
    });
  }
  const today = drawDay(memoryStorage(), morning);
  assert.equal(new Set(today).size, today.length);
  assert.deepEqual(drawDay(memoryStorage(), morning), today);
  assert.notDeepEqual(drawDay(memoryStorage(), morning + 86_400_000), today);
});

test("sky visits persist over refresh, reset at Beijing midnight, and update during a stay", () => {
  const storage = memoryStorage();
  let now = beforeMidnight;
  const options = { now: () => now, random: () => .999 };
  const first = session(storage, options);
  first.dialogue.recordSkyVisit();
  const night = { ...available, night: true };
  function entry() {
    const { dialogue, lines } = session(storage, options);
    dialogue.update(0, night);
    dialogue.update(6000, night);
    return lines[0].line;
  }
  assert.notEqual(entry(), LIVING_DIALOGUE.beforeSkyVisit);
  now = midnight;
  // Start with a copy of yesterday's visit to exercise both returning and staying in the islands.
  const serialized = storage.getItem("cloudhaven-living-dialogue-v1");
  assert.equal(entry(), LIVING_DIALOGUE.beforeSkyVisit);
  storage.setItem("cloudhaven-living-dialogue-v1", serialized);
  first.dialogue.recordSkyVisit();
  assert.notEqual(entry(), LIVING_DIALOGUE.beforeSkyVisit);
});

test("ginkgo welcomes retain priority and conflicting game phases use general conversation", () => {
  const ginkgo = createGinkgoInteraction(() => 0);
  const { dialogue, lines } = session(memoryStorage(), { now: () => midnight });
  dialogue.update(0, available);
  ginkgo.update({ ...GOLDEN_GINKGO, layer: "ground" });
  assert.equal(ginkgo.welcome(false), true);
  dialogue.update(4000, { ...available, blocked: ginkgo.inside });
  assert.equal(lines.length, 0);
  assert.ok(ginkgo.touch());
  ginkgo.update({ ...GOLDEN_GINKGO, layer: "sky" });
  dialogue.update(5000, { ...available, blocked: ginkgo.inside });
  assert.ok(LIVING_DIALOGUE.general.includes(lines[0].line));
});
