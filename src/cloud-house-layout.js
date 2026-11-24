export const HABITAT_MARKER = { x: -43, z: 32 };
export const HABITAT = { id: "habitat-cloud", x: -43, z: 25.85, rx: 5.68, rz: 3.66 };
export const MOON_STORAGE = {
  id: "chest", layer: "ground", x: HABITAT.x - 3.15, z: HABITAT.z - .64,
  label: "打开月牙储物舱", range: 2.15,
};

export function cloudRadius(angle) {
  return .93 + .15 * lobe(angle, .82, .085) + .17 * lobe(angle, 2.23, .09) +
    .13 * lobe(angle, -1.4, .14) + .09 * lobe(angle, -2.98, .12) + .07 * lobe(angle, -.17, .10);
}

export function cloudFloat(seconds) {
  return .075 * Math.sin(seconds * .9);
}

function lobe(angle, center, width) {
  return Math.exp((Math.cos(angle - center) - 1) / width);
}

export function cloudRimHeight(radius, angle = 0) {
  const rise = Math.max(0, Math.min(1, (radius - .48) / .35));
  const rim = rise * rise * (3 - 2 * rise);
  const crown = 1.95 * lobe(angle, -1.4, .14) + .89 * lobe(angle, -2.29, .08) +
    .85 * lobe(angle, -.48, .08) + .55 * lobe(angle, .82, .095) + .64 * lobe(angle, 2.23, .085);
  const shoulder = 1 - .12 * Math.max(0, (radius - .83) / .08);
  return 1.49 + rim * (.10 + crown * shoulder);
}

export function cloudFootprint(x, z) {
  const dx = (x - HABITAT.x) / HABITAT.rx, dz = (z - HABITAT.z) / HABITAT.rz;
  return Math.hypot(dx, dz) / cloudRadius(Math.atan2(dz, dx));
}

export function cloudFloor(x, z, offset = 0) {
  const radius = cloudFootprint(x, z);
  const angle = Math.atan2((z - HABITAT.z) / HABITAT.rz, (x - HABITAT.x) / HABITAT.rx);
  return radius <= .91 ? cloudRimHeight(radius, angle) + offset : -Infinity;
}

export function canReachMoon(player) {
  return player.layer === "ground" && player.y >= 1.12 &&
    Math.hypot(player.x - MOON_STORAGE.x, player.z - MOON_STORAGE.z) < MOON_STORAGE.range;
}
