import assert from "node:assert/strict";
import test from "node:test";
import { Color, Fog, Group, PerspectiveCamera, Scene } from "three";
import { createMoonlight } from "../src/moonlight.js";
import { createSummerWeather } from "../src/summer-weather.js";
import { createSummerWeatherEffects } from "../src/summer-weather-effects.js";
import { SUMMER } from "../src/summer-layout.js";
import { SUMMER_WEATHER_DIALOGUE } from "../src/summer-dialogue.js";

test("a daytime shower has one ramp, one running event and a fading rainbow", () => {
  const weather = createSummerWeather(() => 0);
  const events = [], rain = [], rainbows = [], gusts = [];
  for (let time = 0; time < 180; time += .2) {
    const state = weather.update(time, time, true, time > 35, (kind) => events.push(kind));
    if (state.rain > .1) rain.push(time);
    if (state.rainbow > .1) rainbows.push(time);
    if (state.wind > .1 && time < 26) gusts.push(time);
  }
  assert.ok(gusts[0] >= 15 && gusts.at(-1) - gusts[0] > 3.5);
  assert.ok(rain[0] > 30 && rain.at(-1) - rain[0] >= 18 && rain.at(-1) - rain[0] <= 35);
  assert.ok(rainbows[0] > rain.at(-1) && rainbows.at(-1) - rainbows[0] > 25);
  assert.deepEqual(events.filter((kind) => kind !== "summer-sea-breeze"),
    ["summer-shower-start", "summer-shower-running", "summer-shower-end", "summer-weather-rainbow"]);
  assert.ok(events.every((kind) => SUMMER_WEATHER_DIALOGUE[kind]));
});

test("late entry skips rain, deserting a shower clears it and never starts a second one that cycle", () => {
  const late = createSummerWeather(() => 0);
  for (let worldTime = 105; worldTime < 180; worldTime++) {
    assert.equal(late.update(worldTime, worldTime, true, true).rain, 0);
  }
  const weather = createSummerWeather(() => 0);
  for (let time = 0; time < 39; time++) weather.update(time, time, true, false);
  assert.equal(weather.update(39, 39, true, false).rain, 1);
  const clear = weather.update(39, 39, false, false);
  assert.equal(clear.rain + clear.rainbow + clear.wind + clear.wet + clear.overcast, 0);
  for (let time = 40; time < 180; time++) {
    assert.equal(weather.update(time, time, true, false).rain, 0);
  }
});

test("the night has a bounded number of meteor opportunities and returns to the usual map lighting", () => {
  const weather = createSummerWeather(() => .82);
  const flashes = [];
  for (let time = 0; time < 300; time += .5) {
    const value = weather.update(time, time, true, false);
    if (value.meteors) flashes.push([time, value.meteors]);
  }
  assert.equal(flashes.length, 3);
  assert.ok(flashes.every(([time, count]) => time > 180 && time < 280 && count <= 2));
  const scene = new Scene(), camera = new PerspectiveCamera();
  scene.background = new Color();
  scene.fog = new Fog();
  const lighting = createMoonlight(scene);
  lighting.update(55, "ground", camera);
  const baseline = [scene.background.getHex(), lighting.objects[1].intensity];
  lighting.update(55, SUMMER, camera);
  const sun = lighting.objects[1].intensity;
  lighting.update(55, SUMMER, camera, .016, { overcast: 1 });
  assert.ok(lighting.objects[1].intensity < sun);
  lighting.update(55, "ground", camera, .016, { overcast: 1 });
  assert.deepEqual([scene.background.getHex(), lighting.objects[1].intensity], baseline);
});

test("weather reuses one set of effects and clears all visibility on exit", () => {
  const root = new Group();
  const visuals = createSummerWeatherEffects(root);
  const camera = new PerspectiveCamera(49, 4 / 3, .35, 305);
  const player = { x: 5, y: .5, z: 43 };
  camera.position.set(3, 4, 35);
  camera.lookAt(25, 10, 78);
  const effects = root.children[0];
  const objects = [...effects.children];
  for (let visit = 0; visit < 3; visit++) {
    const sample = { time: visit * 10 + 1, rain: .8, rainbow: .7, wind: .6, meteors: 1, x: .5, z: .2, driftX: 2, driftZ: 1 };
    visuals.update(sample, player, camera);
    visuals.update({ ...sample, time: sample.time + .4, meteors: 0 }, player, camera);
    assert.equal(effects.getObjectByName("summer-shower").visible, true);
    assert.equal(effects.getObjectByName("summer-weather-rainbow").visible, true);
    assert.equal(effects.getObjectByName("summer-meteor").visible, true);
    visuals.pause();
    assert.ok(effects.children.every((node) => !node.visible));
    assert.deepEqual(effects.children, objects);
  }
});
