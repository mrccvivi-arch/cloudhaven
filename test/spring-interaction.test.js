import assert from "node:assert/strict";
import test from "node:test";
import { Scene } from "three";
import { createAffection } from "../src/affection.js";
import { blockingSolid } from "../src/collision.js";
import { terrainHeight } from "../src/map.js";
import { readSave } from "../src/save.js";
import { createSpringGrove } from "../src/spring-grove.js";
import { createSpringDialogue, createSpringSeat, SPRING_ENTRY_LINES, SPRING_ENVIRONMENT_LINES, SPRING_LINES } from "../src/spring-interaction.js";
import { springPoint } from "../src/spring-layout.js";

const outside = { ...springPoint(54.9, 10.2), layer: "ground", grounded: true };
const inside = { ...springPoint(59.5, 10.2), layer: "ground", grounded: true };
const bank = { ...springPoint(63.55, 11.4), layer: "ground", grounded: true };
bank.y = terrainHeight(bank.x, bank.z);

const flags = (time, others = {}) => ({
  time, wallTime: 1_000_000 + time, seated: false, night: false,
  available: () => true, canWelcome: true, ...others,
});

test("entry is saved, avoids boundary repeats and can recur after three minutes", () => {
  const state = readSave();
  const dialogue = createSpringDialogue(state.springDiscovery, outside, () => 0);
  assert.equal(dialogue.update(outside, flags(10)), undefined);
  assert.equal(dialogue.update(inside, flags(20)).text, "被你发现啦。");
  assert.equal(dialogue.update(inside, flags(30)), undefined);
  const reloaded = readSave(JSON.parse(JSON.stringify(state)));
  const afterRefresh = createSpringDialogue(reloaded.springDiscovery, inside, () => .99);
  assert.equal(afterRefresh.update(inside, flags(200_000)), undefined);
  afterRefresh.update(outside, flags(40));
  assert.equal(afterRefresh.update(inside, flags(179_000)), undefined);
  afterRefresh.update(outside, flags(180_000));
  assert.equal(afterRefresh.update(inside, flags(180_020)).text, SPRING_ENTRY_LINES.at(-1));
  assert.equal(SPRING_ENTRY_LINES.length + SPRING_LINES.length + Object.keys(SPRING_ENVIRONMENT_LINES).length, 28);
});

test("touch uses quiet lines without changing affection gains or the existing cooldown", () => {
  const { affection } = readSave();
  const relationship = createAffection(affection);
  const dialogue = createSpringDialogue({ discovered: true }, inside, () => .73);
  const first = relationship.touch({ now: new Date("2026-11-25T09:00:00Z"), quiet: true });
  assert.deepEqual(first, { level: 1, points: 3, upgraded: false });
  assert.equal(relationship.touch({ now: new Date("2026-11-25T09:00:01Z"), quiet: true }), undefined);
  assert.equal(affection.lastDialogueId, null);
  assert.notEqual(dialogue.touch(false), SPRING_LINES[13]);
  assert.equal(dialogue.touch(true), SPRING_LINES[13]);
  assert.notEqual(dialogue.touch(true), SPRING_LINES[13]);
});

test("seating eases onto the real rock surface and returns to a saveable safe bank", () => {
  const grove = createSpringGrove(new Scene(), true);
  const player = { ...bank };
  const seat = createSpringSeat();
  assert.equal(blockingSolid("ground", bank.x, bank.y, bank.z), undefined);
  assert.equal(seat.sit(player, grove.perch), true);
  seat.update(player, .15);
  assert.equal(seat.settled, false);
  assert.notEqual(player.y, bank.y);
  assert.equal(seat.poseForSave.y, bank.y);
  seat.update(player, .5);
  assert.equal(seat.settled, true);
  assert.equal(seat.sitAmount, 1);
  assert.equal(player.y, grove.perch.y);
  seat.stand(true);
  assert.equal(seat.update(player, .62), true);
  assert.deepEqual(player, bank);
  assert.equal(seat.active, false);
});

test("seated dialogue reacts to real transitions, honors cooldown and never queues wind", () => {
  const dialogue = createSpringDialogue({ discovered: true }, inside, () => 0);
  const tick = (time, extra) => dialogue.update(inside, flags(time, { seated: true, ...extra }));
  const wind = (event, phase) => ({ event, phase });
  assert.equal(tick(0, { wind: wind(0, "calm") }), undefined);
  assert.equal(tick(1_000, { wind: wind(1, "rising"), available: () => false }), undefined);
  assert.equal(tick(14_000, { wind: wind(1, "calm") }), undefined);
  assert.equal(tick(15_000).kind, "spring-settled");
  assert.equal(tick(30_000, { night: true }), undefined);
  assert.equal(tick(45_000, { night: true }), undefined);
  assert.equal(tick(61_000).text, SPRING_ENVIRONMENT_LINES.dawn);
  assert.equal(tick(62_000), undefined);
  assert.equal(tick(92_000, { wind: wind(2, "rising") }).text, SPRING_ENVIRONMENT_LINES.rising);
  assert.equal(tick(124_000, { wind: wind(2, "peak") }), undefined);
  assert.equal(tick(125_000, { night: true }).text, SPRING_ENVIRONMENT_LINES.dusk);
});
