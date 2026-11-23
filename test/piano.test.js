import assert from "node:assert/strict";
import test from "node:test";
import { NOTES, MELODIES, checkNote, completePianoLevel, localDate } from "../src/piano-rules.js";
import { loadGame, saveGame } from "../src/save.js";
import { PIANO, PIANO_APPROACH, ROUTE, TREES, availableSpot, regionFor, terrainHeight } from "../src/map.js";
import { movePlayer, spawnPlayer } from "../src/motion.js";

test("the forest piano stays clear of trees and the main route, with local collision and interaction", () => {
  assert.equal(regionFor(PIANO), "forest");
  const position = { ...PIANO, x: PIANO.x - 2.5 };
  assert.equal(availableSpot(position, []).id, "piano");
  assert.equal(availableSpot({ ...position, layer: "sky" }, []), undefined);
  for (const [x, z] of ROUTE) assert.notEqual(availableSpot({ x, z, layer: "ground" }, [])?.id, "piano");
  assert.ok(TREES.every(({ x, z, size }) => Math.hypot(x - PIANO.x, z - PIANO.z) > PIANO.radius + 1.5 * size));
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI / 16;
    const y = terrainHeight(PIANO.x + PIANO.radius * Math.cos(angle), PIANO.z + PIANO.radius * Math.sin(angle));
    assert.ok(Math.abs(y - terrainHeight(PIANO.x, PIANO.z)) < .32);
  }
  const player = spawnPlayer(position);
  for (let i = 0; i < 60; i++) movePlayer(player, .08, 0, .01);
  assert.ok(Math.abs(player.x - PIANO.x) >= PIANO.radius + .44);
  const inside = spawnPlayer(PIANO);
  for (let i = 0; i < 60; i++) movePlayer(inside, -.08, 0, .01);
  assert.ok(Math.abs(inside.x - PIANO.x) > PIANO.radius + .44);
});

test("the marked spur is walkable from the main route to the piano", () => {
  const [[x, z], [endX, endZ]] = PIANO_APPROACH;
  assert.ok(ROUTE.some(([routeX, routeZ]) => routeX === x && routeZ === z));
  const player = spawnPlayer({ layer: "ground", x, z });
  const steps = 48;
  for (let index = 0; index < steps; index++) {
    movePlayer(player, (endX - x) / steps, (endZ - z) / steps, .01);
    assert.ok(player.grounded);
  }
  assert.ok(Math.hypot(player.x - endX, player.z - endZ) < .01);
  assert.equal(availableSpot(player, []), PIANO);
});

test("three melodies advance only for the correct notes in order", () => {
  assert.deepEqual(NOTES.map(({ frequency }) => frequency), [261.63, 293.66, 329.63, 392, 440]);
  assert.deepEqual(MELODIES.map(({ length }) => length), [3, 4, 5]);
  MELODIES.forEach((melody, level) => {
    melody.forEach((note, position) => {
      assert.equal(checkNote(level, position, (note + 1) % NOTES.length), "retry");
      assert.equal(checkNote(level, position, note), position === melody.length - 1 ? "complete" : "next");
    });
  });
});

test("progress and daily claims survive a reload in the existing save", () => {
  let stored;
  const storage = { getItem: () => stored ?? null, setItem: (_, value) => { stored = value; } };
  const state = loadGame(storage);
  assert.equal(state.piano.unlocked, 1);
  state.moonlightEnergy = 95;
  const today = localDate(new Date(2026, 10, 23, 23, 30));
  assert.equal(today, "2026-11-23");
  assert.equal(completePianoLevel(state, 0, true, today).claimed, false);
  assert.equal(state.piano.unlocked, 2);
  completePianoLevel(state, 1, true, today);
  assert.equal(state.piano.unlocked, 3);
  assert.equal(completePianoLevel(state, 2, false, today).claimed, false);
  assert.deepEqual(completePianoLevel(state, 2, true, today), { claimed: true, energy: 5 });
  assert.equal(state.moonlightEnergy, 100);
  saveGame(storage, state);
  const next = loadGame(storage);
  assert.deepEqual(next.piano, { unlocked: 3, lastRewardDate: today });
  next.moonlightEnergy = 30;
  assert.equal(completePianoLevel(next, 2, true, today).claimed, false);
  assert.deepEqual(completePianoLevel(next, 2, true, "2026-11-24"), { claimed: true, energy: 10 });
  assert.equal(next.moonlightEnergy, 40);
});
