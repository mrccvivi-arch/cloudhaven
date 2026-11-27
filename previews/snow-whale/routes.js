// All three paths are closed. The climb rises through the viewing area,
// then comes back down on the far side of the loop.
export const routes = {
  cruise: { width: 38, depth: 23, centerZ: -47, height: 9.5, lift: 1.7, speed: .089, phase: .26, roll: .11 },
  pass: { width: 34, depth: 23, centerZ: -35, height: 13.6, lift: .85, speed: .091, phase: .035, roll: .10 },
  climb: { width: 34, depth: 27, centerZ: -38, height: 18.5, lift: 9.5, speed: .094, phase: -.37, roll: .13 },
};

export function poseWhale(group, route, time) {
  const angle = route.phase + time * route.speed;
  const sine = Math.sin(angle);
  const cosine = Math.cos(angle);
  const x = -route.width * sine;
  const y = route.height + route.lift * sine;
  const z = route.centerZ + route.depth * cosine;
  const dx = -route.width * cosine;
  const dz = -route.depth * sine;
  const dy = route.lift * cosine;
  group.position.set(x, y + .22 * Math.sin(time * .91), z);
  group.rotation.set(0, Math.atan2(dz, -dx), 0, "YXZ");
  group.rotateX(route.roll + .07 * Math.sin(angle + .45));
  group.rotateZ(-Math.atan2(dy, Math.hypot(dx, dz)));
}
