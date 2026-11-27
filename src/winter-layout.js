export const WINTER = "winter_sea";
export const WINTER_NAME = "冬日秘境 · 雪之海";
export const WINTER_LIMIT = 92;
export const WINTER_VIEW_DISTANCE = 310;
export const WINTER_BOUNDS = { x: 0, z: 0, span: WINTER_LIMIT * 2 };
export const WINTER_GATE = { x: 21.5, z: 57.5, layer: "ground" };
export const WINTER_RETURN = { x: 21.5, z: 53.7, layer: "ground" };
export const SNOW_GATE = { x: 0, z: 47, layer: WINTER };
export const WINTER_ENTRY = { x: 0, z: 30.5, layer: WINTER };
export const WINTER_TREE = { x: 17, z: -19, shade: 9.6, trunk: 1.28, shelter: [12.4, 21.0] };
export const WINTER_LOOP = Array.from({ length: 65 }, (_, i) => {
  const a = i * Math.PI / 32;
  return [55 * Math.sin(a), 52 * Math.cos(a) + 2 * Math.sin(a * 3)];
});

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
  const loop = Math.abs(Math.hypot(x / 55, (z - 2 * Math.sin(Math.atan2(x / 55, z / 52) * 3)) / 52) - 1);
  const path = smooth(loop, .016, .14);
  const waves = Math.sin(x * .081 + z * .060 + .68 * Math.sin(z * .055)) * .85 +
    Math.sin(z * .121 - x * .036) * .47 + .28 * Math.cos(x * .20 + z * .11);
  const interior = 1.65 + waves * (.28 + .72 * path);
  const clearing = winterCanopy(x, z);
  const rim = r - (67 + 3.8 * Math.sin(3 * a + .8) + 2 * Math.cos(5 * a));
  const ridge = Math.max(0, rim);
  const bank = ridge < 34 ? ridge * ridge * .025 : 28.9 + (ridge - 34) * .19;
  return interior + (1.48 - interior) * clearing + bank + smooth(r, 92, 149) *
    (2.5 * Math.sin(x * .039 + z * .062) + 2 * Math.cos(z * .080 - x * .042));
}

export function winterWalkable(fromX, fromZ, x, z) {
  if (Math.hypot(x, z) > WINTER_LIMIT) return false;
  const oldTrunk = Math.hypot(fromX - WINTER_TREE.x, fromZ - WINTER_TREE.z);
  const newTrunk = Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z);
  if (newTrunk < WINTER_TREE.trunk + .43 && newTrunk < oldTrunk) return false;
  return winterHeight(x, z) - winterHeight(fromX, fromZ) <= .62 * Math.hypot(x - fromX, z - fromZ) + 1e-5;
}
