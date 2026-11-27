import * as THREE from "three";
import { createWhale } from "../previews/snow-whale/whale.js";
import { createSnow } from "../previews/snow-whale/snow.js";
import { createWinterFlight, WINTER_CROWN } from "./winter-flight.js";
import { createWinterStarSnow } from "./winter-star-snow.js";
import { createWhaleMotes } from "./winter-whale-motes.js";
import { WINTER_TREE, winterHeight } from "./winter-layout.js";

const { smoothstep } = THREE.MathUtils;
const FADE_IN = 3;
const FADE_OUT = 4;
const WAKE_LIFE = 12;
const flights = {
  pass: Array.from({ length: 16 }, (_, index) => createWinterFlight("pass", { angle: index * Math.PI / 8 })),
  cruise: [createWinterFlight("cruise"), createWinterFlight("cruise", { opposite: true })],
  climb: [createWinterFlight("climb"), createWinterFlight("climb", { opposite: true })],
};
const compactView = aspect => 1 - smoothstep(aspect, 1.30, 1.58);

function clearSky(anchor, point) {
  let score = 1;
  for (const fraction of [.16, .29, .43, .58, .73, .87]) {
    const x = THREE.MathUtils.lerp(anchor.x, point.x, fraction);
    const z = THREE.MathUtils.lerp(anchor.z, point.z, fraction);
    const y = THREE.MathUtils.lerp(anchor.y, point.y, fraction);
    if (y < winterHeight(x, z) + 1.5) score -= 1.2;
    const crownWidth = y < 8 ? 4 : y < 22 ? 19 : 9;
    if (y < WINTER_CROWN.top && Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z) < crownWidth) score -= .8;
  }
  return score;
}

export function createWinterWhale(parent, random, reduced = false, echo) {
  const whale = createWhale(random, { underside: true, pearlIce: true });
  whale.group.scale.multiplyScalar(1.88);
  whale.group.visible = false;
  parent.add(whale.group);
  echo?.attach(whale.group);
  const trail = createSnow(parent, random, whale, { weather: false, wakeClarity: 1.64, winter: true, reduced });
  const motes = createWhaleMotes(parent, trail.starTexture, reduced);
  const starSnow = createWinterStarSnow(parent, whale, reduced);
  const direction = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const projection = new THREE.Vector3();
  const probe = new THREE.Object3D();
  const cues = [];
  let active = false;
  const upcoming = [];
  let elapsed, next, event, lastKind, announced;

  function sample(group, time) {
    event.flight(group, time / event.duration, time);
  }

  function facing(camera) {
    camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < .001) direction.set(0, 0, -1);
    return direction.normalize();
  }

  function choosePath(kind, camera) {
    const current = facing(camera);
    let best = -Infinity;
    for (const flight of flights[kind]) {
      let score = 0;
      for (const progress of [.023, .075, .15, .26]) {
        flight(probe, progress, 0);
        relative.subVectors(probe.position, camera.position).normalize();
        axis.set(1, 0, 0).applyQuaternion(probe.quaternion);
        projection.copy(probe.position).project(camera);
        const open = clearSky(camera.position, probe.position);
        const horizontal = Math.abs(projection.x);
        const screen = projection.z > -1 && projection.z < 1 ?
          (1 - smoothstep(horizontal, .26, 1.30)) * (1 - smoothstep(Math.abs(projection.y), .64, 1.26)) : 0;
        const opening = progress < .10 ? 2 : 1;
        score += opening * (3.6 * open + 3 * relative.dot(current) +
          7 * screen - 2.6 * Math.abs(axis.dot(relative)));
        score -= .014 * Math.abs(probe.position.distanceTo(camera.position) - 83);
      }
      if (score > best) {
        best = score;
        event.flight = flight;
      }
    }
  }

  function reset() {
    active = false;
    event = undefined;
    upcoming.length = 0;
    lastKind = undefined;
    cues.length = 0;
    whale.group.visible = false;
    trail.reset(0);
    starSnow.reset();
    motes.reset();
    echo?.reset();
  }

  return {
    enter() {
      reset();
      active = true;
      elapsed = 0;
      next = 3 + random() * 1.6;
      announced = false;
    },
    leave: reset,
    update(dt, player, camera, night) {
      if (!active) return 0;
      elapsed += dt;
      whale.light(night, trail.starTexture);
      if (!lastKind && !announced && elapsed >= next - 2.5) {
        announced = true;
        cues.push({ type: "approach" });
      }
      if (elapsed >= next) {
        const initial = !lastKind;
        if (!initial && !upcoming.length) {
          if (random() < .5) upcoming.push("cruise", "climb", "pass");
          else upcoming.push("climb", "cruise", "pass");
        }
        const kind = initial ? "pass" : upcoming.shift();
        const minimum = 40 + 6 * compactView(camera.aspect);
        const duration = minimum + random() * (60 - minimum) + FADE_IN + FADE_OUT;
        event = { kind, duration, start: elapsed, initial, seen: false, prompted: false, departed: false };
        choosePath(kind, camera);
        lastKind = kind;
        next = elapsed + duration + 15 + random() * 10;
        trail.reset(0);
      }
      if (!event) {
        starSnow.update(dt, elapsed, 0, player, camera, night, false, false);
        echo?.update(dt, whale.group, 0, player, camera);
        return 0;
      }

      const age = elapsed - event.start;
      if (age >= event.duration + WAKE_LIFE) {
        event = undefined;
        trail.reset(0);
        starSnow.update(dt, elapsed, age, player, camera, night, false, false);
        echo?.update(dt, whale.group, 0, player, camera);
        return 0;
      }
      const reveal = smoothstep(age, 0, event.initial ? 1.9 : FADE_IN) * (1 - smoothstep(age, event.duration - FADE_OUT, event.duration));
      whale.group.visible = reveal > .003;
      if (whale.group.visible) sample(whale.group, age);
      const distance = Math.hypot(whale.group.position.x - player.x, whale.group.position.z - player.z);
      const local = !event.local && reveal > .18 && distance < 112;
      event.local ||= local;
      if (whale.group.visible) {
        whale.reveal(reveal);
        whale.swim(age);
        relative.subVectors(whale.group.position, player).setY(0).normalize();
        const ahead = relative.dot(facing(camera)) > .72;
        projection.copy(whale.group.position).project(camera);
        const inView = projection.z > -1 && projection.z < 1 &&
          Math.abs(projection.x) < 1.05 && Math.abs(projection.y) < 1.07;
        const open = ahead && (event.initial && !event.prompted || !event.seen) &&
          clearSky(camera.position, whale.group.position) > 0;
        if (event.initial && !event.prompted && reveal > .22 && open && Math.abs(projection.x) < 1.13) {
          event.prompted = true;
          const outsideShelter = Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z) > WINTER_TREE.shelter[0];
          cues.push({ type: "look", waitForStarSnow: event.local && outsideShelter });
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
      if (starSnow.update(dt, elapsed, age, player, camera, night, reveal > .14, local)) {
        cues.push({ type: "star-snow" });
      }
      motes.update(dt, whale, age, reveal > .34 && distance < 131, night);
      if (echo?.update(dt, whale.group, reveal, player, camera)) cues.push({ type: "lake-echo" });
      return reveal * (1 - smoothstep(distance, 23, 77));
    },
    takeCue() { return cues.shift(); },
  };
}
