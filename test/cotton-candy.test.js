import assert from "node:assert/strict";
import { test } from "node:test";
import { Box3 } from "three";
import { createCottonCandy } from "../src/cotton-candy.js";
import { jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { HOME } from "../src/map.js";

test("Cotton Candy keeps a foot on the ground while walking and on landing", () => {
  const avatar = createCottonCandy();
  const player = spawnPlayer(HOME);
  const lower = avatar.root.getObjectByName("Lower ear");
  const higher = avatar.root.getObjectByName("Higher ear");
  const initialPitch = lower.rotation.x;
  const bounds = new Box3();
  const dt = 1 / 120;

  function frame(moving) {
    movePlayer(player, 0, 0, dt);
    avatar.root.position.set(player.x, player.y, player.z);
    avatar.update(dt, moving, player.grounded, player.vy);
    assert.ok(Math.abs(bounds.setFromObject(avatar.root, true).min.y - player.y) < 1e-6);
  }

  for (let i = 0; i < 85; i++) frame(true);
  assert.notEqual(lower.rotation.x, initialPitch);
  assert.notEqual(lower.rotation.x, higher.rotation.x);

  assert.ok(jump(player));
  let peak = player.y;
  let stretch = 0;
  while (!player.grounded) {
    frame(false);
    peak = Math.max(peak, player.y);
    stretch = Math.max(stretch, lower.parent.scale.y);
  }
  assert.ok(peak - player.y > 1);
  assert.ok(stretch > 1.04);

  let squash = 1;
  for (let i = 0; i < 24; i++) {
    frame(false);
    squash = Math.min(squash, lower.parent.scale.y);
  }
  assert.ok(squash < .97);
});

test("both ears have closed, outward-facing smooth surfaces", () => {
  const { root } = createCottonCandy();
  const ears = ["Lower ear", "Higher ear"].map((name) => root.getObjectByName(name));
  for (const ear of ears) {
    const { geometry } = ear.children[0];
    const edges = new Map();
    const { array: indices } = geometry.index;
    const positions = geometry.getAttribute("position");
    let volume = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.subarray(i, i + 3);
      for (const [start, end] of [[a, b], [b, c], [c, a]]) {
        const key = Math.min(start, end) * positions.count + Math.max(start, end);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      volume += positions.getX(a) * (positions.getY(b) * positions.getZ(c) - positions.getZ(b) * positions.getY(c))
        + positions.getY(a) * (positions.getZ(b) * positions.getX(c) - positions.getX(b) * positions.getZ(c))
        + positions.getZ(a) * (positions.getX(b) * positions.getY(c) - positions.getY(b) * positions.getX(c));
    }
    assert.ok([...edges.values()].every((count) => count === 2));
    assert.ok(volume > 0);
    assert.ok(geometry.getAttribute("normal").array.every(Number.isFinite));
  }
  const bounds = ears.map((ear) => new Box3().setFromObject(ear, true));
  assert.ok(bounds[1].max.y > bounds[0].max.y);
});
