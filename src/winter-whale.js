import * as THREE from "three";
import { createWhale } from "../previews/snow-whale/whale.js";
import { createSnow } from "../previews/snow-whale/snow.js";
import { poseWhale, routes } from "../previews/snow-whale/routes.js";
import { WINTER_TREE, winterHeight } from "./winter-layout.js";

const { clamp, smoothstep } = THREE.MathUtils;
const gameRoutes = {
  cruise: { ...routes.cruise, width: 115, depth: 128, centerZ: -215, height: 35, lift: 5, phase: -.94 },
  pass: { ...routes.pass, width: 89, depth: 143, centerZ: -197, height: 21, lift: 2.0, phase: -.91 },
  climb: { ...routes.climb, width: 98, depth: 114, centerZ: -186, height: 32, lift: 16, phase: -.94 },
};
const SWEEP = 1.86;
const FADE_IN = 3;
const FADE_OUT = 4;
const WAKE_LIFE = 12;
const kinds = Object.keys(gameRoutes);
const compactView = aspect => 1 - smoothstep(aspect, 1.30, 1.58);

function clearSky(anchor, point) {
  let score = 1;
  for (const fraction of [.16, .29, .43, .58, .73, .87]) {
    const x = THREE.MathUtils.lerp(anchor.x, point.x, fraction);
    const z = THREE.MathUtils.lerp(anchor.z, point.z, fraction);
    const y = THREE.MathUtils.lerp(anchor.y + 2.7, point.y, fraction);
    if (y < winterHeight(x, z) + 1.5) score -= 1.2;
    if (y < 27 && Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z) < 15) score -= .7;
  }
  return score;
}

export function createWinterWhale(parent, random, reduced = false) {
  const whale = createWhale(random, { underside: true });
  whale.group.scale.multiplyScalar(1.88);
  whale.group.visible = false;
  parent.add(whale.group);
  const trail = createSnow(parent, random, whale, { weather: false, wakeClarity: 1.64, winter: true, reduced });
  const offset = new THREE.Vector3();
  const entry = new THREE.Vector3();
  const entryView = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const projection = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const probe = new THREE.Object3D();
  const aim = new THREE.Quaternion();
  const cues = [];
  let active = false;
  let elapsed, next, event, wasNight, lastKind, announced, hasEntry;

  function sample(group, time) {
    poseWhale(group, event.route, time);
    group.position.applyQuaternion(rotation).add(offset);
    group.quaternion.premultiply(rotation);
  }

  function facing(camera) {
    camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < .001) direction.set(0, 0, -1);
    return direction.normalize();
  }

  function choosePath(kind, duration, player, camera, initial) {
    const current = facing(camera);
    const useEntry = initial && Math.hypot(player.x - entry.x, player.z - entry.z) < 13 && current.dot(entryView) > .80;
    offset.copy(useEntry ? entry : player);
    const forward = useEntry ? entryView : current;
    const yaw = Math.atan2(-forward.x, -forward.z);
    const width = gameRoutes[kind].width * clamp(camera.aspect / 1.42, .44, 1);
    const template = { ...gameRoutes[kind], speed: (SWEEP - .35 * compactView(camera.aspect)) / duration };
    let best = -Infinity;

    for (const side of [-1, 1]) {
      for (const shift of [-.24, -.12, 0, .12, .24]) {
        const route = { ...template, width: width * side };
        aim.setFromAxisAngle(up, yaw + shift);
        let score = -Math.abs(shift);
        for (const portion of [.05, .18, .32, .53, .73, .90]) {
          poseWhale(probe, route, duration * portion);
          probe.position.applyQuaternion(aim).add(offset);
          relative.subVectors(probe.position, offset).setY(0).normalize();
          const open = clearSky(offset, probe.position);
          score += open * (portion < .32 && initial ? 1.7 : 1);
          score += relative.dot(current);
          projection.copy(probe.position).project(camera);
          const horizontal = Math.abs(projection.x);
          if (projection.z < 1 && projection.z > -1) {
            score += (1 - smoothstep(horizontal, .57, 1.16)) * (initial && portion < .32 ? 4 : 2.2);
          }
        }
        if (score > best) {
          best = score;
          event.route = route;
          rotation.copy(aim);
        }
      }
    }
  }

  function reset() {
    active = false;
    event = undefined;
    hasEntry = false;
    lastKind = undefined;
    cues.length = 0;
    whale.group.visible = false;
    trail.reset(0);
  }

  return {
    enter() {
      reset();
      active = true;
      elapsed = 0;
      next = 8 + random() * 4;
      announced = false;
    },
    leave: reset,
    update(dt, player, camera, night) {
      if (!active) return 0;
      if (!hasEntry) {
        entry.copy(player);
        entryView.copy(facing(camera));
        hasEntry = true;
      }
      elapsed += dt;
      const dark = night >= .5;
      if (dark !== wasNight) {
        wasNight = dark;
        whale.light(dark, trail.starTexture);
      }
      if (!lastKind && !announced && elapsed >= next - 2.5) {
        announced = true;
        cues.push({ type: "approach" });
      }
      if (elapsed >= next) {
        const initial = !lastKind;
        const alternatives = kinds.filter(kind => kind !== lastKind);
        const kind = initial ? "pass" : alternatives[Math.floor(random() * alternatives.length)];
        const minimum = 40 + 6 * compactView(camera.aspect);
        const duration = minimum + random() * (60 - minimum) + FADE_IN + FADE_OUT;
        event = { kind, duration, start: elapsed, initial, seen: false, prompted: false, departed: false };
        choosePath(kind, duration, player, camera, initial);
        lastKind = kind;
        next = elapsed + duration + 15 + random() * 10;
        trail.reset(0);
      }
      if (!event) return 0;

      const age = elapsed - event.start;
      if (age >= event.duration + WAKE_LIFE) {
        event = undefined;
        trail.reset(0);
        return 0;
      }
      const reveal = smoothstep(age, 0, FADE_IN) * (1 - smoothstep(age, event.duration - FADE_OUT, event.duration));
      whale.group.visible = reveal > .003;
      if (whale.group.visible) {
        sample(whale.group, age);
        whale.reveal(reveal);
        whale.swim(age);
        relative.subVectors(whale.group.position, player).setY(0).normalize();
        const ahead = relative.dot(facing(camera)) > .72;
        projection.copy(whale.group.position).project(camera);
        const inView = projection.z > -1 && projection.z < 1 &&
          Math.abs(projection.x) < 1.05 && Math.abs(projection.y) < 1.07;
        const open = ahead && (event.initial && !event.prompted || !event.seen) &&
          clearSky(player, whale.group.position) > 0;
        if (event.initial && !event.prompted && reveal > .22 && open && Math.abs(projection.x) < 1.13) {
          event.prompted = true;
          cues.push({ type: "look" });
        }
        if (!event.seen && reveal > .45 && inView && open) {
          event.seen = true;
          cues.push({ type: "sighting", kind: event.kind, initial: event.initial });
        }
      } else if (!event.departed && age >= event.duration) {
        event.departed = true;
        if (event.seen) cues.push({ type: "depart" });
      }
      trail.update(age, 0, sample, night, reveal > .11);
      return reveal * (1 - smoothstep(Math.hypot(whale.group.position.x - player.x, whale.group.position.z - player.z), 23, 77));
    },
    takeCue() { return cues.shift(); },
  };
}
