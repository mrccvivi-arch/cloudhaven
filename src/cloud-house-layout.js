export const CABIN = { x: -43, z: 32 };
export const CLOUD_HOUSE = { x: CABIN.x, z: CABIN.z - 6.15, rx: 4.85, rz: 3.75 };
export const STAR_CHEST = {
  id: "chest", layer: "ground", x: CLOUD_HOUSE.x - 2.85, z: CLOUD_HOUSE.z - .84,
  label: "打开星月宝箱", range: 2.15, w: 1.48, d: 1.06, h: .96,
};

// The open front faces +Z. Each cloud segment and its collider share the same chord.
const arc = Array.from({ length: 13 }, (_, index) => {
  const angle = .48 + (Math.PI * 2 - .96) * index / 12;
  return [CLOUD_HOUSE.x + Math.sin(angle) * CLOUD_HOUSE.rx,
    CLOUD_HOUSE.z + Math.cos(angle) * CLOUD_HOUSE.rz];
});
export const CLOUD_WALLS = arc.slice(1).map(([x1, z1], index) => {
  const [x0, z0] = arc[index];
  return {
    x: (x0 + x1) / 2, z: (z0 + z1) / 2,
    w: Math.hypot(x1 - x0, z1 - z0) + .19, d: 1.43,
    height: 3.74 + .18 * Math.sin(index * 2.1),
    yaw: Math.atan2(z0 - z1, x1 - x0),
  };
});

export const CLOUD_LOBES = [
  { dx: -4.9, y: .76, dz: 1.61, sx: 1.93, sy: 1.22, sz: 1.68, shade: 2, yaw: -.18 },
  { dx: 4.45, y: .93, dz: 1.86, sx: 2.19, sy: 1.46, sz: 1.7, shade: 1, yaw: .2 },
  { dx: 4.98, y: .48, dz: -.98, sx: 1.6, sy: .92, sz: 1.73, shade: 2, yaw: 0 },
  { dx: -4.25, y: 1.24, dz: -2.55, sx: 2.01, sy: 1.46, sz: 1.62, shade: 1, yaw: .26 },
];

export function inCloudHouse(x, z) {
  return ((x - CLOUD_HOUSE.x) / CLOUD_HOUSE.rx) ** 2 +
    ((z - CLOUD_HOUSE.z) / CLOUD_HOUSE.rz) ** 2 < 1;
}
