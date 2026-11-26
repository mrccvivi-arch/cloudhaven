import { Color, MathUtils, Vector3 } from "three";
import { CYCLE_LENGTH } from "./day-night.js";

const { lerp, smoothstep } = MathUtils;
const SUN_X = .73, SUN_Z = .68345;
const MOON_X = .47, MOON_Z = .88267;
const colorKeys = ["top", "middle", "horizon", "haze", "ambient", "bounce", "key", "sea", "cloudShade", "cloudLight", "sunTint"];
const valueKeys = ["skyMix", "sunHeight", "sunGlow", "moon", "star", "fill", "direct", "cloudMix", "waterMix"];

function cue(at, colors, values) {
  return { at, colors: colors.map((hex) => new Color(hex)), values };
}

const day = cue(23,
  [0x3e94d6, 0x87c8ee, 0xbce5fa, 0xe1f5ff, 0xeaf6ff, 0xb3cec8, 0xfff7e6, 0xffffff, 0xffffff, 0xffffff, 0xffdfaa],
  [0, .43, 0, 0, 0, 1.55, 1.62, 0, 0]);
const night = cue(194,
  [0x080f30, 0x152958, 0x2f5088, 0x6f8ab5, 0xaccaff, 0x8a9cc1, 0xcbdfff, 0x406ca0, 0x36497e, 0x738dbd, 0xffbdad],
  [1, -.15, 0, 1, .88, 1.17, .85, .84, .85]);
const morning = cue(0,
  [0x385782, 0x87a2cf, 0xf3c8c8, 0xffd9ad, 0xe1e8fe, 0xadbfd0, 0xffdfc5, 0x93b7d3, 0x9a9bc8, 0xffddc4, 0xffdbb4],
  [.82, -.15, 0, .1, .12, 1.46, 1.29, .56, .4]);

const cues = [
  morning, day, { ...day, at: 135 },
  cue(151,
    [0x777fbc, 0xe6aec4, 0xffdaad, 0xffdbc0, 0xf2edff, 0xb4c2bb, 0xffddb1, 0xacc1cc, 0xab9bc8, 0xffd8b2, 0xffd397],
    [1, .17, 1, 0, 0, 1.48, 1.46, .65, .55]),
  cue(165,
    [0x555c9d, 0xd493bd, 0xffbc99, 0xffd3a1, 0xe5dfff, 0xabacc0, 0xffcda5, 0xbf91c4, 0x867eaf, 0xf5bac7, 0xffbca3],
    [1, .032, .94, 0, .02, 1.37, 1.26, .77, .7]),
  cue(172,
    [0x313d7b, 0x9579b5, 0xf0a9be, 0xfdb5ad, 0xd6d8fa, 0x9caac5, 0xe6c9dd, 0xa080cd, 0x766fa9, 0xdcaecb, 0xffb6b7],
    [1, -.059, .15, .16, .31, 1.28, 1.04, .85, .79]),
  cue(183,
    [0x17244f, 0x4b5591, 0xbc8bb9, 0xecaebd, 0xc0cef5, 0x8d9cc2, 0xd4d6fa, 0x7581c2, 0x4a538e, 0xa197c1, 0xffb6b7],
    [1, -.12, 0, .66, .66, 1.21, .93, .86, .86]),
  night, { ...night, at: 278 },
  cue(289,
    [0x17274f, 0x4f638e, 0x918eb8, 0xd6a7b8, 0xc2d5f5, 0x96aac5, 0xd5dfff, 0x618caf, 0x586893, 0xa39ebf, 0xffd4bf],
    [1, -.15, 0, .76, .59, 1.25, .98, .77, .7]),
  { ...morning, at: CYCLE_LENGTH },
];

export function summerSkySituation(time) {
  if (time >= 281 || time < 9) return "summer-dawn";
  if (time >= 135 && time < 159) return "summer-golden-hour";
  if (time >= 159 && time < 171) return "summer-sunset";
  if (time >= 171 && time < 194) return "summer-blue-hour";
  if (time >= 194 && time < 281) return "summer-moonlit-sea";
}

export function createSummerLight() {
  const look = Object.fromEntries(colorKeys.map((key) => [key, new Color()]));
  look.sunDirection = new Vector3();
  look.moonDirection = new Vector3();
  return {
    look,
    update(time) {
      time = MathUtils.euclideanModulo(time, CYCLE_LENGTH);
      const next = cues.findIndex(({ at }) => at > time);
      const a = cues[Math.max(0, next - 1)], b = cues[next];
      const t = smoothstep(time, a.at, b.at);
      colorKeys.forEach((key, i) => look[key].copy(a.colors[i]).lerp(b.colors[i], t));
      valueKeys.forEach((key, i) => { look[key] = lerp(a.values[i], b.values[i], t); });
      look.beacon = smoothstep(time, 146, 194) * (1 - smoothstep(time, 277, CYCLE_LENGTH));
      look.sunDirection.set(SUN_X, look.sunHeight, SUN_Z).normalize();
      look.moonDirection.set(MOON_X, .13 + .07 * smoothstep(time, 170, 240) * (1 - smoothstep(time, 278, CYCLE_LENGTH)), MOON_Z).normalize();
      return look;
    },
  };
}
