import * as THREE from "three";
import { snowTexture } from "../previews/snow-whale/snow.js";
import { MOVE_SPEED } from "./motion.js";
import { WINTER_LIMIT, WINTER_TREE, SNOW_GATE, winterHeight, winterWalkable, winterLakeExtent } from "./winter-layout.js";

const tau = Math.PI * 2;
const range = (random, min, max) => min + random() * (max - min);

function snowy(x, z) {
  return Math.hypot(x, z) < WINTER_LIMIT - .55 && winterLakeExtent(x, z) > 1.015 &&
    Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z) > WINTER_TREE.trunk + .8 &&
    Math.hypot(x - SNOW_GATE.x, z - SNOW_GATE.z) > 3.3;
}

export function createWinterPups(parent, random = Math.random) {
  const root = new THREE.Group();
  root.name = "Snow pups";
  parent.add(root);
  const body = new THREE.SphereGeometry(1, 18, 12);
  const positions = body.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const ripple = 1 + .035 * Math.sin(5 * x + 3 * z) * Math.cos(4 * y);
    positions.setXYZ(i, x * ripple * 1.1, y * ripple * .89, z * ripple);
  }
  body.computeVertexNormals();
  const snow = new THREE.MeshStandardMaterial({ color: 0xf9fcff, roughness: .87, emissive: 0x829bbd, emissiveIntensity: .16 });
  const eye = new THREE.SphereGeometry(.091, 8, 6);
  const ink = new THREE.MeshBasicMaterial({ color: 0x202536 });
  const shadowGeometry = new THREE.PlaneGeometry(2.7, 2.7);
  shadowGeometry.rotateX(-Math.PI / 2);
  const texture = snowTexture("snow");
  const shadow = new THREE.MeshBasicMaterial({ alphaMap: new THREE.DataTexture(
    Uint8Array.from({ length: 32 * 32 * 4 }, (_, i) => {
      const p = Math.floor(i / 4);
      return 255 * Math.max(0, 1 - Math.hypot(p % 32 - 15.5, Math.floor(p / 32) - 15.5) / 15.5) ** 1.3;
    }), 32, 32), color: 0x496486, opacity: .5, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2 });
  shadow.alphaMap.needsUpdate = true;

  const pups = Array.from({ length: 10 }, () => {
    const model = new THREE.Group(), footprint = new THREE.Mesh(shadowGeometry, shadow);
    model.add(new THREE.Mesh(body, snow));
    for (const side of [-1, 1]) {
      const dot = new THREE.Mesh(eye, ink);
      dot.position.set(side * .31, .24, .91);
      model.add(dot);
    }
    root.add(model, footprint);
    return { model, footprint, state: "gone" };
  });
  const burst = new THREE.BufferGeometry();
  const marks = new THREE.BufferAttribute(new Float32Array(160 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  burst.setAttribute("position", marks);
  const motes = new THREE.Points(burst, new THREE.PointsMaterial({
    map: texture, color: 0xe4f3ff, size: .085, opacity: .68, transparent: true, depthWrite: false,
  }));
  motes.frustumCulled = false;
  root.add(motes);
  const particles = Array.from({ length: 160 }, () => ({ age: 1 }));
  let cursor, time, nextSpawn, previousGrounded, vx, vz, previousX, previousZ;

  function puff(p, count) {
    for (let i = 0; i < count; i++) {
      const particle = particles[cursor++ % particles.length];
      const angle = random() * tau;
      Object.assign(particle, { age: 0, x: p.x, z: p.z, y: winterHeight(p.x, p.z) + .10,
        dx: .6 * Math.cos(angle), dz: .6 * Math.sin(angle), dy: range(random, .45, 1.15) });
    }
  }

  function spawn(player, heading) {
    const slots = pups.filter(p => p.state === "gone");
    const count = 3 + Math.floor(random() * 3);
    if (slots.length < count || pups.filter(p => p.leader && p.state !== "gone").length >= 2) return false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = heading + range(random, -.92, .92);
      const distance = range(random, 13, 19);
      const centerX = player.x + Math.sin(angle) * distance, centerZ = player.z + Math.cos(angle) * distance;
      const spots = [];
      for (let i = 0; i < count; i++) {
        const a = i * tau / count + range(random, -.23, .23);
        const x = centerX + Math.cos(a) * 1.45, z = centerZ + Math.sin(a) * 1.45;
        if (snowy(x, z) && pups.every(p => p.state === "gone" || Math.hypot(p.x - x, p.z - z) > 2)) spots.push({ x, z });
      }
      if (spots.length !== count) continue;
      for (let i = 0; i < count; i++) {
        Object.assign(slots[i], spots[i], {
          state: "buried", leader: i === 0, born: time, size: range(random, .18, .29),
          lane: i * tau / count + range(random, -.18, .18), spread: range(random, 2, 3.05),
          speed: range(random, 8.8, 11.2), height: range(random, .10, .23), period: range(random, .34, .52),
          delay: range(random, .06, .75), phase: random(), wake: undefined, mimic: Infinity,
        });
      }
      return true;
    }
    return false;
  }

  function advance(p, x, z, dt, speed, player) {
    let dx = x - p.x, dz = z - p.z;
    for (const other of pups) {
      if (other === p || other.state !== "active") continue;
      const sx = p.x - other.x, sz = p.z - other.z, d = Math.hypot(sx, sz);
      if (d > .001 && d < .85) {
        dx += sx / d * (.85 - d) * 2;
        dz += sz / d * (.85 - d) * 2;
      }
    }
    const distance = Math.hypot(dx, dz);
    if (distance < .12) return false;
    const stride = Math.min(speed * dt, distance);
    const angle = Math.atan2(dx, dz);
    for (const offset of [0, -.65, .65, -1.2, 1.2]) {
      const nx = p.x + Math.sin(angle + offset) * stride, nz = p.z + Math.cos(angle + offset) * stride;
      if (player && Math.hypot(nx - player.x, nz - player.z) < 1.15) continue;
      if (!snowy(nx, nz) || !winterWalkable(p.x, p.z, nx, nz)) continue;
      p.x = nx;
      p.z = nz;
      return true;
    }
    return false;
  }

  function clear() {
    cursor = time = vx = vz = 0;
    nextSpawn = 2.5;
    previousX = previousZ = previousGrounded = undefined;
    for (const p of pups) {
      p.state = "gone";
      p.model.visible = p.footprint.visible = false;
    }
    for (const p of particles) p.age = 1;
    burst.setDrawRange(0, 0);
  }
  clear();

  return { clear, update(player, camera, dt, step) {
    time += dt;
    const rawX = step?.dt ? step.dx / step.dt : 0, rawZ = step?.dt ? step.dz / step.dt : 0;
    const weight = 1 - Math.exp(-dt * 9);
    vx += (rawX - vx) * weight;
    vz += (rawZ - vz) * weight;
    const speed = Math.min(MOVE_SPEED, Math.hypot(vx, vz));
    const heading = speed > .45 ? Math.atan2(vx, vz) : Math.atan2(player.x - camera.position.x, player.z - camera.position.z);
    const jumped = previousGrounded && !player.grounded && player.vy > 0;
    previousGrounded = player.grounded;
    const warped = previousX !== undefined && Math.hypot(player.x - previousX, player.z - previousZ) > 5;
    previousX = player.x;
    previousZ = player.z;
    if (time >= nextSpawn && step && snowy(player.x, player.z)) {
      nextSpawn = time + (spawn(player, heading) ? range(random, 14, 23) : 3);
    }

    for (const p of pups) {
      if (p.state === "gone") continue;
      const distance = Math.hypot(p.x - player.x, p.z - player.z);
      if (p.state === "buried") {
        if (distance < 9) p.wake ??= time + p.delay;
        if (time >= p.wake) {
          p.state = "active";
          p.since = time;
          p.until = time + range(random, 30, 60);
          p.trick = time + range(random, 7, 15);
          p.leadUntil = 0;
          puff(p, 9);
        } else if (time - p.born > 15 && distance > 26) p.state = "gone";
      } else if (warped || distance > 29 || (p.state === "active" && time >= p.until)) {
        if (p.state !== "leaving") {
          p.state = "leaving";
          p.since = time;
          puff(p, 4);
        }
      }

      let moved = false, hop = 0, depth = 0;
      if (p.state === "active") {
        if (jumped && distance < 6 && random() < .53) p.mimic = time + range(random, .12, .40);
        if (time >= p.trick) {
          p.trick = time + range(random, 8, 18);
          if (speed > 2 && random() < .58) p.leadUntil = time + range(random, 1.6, 3.2);
          else if (distance < 6 && random() < .42) {
            p.state = "hiding";
            p.since = time;
            puff(p, 4);
          }
        }
        const lane = heading + (time < p.leadUntil ? Math.sign(Math.sin(p.lane) || 1) * .86 : p.lane);
        const stride = speed > 1 ? 1.8 : .12;
        if (time - p.since > .7 + p.delay && step) {
          moved = advance(p, player.x + Math.sin(lane) * p.spread + Math.sin(heading) * stride,
            player.z + Math.cos(lane) * p.spread + Math.cos(heading) * stride, dt, speed > 1 ? p.speed : 2.4, player);
        }
        const prior = p.phase;
        if (moved || prior > 0) p.phase = (prior + dt / p.period) % 1;
        if (!moved && p.phase < prior) p.phase = 0;
        if (p.phase < prior && moved) puff(p, 2);
        hop = Math.sin(Math.PI * p.phase) * p.height;
        const mimicAge = time - p.mimic;
        if (mimicAge >= 0 && mimicAge < .46) hop = Math.max(hop, .34 * Math.sin(Math.PI * mimicAge / .46));
        if (time - p.since < .54) hop += .32 * Math.sin(Math.PI * (time - p.since) / .54);
        else if (!moved) hop += Math.max(0, Math.sin(time * 2 + p.lane) - .94) * .7;
      }
      if (p.state === "buried") depth = .98;
      if (p.state === "hiding") {
        const age = time - p.since;
        depth = Math.min(1.95, age * 5);
        if (age > .48) {
          advance(p, p.x + Math.sin(p.lane) * 2, p.z + Math.cos(p.lane) * 2, dt, 2);
          depth *= Math.min(1, Math.max(0, (1.22 - age) * 4));
        }
        if (age > 1.22) {
          p.state = "active";
          p.since = time;
          puff(p, 6);
        }
      }
      if (p.state === "leaving") {
        depth = (time - p.since) * 4.2;
        if (depth >= 2) p.state = "gone";
      }
      const show = p.state !== "gone";
      p.model.visible = p.footprint.visible = show;
      if (!show) continue;
      const height = winterHeight(p.x, p.z);
      p.model.position.set(p.x, height + p.size * (.87 - depth) + hop, p.z);
      const face = Math.atan2(player.x - p.x, player.z - p.z);
      p.model.rotation.y += Math.atan2(Math.sin(face - p.model.rotation.y), Math.cos(face - p.model.rotation.y)) * weight;
      p.model.rotation.z = .075 * Math.sin(time * 5 + p.lane);
      const squash = .11 * Math.cos(p.phase * tau) * (moved ? 1 : .28);
      p.model.scale.set(p.size * (1 + squash), p.size * (1 - squash), p.size * (1 + squash));
      p.footprint.position.set(p.x, height + .033, p.z);
      p.footprint.scale.setScalar(p.size * (1.2 + hop * .6));
    }

    let count = 0;
    for (const p of particles) {
      p.age += dt;
      if (p.age >= .50) continue;
      marks.setXYZ(count++, p.x + p.dx * p.age, p.y + p.dy * p.age - 1.6 * p.age ** 2, p.z + p.dz * p.age);
    }
    marks.needsUpdate = true;
    burst.setDrawRange(0, count);
  } };
}
