import * as THREE from "three";
import { WINTER_LAKE, WINTER_TREE, winterHeight } from "./winter-layout.js";

const { clamp, smoothstep } = THREE.MathUtils;

// Includes the flukes, both pectorals, the swim bend, and the limited pitch and bank.
export const WINTER_WHALE_HULL = { length: 19, width: 11, below: 9 };
export const WINTER_CROWN = { radius: 22, top: 29 };
const crownPassHeight = WINTER_CROWN.top + WINTER_WHALE_HULL.below + 4;
export const WINTER_LAKE_VISIT = { descent: 9, low: 25, rise: 9, lingering: 10 };
const lakeCenter = new THREE.Vector3(WINTER_LAKE.x - 5, WINTER_LAKE.shoreHeight + 9.1, WINTER_LAKE.z);
const lakeRadius = 24;
export const WINTER_LAKE_HULL_BELOW = 7.85;

const paths = {
  pass: [[-15, 18.5, -67], [-38, 20, -58], [-46, 23, -32], [-31, 25, -11],
    [0, 29, 0], [31, 28, 22], [68, 31, 49]],
  cruise: [[-87, 25, -33], [-51, 27, -29], [-17, 36, -25],
    [WINTER_TREE.x, 42, WINTER_TREE.z], [50, 34, -11], [91, 28, 5]],
  lake: [[-65, 23, 91], [-61, 19, 58], [-57, 17.5, 24],
    [WINTER_LAKE.x, 18, WINTER_LAKE.z], [-52, 20, -33], [-58, 23, -65], [-75, 29, -99]],
  // Reuses the crown crossing before turning back toward the central snowfield.
  lakeReturn: [[-28, 37, -26], [-9, 41, -25], [WINTER_TREE.x, 43, WINTER_TREE.z], [35, 43, -8],
    [35, 41, 10], [22, 39, 25], [4, 34, 27], [-23, 29, 24]],
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

function followCurve(pointAt, distance, bank = .10) {
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
    group.rotation.set(0, yaw, 0, "YXZ");
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

function clearanceHeight(x, z, dx, dz, margin, below) {
  const { length, width } = WINTER_WHALE_HULL;
  let ground = -Infinity;
  for (let u = -length; u <= length; u += length / 3) {
    for (let v = -width; v <= width; v += width / 2) {
      ground = Math.max(ground, winterHeight(x + u * dx - v * dz, z + u * dz + v * dx));
    }
  }
  const crown = crownDistance(x, z, dx, dz) <= WINTER_CROWN.radius ? WINTER_CROWN.top + 3.4 : -Infinity;
  return Math.max(ground + margin, crown) + below;
}

export function winterFlightClear(pose, margin = 1.25, below = WINTER_WHALE_HULL.below) {
  const { x, y, z } = pose.position;
  tailAxis.set(1, 0, 0).applyQuaternion(pose.quaternion).setY(0).normalize();
  return y >= clearanceHeight(x, z, tailAxis.x, tailAxis.z, margin, below);
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

// A broad, low arc with the full body over the central ice. The normal swim
// bob and animation still run here, but the path has no vertical grade.
export function winterLakeArc(angle, sweep) {
  return followCurve((u, target) => {
    const a = angle + sweep * u;
    target.set(lakeCenter.x + Math.cos(a) * lakeRadius, lakeCenter.y,
      lakeCenter.z + Math.sin(a) * lakeRadius);
  }, lakeRadius * Math.abs(sweep), .05);
}

function lakeJoin(start, end) {
  const a = start.position, b = end.position;
  const heading = pose => new THREE.Vector3(-1, 0, 0).applyQuaternion(pose.quaternion).setY(0).normalize();
  const arm = Math.hypot(a.x - b.x, a.z - b.z) * .35;
  const curve = new THREE.CubicBezierCurve3(a.clone(), a.clone().addScaledVector(heading(start), arm),
    b.clone().addScaledVector(heading(end), -arm), b.clone());
  const flight = followCurve((u, target) => {
    curve.getPointAt(u, target);
    target.y = THREE.MathUtils.lerp(a.y, b.y, smoothstep(u, 0, 1));
  }, curve.getLength(), .05);

  // Blend the slight endpoint bank/pitch back into the adjoining poses.
  const join = (group, u, time) => {
    flight(group, u, time);
    if (u < .15) group.quaternion.slerp(start.quaternion, 1 - smoothstep(u, 0, .15));
    if (u > .85) group.quaternion.slerp(end.quaternion, smoothstep(u, .85, 1));
  };
  join.distance = flight.distance;
  return join;
}

function safeLakeJoin(flight) {
  const sample = new THREE.Object3D();
  const previous = new THREE.Object3D();
  for (let i = 0; i <= 36; i++) {
    flight(sample, i / 36);
    if (!winterFlightClear(sample, .95, WINTER_LAKE_HULL_BELOW)) return false;
    if (i && (sample.position.distanceTo(previous.position) > 2.8 ||
        sample.quaternion.angleTo(previous.quaternion) > .22)) return false;
    previous.position.copy(sample.position);
    previous.quaternion.copy(sample.quaternion);
  }
  return true;
}

const openingArcs = [0, Math.PI / 8].map(angle => winterLakeArc(angle, 4.25));
const returningArc = winterLakeArc(Math.PI / 4, 4.25);

function lakeDescent(flight, progress, arcs) {
  const start = new THREE.Object3D(), target = new THREE.Object3D();
  flight(start, progress);
  if (start.position.y - lakeCenter.y < 6.5) return null;
  const facing = new THREE.Vector3(-1, 0, 0).applyQuaternion(start.quaternion);
  for (const { low, rise } of arcs) {
    low(target, 0);
    const offset = target.position.clone().sub(start.position);
    const distance = offset.length();
    if (distance < 16 || distance > 78 || facing.dot(offset.normalize()) < -.16) continue;
    const descent = lakeJoin(start, target);
    if (safeLakeJoin(descent)) return { descent, low, rise };
  }
  return null;
}

export function createWinterLakeCycle(patrol, duration) {
  // Give the rejoined sky leg time to cross the crown and turn toward the lake.
  const rejoinAt = duration * .03;
  const descendAt = rejoinAt + 26;
  const rejoin = new THREE.Object3D();
  const end = new THREE.Object3D();
  patrol(rejoin, rejoinAt / duration);
  const prepare = low => {
    low(end, 1);
    const rise = lakeJoin(end, rejoin);
    return safeLakeJoin(rise) ? { low, rise } : null;
  };
  const opening = [...openingArcs, returningArc].map(prepare).filter(Boolean);
  const recurring = prepare(returningArc);
  return {
    rejoinAt,
    descendAt,
    recurring: recurring && lakeDescent(patrol, descendAt / duration, [recurring]),
    first(flight, age, duration) {
      return lakeDescent(flight, age / duration, opening);
    },
  };
}
