import * as THREE from "three";
import { WINTER_LAKE, WINTER_TREE, winterHeight } from "./winter-layout.js";

const { clamp, smoothstep } = THREE.MathUtils;

// Includes the flukes, both pectorals, the swim bend, and the limited pitch and bank.
export const WINTER_WHALE_HULL = { length: 19, width: 11, below: 9 };
export const WINTER_CROWN = { radius: 22, top: 29 };
const crownPassHeight = WINTER_CROWN.top + WINTER_WHALE_HULL.below + 4;
export const WINTER_RESPONSE_DURATION = 26;

const paths = {
  pass: [[-15, 18.5, -67], [-38, 20, -58], [-46, 23, -32], [-31, 25, -11],
    [0, 29, 0], [31, 28, 22], [68, 31, 49]],
  cruise: [[-87, 25, -33], [-51, 27, -29], [-17, 36, -25],
    [WINTER_TREE.x, 42, WINTER_TREE.z], [50, 34, -11], [91, 28, 5]],
  lake: [[-65, 23, 91], [-61, 19, 58], [-57, 17.5, 24],
    [WINTER_LAKE.x, 18, WINTER_LAKE.z], [-52, 20, -33], [-58, 23, -65], [-75, 29, -99]],
  climb: [[-58, 27, -27], [-27, 30, -14], [0, 38, 0],
    [24, 48, 23], [45, 63, 54], [72, 79, 79], [113, 91, 85]],
};

function crownDistance(x, z, dx, dz) {
  const distance = Math.hypot(dx, dz) || 1;
  const ox = WINTER_TREE.x - x;
  const oz = WINTER_TREE.z - z;
  const along = Math.abs((ox * dx + oz * dz) / distance);
  const across = Math.abs((ox * dz - oz * dx) / distance);
  return Math.hypot(Math.max(0, along - WINTER_WHALE_HULL.length),
    Math.max(0, across - WINTER_WHALE_HULL.width));
}

function protectedHeight(position, dx, dz) {
  const lift = 1 - smoothstep(crownDistance(position.x, position.z, dx, dz),
    WINTER_CROWN.radius + .8, WINTER_CROWN.radius + 18);
  return Math.max(position.y, crownPassHeight - (1 - lift) * 42);
}

function followCurve(pointAt, distance, bank = .10, face = null) {
  const point = new THREE.Vector3();
  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  const step = .0025;
  const flight = (group, progress, time = 0) => {
    const u = clamp(progress, 0, 1);
    pointAt(u, point);
    pointAt(Math.max(0, u - step), before);
    pointAt(Math.min(1, u + step), after);
    const dx = after.x - before.x, dz = after.z - before.z;
    const horizontal = Math.hypot(dx, dz);
    const dy = after.y - before.y;
    const yaw = Math.atan2(dz, -dx);
    group.position.copy(point);
    group.position.y = point.y + .22 * Math.sin(.91 * time);
    let turn = 0;
    if (face) {
      const toward = Math.atan2(face.z - point.z, point.x - face.x);
      const delta = Math.atan2(Math.sin(toward - yaw), Math.cos(toward - yaw));
      turn = clamp(delta, -.27, .27) * Math.sin(Math.PI * u) ** 2;
    }
    group.rotation.set(0, yaw + turn, 0, "YXZ");
    group.rotateX(bank * Math.sin(Math.PI * u) * Math.sin(u * 6.28 + .5));
    group.rotateZ(-clamp(Math.atan2(dy, horizontal), -.16, .16));
  };
  flight.distance = distance;
  return flight;
}

function gradeLimit(values, step) {
  const ramp = values.slice();
  for (let i = 1; i < ramp.length; i++) ramp[i] = Math.max(ramp[i], ramp[i - 1] - step);
  for (let i = ramp.length - 2; i >= 0; i--) ramp[i] = Math.max(ramp[i], ramp[i + 1] - step);
  return ramp;
}

function patrolSampler(curve) {
  const steps = 112;
  const points = Array.from({ length: steps + 1 }, (_, i) => curve.getPointAt(i / steps));
  const desired = points.map((p, i) => {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(steps, i + 1)];
    return protectedHeight(p, after.x - before.x, after.z - before.z);
  });
  const grade = Math.max(.6, .48 * curve.getLength() / steps);
  const ramp = gradeLimit(desired, grade);
  const heights = ramp.map((y, i) => {
    const endpoint = i === 0 || i === steps;
    if (endpoint) return new THREE.Vector2(i, y);
    return new THREE.Vector2(i, Math.max(desired[i], .23 * ramp[i - 1] + .54 * y + .23 * ramp[i + 1]));
  });
  const profile = new THREE.SplineCurve(heights);
  const level = new THREE.Vector2();
  return followCurve((u, point) => {
    curve.getPointAt(u, point);
    point.y = profile.getPoint(u, level).y;
  }, curve.getLength());
}

export function createWinterFlight(kind, { angle = 0, opposite = false } = {}) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const points = paths[kind].map(([x, y, z]) => {
    if (kind === "lake" && opposite) z = 2 * WINTER_LAKE.z - z;
    return new THREE.Vector3(x * cos + z * sin, y, z * cos - x * sin);
  });
  if (kind === "cruise" && opposite) points.reverse();
  const curve = new THREE.CatmullRomCurve3(points);
  curve.arcLengthDivisions = 144;
  return patrolSampler(curve);
}

const tailAxis = new THREE.Vector3();

function clearanceHeight(x, z, dx, dz, margin) {
  const { length, width, below } = WINTER_WHALE_HULL;
  let ground = -Infinity;
  for (let u = -length; u <= length; u += length / 3) {
    for (let v = -width; v <= width; v += width / 2) {
      ground = Math.max(ground, winterHeight(x + u * dx - v * dz, z + u * dz + v * dx));
    }
  }
  const crown = crownDistance(x, z, dx, dz) <= WINTER_CROWN.radius ? WINTER_CROWN.top + 3.4 : -Infinity;
  return Math.max(ground + margin, crown) + below;
}

export function winterFlightClear(pose, margin = 1.25) {
  const { x, y, z } = pose.position;
  tailAxis.set(1, 0, 0).applyQuaternion(pose.quaternion).setY(0).normalize();
  return y >= clearanceHeight(x, z, tailAxis.x, tailAxis.z, margin);
}

// Tangent joins between constant-radius turns preserve both approach headings.
export function connectWinterFlights(from, to, radius = 31) {
  const start = new THREE.Object3D();
  const end = new THREE.Object3D();
  from(start, 1);
  to(end, 0);
  const a = start.position, b = end.position;
  const nose = new THREE.Vector3(-1, 0, 0);
  const outgoing = nose.clone().applyQuaternion(start.quaternion);
  const incoming = nose.clone().applyQuaternion(end.quaternion);
  const startAngle = Math.atan2(outgoing.z, outgoing.x);
  const endAngle = Math.atan2(incoming.z, incoming.x);
  const wrap = a => THREE.MathUtils.euclideanModulo(a, Math.PI * 2);
  let best;
  for (const enter of [-1, 1]) {
    for (const exit of [-1, 1]) {
      const x1 = a.x - enter * radius * Math.sin(startAngle);
      const z1 = a.z + enter * radius * Math.cos(startAngle);
      const x2 = b.x - exit * radius * Math.sin(endAngle);
      const z2 = b.z + exit * radius * Math.cos(endAngle);
      const separation = Math.hypot(x2 - x1, z2 - z1);
      const offset = (exit - enter) * radius;
      if (separation <= Math.abs(offset) + .01) continue;
      const tangent = Math.atan2(z2 - z1, x2 - x1) - Math.asin(offset / separation);
      const lead = radius * wrap(enter * (tangent - startAngle));
      const tail = radius * wrap(exit * (endAngle - tangent));
      const line = Math.sqrt(separation ** 2 - offset ** 2);
      const total = lead + line + tail;
      if (!best || total < best.total) best = { x1, z1, x2, z2, enter, exit, tangent, lead, line, total };
    }
  }
  const { x1, z1, x2, z2, enter, exit, tangent, lead, line, total } = best;
  const crest = Math.max(58, a.y, b.y);
  const flight = followCurve((u, point) => {
    const d = u * total;
    if (d < lead) {
      const angle = startAngle + enter * d / radius;
      point.set(x1 + enter * radius * Math.sin(angle), 0, z1 - enter * radius * Math.cos(angle));
    } else if (d < lead + line) {
      const along = d - lead;
      point.set(x1 + enter * radius * Math.sin(tangent) + along * Math.cos(tangent), 0,
        z1 - enter * radius * Math.cos(tangent) + along * Math.sin(tangent));
    } else {
      const angle = tangent + exit * (d - lead - line) / radius;
      point.set(x2 + exit * radius * Math.sin(angle), 0, z2 - exit * radius * Math.cos(angle));
    }
    point.y = a.y + (crest - a.y) * smoothstep(u, 0, .39) + (b.y - crest) * smoothstep(u, .61, 1);
  }, total, .085);
  const connector = (group, progress, time) => {
    flight(group, progress, time);
    if (progress < .075) group.quaternion.slerp(start.quaternion, 1 - smoothstep(progress, 0, .075));
    if (progress > .925) group.quaternion.slerp(end.quaternion, smoothstep(progress, .925, 1));
  };
  connector.distance = total;
  return connector;
}

export function createWinterResponse(flight, age, duration, player, forward) {
  const span = Math.min(WINTER_RESPONSE_DURATION * .58, duration - age - 1);
  if (span < 6.5) return null;
  const endAge = age + span;
  const start = new THREE.Object3D(), mid = new THREE.Object3D(), end = new THREE.Object3D();
  flight(start, age / duration);
  flight(mid, (age + span * .5) / duration);
  flight(end, endAge / duration);
  const crossing = new THREE.Vector3(-1, 0, 0).applyQuaternion(mid.quaternion).setY(0).normalize();
  const lateral = new THREE.Vector3(crossing.z, 0, -crossing.x);
  const caller = new THREE.Vector3(player.x, player.y, player.z);
  const anchor = caller.clone().addScaledVector(forward, 24);
  const base = new THREE.Object3D();
  const sample = new THREE.Object3D();
  const previous = new THREE.Object3D();
  const probe = new THREE.Vector3();
  const slowdown = (span - 3) / (WINTER_RESPONSE_DURATION - 3);
  // Integrate a linear deceleration and acceleration so both joins retain the
  // patrol's original position and velocity, even when little patrol remains.
  function traveled(t) {
    if (t < 3) return t - (1 - slowdown) * t * t / 6;
    if (t > WINTER_RESPONSE_DURATION - 3) return span - traveled(WINTER_RESPONSE_DURATION - t);
    return (1 + slowdown) * 1.5 + (t - 3) * slowdown;
  }

  for (const [arc, bias, reach] of [[8, 0, .72], [-8, 0, .72], [5, 0, .44], [-5, 0, .44],
    [7, 12, .62], [-7, 12, .62], [7, -12, .62], [-7, -12, .62], [3, 0, .24], [-3, 0, .24]]) {
    const shift = probe.subVectors(anchor, mid.position).setY(0);
    const across = clamp(shift.dot(lateral) * reach + bias, -32, 32);
    const along = clamp(shift.dot(crossing) * reach * .6, -8, 10);
    const horizontal = (u, point) => {
      flight(base, (age + traveled(u * WINTER_RESPONSE_DURATION)) / duration);
      const bell = Math.sin(Math.PI * u) ** 2;
      point.copy(base.position).addScaledVector(lateral, bell * (across + arc * Math.sin(Math.PI * 2 * u)))
        .addScaledVector(crossing, bell * along);
      point.y += (Math.min(base.position.y, player.y + 14.5) - point.y) * bell * .90;
    };
    const steps = 64;
    const positions = Array.from({ length: steps + 1 }, (_, i) => {
      const point = new THREE.Vector3();
      horizontal(i / steps, point);
      return point;
    });
    const desired = positions.map((point, i) => {
      const a = positions[Math.max(0, i - 1)], b = positions[Math.min(steps, i + 1)];
      const d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return Math.max(point.y, clearanceHeight(point.x, point.z, (b.x - a.x) / d, (b.z - a.z) / d, 2) + .55);
    });
    // Spread a required climb over neighboring samples instead of stepping the
    // altitude as the whale's wings or tail first reach the crown footprint.
    const ramp = gradeLimit(desired, .82);
    if (ramp[0] > start.position.y + .15 || ramp[steps] > end.position.y + .15) continue;
    const elevations = ramp.map((y, i) => new THREE.Vector2(i,
      i === 0 || i === steps ? positions[i].y : Math.max(desired[i], (.23 * ramp[i - 1] + .54 * y + .23 * ramp[i + 1]))));
    const profile = new THREE.SplineCurve(elevations);
    const profilePoint = new THREE.Vector2();
    const pointAt = (u, point) => {
      horizontal(u, point);
      point.y = profile.getPoint(u, profilePoint).y;
    };
    const approach = followCurve(pointAt, 0, .12, caller);
    let valid = true;
    let closest = Infinity;
    let descent = 0;
    for (let i = 0; i <= 52; i++) {
      const u = i / 52;
      approach(sample, u);
      if (!winterFlightClear(sample, 2) || (i && (sample.position.distanceTo(previous.position) < .27 ||
          sample.position.distanceTo(previous.position) > 4.25 || sample.quaternion.angleTo(previous.quaternion) > .34))) {
        valid = false;
        break;
      }
      previous.position.copy(sample.position);
      previous.quaternion.copy(sample.quaternion);
      if (u > .28 && u < .72) {
        closest = Math.min(closest, Math.hypot(player.x - sample.position.x, player.z - sample.position.z));
        descent = Math.max(descent, base.position.y - sample.position.y);
      }
    }
    if (!valid || closest > 52 || descent < .52) continue;
    return {
      endAge,
      sample(group, u, time) {
        approach(group, u, time);
        if (u < .085) group.quaternion.slerp(start.quaternion, 1 - smoothstep(u, 0, .085));
        if (u > .915) group.quaternion.slerp(end.quaternion, smoothstep(u, .915, 1));
      },
    };
  }
  return null;
}
