import * as THREE from "three";
import { BODY_RADIUS } from "./cotton-candy.js";
import { MOVE_SPEED } from "./motion.js";
import { seeded } from "./map.js";
import { SNOW_GATE, WINTER_TREE } from "./winter-layout.js";
import { createWinterBloomTrail } from "./winter-bloom-trail.js";
import { createWinterMotionParticles } from "./winter-motion-particles.js";

const BODY_DIAMETER = BODY_RADIUS * 2;
const DANCE_DELAY = 2.65;
const { clamp, lerp } = THREE.MathUtils;

export function permitsWinterMotion(x, z) {
  return (x - WINTER_TREE.x) ** 2 + (z - WINTER_TREE.z) ** 2 >= WINTER_TREE.shelter[1] ** 2 &&
    (x - SNOW_GATE.x) ** 2 + (z - SNOW_GATE.z) ** 2 >= 4.5 ** 2;
}

export function createWinterMotion(parent, night, clock, reduced) {
  const random = seeded(42781);
  const particles = createWinterMotionParticles(parent, random, reduced);
  const flowers = createWinterBloomTrail(parent, random, night, clock, reduced, particles, permitsWinterMotion);
  let nextBloom, stride, runTime, idleTime, strength, headingX, headingZ, leanX, leanZ, streamAngle;
  let wasRunning, wasMovingFast, turnAt, danceStarted;
  const events = { flower: false, dance: false, running: 0, stopped: false };

  function spacing() { return BODY_DIAMETER * (.80 + random() * .70); }

  function clear() {
    nextBloom = spacing();
    stride = runTime = idleTime = strength = leanX = leanZ = turnAt = 0;
    headingX = 0;
    headingZ = -1;
    streamAngle = -Math.PI / 2;
    wasRunning = wasMovingFast = danceStarted = false;
    events.flower = events.dance = events.stopped = false;
    events.running = 0;
    particles.clear();
    flowers.clear();
  }
  clear();

  return {
    clear,
    update(player, camera, step, dt, now) {
      events.flower = events.dance = events.stopped = false;
      const free = permitsWinterMotion(player.x, player.z);
      const length = step ? Math.hypot(step.dx, step.dz) : 0;
      const speed = step?.dt > 0 ? length / step.dt : 0;
      const grounded = Boolean(step && player.grounded && !step.landed && free);
      const running = grounded && speed >= MOVE_SPEED * .59;
      if (step?.landed && free) particles.land(player, now);

      if (grounded && speed > .64) {
        const x = step.dx / length;
        const z = step.dz / length;
        const directionDot = headingX * x + headingZ * z;
        const turn = headingX * z - headingZ * x;
        if (running && wasMovingFast && directionDot < .78 && now > turnAt) {
          particles.turn(player, x, z, turn < 0 ? -1 : 1, now);
          turnAt = now + .37;
        }
        const blend = 1 - Math.exp(-11 * dt);
        const driftX = headingX - x;
        const driftZ = headingZ - z;
        leanX = lerp(leanX, driftX * .33 - x * .17, blend);
        leanZ = lerp(leanZ, driftZ * .33 - z * .17, blend);
        const angleDelta = Math.atan2(z, x) - streamAngle;
        streamAngle += Math.atan2(Math.sin(angleDelta), Math.cos(angleDelta)) * (1 - Math.exp(-8 * dt));
        headingX = x;
        headingZ = z;

        stride += length;
        const interval = running ? .62 : 1.24;
        if (stride >= interval) {
          stride %= interval;
          particles.steps(player, x, z, clamp(speed / MOVE_SPEED, 0, 1), now);
        }
        if (running) {
          let consumed = nextBloom;
          while (consumed <= length) {
            const tail = length - consumed;
            const born = flowers.plant(player.x - x * tail, player.z - z * tail, x, z, now);
            events.flower ||= born;
            consumed += spacing();
          }
          nextBloom = consumed - length;
        }
      } else {
        stride = 0;
        const decay = 1 - Math.exp(-5 * dt);
        leanX = lerp(leanX, 0, decay);
        leanZ = lerp(leanZ, 0, decay);
      }

      if (running) {
        wasRunning = true;
        runTime += step.dt;
        idleTime = 0;
      } else {
        if (wasMovingFast) nextBloom = spacing();
        runTime = 0;
        idleTime += dt;
        if (wasRunning && idleTime > .30 && player.grounded) {
          events.stopped = danceStarted && free && Boolean(step);
          wasRunning = false;
          danceStarted = false;
        }
      }
      wasMovingFast = running;
      const dancing = runTime > DANCE_DELAY;
      if (dancing && !danceStarted) {
        danceStarted = true;
        events.dance = true;
      }
      strength = clamp(strength + (dancing ? dt / .88 : -dt / 3.05), 0, 1);
      particles.dance(player, Math.cos(streamAngle), Math.sin(streamAngle), leanX, leanZ, strength, dancing, now, night.value);
      flowers.update(now, camera);
      particles.update(now, night.value);
      events.running = runTime;
      return events;
    },
  };
}
