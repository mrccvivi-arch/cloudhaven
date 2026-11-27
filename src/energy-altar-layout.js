export const ENERGY_ALTAR = { id: "energy-altar", x: -55, z: 40, layer: "ground" };
export const ALTAR_PATH = [[-43, 32], [-50.45, 39]];
export const ALTAR_YAW = 1.82;
export const ALTAR_FLOOR = .63;
export const ALTAR_MOON_STYLE = "adaptive";
export const ALTAR_STAIRS = {
  angle: 1.54,
  levels: [{ offset: 1.86, y: .21, halfWidth: .36 }, { offset: .93, y: .42, halfWidth: .34 }],
};

export function altarEdge(angle) {
  return 5.8 + .25 * Math.cos(angle * 2 + .9) + .13 * Math.sin(angle * 3 - .4);
}

function altarObject(localX, localZ, shape) {
  const cos = Math.cos(ALTAR_YAW), sin = Math.sin(ALTAR_YAW);
  return {
    localX, localZ,
    x: ENERGY_ALTAR.x + localX * cos + localZ * sin,
    z: ENERGY_ALTAR.z - localX * sin + localZ * cos,
    ...shape,
  };
}

export const ALTAR_PLINTH = altarObject(-.18, .3, { radius: .89, height: .63 });
export const ALTAR_STELE = altarObject(2.22, 1.34, { w: 1.76, d: 1.06, height: .81 });
export const ALTAR_SCULPTURE = altarObject(-.65, -1.94, { w: 3.35, d: .96, height: 2.45 });

export function onAltarFloor(x, z, margin = 0) {
  const dx = x - ENERGY_ALTAR.x, dz = z - ENERGY_ALTAR.z;
  if (Math.abs(dx) > 6.2 + margin || Math.abs(dz) > 6.2 + margin) return false;
  return Math.hypot(dx, dz) <= altarEdge(Math.atan2(dz, dx) + ALTAR_YAW) + margin;
}

export function altarTreadReach({ offset, halfWidth }, angle) {
  const corner = Math.max(0, (Math.abs(angle) - halfWidth + .036) / .036);
  return corner > 1.000001 ? -Infinity : offset - .19 * (1 - Math.sqrt(Math.max(0, 1 - corner * corner)));
}

export function altarSurface(x, z) {
  const dx = x - ENERGY_ALTAR.x, dz = z - ENERGY_ALTAR.z;
  if (Math.abs(dx) > 8.1 || Math.abs(dz) > 8.1) return -Infinity;
  const angle = Math.atan2(dz, dx) + ALTAR_YAW;
  const distance = Math.hypot(dx, dz) - altarEdge(angle);
  if (distance <= 0) return ALTAR_FLOOR;
  const fromStairs = Math.atan2(Math.sin(angle - ALTAR_STAIRS.angle), Math.cos(angle - ALTAR_STAIRS.angle));
  const [outer, inner] = ALTAR_STAIRS.levels;
  if (distance <= altarTreadReach(inner, fromStairs)) return inner.y;
  if (distance <= altarTreadReach(outer, fromStairs)) return outer.y;
  return -Infinity;
}

export function nearAltar(player, range, target = ENERGY_ALTAR) {
  return player.layer === ENERGY_ALTAR.layer && Math.hypot(player.x - target.x, player.z - target.z) <= range;
}
