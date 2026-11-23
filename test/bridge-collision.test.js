import assert from "node:assert/strict";
import test from "node:test";
import { BRIDGE_RAMPS, CREEK_BRIDGE, TREES, rampHeight, terrainHeight } from "../src/map.js";
import { PLAYER_RADIUS, blockingSolid, staticColliders } from "../src/collision.js";
import { floorAt, jump, movePlayer, spawnPlayer } from "../src/motion.js";
import { readSave } from "../src/save.js";

test("both bridge approaches are continuous and walkable in either direction", () => {
  const { x, y } = CREEK_BRIDGE;
  for (const ramp of BRIDGE_RAMPS) {
    for (const px of ramp.xs) {
      assert.equal(rampHeight(ramp, px, ramp.bridgeZ), y);
      assert.ok(Math.abs(rampHeight(ramp, px, ramp.landZ) - terrainHeight(px, ramp.landZ)) < 1e-9);
    }
  }
  for (const direction of [-1, 1]) {
    const player = spawnPlayer({ x, z: direction < 0 ? -15 : -37, layer: "ground" });
    const floors = new Set();
    for (let i = 0; i < 330; i++) {
      const prior = player.y;
      movePlayer(player, 0, direction * .067, 1 / 120);
      const floor = floorAt(player.layer, player.x, player.z);
      floors.add(floor.id);
      assert.ok(player.grounded, "Lost ground at a bridge seam");
      assert.equal(player.y, floor.y);
      assert.ok(Math.abs(player.y - prior) < .08, "Abrupt height change at a bridge seam");
    }
    assert.ok(["north-ramp", "creek-bridge", "south-ramp"].every((name) => floors.has(name)));
  }
  const besideRamp = spawnPlayer({ x: 20.5, z: -31, layer: "ground" });
  movePlayer(besideRamp, 2, 0, .25);
  assert.ok(besideRamp.x < x - CREEK_BRIDGE.w / 2);
  const oldPose = { x, y: 1.24, z: CREEK_BRIDGE.z, layer: "ground" };
  assert.equal(readSave({ pose: oldPose }).pose.y, y);
});

test("static solids stop high-speed moves and allow sliding along rails", () => {
  const tree = TREES[0];
  const trunk = spawnPlayer({ layer: "ground", x: tree.x - 2, z: tree.z });
  movePlayer(trunk, 6, 0, .7);
  assert.ok(trunk.x <= tree.x - tree.radius - PLAYER_RADIUS + .001);

  const rock = staticColliders("ground").find(({ kind, x, z }) =>
    kind === "rock" && Math.abs(x) < 45 && Math.abs(z) < 45);
  const stone = spawnPlayer({ layer: "ground", x: rock.x - rock.cos * 2, z: rock.z + rock.sin * 2 });
  movePlayer(stone, rock.cos * 4, -rock.sin * 4, .45);
  assert.ok((stone.x - rock.x) * rock.cos - (stone.z - rock.z) * rock.sin <= -.45);

  const railing = spawnPlayer({ layer: "ground", x: CREEK_BRIDGE.x, z: CREEK_BRIDGE.z });
  movePlayer(railing, 5, 2, .5);
  assert.ok(railing.x < CREEK_BRIDGE.x + CREEK_BRIDGE.w / 2 - PLAYER_RADIUS);
  assert.ok(railing.z > CREEK_BRIDGE.z + 1.8);
});

test("saved positions inside scenery recover outside the colliders", () => {
  const { x, z } = TREES[0];
  const player = spawnPlayer({ layer: "ground", x, z });
  assert.equal(blockingSolid(player.layer, player.x, player.y, player.z), undefined);
  assert.ok(Math.hypot(player.x - x, player.z - z) < 2);
});
