import * as THREE from "three";
import { createWhale } from "../previews/snow-whale/whale.js";
import { createSnow } from "../previews/snow-whale/snow.js";
import { connectWinterFlights, createWinterFlight, createWinterResponse, winterFlightClear,
  WINTER_CROWN, WINTER_RESPONSE_DURATION } from "./winter-flight.js";
import { createWinterWhaleCall, WINTER_CALL_RANGE } from "./winter-whale-call.js";
import { createWinterStarSnow } from "./winter-star-snow.js";
import { createWhaleMotes } from "./winter-whale-motes.js";
import { WINTER_TREE, winterHeight } from "./winter-layout.js";

const { clamp, smoothstep } = THREE.MathUtils;
const flights = {
  pass: Array.from({ length: 16 }, (_, index) => createWinterFlight("pass", { angle: index * Math.PI / 8 })),
  cruise: [createWinterFlight("cruise"), createWinterFlight("cruise", { opposite: true })],
  lake: [createWinterFlight("lake"), createWinterFlight("lake", { opposite: true })],
  climb: [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(angle => createWinterFlight("climb", { angle })),
};
const itinerary = ["pass", "cruise", "lake", "climb"];
const responseSnowStarts = 6.5;
const responseSnowEnds = 19;

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
  const call = createWinterWhaleCall();
  const direction = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const projection = new THREE.Vector3();
  const probe = new THREE.Object3D();
  const previous = new THREE.Object3D();
  const departure = new THREE.Object3D();
  const cues = [];
  let active = false;
  let elapsed, openingAt, announced, leg, legAge, pending, response, request, index;

  function facing(camera) {
    camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < .001) direction.set(0, 0, -1);
    return direction.normalize();
  }

  function openingFlight(camera) {
    const current = facing(camera);
    let best = -Infinity, result;
    for (const flight of flights.pass) {
      let score = 0;
      for (const progress of [.018, .057, .112, .20, .30]) {
        flight(probe, progress);
        relative.subVectors(probe.position, camera.position).normalize();
        axis.set(1, 0, 0).applyQuaternion(probe.quaternion);
        projection.copy(probe.position).project(camera);
        const open = clearSky(camera.position, probe.position);
        const screen = projection.z > -1 && projection.z < 1 ?
          (1 - smoothstep(Math.abs(projection.x), .30, 1.23)) *
          (1 - smoothstep(Math.abs(projection.y), .64, 1.24)) : 0;
        const opening = progress < .10 ? 2.4 : 1;
        score += opening * (3.6 * open + 3 * relative.dot(current) +
          8 * screen - 2.9 * Math.abs(axis.dot(relative)));
        score -= .014 * Math.abs(probe.position.distanceTo(camera.position) - 83);
      }
      if (score > best) {
        best = score;
        result = flight;
      }
    }
    return result;
  }

  function patrol(kind, flight, initial = false) {
    return { kind, flight, initial,
      duration: initial ? clamp(flight.distance / 4.9, 35, 39) : clamp(flight.distance / 4.1, 33, 58) };
  }

  function nextLeg() {
    if (pending) {
      leg = pending;
      pending = undefined;
      return;
    }
    if (leg.seen) cues.push({ type: "depart" });
    index = (index + 1) % itinerary.length;
    const kind = itinerary[index];
    leg.flight(departure, 1);
    axis.set(-1, 0, 0).applyQuaternion(departure.quaternion);
    const candidates = flights[kind].map(flight => {
      flight(probe, 0);
      relative.subVectors(probe.position, departure.position);
      const distance = relative.length();
      return { flight, score: distance - 32 * axis.dot(relative.normalize()) };
    }).sort((a, b) => a.score - b.score);
    let chosen;
    for (const { flight, radius } of candidates.flatMap(({ flight }) =>
      [31, 37, 43].map(radius => ({ flight, radius })))) {
      const connector = connectWinterFlights(leg.flight, flight, radius);
      let safe = true;
      for (let i = 0; i <= 40; i++) {
        connector(probe, i / 40);
        if (!winterFlightClear(probe, 1.6)) {
          safe = false;
          break;
        }
      }
      if (safe) {
        chosen = { flight, connector };
        break;
      }
    }
    const { flight, connector } = chosen ?? {
      flight: candidates[0].flight,
      connector: connectWinterFlights(leg.flight, candidates[0].flight),
    };
    pending = patrol(kind, flight);
    leg = { flight: connector, transit: true, duration: Math.max(9, connector.distance / 4.65) };
  }

  function reset() {
    active = false;
    leg = pending = response = request = undefined;
    index = 0;
    cues.length = 0;
    whale.group.visible = false;
    trail.reset(0);
    starSnow.reset();
    motes.reset();
    call.reset();
    echo?.reset();
  }

  function sampleWake(pose, time, dt) {
    const blend = dt > 0 ? clamp(1 - (elapsed - time) / dt, 0, 1) : 1;
    pose.position.lerpVectors(previous.position, whale.group.position, blend);
    pose.quaternion.copy(previous.quaternion).slerp(whale.group.quaternion, blend);
  }

  return {
    enter() {
      reset();
      active = true;
      elapsed = 0;
      openingAt = 3 + random() * 1.6;
      announced = false;
    },
    leave: reset,
    update(dt, player, camera, night, completedJump = false) {
      if (!active) return 0;
      elapsed += dt;
      if (!leg && !announced) {
        announced = true;
        cues.push({ type: "approach" });
      }
      if (!leg && elapsed < openingAt) {
        trail.update(elapsed, 0, null, night, false);
        return 0;
      }

      const group = whale.group;
      const wasVisible = group.visible;
      if (wasVisible) {
        previous.position.copy(group.position);
        previous.quaternion.copy(group.quaternion);
      }
      if (!leg) {
        leg = patrol("pass", openingFlight(camera), true);
        legAge = elapsed - openingAt;
      } else if (response) {
        response.age += dt;
        if (response.age >= WINTER_RESPONSE_DURATION) {
          legAge = response.endAge + response.age - WINTER_RESPONSE_DURATION;
          response = undefined;
          cues.push({ type: "response-end" });
        }
      } else legAge += dt;

      if (legAge >= leg.duration) {
        legAge -= leg.duration;
        nextLeg();
      }
      const progress = legAge / leg.duration;
      if (response) response.sample(group, response.age / WINTER_RESPONSE_DURATION, elapsed);
      else leg.flight(group, progress, elapsed);

      const fade = leg.transit ? 1 - .87 * Math.sin(Math.PI * progress) ** 2 :
        leg.initial ? smoothstep(legAge, 0, 2.2) : 1;
      group.visible = fade > .003;
      if (!wasVisible) {
        previous.position.copy(group.position);
        previous.quaternion.copy(group.quaternion);
      }

      const distance = Math.hypot(group.position.x - player.x, group.position.z - player.z);
      const outsideShelter = Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z) > WINTER_TREE.shelter[1];
      const local = !leg.transit && !leg.local && fade > .18 && distance < 112;
      leg.local ||= local;
      if (group.visible) {
        whale.light(night, trail.starTexture);
        whale.reveal(fade);
        whale.swim(elapsed);
        relative.subVectors(group.position, player).setY(0).normalize();
        const ahead = relative.dot(facing(camera)) > .55;
        projection.copy(group.position).project(camera);
        const inView = projection.z > -1 && projection.z < 1 &&
          Math.abs(projection.x) < 1.06 && Math.abs(projection.y) < 1.07;
        const open = ahead && clearSky(camera.position, group.position) > 0;
        if (leg.initial && !leg.prompted && fade > .20 && open && inView) {
          leg.prompted = true;
          cues.push({ type: "look", waitForStarSnow: leg.local && outsideShelter });
        }
        const nearPass = !leg.nearNoticed && distance < 76 && group.position.y < 59;
        if (!leg.transit && fade > .40 && (nearPass || !leg.seen && inView && open && distance < 105)) {
          leg.seen = true;
          leg.nearNoticed ||= nearPass;
          cues.push({ type: "sighting", kind: leg.kind, initial: leg.initial, nearby: nearPass });
        }
      }

      const eligible = !leg.transit && !response && fade > .7 && outsideShelter &&
        distance < WINTER_CALL_RANGE && group.position.y < 53 && leg.duration - legAge > 7;
      const { hint, requested, left } = call.update(elapsed, eligible, completedJump);
      if (left) cues.push({ type: "call-away" });
      if (hint) cues.push({ type: "call-hint" });
      if (requested && !request) request = { expires: elapsed + 5, retryAt: elapsed };
      if (request && (!eligible || elapsed > request.expires)) request = undefined;
      if (request && elapsed >= request.retryAt) {
        const course = createWinterResponse(leg.flight, legAge, leg.duration, player, facing(camera));
        if (course) {
          response = { ...course, age: 0, snowStarted: false };
          call.started(elapsed, WINTER_RESPONSE_DURATION);
          request = undefined;
          cues.push({ type: "response" });
        } else request.retryAt = elapsed + .80;
      }

      const special = response?.age >= responseSnowStarts && response.age < responseSnowEnds;
      const beginSnow = special && !response.snowStarted;
      if (beginSnow) response.snowStarted = true;
      trail.update(elapsed, 0, (pose, time) => sampleWake(pose, time, dt), night, fade > .19);
      if (starSnow.update(dt, elapsed, elapsed, player, camera, night, fade > .35, local && !response, special, beginSnow)) {
        cues.push({ type: special ? "response-snow" : "star-snow" });
      }
      motes.update(dt, whale, elapsed, fade > .34 && distance < 131, night);
      if (echo?.update(dt, group, fade, player, camera)) cues.push({ type: "lake-echo" });
      return fade * (1 - smoothstep(distance, 23, 77));
    },
    takeCue() { return cues.shift(); },
  };
}
