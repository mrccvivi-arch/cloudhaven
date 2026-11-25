import assert from "node:assert/strict";
import test from "node:test";
import { Scene } from "three";
import { createAffection } from "../src/affection.js";
import { blockingSolid } from "../src/collision.js";
import { terrainHeight } from "../src/map.js";
import { readSave } from "../src/save.js";
import { createGroveBreeze, createSpringGrove } from "../src/spring-grove.js";
import { createSpringDialogue, createSpringSeat, SPRING_WELCOME, SPRING_ENVIRONMENT_LINES, SPRING_LINES } from "../src/spring-interaction.js";
import { springPoint } from "../src/spring-layout.js";

const outside = { ...springPoint(54.9, 10.2), layer: "ground", grounded: true };
const inside = { ...springPoint(59.5, 10.2), layer: "ground", grounded: true };
const bank = { ...springPoint(63.55, 11.4), layer: "ground", grounded: true };
bank.y = terrainHeight(bank.x, bank.z);

const flags = (time, others = {}) => ({
  time, wallTime: 1_000_000 + time, seated: false, night: false,
  available: () => true, ready: true, ...others,
});

test("every real spring entry and teleport speaks the fixed welcome, with hysteresis", () => {
  const state = readSave();
  const dialogue = createSpringDialogue(state.springDiscovery, () => 0);
  const edge = { ...inside, ...springPoint(57.3, 10.2) };
  assert.equal(dialogue.update(outside, flags(10)), undefined);
  assert.equal(dialogue.update(inside, flags(20)).text, SPRING_WELCOME);
  assert.equal(dialogue.update(edge, flags(30)), undefined);
  assert.equal(dialogue.update(inside, flags(40)), undefined);
  dialogue.update(outside, flags(50));
  assert.equal(dialogue.update(inside, flags(60)).text, SPRING_WELCOME);
  const saved = readSave(JSON.parse(JSON.stringify(state)));
  assert.equal(saved.springDiscovery.discovered, true);
  const loaded = createSpringDialogue(saved.springDiscovery);
  assert.equal(loaded.update(inside, flags(10, { ready: false })), undefined);
  assert.equal(loaded.update(inside, flags(20)).text, SPRING_WELCOME);
  loaded.reset();
  assert.equal(loaded.update(inside, flags(30)).text, SPRING_WELCOME);
  assert.equal(SPRING_LINES.length + Object.keys(SPRING_ENVIRONMENT_LINES).length + 1, 28);
  assert.ok(SPRING_LINES.includes("这里很适合发呆。"));
});

test("touch uses quiet lines without changing affection gains or the existing cooldown", () => {
  const { affection } = readSave();
  const relationship = createAffection(affection, Math.random, false);
  const dialogue = createSpringDialogue({ discovered: true }, () => .62);
  const first = relationship.touch({ now: new Date("2026-11-25T09:00:00Z"), quiet: true });
  assert.deepEqual(first, { level: 1, points: 3, upgraded: false });
  assert.equal(relationship.touch({ now: new Date("2026-11-25T09:00:01Z"), quiet: true }), undefined);
  assert.equal(affection.lastDialogueId, null);
  assert.notEqual(dialogue.touch(false), SPRING_LINES[13]);
  const moon = createSpringDialogue({ discovered: true }, () => .60);
  assert.equal(moon.touch(true), SPRING_LINES[13]);
  assert.notEqual(moon.touch(true), SPRING_LINES[13]);
});

test("test mode rewards quick spring touches without selecting ordinary dialogue", () => {
  const { affection } = readSave();
  const relationship = createAffection(affection);
  for (const timestamp of ["2026-11-25T09:00:00Z", "2026-11-25T09:00:01Z"]) {
    assert.deepEqual(relationship.touch({ now: new Date(timestamp), quiet: true }),
      { level: 1, points: 3, upgraded: false });
  }
  assert.equal(affection.affectionPoints, 6);
  assert.equal(affection.lastDialogueId, null);
});

test("seating eases onto the petal-covered rock and returns to a saveable safe bank", () => {
  const scene = new Scene();
  const grove = createSpringGrove(scene, true);
  assert.equal(scene.getObjectByName("Spring stone petals").count, 7);
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

test("seated breezes recur without overlap and standing restores natural timing", () => {
  const breeze = createGroveBreeze(() => .5);
  assert.equal(breeze(0, true).event, 0);
  assert.equal(breeze(2.25, true).event, 0);
  assert.equal(breeze(.25, false).event, 0, "standing cancels an unstarted breeze");
  breeze(0, true);
  assert.equal(breeze(2.5, true).phase, "rising");
  assert.equal(breeze(1.5, true).dialoguePhase, "peak");
  assert.equal(breeze(.25, true).strength, .74);
  assert.equal(breeze(2.25, true).phase, "falling");
  assert.equal(breeze(1, true).phase, "calm");
  assert.equal(breeze(4.75, true).event, 1);
  assert.equal(breeze(.25, true).event, 2);
  assert.equal(breeze(2, false).phase, "peak", "standing lets the running breeze fade");
  assert.equal(breeze(3, false).phase, "calm");
  assert.equal(breeze(10, false).event, 2, "standing cancels the next seated breeze");
  assert.equal(breeze(29.75, false).phase, "rising", "the natural schedule resumes");
  breeze(0, true);
  assert.equal(breeze(2.5, true).event, 3, "sitting never restarts running natural wind");
});

test("seated flower showers can peak at full strength while repeated breezes stay quiet", () => {
  const breeze = createGroveBreeze(() => 0);
  breeze(0, true);
  assert.equal(breeze(2, true).dialoguePhase, "rising");
  assert.equal(breeze(2, true).strength, 1);
  assert.equal(breeze(2, true).phase, "calm");
  assert.equal(breeze(4, true).dialoguePhase, null);

  const dialogue = createSpringDialogue({ discovered: true }, () => 0);
  const tick = (time, event, phase, dialoguePhase) => dialogue.update(inside, flags(time, {
    seated: true, wind: { event, phase, dialoguePhase },
  }));
  assert.equal(tick(0, 0, "calm").text, SPRING_WELCOME);
  assert.equal(tick(2_000, 1, "rising", "rising").text, SPRING_ENVIRONMENT_LINES.rising);
  assert.equal(tick(4_000, 1, "peak", "rising"), undefined);
  assert.equal(tick(6_000, 1, "calm", "rising"), undefined);
  assert.equal(tick(10_000, 2, "rising", null), undefined);
  assert.equal(tick(12_000, 2, "peak", null), undefined);
  assert.equal(tick(14_000, 2, "calm", null), undefined);
  assert.equal(tick(18_000, 3, "rising", null), undefined);
});

test("wind cues wait behind an active scene line and then play in order without a global cooldown", () => {
  const dialogue = createSpringDialogue({ discovered: true }, () => 0);
  const wind = (event, phase) => ({ event, phase });
  const tick = (time, extra = {}) => dialogue.update(inside, flags(time, { seated: true, ...extra }));
  assert.equal(tick(0, { wind: wind(0, "calm") }).text, SPRING_WELCOME);
  assert.equal(tick(2_000, { wind: wind(1, "rising"), available: () => false }), undefined);
  assert.equal(tick(5_000, { wind: wind(1, "peak") }).text, SPRING_ENVIRONMENT_LINES.rising);
  assert.equal(tick(6_000, { wind: wind(1, "peak"), available: () => false }), undefined);
  assert.equal(tick(9_200, { wind: wind(1, "peak") }).text, SPRING_ENVIRONMENT_LINES.peak);
  assert.equal(tick(15_000, { wind: wind(1, "calm") }).text, SPRING_ENVIRONMENT_LINES.calm);
  assert.equal(tick(20_000, { wind: wind(1, "calm") }), undefined);
  assert.equal(tick(22_000, { night: true, wind: wind(1, "calm") }).text, SPRING_ENVIRONMENT_LINES.dusk);
  assert.equal(tick(65_000, { wind: wind(1, "calm") }).text, SPRING_ENVIRONMENT_LINES.dawn);
  assert.equal(tick(70_000, { wind: wind(2, "rising"), available: () => false }), undefined);
  assert.equal(tick(71_000, { seated: false, wind: wind(2, "rising") }), undefined);
  assert.equal(tick(72_000, { wind: wind(2, "rising") }), undefined, "standing clears pending speech");
});

test("fast cycles still speak dusk and dawn, with the original repeat interval", () => {
  const dialogue = createSpringDialogue({ discovered: true }, () => 0);
  const tick = (time, night) => dialogue.update(inside, flags(time, { seated: true, night }));
  assert.equal(tick(0, false).text, SPRING_WELCOME);
  assert.equal(tick(15_000, false).kind, "spring-settled");
  assert.equal(tick(180_000, true).text, SPRING_ENVIRONMENT_LINES.dusk);
  assert.equal(tick(300_000, false).text, SPRING_ENVIRONMENT_LINES.dawn);

  for (let cycle = 1; cycle < 4; cycle++) {
    assert.equal(tick(300_000 * cycle + 180_000, true), undefined);
    assert.equal(tick(300_000 * (cycle + 1), false), undefined);
  }
  assert.equal(tick(1_380_000, true).text, SPRING_ENVIRONMENT_LINES.dusk);
  assert.equal(tick(1_500_000, false).text, SPRING_ENVIRONMENT_LINES.dawn);
});

test("without an environment event, sitting gives one spring line from the interaction pool", () => {
  const dialogue = createSpringDialogue({ discovered: true }, () => 0);
  const tick = (time) => dialogue.update(inside, flags(time, { seated: true }));
  assert.equal(tick(0).text, SPRING_WELCOME);
  assert.equal(tick(14_999), undefined);
  assert.equal(tick(15_000).kind, "spring-settled");
  assert.equal(tick(30_000), undefined);
});
