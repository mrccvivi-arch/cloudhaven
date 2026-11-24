// One translation for the original grove layout, including its authored terrain profile.
export const SPRING_OFFSET = Object.freeze({ x: -104, z: -50 });

export function springPoint(x, z) {
  return { x: x + SPRING_OFFSET.x, z: z + SPRING_OFFSET.z };
}
export const SPRING_POOL = { ...springPoint(60.5, 1.55), radiusX: 6.25, radiusZ: 7.4, y: .17 };
const SHALLOW_DEPTH = .24;
export const SPRING_FALLS = { ...springPoint(60.5, -4.45), lip: 8.85 };
export const SPRING_REST_ROCK = { ...springPoint(63.55, 9.15), sx: 1.35, sz: .93, height: .64, yaw: -.22 };
export const SPRING_PATH = [[43, 14], [48, 14], [51, 13.35], [53.75, 11.95],
  [54.6, 9.5], [56.15, 9.15], [58.6, 9.95], [61.1, 10.4]].map(([x, z]) => {
    const point = springPoint(x, z);
    return [point.x, point.z];
  });

export const SPRING_TREES = [
  [43.8, 10.7, .92], [46.6, 16.7, 1.07], [48.3, 10.15, 1.13], [51.4, 16.4, .94],
  [52.65, 10.35, .90], [55.45, 11.15, 1.03], [55.2, 21.2, .94], [65.6, 13.9, 1.12],
  [49.45, 1.2, 1.02], [51.9, -7.55, .97], [43.4, -2.0, .82], [50.6, 9.55, .85],
  [54.8, -10.1, 1.16], [61, -10.05, 1.05], [66, -10.45, 1.13],
  [70.55, -7.6, .99], [74.6, 1.6, 1.01], [71.95, 5.2, 1.05], [74.45, 9.4, 1.11],
  [71.25, 17.7, .95], [67.2, 19.2, .92],
  [55.25, 8.05, .65, -.83], [67.0, 4.8, .67, 2.12], [67.0, 8.15, .66, -1.96],
  [44.45, 5.45, .82], [53.95, -2.75, .69, .49], [69.35, .25, .94],
  [69.1, 11.7, .73], [58.5, 16.8, .74], [61.9, 19.5, .68], [74.7, 14.3, .76],
].map(([x, z, size, overhang]) => ({ ...springPoint(x, z), size, overhang }));

export const CHERRY_FORK_HEIGHT = 6.05;

// The western spur and southern ridge overlap in sight, with a walkable bend between their tips.
export const SPRING_BOULDERS = [
  [52.05, 6.9, 2.15, 5.7, 2.25, -.29],
  [46.0, 1.4, 2.75, 6.65, 2.8, .24],
  [46.9, -2.9, 2.9, 7.65, 3.0, -.36],
  [49.0, -6.0, 2.65, 8.45, 2.55, .29],
  [47.35, 4.2, 2.55, 7.4, 2.75, .37],
  [52.8, 8.25, 1.46, 3.2, 1.28, .31],
  [50.4, 4.9, 1.95, 8.65, 2.0, -.12],
  [55.33, 6.15, 1.28, 8.15, 1.15, -.28],
  [54.4, 16.4, 1.93, 7.3, 1.95, .36],
  [56.45, 14.5, 1.7, 7.9, 2.45, -.32],
  [56.95, 17.2, 2.03, 7.8, 2.25, -.21],
  [59.25, 21.4, 2.8, 8.7, 2.15, .16],
  [63.0, 22.15, 2.8, 8.45, 1.75, -.09],
  [68.35, 21.7, 3.1, 8.0, 1.98, .12],
  [74.4, 20.0, 2.35, 6.0, 4.0, -.16],
  [77.6, 11.5, 2.32, 5.75, 4.4, -.25],
  [77.5, 5.2, 2.55, 6.25, 3.3, -.27],
  [76.8, -.25, 2.45, 6.35, 3.4, .36],
  [73.5, -4.8, 2.98, 7.15, 2.65, -.28],
  [65.1, -6.6, 2.7, 9.4, 2.8, -.18],
  [62.05, -7.15, 2.4, 10.15, 2.72, .24],
  [58.78, -7.25, 2.47, 9.75, 2.6, -.34],
  [55.9, -6.4, 2.65, 10.3, 2.7, .24],
  [58.3, -4.85, 1.58, 7.55, 1.73, -.10],
  [62.75, -4.95, 1.65, 8.25, 1.7, .19],
  [60.5, -5.7, 1.74, 8.82, 1.1, 0],
  [72.1, 22.0, 2.65, 8.4, 1.9, .12],
  [77.8, 17.3, 2.55, 7.3, 3.3, -.18],
].map(([x, z, sx, height, sz, yaw]) => ({ ...springPoint(x, z), sx, height, sz, yaw }));

export function springPoolDistance(x, z) {
  return Math.hypot((x - SPRING_POOL.x) / SPRING_POOL.radiusX, (z - SPRING_POOL.z) / SPRING_POOL.radiusZ);
}

export function springWaterDepth(x, y, z) {
  return springPoolDistance(x, z) < 1 ? Math.max(0, SPRING_POOL.y - y) : 0;
}

function smoothEdge(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

export function springGroundHeight(x, z, naturalHeight, sampleNaturalHeight) {
  // Blend the relocated topography into the new forest before it reaches the creek or map edge.
  const localX = x - SPRING_OFFSET.x, localZ = z - SPRING_OFFSET.z;
  const terrainBlend = Math.min(1, Math.max(0, Math.min((localX - 35) / 5, (81 - localX) / 5, (localZ + 19) / 5, (24 - localZ) / 2)));
  if (terrainBlend > 0) naturalHeight += (sampleNaturalHeight(localX, localZ) - naturalHeight) * smoothEdge(terrainBlend);

  const distance = springPoolDistance(x, z);
  if (distance >= 1.35) return naturalHeight;
  // The inlet bends around the entrance rock, leaving a continuous dry path on the western bank.
  const west = smoothEdge((SPRING_POOL.x - x) / 3.4);
  const front = smoothEdge((z - SPRING_POOL.z) / 3.8);
  const shore = smoothEdge((distance - .64 + .16 * west * front) / .43);
  const basin = SPRING_POOL.y - SHALLOW_DEPTH + shore * .74;
  return basin + (naturalHeight - basin) * smoothEdge((distance - 1.02) / .33);
}

export function insideSpringClearing(x, z) {
  x -= SPRING_OFFSET.x;
  z -= SPRING_OFFSET.z;
  return ((x - 61) / 14.1) ** 2 + ((z - 4.55) / 15.1) ** 2 < 1 ||
    ((x - 47.2) / 4) ** 2 + ((z - 12.6) / 2) ** 2 < 1 ||
    ((x - 50.65) / 3.15) ** 2 + ((z - 12.65) / 3.5) ** 2 < 1 ||
    ((x - 72.5) / 5.15) ** 2 + ((z - 12) / 8.2) ** 2 < 1;
}

export function springGrassBlend(x, z) {
  x -= SPRING_OFFSET.x;
  z -= SPRING_OFFSET.z;
  const edge = Math.min(1, Math.hypot((x - 58) / 20, (z - 5) / 19));
  return (1 - edge * edge) ** 2;
}


export function springPathBlend(x, z) {
  let blend = 0;
  for (let i = 1; i < SPRING_PATH.length; i++) {
    const [ax, az] = SPRING_PATH[i - 1], [bx, bz] = SPRING_PATH[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const edge = Math.min(1, Math.hypot(x - ax - dx * t, z - az - dz * t) / 1.65);
    const progress = (i - 1 + t) / (SPRING_PATH.length - 1);
    blend = Math.max(blend, (1 - edge * edge) ** 2 * Math.min(1, progress * 5, (1 - progress) * 5));
  }
  return blend;
}
