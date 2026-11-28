import * as THREE from "three";
import { createWhale } from "../previews/snow-whale/whale.js";
import { createSnow } from "../previews/snow-whale/snow.js";
import { connectWinterFlights, createWinterFlight, createWinterLakeCycle, winterFlightClear,
  WINTER_CROWN, WINTER_LAKE_VISIT } from "./winter-flight.js";
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
const lakePhases = ["descent", "low", "rise"];
const returnFlight = createWinterFlight("lakeReturn");
const returnDuration = clamp(returnFlight.distance / 4.1, 33, 58);
const lakeCycle = createWinterLakeCycle(returnFlight, returnDuration);

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
  const replyMotes = createWhaleMotes(parent, trail.starTexture, reduced, true);
  const starSnow = createWinterStarSnow(parent, whale, reduced);
  const direction = new THREE.Vector3();
  const relative = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const projection = new THREE.Vector3();
  const probe = new THREE.Object3D();
  const previous = new THREE.Object3D();
  const departure = new THREE.Object3D();
  const cues = [];
  let active = false, touchable = false;
  let touchedAt = -Infinity;
  let elapsed, openingAt, leg, legAge, pending, visit, goldUntil, index;

  function facing(camera) {
    camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.lengthSq() < .001) direction.set(0, 0, -1);
    return direction.normalize();
  }

  function openingFlight(camera) {
    const current = facing(camera);
    const ranked = [];
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
      ranked.push({ flight, score });
    }
    ranked.sort((a, b) => b.score - a.score);
    for (const { flight } of ranked) {
      const leg = patrol("pass", flight, true);
      for (const at of [12.5, 11, 14, 15]) {
        const course = lakeCycle.first(flight, at, leg.duration);
        if (course) return { ...leg, course, descendAt: at };
      }
    }
    return patrol("pass", ranked[0].flight, true);
  }

  function patrol(kind, flight, initial = false) {
    return { kind, flight, initial,
      duration: initial ? clamp(flight.distance / 4.9, 35, 39) : clamp(flight.distance / 4.1, 33, 58) };
  }

  function advanceLakePhase() {
    const next = lakePhases[lakePhases.indexOf(leg.phase) + 1];
    if (next) {
      leg = { phase: next, flight: visit[next], duration: WINTER_LAKE_VISIT[next] };
      if (next === "low") cues.push({ type: "encounter" });
      return;
    }
    visit = undefined;
    leg = { ...patrol("cruise", returnFlight), course: lakeCycle.recurring, descendAt: lakeCycle.descendAt };
    legAge += lakeCycle.rejoinAt;
    goldUntil = elapsed + WINTER_LAKE_VISIT.lingering;
    cues.push({ type: "return" });
  }

  function nextLeg() {
    if (pending) {
      leg = pending;
      pending = undefined;
      return;
    }
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
    active = touchable = false;
    touchedAt = -Infinity;
    leg = pending = visit = undefined;
    goldUntil = 0;
    index = 0;
    cues.length = 0;
    whale.group.visible = false;
    trail.reset(0);
    starSnow.reset();
    motes.reset();
    replyMotes.reset();
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
      openingAt = 5 + random() * 2.3;
    },
    leave: reset,
    guideReady(camera, hitTest) {
      if (!active || !touchable || elapsed - touchedAt < 8) return false;
      camera.updateMatrixWorld();
      const group = whale.group;
      for (const x of [0, -4, 4]) {
        group.localToWorld(projection.set(x, 0, 0)).project(camera);
        if (Math.abs(projection.z) < 1 && Math.abs(projection.x) < 1 && Math.abs(projection.y) < 1 &&
            hitTest(group, projection)) return true;
      }
      return false;
    },
    touch(hitTest, voice) {
      if (!active || !touchable) return false;
      whale.group.updateWorldMatrix(true, true);
      if (!hitTest(whale.group)) return false;
      if (elapsed - touchedAt >= 8 && !voice.busy) {
        touchedAt = elapsed;
        voice.play();
      }
      return true;
    },
    update(dt, player, camera, night) {
      if (!active) return 0;
      elapsed += dt;
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
        leg = openingFlight(camera);
        legAge = elapsed - openingAt;
        cues.push({ type: "approach" });
      } else legAge += dt;

      if (leg.course && legAge >= leg.descendAt) {
        legAge -= leg.descendAt;
        visit = leg.course;
        leg = { phase: "descent", flight: visit.descent, duration: WINTER_LAKE_VISIT.descent };
        cues.push({ type: "descent" });
      } else if (legAge >= leg.duration) {
        legAge -= leg.duration;
        if (leg.phase) advanceLakePhase();
        else nextLeg();
      }
      const progress = legAge / leg.duration;
      leg.flight(group, progress, elapsed);

      const fade = leg.transit ? 1 - .87 * Math.sin(Math.PI * progress) ** 2 :
        leg.initial ? smoothstep(legAge, 0, 2.2) : 1;
      group.visible = fade > .003;
      touchable = fade > .34;
      const replyAge = elapsed - touchedAt;
      if (!wasVisible) {
        previous.position.copy(group.position);
        previous.quaternion.copy(group.quaternion);
      }

      const distance = Math.hypot(group.position.x - player.x, group.position.z - player.z);
      if (group.visible) {
        whale.light(night, trail.starTexture);
        whale.reveal(fade);
        whale.swim(elapsed, replyAge < 3 ? replyAge / 3 : -1);
        if (!leg.seen && !leg.transit && fade > .4) {
          projection.copy(group.position).project(camera);
          if (projection.z > -1 && projection.z < 1 &&
              Math.abs(projection.x) < 1.12 && Math.abs(projection.y) < 1.12) {
            leg.seen = true;
            cues.push({ type: "sighting" });
          }
        }
      }

      const gold = leg.phase ? (leg.phase === "descent" ? smoothstep(legAge, 0, 2.8) : 1) :
        smoothstep(goldUntil - elapsed, 0, 3.5);
      trail.update(elapsed, 0, (pose, time) => sampleWake(pose, time, dt), night, fade > .19);
      starSnow.update(dt, elapsed, elapsed, player, camera, night, Boolean(leg.phase), gold);
      motes.update(dt, whale, elapsed, fade > .34 && distance < 131, night);
      replyMotes.update(dt, whale, elapsed, touchable && replyAge < 1.1, night);
      if (echo?.update(dt, group, fade, player, camera)) cues.push({ type: "lake-echo" });
      return fade * (1 - smoothstep(distance, 23, 77));
    },
    takeCue() { return cues.shift(); },
  };
}
