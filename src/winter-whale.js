import * as THREE from "three";
import { createWhale } from "../previews/snow-whale/whale.js";
import { createSnow } from "../previews/snow-whale/snow.js";
import { poseWhale, routes } from "../previews/snow-whale/routes.js";

const { smoothstep } = THREE.MathUtils;
const gameRoutes = {
  cruise: { ...routes.cruise, width: 100, depth: 43, centerZ: -114, height: 37, lift: 4, phase: -1.44 },
  pass: { ...routes.pass, width: 81, depth: 40, centerZ: -66, height: 23, lift: 1.8, phase: -1.44 },
  climb: { ...routes.climb, width: 87, depth: 43, centerZ: -90, height: 34, lift: 17, phase: -1.44 },
};

export function createWinterWhale(parent, random) {
  const whale = createWhale(random, { underside: true });
  whale.group.scale.multiplyScalar(1.88);
  whale.group.visible = false;
  parent.add(whale.group);
  const trail = createSnow(parent, random, whale, { weather: false, wakeClarity: 1.29 });
  const offset = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const projection = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let elapsed = 0;
  let next = 0;
  let event;
  let wasNight;
  let sighting;

  function sample(group, time) {
    poseWhale(group, event.route, time);
    group.position.applyQuaternion(rotation).add(offset);
    group.quaternion.premultiply(rotation);
  }

  return {
    enter() {
      elapsed = 0;
      next = 15 + random() * 15;
      event = undefined;
      sighting = undefined;
      whale.group.visible = false;
      trail.reset(0);
      // Clear any old world-space wake when re-entering the region.
      trail.update(0, 0, sample, false, false);
    },
    update(dt, player, camera, night) {
      elapsed += dt;
      const dark = night >= .5;
      if (dark !== wasNight) {
        wasNight = dark;
        whale.light(dark, trail.starTexture);
      }
      if (elapsed >= next) {
        const roll = random();
        const kind = roll < .72 ? "cruise" : roll < .85 ? "pass" : "climb";
        const duration = 30 + random() * 15;
        event = { kind, duration, start: elapsed, seen: false,
          route: { ...gameRoutes[kind], speed: 2.88 / duration } };
        next = elapsed + 90 + random() * 60;
        offset.set(player.x, player.y, player.z);
        camera.getWorldDirection(direction);
        rotation.setFromAxisAngle(up, Math.atan2(-direction.x, -direction.z));
        trail.reset(0);
      }
      if (!event) return 0;
      const age = elapsed - event.start;
      if (age >= event.duration + 12.1) {
        event = undefined;
        return 0;
      }
      const reveal = smoothstep(age, 0, 7) * (1 - smoothstep(age, event.duration - 8, event.duration));
      whale.group.visible = reveal > .003;
      if (whale.group.visible) {
        sample(whale.group, age);
        whale.reveal(reveal);
        whale.swim(age);
        projection.copy(whale.group.position).project(camera);
        if (!event.seen && reveal > .53 && Math.abs(projection.x) < 1.10 &&
            Math.abs(projection.y) < 1.08 && projection.z > -1 && projection.z < 1) {
          event.seen = true;
          sighting = event.kind;
        }
      }
      trail.update(age, 0, sample, dark, reveal > .17);
      return reveal * (1 - smoothstep(Math.hypot(whale.group.position.x - player.x, whale.group.position.z - player.z), 23, 77));
    },
    takeSighting() {
      const kind = sighting;
      sighting = undefined;
      return kind;
    },
  };
}
