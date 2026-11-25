import { HABITAT } from "../src/cloud-house-layout.js";
import { moonlightMask } from "../src/moonlight.js";
import { Vector3 } from "three";
import { cloudPixels, solarPhase, sunDirection } from "../src/atmosphere.js";
import assert from "node:assert/strict";
import test from "node:test";
import { CYCLE_LENGTH, DAY_CYCLE_SECONDS, DAY_DURATION_SECONDS, DAY_LENGTH, NIGHT_DURATION_SECONDS, NIGHT_LENGTH,
  TRANSITION_SECONDS, advanceCycle, clockText, isNight, nightBlend } from "../src/day-night.js";
import { HOME, SKY, TREES, hasMoonlight } from "../src/map.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave } from "../src/save.js";

test("300 seconds cover a full day with a synchronized clock and smooth twilight", () => {
  assert.equal(DAY_CYCLE_SECONDS, 300);
  assert.equal(CYCLE_LENGTH, DAY_CYCLE_SECONDS);
  assert.equal(DAY_DURATION_SECONDS, 180);
  assert.equal(NIGHT_DURATION_SECONDS, 120);
  assert.equal(TRANSITION_SECONDS, 15);
  assert.equal(DAY_LENGTH, DAY_DURATION_SECONDS);
  assert.equal(NIGHT_LENGTH, NIGHT_DURATION_SECONDS);
  assert.equal(clockText(0), "06:00");
  assert.equal(clockText(179.99), "17:59");
  assert.equal(clockText(180), "18:00");
  assert.equal(clockText(185), "18:30");
  assert.equal(clockText(240), "00:00");
  assert.equal(clockText(299.99), "05:59");
  assert.equal(isNight(179.99), false);
  assert.equal(isNight(180), true);
  assert.equal(nightBlend(45), 0);
  assert.equal(nightBlend(240), 1);
  const halfTransition = TRANSITION_SECONDS / 2;
  assert.equal(nightBlend(DAY_LENGTH - halfTransition), 0);
  assert.equal(nightBlend(DAY_LENGTH), .5);
  assert.equal(nightBlend(DAY_LENGTH + halfTransition), 1);
  assert.equal(nightBlend(DAY_CYCLE_SECONDS - halfTransition), 1);
  assert.equal(nightBlend(0), .5);
  assert.equal(nightBlend(halfTransition), 0);
  assert.ok(Math.abs(nightBlend(179.999) - nightBlend(180.001)) < .001);
  assert.ok(Math.abs(nightBlend(299.999) - nightBlend(.001)) < .001);

  const state = { worldTime: 0, moonlightEnergy: 80 };
  advanceCycle(state, DAY_CYCLE_SECONDS, false, false);
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
  assert.equal(state.moonlightEnergy, 99);
  state.worldTime = DAY_LENGTH;
  advanceCycle(state, 5, false, true);
  assert.equal(state.moonlightEnergy, 100);
  state.worldTime = DAY_LENGTH - 1;
  state.moonlightEnergy = 60;
  advanceCycle(state, 2, true, true);
  assert.equal(state.moonlightEnergy, 60.38);
  state.worldTime = DAY_CYCLE_SECONDS - 1;
  advanceCycle(state, 2, false, true);
  assert.equal(state.worldTime, 1);
  assert.equal(state.moonlightEnergy, 60.88);
});

test("the open habitat and outdoor areas receive moonlight while tree canopies still block it", () => {
  const covered = spawnPlayer({ ...HOME, x: HABITAT.x, z: HABITAT.z });
  assert.equal(hasMoonlight(covered), true);
  assert.equal(hasMoonlight({ ...covered, y: 6 }), true);
  assert.equal(hasMoonlight(spawnPlayer(HOME)), true);
  const tree = TREES[0];
  assert.equal(hasMoonlight(spawnPlayer({ layer: "ground", x: tree.x, z: tree.z })), false);
  assert.equal(hasMoonlight(spawnPlayer({ ...SKY, x: -13 * .31, z: 12 })), false);
  assert.equal(hasMoonlight(spawnPlayer(SKY)), true);

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
  assert.ok(!("bathed" in old));
  const bad = readSave({ worldTime: -1, moonlightEnergy: -10 });
  assert.equal(bad.worldTime, DAY_CYCLE_SECONDS - .25);
  assert.equal(bad.moonlightEnergy, 0);
  assert.equal(readSave({ worldCycleSeconds: DAY_CYCLE_SECONDS, worldTime: DAY_CYCLE_SECONDS + 30 }).worldTime, 30);
  assert.equal(readSave({ moonlightEnergy: 101 }).moonlightEnergy, 100);
});

test("existing saves and later cycle adjustments preserve local game time and resource progress", () => {
  const migrated = readSave({ worldTime: 960, moonlightEnergy: 37, gathering: { cycle: 5, collected: { "stardust:0": 5 } } });
  assert.equal(clockText(migrated.worldTime), "00:00");
  assert.equal(migrated.worldCycleSeconds, DAY_CYCLE_SECONDS);
  assert.equal(migrated.moonlightEnergy, 37);
  assert.deepEqual(migrated.gathering, { cycle: 5, elapsed: 960, collected: { "stardust:0": 5 } });
  const reloaded = readSave(JSON.parse(JSON.stringify(migrated)));
  assert.equal(reloaded.worldTime, migrated.worldTime);
  assert.equal(reloaded.moonlightEnergy, migrated.moonlightEnergy);
  assert.deepEqual(reloaded.gathering, migrated.gathering);
  const rescaled = readSave({ ...migrated, worldCycleSeconds: 600, worldTime: 480 });
  assert.equal(clockText(rescaled.worldTime), "00:00");
  assert.deepEqual(rescaled.gathering, migrated.gathering);
});

test("the atmospheric phase is continuous across dusk and the daily wrap", () => {
  const sunrise = solarPhase(0);
  const noon = solarPhase(DAY_LENGTH / 2);
  const sunset = solarPhase(DAY_LENGTH);
  const beforeDawn = solarPhase(DAY_CYCLE_SECONDS - .001);
  const beforeSunset = solarPhase(DAY_LENGTH - .001);
  assert.equal(noon.twilight, 0);
  assert.ok(sunrise.morning && !sunset.morning);
  const midnight = DAY_LENGTH + NIGHT_LENGTH / 2;
  assert.equal(solarPhase(midnight - .001).night, 1);
  assert.equal(solarPhase(midnight + .001).night, 1);
  assert.ok(!solarPhase(midnight - .001).morning && solarPhase(midnight + .001).morning);
  assert.equal(sunrise.twilight, 1);
  assert.ok(Math.abs(sunset.night - beforeSunset.night) < .001);
  assert.ok(Math.abs(sunrise.night - beforeDawn.night) < .001);
  assert.equal(sunrise.arc, beforeDawn.arc);
  assert.ok(sunDirection(noon.arc, new Vector3()).y > .8);
  assert.ok(sunDirection(sunrise.arc, new Vector3()).x > .9);
  assert.ok(sunDirection(sunset.arc, new Vector3()).x < -.9);
});

test("cumulus texture pixels are achromatic and retain smooth alpha and shading", () => {
  const data = cloudPixels(26);
  assert.deepEqual(data, cloudPixels(26));
  assert.notDeepEqual(data, cloudPixels(98));
  const alpha = new Set();
  const shades = new Set();
  for (let i = 0; i < data.length; i += 4) {
    assert.equal(data[i], data[i + 1]);
    assert.equal(data[i], data[i + 2]);
    alpha.add(data[i + 3]);
    if (data[i + 3] >= 250) shades.add(data[i]);
  }
  assert.ok(alpha.has(0) && alpha.has(255) && alpha.size > 100);
  assert.ok(shades.size > 10);
});

test("moon and glow masks contain white RGB and deterministic coverage", () => {
  for (const kind of ["moon", "glow"]) {
    const data = moonlightMask(kind);
    assert.deepEqual(data, moonlightMask(kind));
    const coverage = new Set();
    for (let i = 0; i < data.length; i += 4) {
      assert.equal(data[i], 255);
      assert.equal(data[i + 1], 255);
      assert.equal(data[i + 2], 255);
      coverage.add(data[i + 3]);
    }
    assert.ok(coverage.has(0) && coverage.size > 20);
  }
  assert.notDeepEqual(moonlightMask("moon"), moonlightMask("glow"));
});
