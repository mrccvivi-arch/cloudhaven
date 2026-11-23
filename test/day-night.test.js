import { Vector3 } from "three";
import { solarPhase, sunDirection } from "../src/atmosphere.js";
import assert from "node:assert/strict";
import test from "node:test";
import { CYCLE_LENGTH, DAY_LENGTH, NIGHT_LENGTH, advanceCycle, clockText, isNight, nightBlend } from "../src/day-night.js";
import { CABIN, CABIN_ROOF, HOME, SKY, TREES, availableSpot, hasMoonlight } from "../src/map.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave } from "../src/save.js";

test("the clock has twelve minutes of day and eight minutes of night with smooth twilight", () => {
  assert.equal(DAY_LENGTH, 720);
  assert.equal(NIGHT_LENGTH, 480);
  assert.equal(clockText(0), "06:00");
  assert.equal(clockText(719), "17:59");
  assert.equal(clockText(720), "18:00");
  assert.equal(clockText(740), "18:30");
  assert.equal(clockText(960), "00:00");
  assert.equal(clockText(1199), "05:58");
  assert.equal(isNight(719.99), false);
  assert.equal(isNight(720), true);
  assert.equal(nightBlend(180), 0);
  assert.equal(nightBlend(960), 1);
  assert.ok(Math.abs(nightBlend(719.99) - nightBlend(720.01)) < .001);
  assert.ok(Math.abs(nightBlend(1199.99) - nightBlend(.01)) < .001);

  const state = { worldTime: 0, moonlightEnergy: 80 };
  advanceCycle(state, CYCLE_LENGTH, false, false);
  assert.equal(state.worldTime, 0);
});

test("energy drains during active daytime and regenerates at 0.5/s only under moonlight", () => {
  const state = { worldTime: 100, moonlightEnergy: 60 };
  advanceCycle(state, 5, false, true);
  assert.equal(state.moonlightEnergy, 60);
  advanceCycle(state, 50, true, true);
  assert.equal(state.moonlightEnergy, 54);
  assert.equal(state.worldTime, 155);
  state.worldTime = DAY_LENGTH;
  advanceCycle(state, 30, true, false);
  assert.equal(state.moonlightEnergy, 54);
  advanceCycle(state, 30, true, true);
  assert.equal(state.moonlightEnergy, 69);
  advanceCycle(state, 90, false, true);
  assert.equal(state.moonlightEnergy, 100);
  state.worldTime = DAY_LENGTH - 1;
  state.moonlightEnergy = 60;
  advanceCycle(state, 2, true, true);
  assert.equal(state.moonlightEnergy, 60.38);
  state.worldTime = CYCLE_LENGTH - 1;
  advanceCycle(state, 2, false, true);
  assert.equal(state.worldTime, 1);
  assert.equal(state.moonlightEnergy, 60.88);
});

test("cabin roof and tree canopies block charging while open areas and the old bed site remain accessible", () => {
  const covered = spawnPlayer({ ...HOME, x: CABIN.x, z: CABIN.z + CABIN_ROOF.offsetZ });
  assert.equal(hasMoonlight(covered), false);
  assert.equal(hasMoonlight({ ...covered, y: 6 }), true);
  assert.equal(hasMoonlight(spawnPlayer(HOME)), true);
  const tree = TREES[0];
  assert.equal(hasMoonlight(spawnPlayer({ layer: "ground", x: tree.x, z: tree.z })), false);
  assert.equal(hasMoonlight(spawnPlayer({ ...SKY, x: -13 * .31, z: 12 })), false);
  assert.equal(hasMoonlight(spawnPlayer(SKY)), true);

  assert.equal(availableSpot({ ...HOME, x: -47.7, z: 26 }, []), undefined);
  const state = { worldTime: 0, moonlightEnergy: 1 };
  advanceCycle(state, 50, true, false);
  assert.equal(state.moonlightEnergy, 0);
  const player = spawnPlayer(HOME);
  assert.equal(jump(player), true);
  movePlayer(player, .08, 0, .01);
  assert.ok(player.x > HOME.x && player.y > 0);
});

test("old saves default to 09:00 and full energy, and malformed values are normalized", () => {
  const old = readSave({ rested: 42, bathed: 123 });
  assert.equal(clockText(old.worldTime), "09:00");
  assert.equal(old.moonlightEnergy, 100);
  assert.equal(old.bathed, 123);
  const bad = readSave({ worldTime: -1, moonlightEnergy: -10 });
  assert.equal(bad.worldTime, CYCLE_LENGTH - 1);
  assert.equal(bad.moonlightEnergy, 0);
  assert.equal(readSave({ worldTime: CYCLE_LENGTH + 30, moonlightEnergy: 101 }).worldTime, 30);
  assert.equal(readSave({ moonlightEnergy: 101 }).moonlightEnergy, 100);
});

test("the atmospheric phase is continuous across dusk and the daily wrap", () => {
  const sunrise = solarPhase(0);
  const noon = solarPhase(DAY_LENGTH / 2);
  const sunset = solarPhase(DAY_LENGTH);
  const beforeDawn = solarPhase(CYCLE_LENGTH - .001);
  const beforeSunset = solarPhase(DAY_LENGTH - .001);
  assert.equal(noon.twilight, 0);
  assert.ok(sunrise.morning && !sunset.morning);
  assert.equal(sunrise.twilight, 1);
  assert.ok(Math.abs(sunset.night - beforeSunset.night) < .001);
  assert.ok(Math.abs(sunrise.night - beforeDawn.night) < .001);
  assert.equal(sunrise.arc, beforeDawn.arc);
  assert.ok(sunDirection(noon.arc, new Vector3()).y > .8);
  assert.ok(sunDirection(sunrise.arc, new Vector3()).x > .9);
  assert.ok(sunDirection(sunset.arc, new Vector3()).x < -.9);
});
