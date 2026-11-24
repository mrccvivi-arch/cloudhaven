// One translation for the original grove layout, including its authored terrain profile.
export const SPRING_OFFSET = Object.freeze({ x: -104, z: -50 });

export function springPoint(x, z) {
  return { x: x + SPRING_OFFSET.x, z: z + SPRING_OFFSET.z };
}
export const SPRING_POOL = { ...springPoint(60.5, 1.55), radiusX: 6.25, radiusZ: 7.4, y: .17 };
export const SPRING_FALLS = { ...springPoint(60.5, -4.45), lip: 8.85 };
export const SPRING_REST_ROCK = { ...springPoint(63.55, 9.15), sx: 1.35, sz: .93, height: .64, yaw: -.22 };
export const SPRING_PATH = [[43, 14], [48, 14], [51, 13.35], [53.75, 11.95],
  [54.6, 9.5], [56.15, 9.15], [58.6, 9.95], [61.1, 10.4]].map(([x, z]) => {
    const point = springPoint(x, z);
    return [point.x, point.z];
  });

export const SPRING_TREES = [
  [43.8, 10.7, .92], [46.6, 16.7, 1.07], [48.3, 10.15, 1.13], [51.4, 16.4, .94],
  [52.65, 10.35, .90], [55.45, 11.15, 1.03], [56.2, 20.1, .94], [65.6, 13.9, 1.12],
  [49.45, 1.2, 1.02], [51, -6.55, .97], [48.8, -2.6, .82], [50.6, 9.55, .85],
  [54.8, -10.1, 1.16], [61, -10.05, 1.05], [66, -10.45, 1.13],
  [73.3, -4.6, .99], [73.85, .6, 1.01], [67.4, 6.4, 1.05], [73.15, 8.55, 1.11],
  [71.8, 14.7, .95], [65.1, 15.3, .92],
  [55.25, 8.05, .65, -.83], [67.0, 4.8, .67, 2.12], [67.0, 8.15, .66, -1.96],
].map(([x, z, size, overhang]) => ({ ...springPoint(x, z), size, overhang }));

export const CHERRY_FORK_HEIGHT = 6.05;

// The western spur and southern ridge overlap in sight, with a walkable bend between their tips.
export const SPRING_BOULDERS = [
  [52.05, 6.9, 2.15, 5.7, 2.25, -.29],
  [52.1, 3.5, 2.75, 6.65, 2.8, .24],
  [52.8, -.4, 2.9, 7.65, 3.0, -.36],
  [54.3, -3.4, 2.65, 8.45, 2.55, .29],
  [49.95, 5.4, 1.75, 4.8, 2.7, .48],
  [52.8, 8.25, 1.46, 3.2, 1.28, .31],
  [55.85, 4.5, 1.95, 8.65, 2.0, -.12],
  [55.55, 6.15, 1.33, 8.15, 1.15, -.28],
  [54.4, 16.4, 1.93, 7.3, 1.95, .36],
  [56.45, 14.5, 1.7, 7.9, 2.45, -.32],
  [56.95, 17.2, 2.03, 7.8, 2.25, -.21],
  [59.25, 19.25, 2.8, 8.7, 3.25, .24],
  [63.0, 20.05, 2.8, 8.45, 2.85, -.24],
  [66.65, 18.5, 2.95, 8.0, 3.1, .36],
  [69.9, 13.6, 1.85, 6.0, 4.3, -.16],
  [71.0, 7.45, 1.82, 5.75, 3.25, .31],
  [71.5, 2.0, 2.15, 6.25, 2.7, -.27],
  [70.75, -2.1, 2.15, 6.35, 2.9, .36],
  [69.15, -5.1, 2.28, 7.15, 2.65, -.28],
  [65.1, -6.6, 2.7, 9.4, 2.8, -.18],
  [62.05, -7.15, 2.4, 10.15, 2.72, .24],
  [58.78, -7.25, 2.47, 9.75, 2.6, -.34],
  [55.9, -6.4, 2.65, 10.3, 2.7, .24],
  [58.3, -4.85, 1.58, 7.55, 1.73, -.10],
  [62.75, -4.95, 1.65, 8.25, 1.7, .19],
  [60.5, -5.7, 1.74, 8.82, 1.1, 0],
  [54.0, 2.7, .84, .76, .99, -.31],
  [54.1, 4.46, .72, .55, .67, .28],
  [66.35, -1.7, 1.18, 1.2, .96, .24],
  [67.15, .25, 1.10, .95, 1.03, -.21],
  [67.3, 2.85, .85, .62, .85, -.13],
  [68.15, 5.2, 1.15, .7, .85, .18],
].map(([x, z, sx, height, sz, yaw]) => ({ ...springPoint(x, z), sx, height, sz, yaw }));

export function springPoolDistance(x, z) {
  return Math.hypot((x - SPRING_POOL.x) / SPRING_POOL.radiusX, (z - SPRING_POOL.z) / SPRING_POOL.radiusZ);
}

export function springGroundHeight(x, z, naturalHeight, sampleNaturalHeight) {
  // Blend the relocated topography into the new forest before it reaches the creek or map edge.
  const localX = x - SPRING_OFFSET.x, localZ = z - SPRING_OFFSET.z;
  const terrainBlend = Math.min(1, Math.max(0, Math.min((localX - 35) / 5, (81 - localX) / 5, (localZ + 19) / 5, (24 - localZ) / 2)));
  if (terrainBlend > 0) naturalHeight += (sampleNaturalHeight(localX, localZ) - naturalHeight) * terrainBlend * terrainBlend * (3 - 2 * terrainBlend);

  const distance = springPoolDistance(x, z);
  if (distance >= 1.25) return naturalHeight;
  const shore = Math.min(1, Math.max(0, (distance - .57) / .36));
  const plunge = Math.max(0, 1 - Math.hypot((x - SPRING_FALLS.x) / 3.3, (z - SPRING_FALLS.z) / 1.6));
  const basin = SPRING_POOL.y - 1.24 + shore * 1.86 - plunge * .23;
  const edge = Math.min(1, Math.max(0, (distance - 1.01) / .24));
  return basin + (naturalHeight - basin) * edge * edge * (3 - 2 * edge);
}

export function insideSpringClearing(x, z) {
  x -= SPRING_OFFSET.x;
  z -= SPRING_OFFSET.z;
  return ((x - 61) / 9.5) ** 2 + ((z - 3.15) / 12.8) ** 2 < 1 ||
    ((x - 47.2) / 4) ** 2 + ((z - 12.6) / 2) ** 2 < 1 ||
    ((x - 50.65) / 3.15) ** 2 + ((z - 12.65) / 3.5) ** 2 < 1;
}

export function springGrassBlend(x, z) {
  x -= SPRING_OFFSET.x;
  z -= SPRING_OFFSET.z;
  const edge = Math.min(1, Math.hypot((x - 56) / 16, (z - 4) / 17));
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
