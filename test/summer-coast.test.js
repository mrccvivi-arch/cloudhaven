import assert from "node:assert/strict";
import test from "node:test";
import { Group, MathUtils, PerspectiveCamera, Vector3 } from "three";
import { createCameraRig } from "../src/camera.js";
import { nightBlend } from "../src/day-night.js";
import { createSummerWeather } from "../src/summer-weather.js";
import { createSummerLight } from "../src/summer-light.js";
import { createSummerBubbles } from "../src/summer-bubbles.js";
import { seeded } from "../src/map.js";
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

function chaseBubbles(player, seed) {
  const root = new Group();
  const bubbles = createSummerBubbles(root, seeded(seed));
  const camera = new PerspectiveCamera(50, 4 / 3, .1, 305);
  const rig = createCameraRig(camera, 0, 8);
  const projected = new Vector3();
  const sprites = root.children.filter((child) => child.isSprite);
  let initialized = false;
  return (dx, dz, running, headingX = dx, headingZ = dz, night = 0, weather) => {
    if (headingX || headingZ) rig.face(Math.atan2(-headingX, -headingZ));
    rig.update(player, dt, !initialized);
    initialized = true;
    bubbles.update(dt, night, player, camera, true, () => {}, { dx, dz, running }, dt, weather);
    camera.updateMatrixWorld();
    return sprites.some(({ visible, material, position }) => {
      const x = position.x - player.x, z = position.z - player.z;
      if (!visible || material.opacity < .25 || Math.hypot(x, z) > 27 || x * headingX + z * headingZ < -.01) return false;
      projected.copy(position).project(camera);
      if (Math.abs(projected.x) > .95 || Math.abs(projected.y) > .95 || Math.abs(projected.z) >= 1) return false;
      return [.2, .4, .6, .8, .92].every((t) => islandHeight(MathUtils.lerp(camera.position.x, position.x, t),
        MathUtils.lerp(camera.position.z, position.z, t)) <= MathUtils.lerp(camera.position.y, position.y, t) - .12);
    });
  };
}

for (const [name, direction, nightRun, rainRun] of [
  ["clockwise", 1, false, false], ["counterclockwise", -1, false, false], ["at night", 1, true, false],
  ["in a summer shower", 1, false, true],
]) {
  test(`Moon runs the full coast ${name} without stopping, jumping or triggering a gate`, () => {
    const start = coastalPoint(START);
    const player = at(...start);
    assert.equal(summerSurface(player.x, player.z, 0, player.y), "sand");
    const run = createSummerRun();
    const gate = createRainbowGateTrigger();
    const sampleBubbles = chaseBubbles(player, direction === 1 ? 6 : 27);
    const light = nightRun ? createSummerLight() : undefined;
    const weather = rainRun ? createSummerWeather(() => .2) : undefined;
    weather?.update(15, 15, true, false);
    let wetTime = 0;
    let time = 0, distance = 0, covered = 0, gap = 0, lastCovered = 5;
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
        const worldTime = (nightRun ? 224 : rainRun ? 45 : 75) + time;
        if (light) assert.equal(light.update(worldTime).moon, 1);
        const conditions = weather?.update(worldTime, worldTime, true, run.running);
        if (conditions?.rain > .4) wetTime += dt;
        const visibleBubbles = sampleBubbles(player.x - previous.x, player.z - previous.z, run.running,
          vx, vz, nightBlend(worldTime), conditions);
        if (nightRun) assert.equal(visibleBubbles, false);
        if (visibleBubbles) {
          if (time > 5) covered += dt;
          lastCovered = Math.max(lastCovered, time);
        } else if (time > 5) gap = Math.max(gap, time - lastCovered);
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
    if (rainRun) assert.ok(wetTime >= 20);
    if (!nightRun) assert.ok(covered / (time - 5) > .6 && gap < 2.5, `bubble coverage ${covered / (time - 5)}, gap ${gap}s`);
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

test("bubbles stay within view on the open beach, in the shallows and after reversing direction", () => {
  for (const [surface, radius] of [["sand", .985], ["water", 1.042]]) {
    const player = at(...coastPoint(1.29, radius));
    assert.equal(summerSurface(player.x, player.z), surface);
    const sampleBubbles = chaseBubbles(player, 6);
    const run = createSummerRun();
    let seenAt;
    for (let i = 0; i < 1000; i++) {
      if (sampleBubbles(0, 0, false, 1, .12)) seenAt ??= i * dt;
    }
    assert.ok(seenAt < 7, `no visible bubble group while waiting on ${surface}`);

    let angle = 1.29, direction = 1, covered = 0, sameSurface = 0;
    for (let i = 0; i < 3000; i++) {
      // Keep to the open southern arc and give the camera the new running direction at each reversal.
      if (angle >= 1.42 || angle <= 1.13) direction *= -1;
      angle += direction * .0018;
      const [x, z] = coastPoint(angle, radius);
      const dx = x - player.x, dz = z - player.z;
      const speed = MOVE_SPEED / Math.max(.01, Math.hypot(dx, dz));
      const px = player.x, pz = player.z;
      assert.equal(run.move(player, dx * speed, dz * speed, dt).fell, false);
      if (summerSurface(player.x, player.z) === surface) sameSurface++;
      if (sampleBubbles(player.x - px, player.z - pz, run.running, dx, dz)) covered++;
    }
    assert.ok(sameSurface > 2700, `left the ${surface} route in ${3000 - sameSurface} frames`);
    assert.ok(covered > 1500, `visible for only ${covered / 100}s on ${surface}`);
  }
});
