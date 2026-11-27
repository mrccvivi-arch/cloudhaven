import * as THREE from "three";
import { WINTER_LAKE, WINTER_TREE } from "./winter-layout.js";

const { clamp, smoothstep } = THREE.MathUtils;

// World-space clearance envelope for the existing 1.88-scale animated whale.
// It includes the flukes, both pectorals, the swim bend and the limited route pitch and bank.
export const WINTER_WHALE_HULL = { length: 19, width: 11, below: 9 };
export const WINTER_CROWN = { radius: 22, top: 29 };
const crownPassHeight = WINTER_CROWN.top + WINTER_WHALE_HULL.below + 4;

const paths = {
  // A starts broadside, bends around the open west field, then crosses the center.
  pass: [[-15, 18.5, -67], [-42, 20, -58], [-49, 23, -30], [-36, 27, -6],
    [0, 30, 0], [33, 26, 19], [70, 28, 52]],
  // B goes across the crown itself. Both directions leave room for the wake.
  cruise: [[-87, 25, -33], [-51, 27, -29], [-17, 36, -25],
    [WINTER_TREE.x, 42, WINTER_TREE.z], [50, 34, -11], [91, 28, 5]],
  // C crosses the lake reservation along its north–south axis and climbs away.
  climb: [[-65, 22, 92], [-58, 20, 62], [-52, 21, 27],
    [WINTER_LAKE.x, 24, WINTER_LAKE.z], [-51, 28, -47], [-61, 38, -82], [-80, 52, -109]],
};

export function createWinterFlight(kind, { angle = 0, opposite = false } = {}) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const points = paths[kind].map(([x, y, z]) => {
    if (kind === "climb" && opposite) z = 2 * WINTER_LAKE.z - z;
    return new THREE.Vector3(x * cos + z * sin, y, z * cos - x * sin);
  });
  if (kind === "cruise" && opposite) points.reverse();
  const curve = new THREE.CatmullRomCurve3(points);
  curve.arcLengthDivisions = 144;
  curve.updateArcLengths();
  const point = new THREE.Vector3();
  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  const step = .0025;

  function height(position, dx, dz) {
    // Compare the tree to the extended footprint, not to the route center line.
    const d = Math.hypot(dx, dz);
    const x = WINTER_TREE.x - position.x;
    const z = WINTER_TREE.z - position.z;
    const along = Math.abs((x * dx + z * dz) / d);
    const across = Math.abs((x * dz - z * dx) / d);
    const edge = Math.hypot(Math.max(0, along - WINTER_WHALE_HULL.length),
      Math.max(0, across - WINTER_WHALE_HULL.width));
    const lift = 1 - smoothstep(edge, WINTER_CROWN.radius, WINTER_CROWN.radius + 15);
    return position.y + Math.max(0, crownPassHeight - position.y) * lift;
  }

  return (group, progress, time) => {
    const u = clamp(progress, 0, 1);
    curve.getPointAt(u, point);
    curve.getPointAt(Math.max(0, u - step), before);
    curve.getPointAt(Math.min(1, u + step), after);
    const dx = after.x - before.x, dz = after.z - before.z;
    const dy = height(after, dx, dz) - height(before, dx, dz);
    group.position.copy(point);
    group.position.y = height(point, dx, dz) + .22 * Math.sin(.91 * time);
    group.rotation.set(0, Math.atan2(dz, -dx), 0, "YXZ");
    group.rotateX(.094 + .038 * Math.sin(u * 6.28 + .5));
    group.rotateZ(-clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.16, .16));
  };
}
