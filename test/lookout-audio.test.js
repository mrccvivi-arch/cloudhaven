import assert from "node:assert/strict";
import test from "node:test";
import { createAudio } from "../src/audio.js";
import { RUNE_INTERVAL } from "../src/lookout.js";

test("25 lookout cycles retain the melody under mixer load and clean up every voice", async () => {
  let contextCount = 0;
  const playing = new Set();
  const connected = new Set();
  const param = () => ({
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    connect() { connected.add(this); },
    disconnect() { connected.delete(this); },
  });
  const source = () => ({
    ...node(),
    frequency: param(),
    start(time) { this.startTime = time; playing.add(this); },
    stop(time) { if (time === undefined) playing.delete(this); },
  });
  class AudioContext {
    state = "suspended";
    currentTime = 1;
    sampleRate = 4;
    constructor() { contextCount++; }
    async resume() { this.state = "running"; }
    async suspend() { this.state = "suspended"; }
    createGain() { return { ...node(), gain: param() }; }
    createOscillator = source;
    createBufferSource = source;
    createBiquadFilter() { return { ...node(), frequency: param() }; }
    createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  }
  globalThis.window = { webkitAudioContext: AudioContext };
  globalThis.document = { hidden: false };

  const audio = createAudio({ enabled: true, volume: .65 });
  const finish = () => {
    for (const voice of playing) {
      playing.delete(voice);
      voice.onended();
    }
    assert.equal(connected.size, 1); // Only the shared mixer remains.
  };
  await audio.activate();
  for (let cycle = 0; cycle < 25; cycle++) {
    await audio.activate();
    for (let i = 0; i < 12; i++) audio.play("click");
    await audio.playLookout(true, RUNE_INTERVAL);
    const starts = [...playing].slice(12).map((voice) => voice.startTime);
    assert.deepEqual(starts, [1, ...Array.from({ length: 6 }, (_, i) => 1 + i * RUNE_INTERVAL), 1]);
    finish();
    await audio.playLookout(false, RUNE_INTERVAL);
    assert.equal(playing.size, 1);
    finish();
    audio.suspend();
  }
  const lighting = audio.playLookout(true, RUNE_INTERVAL);
  audio.stopLookout();
  await lighting;
  assert.equal(playing.size, 0);
  await audio.playLookout(true, RUNE_INTERVAL);
  await audio.playLookout(false, RUNE_INTERVAL);
  assert.equal(playing.size, 1);
  finish();
  assert.equal(contextCount, 1);
});
