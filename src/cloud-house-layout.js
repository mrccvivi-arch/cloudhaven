export const HABITAT_MARKER = { x: -43, z: 32 };
export const HABITAT = { id: "habitat-cloud", x: -43, z: 25.85, rx: 5.68, rz: 3.66 };
export const MOON_STORAGE = {
  id: "chest", layer: "ground", x: HABITAT.x - 3.15, z: HABITAT.z - .64,
  label: "打开月牙储物舱", range: 2.15,
};

export function cloudRadius(angle) {
  return 1 + .041 * Math.cos(3 * angle + .48) + .034 * Math.sin(5 * angle - .7) + .018 * Math.cos(7 * angle + 1.9);
}

export function cloudFloat(seconds) {
  return .075 * Math.sin(seconds * .9);
}

export function cloudRimHeight(radius) {
  const lip = Math.max(0, Math.min(1, (radius - .57) / .31));
  return 1.49 + .17 * lip * lip * (3 - 2 * lip);
}

export function cloudFootprint(x, z) {
  const dx = (x - HABITAT.x) / HABITAT.rx, dz = (z - HABITAT.z) / HABITAT.rz;
  return Math.hypot(dx, dz) / cloudRadius(Math.atan2(dz, dx));
}

export function cloudFloor(x, z, offset = 0) {
  const radius = cloudFootprint(x, z);
  return radius <= .91 ? cloudRimHeight(radius) + offset : -Infinity;
}

export function canReachMoon(player) {
  return player.layer === "ground" && player.y >= 1.12 &&
    Math.hypot(player.x - MOON_STORAGE.x, player.z - MOON_STORAGE.z) < MOON_STORAGE.range;
}
