import assert from "node:assert/strict";
import test from "node:test";
import { Group, MathUtils } from "three";
import { blockingSolid, PLAYER_RADIUS } from "../src/collision.js";
import { BODY_RADIUS } from "../src/cotton-candy.js";
import { MOVE_SPEED, movePlayer, spawnPlayer } from "../src/motion.js";
import { createSummerEffects } from "../src/summer-effects.js";
import { createRainbowGateTrigger } from "../src/summer-island.js";
import { COAST_HEADROOM, ISLAND_BRIDGE, PIER, PIER_SUPPORTS, SHORE_X, SHORE_Z, SUMMER, coastPoint, islandHeight,
  onRainbow, pierLocal, pierPoint, summerDeckCeiling, summerSurface, summerWalkable, wadePoint } from "../src/summer-layout.js";
import { createSummerRun } from "../src/summer-run.js";

const TAU = Math.PI * 2;
const START = 1.46;
const dt = .01;

function coastalPoint(angle) {
  const a = MathUtils.euclideanModulo(angle, TAU);
  const { smoothstep } = MathUtils;
  const underBridge = smoothstep(a, 1.51, 1.63) * (1 - smoothstep(a, 1.86, 1.98));
  const behindPier = smoothstep(a, .32, .70) * (1 - smoothstep(a, .99, 1.33));
  return coastPoint(a, .995 + .059 * underBridge - .275 * behindPier);
}

function at(x, z) {
  return spawnPlayer({ layer: SUMMER, x, z, y: islandHeight(x, z) });
}

for (const [name, direction] of [["clockwise", 1], ["counterclockwise", -1]]) {
  test(`Moon runs the full coast ${name} without stopping, jumping or triggering a gate`, () => {
    const start = coastalPoint(START);
    const player = at(...start);
    assert.equal(summerSurface(player.x, player.z, 0, player.y), "sand");
    const run = createSummerRun();
    const gate = createRainbowGateTrigger();
    let time = 0, distance = 0;
    let underRainbow = false, behindCliff = false, aroundPier = false;
    for (let i = 1; i <= 720; i++) {
      const angle = START + direction * i * TAU / 720;
      const [x, z] = coastalPoint(angle);
      for (let j = 0; Math.hypot(x - player.x, z - player.z) > .16; j++) {
        assert.ok(j < 20, `blocked at ${angle}`);
        const vx = x - player.x, vz = z - player.z;
        const speed = MOVE_SPEED / Math.hypot(vx, vz);
        const previous = { ...player };
        assert.equal(run.move(player, vx * speed, vz * speed, dt).fell, false);
        time += dt;
        const step = Math.hypot(player.x - previous.x, player.z - previous.z);
        assert.ok(step >= MOVE_SPEED * dt - 1e-6, `movement interrupted at ${angle}`);
        distance += step;
        if (time > 2.02) assert.ok(run.running, `run interrupted at ${angle}`);
        assert.ok(player.grounded && Math.abs(player.y - islandHeight(player.x, player.z)) < .025);
        assert.ok(Math.abs(player.y - previous.y) < .035);
        assert.equal(gate.crossed({ ...previous, y: previous.y + BODY_RADIUS },
          { ...player, y: player.y + BODY_RADIUS }, time * 1000), false);

        const surface = summerSurface(player.x, player.z, 0, player.y);
        underRainbow ||= onRainbow(ISLAND_BRIDGE, player.x, player.z) && surface === "water";
        behindCliff ||= player.z < -38 && player.x > 12 && player.x < 28;
        const { along, across } = pierLocal(player.x, player.z);
        aroundPier ||= along < -2 && along > -6 && Math.abs(across) < 1;
      }
    }
    assert.ok(distance > 300 && Math.hypot(player.x - start[0], player.z - start[1]) < .18);
    assert.ok(underRainbow && behindCliff && aroundPier);
  });
}

test("the coastal route has at least four body diameters of usable width", () => {
  for (let angle = 0; angle < TAU; angle += .025) {
    const [x, z] = coastalPoint(angle);
    const [ax, az] = coastalPoint(angle - .001);
    const [bx, bz] = coastalPoint(angle + .001);
    const length = Math.hypot(bx - ax, bz - az);
    const nx = (bz - az) / length, nz = (ax - bx) / length;
    let width = 0;
    for (const side of [-1, 1]) {
      let previousY = islandHeight(x, z);
      for (let offset = .2; offset <= 7; offset += .2) {
        const px = x + side * nx * offset;
        const pz = z + side * nz * offset;
        const y = islandHeight(px, pz);
        if (Math.abs(y - previousY) > .09 || blockingSolid(SUMMER, px, y, pz) ||
            !summerWalkable({ layer: SUMMER, x: px, y, z: pz }, px, pz, PLAYER_RADIUS) ||
            summerDeckCeiling(px, pz, y, PLAYER_RADIUS) < y + COAST_HEADROOM) break;
        width += .2;
        previousY = y;
      }
    }
    assert.ok(width >= BODY_RADIUS * 8, `only ${width} units wide at ${angle}`);
  }
});

test("the pier supports stop travel while the crossing between them remains open", () => {
  const post = PIER_SUPPORTS.find(({ along }) => along > 11 && along < 12);
  const start = pierPoint(-3.2, post.along);
  const player = at(start.x, start.z);
  for (let i = 0; i < 100; i++) movePlayer(player, Math.cos(PIER.yaw) * .055, -Math.sin(PIER.yaw) * .055, dt);
  assert.ok(pierLocal(player.x, player.z).across < -2.6 && player.grounded);

  const crossing = pierPoint(-3.6, 13.2);
  const wader = at(crossing.x, crossing.z);
  for (let i = 0; i < 145; i++) movePlayer(wader, Math.cos(PIER.yaw) * .05, -Math.sin(PIER.yaw) * .05, dt);
  assert.ok(pierLocal(wader.x, wader.z).across > 3.5 && wader.grounded && wader.y < 0);
});

test("the new shallows behind the cape produce splashes and support sliding along the deep edge", () => {
  const [x, z] = coastPoint(5.18, 1.06);
  const player = at(x, z);
  assert.equal(summerSurface(player.x, player.z), "water");
  const root = new Group();
  const effects = createSummerEffects(root);
  effects.update(0, dt, 0, { ...player, surface: "water", dx: .08, dz: 0, running: true });
  assert.equal(root.children[0].count, 8);
  assert.equal(root.children[1].count, 1);

  const [sx, sz] = wadePoint(5.18, PLAYER_RADIUS + .01);
  const edge = at(sx, sz);
  for (const direction of [-1, 1]) {
    const startAngle = Math.atan2(edge.z / SHORE_Z, edge.x / SHORE_X);
    for (let i = 0; i < 120; i++) {
      const angle = Math.atan2(edge.z / SHORE_Z, edge.x / SHORE_X);
      const [tx, tz] = wadePoint(angle + direction * .0014, PLAYER_RADIUS - .04);
      movePlayer(edge, tx - edge.x, tz - edge.z, dt);
      assert.ok(summerWalkable(edge, edge.x, edge.z, PLAYER_RADIUS) && edge.grounded);
    }
    const endAngle = Math.atan2(edge.z / SHORE_Z, edge.x / SHORE_X);
    assert.ok(direction * (endAngle - startAngle) > .13);
  }
});
