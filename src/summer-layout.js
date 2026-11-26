import { BODY_RADIUS } from "./cotton-candy.js";

export const SUMMER = "summer_island";
export const SUMMER_NAME = "夏日秘境";
export const SUMMER_BOUNDS = { x: 0, z: 10, span: 119 };
export const SUMMER_WATER = 0;
export const SUMMER_VIEW_DISTANCE = 305;
export const SHORE_RADIUS = 1;
export const WADE_RADIUS = 1.068;
export const SHORE_X = 41;
export const SHORE_Z = 40;
export const POND = { x: -23, z: 1, rx: 6.7, rz: 4.9, y: 1.65 };
export const SWING = { x: 24, z: 8, yaw: -.43 };
const PIER_YAW = .60;
const PIER_SHIFT = 5;
export const PIER = {
  x: 23 + Math.sin(PIER_YAW) * PIER_SHIFT, z: 24 + Math.cos(PIER_YAW) * PIER_SHIFT,
  yaw: PIER_YAW, length: 30, y: 1.56,
};
export const TOWER = { x: 16, z: -23, y: 10.5, rise: 21.6, inner: 1.91, baseRadius: 5.34, neckRadius: 4.40, gallery: 6.70 };
export const TOWER_TURNS = 5 * Math.PI;
export const TOWER_LANDING = TOWER.y + TOWER.rise;
export const TOWER_EXIT = { layer: SUMMER, x: TOWER.x, z: TOWER.z + 8.5 };
// The handrail is inset .14 and its posts reach about .17 inside the deck edge.
export const GALLERY_WALK_RADIUS = TOWER.gallery - .18 - BODY_RADIUS - .07; // Allow for the landing squash.
export const GALLERY_OPENING = .95;
export const GALLERY_HATCH_START = Math.PI - GALLERY_OPENING;
export const GALLERY_HATCH_END = Math.PI - .26;
export const TOWER_EXIT_TURN = TOWER_TURNS - Math.PI + GALLERY_HATCH_END;
export const TOWER_CAP_RADIUS = 2.98;
export const LANTERN_BASE_RADIUS = TOWER_CAP_RADIUS + .11;
export const TOWER_INNER_GUARD_RADIUS = TOWER.inner + .04;
export const TOWER_WALL_THICKNESS = .29;
export const GALLERY_HATCH_RADIUS = TOWER.neckRadius + .54;
export const TOWER_FLARE_BASE = TOWER_LANDING - 2.1;
export const HATCH_RAIL_HALF_WIDTH = .10;
export const TOWER_DOOR_HALF_ANGLE = .30;
export const TOWER_DOOR_HEIGHT = 3.2;
export const COAST_TREES = [
  [-30, -4, 1.18], [-27, -8, .92], [-20, -7, 1.01], [-30, 7, 1.09], [-22, 10, .95],
  [-34, -13, 1.02], [-26, -20, 1.19], [-20, -25, .86], [-14, -29, 1.09], [-7, -30, .84],
  [6, -32, 1.06], [26, -22, .91], [29, -19, .72], [30, -12, 1.06], [32, -7, 1.04],
  [24, 12, 1.23], [19, 17, .81], [28, 15, .73], [-17, 24, 1.14], [-23, 22, .89],
  [-27, 17, .87], [-30, 13, .72], [-13, -11, .75], [1, -12, .89],
].map(([x, z, size]) => ({ x, z, size }));
export const RAINBOW_WIDTH = 6.4;
export const FOREST_BRIDGE = { layer: "ground", x: 48, start: -62, end: -76.9, gate: -75.5, direction: -1, rise: 3.6 };
export const ISLAND_BRIDGE = { layer: SUMMER, x: -8, start: 36, end: 59.8, gate: 58.3, direction: 1, rise: 3.6 };
export const SUMMER_ENTRY = { layer: SUMMER, x: -8, z: 51.5 };
export const FOREST_RETURN = { layer: "ground", x: 48, z: -69.5 };
export const SUMMER_PATH = [
  [-8, 36], [-7, 31], [-3, 25], [-4, 17], [-6, 9], [-3, 3], [4, -4], [5, -11],
  [8, -14], [12, -14.8], [16, -16.2], [16, -18],
];
export const PIER_PATH = [[-4, 16], [3, 18], [11, 18], [18, 20], [23, 24], [PIER.x, PIER.z]];
export const SUMMER_MARKERS = [
  { id: "island-rainbow", name: "彩虹桥", icon: "🌈", position: { x: ISLAND_BRIDGE.x, z: 44 } },
  { id: "lighthouse", name: "月光灯塔", icon: "♜", position: TOWER },
  { id: "firefly-pond", name: "萤火池", icon: "◉", position: POND },
  { id: "seaside-swing", name: "海边秋千", icon: "♧", position: SWING },
  { id: "sunset-pier", name: "日落栈道", icon: "⚓", position: pierPoint(0, PIER.length - 3) },
];

const TAU = 2 * Math.PI;
const smooth = (t) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

function coastShape(angle) {
  return 1 + .078 * Math.sin(3 * angle + .7) + .06 * Math.cos(5 * angle - .8) +
    .035 * Math.sin(7 * angle + .4) -
    .095 * Math.max(0, Math.cos(angle - 2.30)) ** 38 +
    .044 * Math.max(0, Math.cos(angle - 2.83)) ** 24;
}

// Expand only the southern arc. All inland vegetation keeps the original coast coordinates.
function beachWeight(angle) {
  return smooth((angle - .30) / .40) * (1 - smooth((angle - 1.89) / .57));
}

function radialMeters(angle) {
  return Math.hypot(Math.cos(angle) * SHORE_X, Math.sin(angle) * SHORE_Z);
}

function coastGrowth(angle) {
  return beachWeight(angle) * (9.15 + 1.24 * Math.sin(angle * 2.3 - .63) + .64 * Math.cos(angle * 7 + .28));
}

function coastProfile(angle) {
  const meters = radialMeters(angle);
  const original = coastShape(angle);
  const weight = beachWeight(angle);
  const growth = coastGrowth(angle);
  const shore = original + growth / meters;
  const oldWadeWidth = original * meters * (WADE_RADIUS - 1);
  return { meters, original, weight, shore, wadeWidth: oldWadeWidth + (10.7 - oldWadeWidth) * weight };
}

export function inlandCoastPoint(angle, radial = SHORE_RADIUS) {
  const r = radial * coastShape(angle);
  return [Math.cos(angle) * SHORE_X * r, Math.sin(angle) * SHORE_Z * r];
}

export function inlandCoastDistance(x, z) {
  return Math.hypot(x / SHORE_X, z / SHORE_Z) / coastShape(Math.atan2(z / SHORE_Z, x / SHORE_X));
}

export function coastPoint(angle, radial = SHORE_RADIUS) {
  const original = coastShape(angle);
  const growth = coastGrowth(angle) / radialMeters(angle);
  // Fade the local extension out at sea so the distant horizon keeps its shape.
  const r = original * radial + growth * Math.min(radial, 1 - smooth((radial - 1.28) / .78));
  return [Math.cos(angle) * SHORE_X * r, Math.sin(angle) * SHORE_Z * r];
}

export function coastDistance(x, z) {
  const angle = Math.atan2(z / SHORE_Z, x / SHORE_X);
  return Math.hypot(x / SHORE_X, z / SHORE_Z) /
    (coastShape(angle) + coastGrowth(angle) / radialMeters(angle));
}

function wadeLimit(profile, radius) {
  return profile.shore + (profile.wadeWidth - radius) / profile.meters;
}

export function wadePoint(angle, radius = 0) {
  const r = wadeLimit(coastProfile(angle), radius);
  return [Math.cos(angle) * SHORE_X * r, Math.sin(angle) * SHORE_Z * r];
}

export function pondDistance(x, z) {
  const u = (x - POND.x) / POND.rx;
  const v = (z - POND.z) / POND.rz;
  return Math.hypot(u, v) / (1 + .13 * Math.sin(3 * Math.atan2(v, u) + .6));
}

export function capeWeight(x, z) {
  return smooth((x - 16) / 13) * smooth((1 - z) / 17);
}

export function islandNodeHeight(x, z) {
  const scaledX = x / SHORE_X, scaledZ = z / SHORE_Z;
  const angle = Math.atan2(scaledZ, scaledX);
  const radial = Math.hypot(scaledX, scaledZ);
  const coast = radial / coastShape(angle);
  const inland = smooth((.99 - coast) / .24);
  const ridge = 8.8 * Math.exp(-(((x - 13) / 18) ** 2 + ((z + 23) / 17) ** 2));
  const hill = 4.8 * Math.exp(-(((x + 11) / 16) ** 2 + ((z + 17) / 13) ** 2));
  const meadow = 2.35 + .62 * Math.sin(x * .15) * Math.cos(z * .14);
  const knolls = 1.45 * Math.exp(-(((x + 23) / 7) ** 2 + ((z - 18) / 8) ** 2)) +
    1.52 * Math.exp(-(((x - 24) / 7.5) ** 2 + ((z + 5) / 7) ** 2));
  const face = smooth((.972 - coast) / .080);
  const cliff = capeWeight(x, z) * face * (.48 + .52 * smooth((coast - .72) / .15)) * (4.9 + .59 * Math.sin(z * 1.03 + x * .32));
  const beach = (1 - coast) * 6.7;
  let y = beach * (1 - inland) + (meadow + ridge + hill + knolls) * inland + cliff;
  if (coast > .88 && beachWeight(angle) > 0) {
    const profile = coastProfile(angle);
    const shoreOffset = (radial - profile.shore) * profile.meters;
    let sand;
    if (shoreOffset <= 0) {
      const dry = -shoreOffset;
      const shelf = .41 * smooth(dry / 5.15) + .11 * dry / (1.7 + dry) + .012 * Math.max(0, dry - 4);
      const originalSlope = dry * 6.7 / (profile.original * profile.meters);
      sand = originalSlope + (shelf - originalSlope) * profile.weight;
    } else {
      // Keep a slope through the waterline so the ground mesh meets the foam cleanly.
      const wet = Math.min(shoreOffset, profile.wadeWidth);
      const edgeDepth = .128 * wet / (1.7 + wet);
      const shelf = -.184 * smooth(wet / profile.wadeWidth) - edgeDepth - (shoreOffset - wet) * .167;
      const originalSlope = -shoreOffset * 6.7 / (profile.original * profile.meters);
      sand = originalSlope + (shelf - originalSlope) * smooth(profile.weight / .61);
    }
    y += (sand - y) * smooth((coast - .88) / .105);
  }
  const towerBlend = 1 - smooth((Math.hypot(x - TOWER.x, z - TOWER.z) - 6.4) / 4.4);
  const towerPad = y + (TOWER.y - y) * towerBlend;
  const pondBlend = 1 - smooth((pondDistance(x, z) - .72) / .56);
  return towerPad + (POND.y - .66 - towerPad) * pondBlend;
}

// The same triangle diagonal as the terrain mesh.
export function islandHeight(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const u = x - ix, v = z - iz;
  const b = islandNodeHeight(ix, iz + 1), d = islandNodeHeight(ix + 1, iz);
  return u + v <= 1 ? islandNodeHeight(ix, iz) * (1 - u - v) + b * v + d * u
    : islandNodeHeight(ix + 1, iz + 1) * (u + v - 1) + b * (1 - u) + d * (1 - v);
}

export const CAPE_ROCKS = [
  // Outcrops on the rear slope and smaller blocks at the waterline.
  [5.0, -34.9, 1.55, 2.20, 1.36, -.26], [7.8, -33.4, 1.80, 3.05, 1.57, .34],
  [10.3, -33.6, 1.73, 3.70, 1.53, .02], [12.5, -33.8, 1.80, 3.12, 1.69, -.39],
  [15.1, -32.9, 1.98, 3.90, 1.70, .28], [17.4, -32.6, 1.44, 3.10, 1.48, -.23],
  [19.0, -31.6, 1.49, 2.93, 1.73, .44], [20.7, -30.8, 1.43, 2.78, 1.25, -.42],
  [12.7, -36.2, 1.50, 1.55, 1.47, -.10], [15.8, -36.1, 1.81, 1.60, 1.28, .48],
  [18.1, -35.0, 1.18, 1.16, 1.08, -.38], [20.0, -34.2, .96, .96, 1.33, .16],
  // East face and broken ledges.
  [22.4, -29.4, 1.35, 2.65, 1.29, .10], [24.1, -27.8, 1.72, 3.40, 1.46, .37],
  [25.7, -26.5, 1.41, 3.00, 1.58, -.35], [27.4, -24.6, 1.73, 2.96, 1.49, .23],
  [29.0, -22.0, 1.63, 2.64, 1.40, -.41], [30.1, -19.3, 1.40, 2.01, 1.55, .20],
  [30.6, -16.4, 1.31, 1.75, 1.40, -.36], [32.1, -14.7, 1.06, 1.25, 1.29, .24],
  [26.9, -29.7, 1.18, 1.50, 1.37, -.16], [27.8, -27.3, 1.28, 1.55, 1.25, .52],
  [30.8, -24.3, 1.23, 1.32, 1.40, -.18], [32.7, -21.0, .93, 1.06, 1.12, .13],
  // Separate outcrops on the western shoulder and the far side of the beach.
  [1.7, -31.0, 1.38, 2.35, 1.60, -.51], [-.5, -32.6, 1.24, 1.85, 1.33, .19],
  [1.3, -34.7, 1.47, 2.00, 1.58, .07], [3.2, -33.4, 1.56, 2.44, 1.47, -.27],
  [-2.8, -34.0, .92, 1.17, 1.03, .21], [-.6, -36.5, 1.16, 1.21, 1.36, -.13],
  [-28.8, 24.6, 1.04, .93, .94, .38], [-30.1, 23.6, .86, .72, .91, -.16],
  [-27.5, 25.1, .73, .64, .81, -.21], [-29.5, 25.7, .62, .50, .63, .31],
].map(([x, z, w, h, d, yaw], index) => ({
  x, z, w, h, d, yaw, y: islandHeight(x, z) - h * (.10 + .045 * (index % 3)),
}));

export function bridgeProgress(bridge, z) {
  return (z - bridge.start) / (bridge.end - bridge.start);
}

export function bridgeCenter(bridge, z) {
  const t = bridgeProgress(bridge, z);
  return bridge.x + 1.45 * Math.sin(Math.PI * t) ** 2;
}

export function rainbowHeight(bridge, z, base) {
  const t = bridgeProgress(bridge, z);
  return base + bridge.rise * Math.sin(t * Math.PI / 2) ** 1.65;
}

export function onRainbow(bridge, x, z, width = RAINBOW_WIDTH) {
  const t = bridgeProgress(bridge, z);
  return t >= 0 && t <= 1 && Math.abs(x - bridgeCenter(bridge, z)) <= width / 2;
}

export function pierPoint(across, along) {
  const { x, z, yaw } = PIER;
  return { x: x + Math.cos(yaw) * across + Math.sin(yaw) * along,
    z: z - Math.sin(yaw) * across + Math.cos(yaw) * along };
}

export function pierLocal(x, z) {
  const dx = x - PIER.x, dz = z - PIER.z;
  return { across: dx * Math.cos(PIER.yaw) - dz * Math.sin(PIER.yaw),
    along: dx * Math.sin(PIER.yaw) + dz * Math.cos(PIER.yaw) };
}

export function pierWidth(along) {
  return along >= PIER.length - 6 ? 7 : 4.8;
}

function onPier(x, z, margin = 0) {
  const { across, along } = pierLocal(x, z);
  return along >= 0 && along <= PIER.length - margin && Math.abs(across) <= pierWidth(along) / 2 - margin;
}

// Read the existing terrain and structures without changing their walkable surfaces.
export function summerSurface(x, z, clearance = 0) {
  if (onRainbow(ISLAND_BRIDGE, x, z, RAINBOW_WIDTH + 2 * clearance) ||
      Math.hypot(x - TOWER.x, z - TOWER.z) <= TOWER.gallery + clearance ||
      pondDistance(x, z) < 1.08) return;
  const { across, along } = pierLocal(x, z);
  if (along >= -clearance && along <= PIER.length + clearance &&
      Math.abs(across) <= pierWidth(along) / 2 + clearance) return;
  const sx = x / SHORE_X, sz = z / SHORE_Z;
  const angle = Math.atan2(sz, sx);
  const profile = coastProfile(angle);
  const radial = Math.hypot(sx, sz);
  if (radial > wadeLimit(profile, clearance)) return;
  const coast = radial / profile.original;
  if (islandHeight(x, z) < SUMMER_WATER) return "water";
  if (capeWeight(x, z) > .22 && coast > .84) return;
  return coast >= .905 ? "sand" : "grass";
}

export function pierHeight(along) {
  // Follow the beach at the landward end, then reach a raised, level deck.
  const start = pierPoint(0, 0);
  return islandHeight(start.x, start.z) + (PIER.y - islandHeight(start.x, start.z)) * smooth(along / 7);
}

export function towerPoint(radius, angle) {
  return { x: TOWER.x + Math.sin(angle) * radius, z: TOWER.z + Math.cos(angle) * radius };
}

export function towerRise(angle) {
  const start = TOWER_TURNS - GALLERY_OPENING;
  if (angle <= start) return TOWER.y + TOWER.rise * angle / TOWER_TURNS;
  if (angle >= TOWER_EXIT_TURN) return TOWER_LANDING;
  const span = TOWER_EXIT_TURN - start;
  const t = (angle - start) / span;
  const slope = span / (TOWER_TURNS - start);
  // Match the old approach slope and reach the landing with no step or slope change.
  const eased = t * (slope + t * (3 - 2 * slope + t * (slope - 2)));
  return TOWER_LANDING - (TOWER_TURNS - start) * (1 - eased) * TOWER.rise / TOWER_TURNS;
}

export function towerAngle(x, z) {
  return (Math.atan2(x - TOWER.x, z - TOWER.z) + TAU) % TAU;
}

export function towerRadiusAt(y) {
  const level = Math.max(0, Math.min(1, (y - TOWER.y) / TOWER.rise));
  return TOWER.baseRadius + (TOWER.neckRadius - TOWER.baseRadius) * level;
}

export function towerShaftRadius(y, angle) {
  const height = smooth((y - TOWER_FLARE_BASE) / .68);
  const sector = smooth((angle - GALLERY_HATCH_START + .32) / .32) *
    (1 - smooth((angle - Math.PI - .10) / .30));
  return towerRadiusAt(y) + .48 * height * sector;
}

export function towerInteriorLimit(y, angle, radius, height) {
  return Math.min(towerShaftRadius(y, angle), towerShaftRadius(y + height, angle)) - radius;
}

export function towerDoorTop(angle) {
  return TOWER.y + TOWER_DOOR_HEIGHT - .58 * (angle / TOWER_DOOR_HALF_ANGLE) ** 2;
}

export function towerShellAt(x, y, z, margin = 0, height = 0) {
  if (y >= TOWER_LANDING || y + height < TOWER.y - .3) return false;
  const radius = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (radius > TOWER.baseRadius + TOWER_WALL_THICKNESS + margin) return false;
  const a = towerAngle(x, z);
  const outside = Math.max(towerShaftRadius(y, a), towerShaftRadius(y + height, a)) + TOWER_WALL_THICKNESS;
  if (radius < towerInteriorLimit(y, a, margin, height) || radius > outside + margin) return false;
  const edge = Math.min(a, TAU - a) + Math.asin(Math.min(1, margin / Math.max(.1, radius)));
  return edge >= TOWER_DOOR_HALF_ANGLE || y + height >= towerDoorTop(edge);
}

export function galleryOpening(angle) {
  return angle > GALLERY_HATCH_START && angle < GALLERY_HATCH_END;
}

export function onTowerGallery({ layer, x, y, z }) {
  return layer === SUMMER && y >= TOWER_LANDING - 1e-8 &&
    Math.hypot(x - TOWER.x, z - TOWER.z) <= TOWER.gallery + BODY_RADIUS;
}

export function canReturnFromTower(player) {
  if (onTowerGallery(player)) return true;
  if (player.layer !== SUMMER || player.y < TOWER.y - .35 || player.y >= TOWER_LANDING) return false;
  const radius = Math.hypot(player.x - TOWER.x, player.z - TOWER.z);
  if (player.y >= TOWER_LANDING - .55) return radius <= TOWER.gallery;
  if (radius > TOWER.baseRadius + TOWER_WALL_THICKNESS) return false;
  const angle = towerAngle(player.x, player.z);
  return radius <= towerShaftRadius(player.y, angle) + TOWER_WALL_THICKNESS;
}

function galleryRailRadius(radius) {
  return GALLERY_HATCH_RADIUS + HATCH_RAIL_HALF_WIDTH + radius;
}

export function clampGalleryStep(player, x, z, radius) {
  const distance = Math.hypot(x - TOWER.x, z - TOWER.z);
  const angle = towerAngle(x, z);
  const previous = Math.hypot(player.x - TOWER.x, player.z - TOWER.z);
  const previousAngle = towerAngle(player.x, player.z);
  let bounded = Math.min(GALLERY_WALK_RADIUS, distance);
  if (galleryOpening(angle)) {
    const outer = galleryRailRadius(radius);
    const inner = GALLERY_HATCH_RADIUS - HATCH_RAIL_HALF_WIDTH - radius;
    if (!galleryOpening(previousAngle) && bounded > inner && bounded < outer) {
      // Slide along the deck edge rather than snapping sideways past the rail end.
      return towerPoint(bounded, previousAngle >= GALLERY_HATCH_END ? GALLERY_HATCH_END + .001 : GALLERY_HATCH_START - .001);
    }
    if (previous >= GALLERY_HATCH_RADIUS) bounded = Math.max(outer, bounded);
    else bounded = Math.min(inner, bounded);
  }
  if (bounded === distance) return { x, z };
  return towerPoint(bounded, angle);
}

function galleryStepAllowed(player, x, z, radius) {
  const distance = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (distance > GALLERY_WALK_RADIUS + 1e-8) return false;
  const angle = towerAngle(x, z);
  const previousAngle = towerAngle(player.x, player.z);
  if (angle <= GALLERY_HATCH_START && galleryOpening(previousAngle) && distance < galleryRailRadius(radius)) return false;
  if (!galleryOpening(angle) || distance >= galleryRailRadius(radius) - 1e-8) return true;

  // Approach the opening from its level end, or stay on the ramp if jumping through it.
  return distance <= GALLERY_HATCH_RADIUS - HATCH_RAIL_HALF_WIDTH - radius + 1e-8 &&
    (previousAngle >= GALLERY_HATCH_END || galleryOpening(previousAngle));
}

function hasGalleryDeck(radius, angle) {
  return radius <= TOWER.gallery &&
    (radius > GALLERY_HATCH_RADIUS || radius < TOWER.inner || !galleryOpening(angle));
}

export function towerGalleryCeiling(x, z) {
  const radius = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (radius > TOWER.gallery || !hasGalleryDeck(radius, towerAngle(x, z))) return Infinity;
  // Match the thicker balcony ring and the shallower floor beside the stair opening.
  return TOWER_LANDING - (radius > GALLERY_HATCH_RADIUS ? .36 : .28);
}

export function towerHeadCeiling(x, z, margin = 0) {
  const lanternRadius = LANTERN_BASE_RADIUS + margin;
  const deck = towerGalleryCeiling(x, z);
  return Math.hypot(x - TOWER.x, z - TOWER.z) < lanternRadius ? Math.min(deck, TOWER_LANDING) : deck;
}

export function towerFloor(x, z, ceiling, best) {
  const radius = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (radius > TOWER.gallery) return best;
  const a = towerAngle(x, z);
  if (TOWER_LANDING <= ceiling && hasGalleryDeck(radius, a)) return Math.max(best, TOWER_LANDING);
  if (radius < TOWER.inner || radius > TOWER.baseRadius) return best;
  for (let angle = a; angle <= TOWER_TURNS; angle += TAU) {
    const y = towerRise(angle);
    if (y <= ceiling && radius <= towerShaftRadius(y, a)) best = Math.max(best, y);
  }
  return best;
}

export function restoreTowerPose(pose, playerRadius, height) {
  const { x, y, z } = pose;
  if (!Number.isFinite(y) || y < TOWER.y + .45 || y > TOWER_LANDING + .30) return pose;
  const radius = Math.hypot(x - TOWER.x, z - TOWER.z);
  if (radius > 7.2) return pose;
  const a = towerAngle(x, z);
  const inHatch = galleryOpening(a);
  const insideLanding = inHatch && radius < GALLERY_HATCH_RADIUS - HATCH_RAIL_HALF_WIDTH;
  const nearLanding = Math.abs(y - TOWER_LANDING) <= .025;
  const margin = playerRadius + .02;
  if (nearLanding && !insideLanding) {
    const minimum = inHatch ? galleryRailRadius(playerRadius) : LANTERN_BASE_RADIUS + margin;
    const safeRadius = Math.max(minimum, Math.min(GALLERY_WALK_RADIUS, radius));
    return safeRadius === radius ? pose : { ...pose, ...towerPoint(safeRadius, a) };
  }
  // Recover the level of poses created before the shaft was tapered.
  if (radius > 5.6) return pose;
  const angle = a + Math.round(((y - TOWER.y) * TOWER_TURNS / TOWER.rise - a) / TAU) * TAU;
  const oldFloor = TOWER.y + TOWER.rise * angle / TOWER_TURNS;
  const newFloor = towerRise(angle);
  if (angle < 0 || angle > TOWER_TURNS ||
      (!nearLanding && Math.min(Math.abs(newFloor - y), Math.abs(oldFloor - y)) > .12)) return pose;
  const inner = (newFloor + height > TOWER_LANDING ? LANTERN_BASE_RADIUS : TOWER_INNER_GUARD_RADIUS) + margin;
  const safeRadius = Math.max(inner, Math.min(towerInteriorLimit(newFloor, a, margin, height), radius));
  return { ...pose, ...towerPoint(safeRadius, a), y: newFloor };
}

export function summerFloor(x, z, ceiling) {
  let y = islandHeight(x, z);
  if (onRainbow(ISLAND_BRIDGE, x, z)) {
    const ramp = rainbowHeight(ISLAND_BRIDGE, z, islandHeight(ISLAND_BRIDGE.x, ISLAND_BRIDGE.start));
    if (ramp <= ceiling) y = Math.max(ramp, y);
  }
  if (onPier(x, z)) {
    const deck = pierHeight(pierLocal(x, z).along);
    if (deck <= ceiling) y = Math.max(deck, y);
  }
  return towerFloor(x, z, ceiling, y);
}

export function summerWalkable(player, x, z, radius) {
  const { y } = player;
  const bridge = ISLAND_BRIDGE;
  if (onRainbow(bridge, x, z, RAINBOW_WIDTH - 2 * radius)) {
    const deck = rainbowHeight(bridge, z, islandHeight(bridge.x, bridge.start));
    if (y + .43 >= deck) return true;
  }
  if (onPier(x, z, radius) && y + .45 >= pierHeight(pierLocal(x, z).along)) return true;
  if (onTowerGallery(player)) return galleryStepAllowed(player, x, z, radius);
  if (onPier(player.x, player.z) && coastDistance(player.x, player.z) > .99 &&
      y >= pierHeight(pierLocal(player.x, player.z).along) - .08) return false;
  if (onRainbow(bridge, player.x, player.z)) {
    const deck = rainbowHeight(bridge, player.z, islandHeight(bridge.x, bridge.start));
    if (y >= deck - .08 && deck > islandHeight(player.x, player.z) + .37) return false;
  }
  const angle = Math.atan2(z / SHORE_Z, x / SHORE_X);
  return Math.hypot(x / SHORE_X, z / SHORE_Z) <= wadeLimit(coastProfile(angle), radius) + 1e-8 &&
    pondDistance(x, z) >= .76;
}

// Follow the curved deep-water boundary without interfering with raised crossings.
export function clampShoreStep(player, x, z, radius) {
  if (player.layer !== SUMMER) return undefined;
  const sx = x / SHORE_X, sz = z / SHORE_Z;
  const angle = Math.atan2(sz, sx);
  const profile = coastProfile(angle);
  const overshoot = (Math.hypot(sx, sz) - wadeLimit(profile, radius)) * profile.meters;
  if (!profile.weight || overshoot <= 0 || overshoot > .30 || summerWalkable(player, x, z, radius)) return undefined;
  const [cx, cz] = wadePoint(angle, radius + .004);
  return { x: cx, z: cz };
}
