export const WINTER = "winter_sea";
export const WINTER_NAME = "冬日秘境 · 雪之海";
export const WINTER_LIMIT = 138;
export const WINTER_VIEW_DISTANCE = 310;
export const WINTER_BOUNDS = { x: 0, z: 0, span: WINTER_LIMIT * 2 };
export const WINTER_GATE = { x: 21.5, z: 57.5, layer: "ground" };
export const WINTER_RETURN = { x: 21.5, z: 53.7, layer: "ground" };
export const SNOW_GATE = { x: 0, z: 47, layer: WINTER };
export const WINTER_ENTRY = { x: 0, z: 30.5, layer: WINTER };
export const WINTER_TREE = { x: 17, z: -19, shade: 9.6, trunk: 1.28, shelter: [12.4, 21.0] };
export const WINTER_LAKE = { x: -54, z: 0, rx: 58, rz: 105, shoreHeight: 1.62 };
const TAU = Math.PI * 2;

function loopRadius(angle) {
  return 129 + 2.4 * Math.sin(3 * angle + .5) + 1.6 * Math.sin(5 * angle);
}

export const WINTER_LOOP = Array.from({ length: 97 }, (_, i) => {
  const angle = TAU * i / 96;
  const radius = loopRadius(angle);
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
});

export const WINTER_PERIMETER = Array.from({ length: 97 }, (_, i) => {
  const angle = TAU * i / 96;
  return [WINTER_LIMIT * Math.cos(angle), WINTER_LIMIT * Math.sin(angle)];
});

function lakeRadius(angle) {
  return 1 + .046 * Math.sin(3 * angle + .5) + .033 * Math.cos(2 * angle - .8)
    - .09 * Math.max(0, Math.cos(angle)) ** 4
    - .112 * Math.exp(-(((angle - .43) / .34) ** 2));
}

// A value of 1 is the future shoreline; this is still continuous snow terrain.
export function winterLakeExtent(x, z) {
  const u = (x - WINTER_LAKE.x) / WINTER_LAKE.rx;
  const v = (z - WINTER_LAKE.z) / WINTER_LAKE.rz;
  return Math.hypot(u, v) / lakeRadius(Math.atan2(v, u));
}

export function winterLoopDistance(x, z) {
  return Math.abs(Math.hypot(x, z) - loopRadius(Math.atan2(z, x)));
}

function smooth(value, low, high) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function winterCanopy(x, z) {
  return 1 - smooth(Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z), 5.5, WINTER_TREE.shade + 2.1);
}

export function winterHeight(x, z) {
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const path = smooth(winterLoopDistance(x, z), 1.8, 11);
  const waves = Math.sin(x * .081 + z * .060 + .68 * Math.sin(z * .055)) * .85 +
    Math.sin(z * .121 - x * .036) * .47 + .28 * Math.cos(x * .20 + z * .11);
  const clearing = winterCanopy(x, z);
  const interior = 1.65 + waves * (.43 + .57 * path);

  const fore = (6.4 + 2.8 * Math.sin(3 * a + .8) + 1.5 * Math.cos(7 * a))
    * Math.exp(-(((r - 142 - 7 * Math.sin(4 * a)) / 31) ** 2)) * smooth(r, 94, 143);
  const middle = (7.2 + 3.9 * Math.cos(4 * a - .9) + 2.2 * Math.sin(7 * a))
    * Math.exp(-(((r - 175 - 13 * Math.sin(3 * a)) / 26) ** 2)) * smooth(r, 131, 163);
  const background = (12 + 5.6 * Math.sin(4 * a + 1.4) + 3.2 * Math.cos(7 * a))
    * Math.exp(-(((r - 215 - 16 * Math.cos(3 * a)) / 34) ** 2)) * smooth(r, 155, 193);
  const bank = fore + middle + background;
  const shore = smooth(winterLakeExtent(x, z), .79, 1.095);
  const snow = interior + (1.48 - interior) * clearing + bank;
  return WINTER_LAKE.shoreHeight + (snow - WINTER_LAKE.shoreHeight) * shore;
}

export function winterWalkable(fromX, fromZ, x, z) {
  if (Math.hypot(x, z) > WINTER_LIMIT) return false;
  const oldTrunk = Math.hypot(fromX - WINTER_TREE.x, fromZ - WINTER_TREE.z);
  const newTrunk = Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z);
  if (newTrunk < WINTER_TREE.trunk + .43 && newTrunk < oldTrunk) return false;
  return winterHeight(x, z) - winterHeight(fromX, fromZ) <= .62 * Math.hypot(x - fromX, z - fromZ) + 1e-5;
}
