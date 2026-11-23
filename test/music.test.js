import assert from "node:assert/strict";
import test from "node:test";
import { musicTheme } from "../src/music.js";
import { MUSIC_RATE, renderTheme } from "../src/music-score.js";
import { readSave, saveGame } from "../src/save.js";

test("music follows the existing layer and night status", () => {
  assert.equal(musicTheme("ground", false), "day");
  assert.equal(musicTheme("ground", true), "night");
  assert.equal(musicTheme("sky", false), "sky");
  assert.equal(musicTheme("sky", true), "sky");
});

test("the three original loops contain distinct, audible and seamless audio", () => {
  const tracks = ["day", "night", "sky"].map(renderTheme);
  assert.equal(new Set(tracks.map(({ length }) => length)).size, 3);
  for (const samples of tracks) {
    assert.ok(samples.length > MUSIC_RATE * 19 && samples.length < MUSIC_RATE * 28);
    for (let start = 0; start < samples.length - MUSIC_RATE; start += MUSIC_RATE) {
      const seconds = samples.subarray(start, start + MUSIC_RATE);
      const power = seconds.reduce((sum, sample) => sum + sample * sample, 0) / MUSIC_RATE;
      assert.ok(power > .00001);
    }
    assert.ok(Math.abs(samples[0] - samples.at(-1)) < .02);
    assert.ok(samples.every((value) => Number.isFinite(value) && Math.abs(value) < .47));
  }
});

test("music preference uses the existing save and defaults to a quarter volume", () => {
  const state = readSave(null);
  assert.deepEqual(state.music, { enabled: true, volume: .25 });
  state.music = { enabled: false, volume: .63 };
  let stored;
  saveGame({ setItem: (_, value) => { stored = value; } }, state);
  assert.deepEqual(readSave(JSON.parse(stored)).music, state.music);
  assert.equal(readSave({ music: { volume: 2 } }).music.volume, 1);
});
