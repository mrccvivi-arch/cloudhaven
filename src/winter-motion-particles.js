import * as THREE from "three";
import { makePoints, snowTexture } from "../previews/snow-whale/snow.js";

const { smoothstep } = THREE.MathUtils;

function makePool(parent, map, size, count) {
  const batch = makePoints(parent, map, count, size, 3);
  const slots = Array.from({ length: count }, () => ({
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, birth: -Infinity, alpha: 0, glow: 0, lift: 0,
  }));
  let cursor = 0;
  return {
    emit(now, x, y, z, vx, vy, vz, life, size, alpha, glow, lift = 0) {
      Object.assign(slots[cursor], { x, y, z, vx, vy, vz, life, birth: now, alpha, glow, lift });
      batch.scales.setX(cursor, size);
      batch.scales.needsUpdate = true;
      cursor = (cursor + 1) % count;
    },
    update(now, night) {
      let visible = false;
      slots.forEach(({ x, y, z, vx, vy, vz, life, birth, alpha, glow, lift }, i) => {
        const age = now - birth;
        if (age < 0 || age >= life) {
          batch.colors.setW(i, 0);
          return;
        }
        visible = true;
        const u = age / life;
        const drift = age * (1 - .42 * u);
        const height = y + vy * drift - (lift ? .10 : .32) * age * age + lift * age * night;
        batch.positions.setXYZ(i, x + vx * drift, height, z + vz * drift);
        let fade = smoothstep(u, 0, .12) * (1 - smoothstep(u, .32, 1)) * alpha;
        const blue = (glow === 2 ? .04 : .17) * night;
        if (height < y - .17 && !lift) fade *= 1 - smoothstep(y - height, .17, .48);
        batch.colors.setXYZW(i, 1 - blue, .96 - (glow === 2 ? .10 * night : blue * .21),
          glow === 2 ? 1 - .28 * night : 1, fade * (.87 + .13 * night));
      });
      batch.material.visible = visible;
      if (visible) batch.positions.needsUpdate = batch.colors.needsUpdate = true;
    },
    clear() {
      cursor = 0;
      batch.material.visible = false;
      for (const slot of slots) slot.birth = -Infinity;
      for (let i = 0; i < count; i++) batch.colors.setW(i, 0);
      batch.colors.needsUpdate = true;
    },
  };
}

export function createWinterMotionParticles(parent, random, reduced) {
  const soft = snowTexture("snow");
  const crystal = snowTexture("crystal");
  const star = snowTexture("star");
  const powder = makePool(parent, soft, .19, reduced ? 220 : 300);
  const shimmer = makePool(parent, star, .21, reduced ? 220 : 280);
  const arcs = makePoints(parent, crystal, reduced ? 81 : 105, .182, 4);
  const motes = makePoints(parent, star, reduced ? 27 : 33, .205, 4);
  const arcShape = [
    { start: -.78, width: 1.15, radius: 1.37, height: .43, speed: .25, offset: -.26 },
    { start: 1.05, width: 1.14, radius: 1.47, height: .78, speed: .21, offset: .24 },
    { start: .08, width: .82, radius: 1.62, height: 1.38, speed: .17, offset: -.09 },
  ];
  const dash = [];
  for (const batch of [arcs, motes]) {
    const dust = batch === motes;
    for (let index = 0; index < batch.positions.count; index++) {
      batch.scales.setX(index, dust ? .52 + random() * .78 : .57 + random() ** 1.6 * 1.04);
      dash.push({ batch, index, dust, stream: arcShape[index % 3],
        offset: random(), twinkle: random() * Math.PI * 2, radius: (random() - .50) * .59,
        lift: (random() - .5) * .72, glow: index % 11 === 0 });
    }
  }
  let shedAt = 0;

  return {
    seed(x, y, z, now) {
      for (let i = 0; i < 3; i++) shimmer.emit(now, x + (random() - .5) * .38, y + .035, z + (random() - .5) * .38,
        (random() - .5) * .43, .32 + random() * .66, (random() - .5) * .43, .29 + random() * .32,
        .46 + random() * .62, .65 + random() * .24, i === 2 ? 2 : 1, .13);
    },
    blossom(x, y, z, now, near) {
      for (let i = 0; i < (near ? 3 : 1); i++) shimmer.emit(now, x + (random() - .5) * .58, y + .10 + random() * .27,
        z + (random() - .5) * .58, (random() - .5) * .51, .21 + random() * .34, (random() - .5) * .51,
        1.0 + random() * .85, .45 + random() * .47, .47 + random() * .31, 1, .23);
    },
    steps(player, dx, dz, speed, now) {
      const count = speed > .62 ? 5 : 2;
      for (let i = 0; i < count; i++) {
        const off = (random() - .5) * .95;
        const push = (.26 + random() * 1.3) * speed;
        powder.emit(now, player.x + dz * off - dx * .32, player.y + .06, player.z - dx * off - dz * .32,
          -dx * push + dz * off, .42 + random() * .79, -dz * push - dx * off, .55 + random() * .56,
          .44 + random() * .76, .48 + speed * .28, 0);
      }
    },
    turn(player, dx, dz, side, now) {
      for (let i = 0; i < 10; i++) {
        const angle = (.18 + i * .15) * side;
        const x = -dx * Math.cos(angle) + dz * Math.sin(angle);
        const z = -dz * Math.cos(angle) - dx * Math.sin(angle);
        const speed = .67 + random() * .78;
        powder.emit(now, player.x + x * .38, player.y + .06, player.z + z * .38, x * speed,
          .66 + random() * .78, z * speed, .74 + random() * .51, .63 + random() * .45, .65, 0);
      }
    },
    land(player, now) {
      for (let i = 0; i < 23; i++) {
        const angle = i * 2 * Math.PI / 23 + (random() - .5) * .29;
        const x = Math.cos(angle);
        const z = Math.sin(angle);
        const pool = i % 5 === 0 ? shimmer : powder;
        const reach = .25 + random() * .34;
        const spread = .66 + random() * 1.12;
        pool.emit(now, player.x + x * reach, player.y + .075, player.z + z * reach,
          x * spread, .73 + random() * .81, z * spread, 1 + random() * .75, .55 + random() * .56, .74, 1);
      }
    },
    dance(player, dx, dz, leanX, leanZ, strength, running, now, night) {
      if (strength < .004) {
        for (const batch of [arcs, motes]) batch.material.visible = false;
        return;
      }
      for (const batch of [arcs, motes]) batch.material.visible = true;
      let shed = running && strength > .42 && now >= shedAt;
      for (const { batch, index, stream, dust, offset, twinkle, radius, lift, glow } of dash) {
        const u = THREE.MathUtils.euclideanModulo(offset + now * stream.speed, 1);
        const angle = stream.start + u * stream.width + .21 * Math.sin(now * .91 + stream.height);
        const width = (stream.radius + radius) * Math.cos(angle);
        const trailing = .37 + (stream.radius + radius) * Math.sin(angle);
        const band = stream === arcShape[1] ? -1 : 1;
        const side = band * Math.max(.79, Math.abs(width));
        const y = player.y + Math.max(.24, stream.height + lift + .27 * Math.sin(u * Math.PI + twinkle));
        const x = player.x - dz * side - dx * trailing + leanX;
        const z = player.z + dx * side - dz * trailing + leanZ;
        batch.positions.setXYZ(index, x, y, z);
        const edge = smoothstep(u, 0, .17) * (1 - smoothstep(u, .73, 1));
        const pulse = .72 + .28 * Math.sin(now * .89 + twinkle);
        const alpha = edge * pulse * strength * (dust ? .62 : .85);
        batch.colors.setXYZW(index, glow ? 1 : 1 - .16 * night, 1 - (glow ? .13 : .04) * night,
          glow ? 1 - .29 * night : 1, alpha);
        if (shed && dust && u > .72) {
          shimmer.emit(now, x, y, z, -dx * (1.2 + random()) - dz * side * .3, -.17,
            -dz * (1.2 + random()) + dx * side * .3, 1.12 + random() * .77, .64 + random() * .49, .60, glow ? 2 : 1);
          shedAt = now + .105;
          shed = false;
        }
      }
      for (const batch of [arcs, motes]) batch.positions.needsUpdate = batch.colors.needsUpdate = true;
    },
    update(now, night) {
      powder.update(now, night);
      shimmer.update(now, night);
    },
    clear() {
      powder.clear();
      shimmer.clear();
      shedAt = 0;
      for (const batch of [arcs, motes]) batch.material.visible = false;
    },
  };
}
