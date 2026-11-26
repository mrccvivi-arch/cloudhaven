import { DataTexture, LinearFilter, MathUtils, Sprite, SpriteMaterial } from "three";

const smooth = MathUtils.smoothstep;

export function summerNightGlow(night, look) {
  return look ? smooth(look.star, .22, .80) : smooth(night, .25, 1);
}

const size = 64;
const pixels = new Uint8Array(size * size * 4).fill(255);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const r = Math.hypot(x + .5 - size / 2, y + .5 - size / 2) / (size / 2);
    pixels[(y * size + x) * 4 + 3] = Math.round(255 * (1 - smooth(r, 0, 1)) ** 2);
  }
}
export const summerHaloMap = new DataTexture(pixels, size, size);
summerHaloMap.minFilter = summerHaloMap.magFilter = LinearFilter;
summerHaloMap.needsUpdate = true;

export function addSummerHalo(parent, position, color, width) {
  const halo = new Sprite(new SpriteMaterial({
    color, map: summerHaloMap, transparent: true, depthWrite: false, toneMapped: false, opacity: 0,
  }));
  halo.position.copy(position);
  halo.scale.set(width, width, 1);
  halo.visible = false;
  halo.renderOrder = 6;
  parent.add(halo);
  return halo;
}
