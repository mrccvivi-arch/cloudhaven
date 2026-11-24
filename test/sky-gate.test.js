import assert from "node:assert/strict";
import test from "node:test";
import { BODY_RADIUS } from "../src/cotton-candy.js";
import { availableSpot, skyStartPoint } from "../src/map.js";
import { MOVE_SPEED, jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { createSkyGateTrigger, gateOpenings } from "../src/sky-gate.js";

function center(x, y, z, layer = "ground") {
  const gate = gateOpenings[layer];
  return { x: gate.x + x, y: gate.y + y, z: gate.z + z, layer };
}

test("the door triggers only when the center crosses the inside of the frame", () => {
  const gate = createSkyGateTrigger();
  assert.equal(gate.crossed(center(0, 1, 2), center(0, 1, .1), 0), false);
  assert.equal(gate.crossed(center(0, 1, .1), center(0, 1, 0), 10), false);
  assert.equal(gate.crossed(center(0, 1, 0), center(0, 1, .1), 20), false);
  assert.equal(gate.crossed(center(0, 1, .1), center(1, 1, .1), 30), false);
  assert.equal(gate.crossed(center(1.65, 1, 1), center(1.65, 1, -1), 40), false);
  assert.equal(gate.crossed(center(0, 3.5, 1), center(0, 3.5, -1), 50), false);
  assert.equal(gate.crossed(center(0, 1, 1), center(0, 1, -1, "sky"), 60), false);
  assert.equal(gate.crossed(center(2, 1, 1), center(0, 2, -1), 70), true);
});

test("crossing during cooldown requires leaving the doorway before trying again", () => {
  const gate = createSkyGateTrigger();
  const outside = center(0, 1, .5);
  const front = center(0, 1, .1);
  const back = center(0, 1, -.1);
  assert.equal(gate.crossed(front, back, 0), false);
  assert.equal(gate.crossed(outside, back, 10), true);
  assert.equal(gate.crossed(back, front, 30), false);
  assert.equal(gate.crossed(outside, back, 1990), false);
  assert.equal(gate.crossed(back, front, 2010), false);
  assert.equal(gate.crossed(outside, back, 2020), true);
});

test("ground movement crosses the door on foot or in a jump, with a safe fixed landing", () => {
  for (const [speed, jumping] of [[MOVE_SPEED * .4, false], [MOVE_SPEED, false], [MOVE_SPEED, true]]) {
    const gate = createSkyGateTrigger();
    const player = spawnPlayer(center(0, 0, 2));
    if (jumping) assert.equal(jump(player), true);
    const bodyCenter = () => ({ ...player, y: player.y + BODY_RADIUS });
    let crossed = false;
    for (let step = 0; step < 100 && !crossed; step++) {
      const before = bodyCenter();
      movePlayer(player, 0, -speed / 100, .01);
      crossed = gate.crossed(before, bodyCenter(), step * 10);
    }
    assert.equal(crossed, true);
    assert.equal(player.grounded, !jumping);
  }
  const landing = spawnPlayer(skyStartPoint);
  assert.deepEqual(landing, { ...skyStartPoint, y: 29, vy: 0, grounded: true });
  assert.equal(availableSpot(landing, []), undefined);
});

test("the two portals share a cooldown across repeated round trips", () => {
  const gate = createSkyGateTrigger();
  for (let time = 0; time <= 8000; time += 4000) {
    assert.equal(gate.crossed(center(0, 1, 1), center(0, 1, -1), time), true);
    const skyFront = center(0, 1, -1, "sky");
    const skyBack = center(0, 1, 1, "sky");
    assert.equal(gate.crossed(skyFront, skyBack, time + 500), false);
    assert.equal(gate.crossed(skyBack, skyFront, time + 2000), true);
    assert.equal(gate.crossed(center(0, 1, 1), center(0, 1, -1), time + 2500), false);
  }
});

test("the arrival arch has no interaction prompt and only its opening triggers return", () => {
  const gate = createSkyGateTrigger();
  const sky = (x, z) => center(x, 1, z, "sky");
  assert.equal(availableSpot(sky(0, -1), []), undefined);
  assert.equal(availableSpot({ x: 2.4, z: -25, layer: "sky" }, []).id, "return-end");
  assert.equal(gate.crossed(sky(0, -1), sky(0, -.1), 0), false);
  assert.equal(gate.crossed(sky(1.65, -1), sky(1.65, 1), 20), false);
  assert.equal(gate.crossed(sky(0, -1), sky(0, 1), 30), true);
});
