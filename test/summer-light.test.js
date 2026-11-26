import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Scene, Color, Fog } from "three";
import { CYCLE_LENGTH, DAY_LENGTH, advanceCycle } from "../src/day-night.js";
import { createMoonlight } from "../src/moonlight.js";
import { createSummerLight, summerSkySituation } from "../src/summer-light.js";
import { SUMMER } from "../src/summer-layout.js";
import { createSummerSkyDialogue, SUMMER_DIALOGUE } from "../src/summer-dialogue.js";

test("the summer sun sets below the horizon before blue hour and the moon rises into night", () => {
  const light = createSummerLight();
  assert.equal(light.update(75).skyMix, 0);
  const gold = light.update(151);
  assert.ok(gold.sunDirection.y > .15 && gold.sunGlow > .9);
  assert.ok(light.update(170).sunDirection.y < 0);
  const blue = light.update(180);
  assert.ok(blue.sunGlow < .1 && blue.star > 0 && blue.moon > 0 && blue.moon < 1);
  const night = light.update(224);
  assert.equal(night.moon, 1);
  assert.ok(night.top.getHex() < night.horizon.getHex());
  assert.ok(night.fill > 1);
  const end = light.update(CYCLE_LENGTH - .001);
  const horizon = end.horizon.clone(), moon = end.moonDirection.clone();
  const morning = light.update(0);
  assert.ok(Math.abs(horizon.r - morning.horizon.r) + Math.abs(horizon.g - morning.horizon.g) +
    Math.abs(horizon.b - morning.horizon.b) < .001);
  assert.ok(moon.distanceTo(morning.moonDirection) < .001);
  assert.ok((194 - 135) / CYCLE_LENGTH <= .2);
});

test("a switch away from Summer Sanctuary restores the usual lighting and does not advance energy", () => {
  const scene = new Scene();
  scene.background = new Color();
  scene.fog = new Fog();
  const camera = new PerspectiveCamera();
  const lighting = createMoonlight(scene);
  const sample = () => {
    const [fill, key, sky] = lighting.objects;
    return [scene.background.getHex(), scene.fog.color.getHex(), scene.fog.near, scene.fog.far,
      fill.color.getHex(), fill.groundColor.getHex(), fill.intensity, key.color.getHex(), key.intensity,
      ...key.position.toArray(), ...sky.children.filter((child) => child.isSprite).at(-1).position.toArray()];
  };
  lighting.update(161, "ground", camera);
  const forest = sample();
  lighting.update(161, SUMMER, camera);
  assert.notDeepEqual(sample(), forest);
  lighting.update(161, "ground", camera);
  assert.deepEqual(sample(), forest);
  const state = { worldTime: DAY_LENGTH - 1, moonlightEnergy: 50 };
  lighting.update(state.worldTime, SUMMER, camera);
  assert.deepEqual(state, { worldTime: DAY_LENGTH - 1, moonlightEnergy: 50 });
  advanceCycle(state, 2, true);
  assert.equal(state.worldTime, DAY_LENGTH + 1);
});

test("summer sky dialogue retries blocked speech and only attempts once per phase and cycle", () => {
  const talk = createSummerSkyDialogue();
  const lines = [];
  const speak = (kind) => { lines.push(kind); return true; };
  assert.equal(summerSkySituation(75), undefined);
  talk(150, false, true, speak);
  talk(151, true, true, () => false);
  talk(152, true, true, speak);
  talk(153, true, true, speak);
  talk(164, true, false, speak);
  talk(166, true, true, speak);
  talk(174, true, true, speak);
  talk(220, true, false, speak);
  talk(221, true, true, speak);
  talk(289, true, true, speak);
  talk(1, true, true, speak);
  talk(20, false, false, speak);
  talk(150, true, true, speak);
  assert.deepEqual(lines, ["summer-golden-hour", "summer-sunset", "summer-blue-hour", "summer-moonlit-sea", "summer-dawn",
    "summer-golden-hour"]);
  assert.equal([...new Set(lines)].flatMap((kind) => SUMMER_DIALOGUE[kind].lines).length, 18);
});
