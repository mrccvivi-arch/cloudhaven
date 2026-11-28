import * as THREE from "three";

const tilesX = 8;
const tilesY = 4;
const tileSize = 64;
const inset = 3;
const { lerp, smoothstep } = THREE.MathUtils;
const pigments = [
  [0, [11, 17, 30]], [.34, [18, 30, 58]], [.64, [32, 53, 98]], [1, [71, 87, 115]],
];
const foilCenters = new Map([
  [8, [.57, .90, .10, .044]], [10, [.24, .96, .15, .048]],
  [12, [.76, .77, .079, .035]], [15, [.62, .89, .16, .052]],
  [16, [.42, .92, .135, .048]],
  [19, [.67, .70, .132, .046]], [22, [.32, .98, .16, .039]],
]);

function hash(x, y, seed) {
  const n = Math.imul(x + 734287 + seed * 31, 1597334677) ^ Math.imul(y + 11797, 3812015801);
  const scrambled = Math.imul(n ^ (n >>> 15), 2246822519);
  return ((scrambled ^ (scrambled >>> 13)) >>> 0) / 4294967295;
}

function noise(x, y, seed) {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = smoothstep(x - i, 0, 1), fy = smoothstep(y - j, 0, 1);
  return lerp(lerp(hash(i, j, seed), hash(i + 1, j, seed), fx),
    lerp(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), fx), fy);
}

function atlas() {
  const width = tilesX * tileSize, height = tilesY * tileSize;
  const blue = new Uint8Array(width * height * 4);
  const neutral = new Uint8Array(blue.length);
  const relief = new Uint8Array(blue.length);
  for (let tile = 0; tile < tilesX * tilesY; tile++) {
    const x0 = tile % tilesX * tileSize, y0 = Math.floor(tile / tilesX) * tileSize;
    const foil = foilCenters.get(tile);
    for (let j = 0; j < tileSize; j++) {
      for (let i = 0; i < tileSize; i++) {
        const u = THREE.MathUtils.clamp((i - inset) / (tileSize - inset * 2 - 1), 0, 1);
        const v = THREE.MathUtils.clamp((j - inset) / (tileSize - inset * 2 - 1), 0, 1);
        // Slow pigment changes, broken daubs and fine bristles run from base to rim.
        const bend = u + .18 * v * v + .070 * noise(u * 4, v * 5, tile);
        const daub = noise(bend * 10, v * 5, tile + 11);
        const stroke = noise(bend * 25, v * 9, tile + 32);
        const bristle = noise(bend * 56, v * 19, tile + 63);
        const load = .53 * daub + .30 * stroke + .17 * bristle;
        const ridge = .54 * stroke + .46 * bristle;
        const shade = THREE.MathUtils.clamp(.19 + .25 * v + .62 * load - (tile < 4 ? .095 : 0), 0, 1);
        let index = 0;
        while (index < pigments.length - 2 && shade > pigments[index + 1][0]) index++;
        const [lo, lowColor] = pigments[index], [hi, highColor] = pigments[index + 1];
        const mix = (shade - lo) / (hi - lo);
        const at = ((y0 + j) * width + x0 + i) * 4;

        let leaf = 0;
        if (foil) {
          const [x, y, rx, ry] = foil;
          const dx = (u - x) / rx, dy = (v - y - .023 * dx) / ry;
          const contour = 1 - dx * dx - dy * dy + .58 * (noise(u * 49, v * 45, tile + 79) - .5);
          const fragments = smoothstep(noise(u * 66 + 17, v * 68 - 5, tile), .30, .50);
          leaf = smoothstep(.08, .40, contour) * fragments;
        }
        const foilTone = [.61 + .39 * ridge, .54 + .35 * ridge, .37 + .27 * ridge];
        for (let c = 0; c < 3; c++) {
          blue[at + c] = lerp(lerp(lowColor[c], highColor[c], mix), 255 * foilTone[c], leaf * .97);
          neutral[at + c] = 202 + 53 * load;
        }
        blue[at + 3] = neutral[at + 3] = relief[at + 3] = 255;
        relief[at] = 255 * (.17 + .77 * ridge);
        relief[at + 1] = 255 * (.61 + .32 * (1 - load));
        relief[at + 2] = 0;
      }
    }
  }

  function texture(data, colorSpace) {
    const map = new THREE.DataTexture(data, width, height);
    map.colorSpace = colorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  }
  return {
    blue: texture(blue, THREE.SRGBColorSpace),
    neutral: texture(neutral, THREE.SRGBColorSpace),
    relief: texture(relief, THREE.NoColorSpace),
  };
}

function withPaintUV(source, segments) {
  const verticesPerRow = segments + 1;
  const verticesPerPetal = verticesPerRow ** 2;
  const count = source.attributes.position.count;
  const uv = new THREE.BufferAttribute(new Float32Array(count * 2), 2);
  const size = (tileSize - 2 * inset - 1) / tileSize;
  const margin = (inset + .5) / tileSize;
  for (let i = 0; i < count; i++) {
    const local = i % verticesPerPetal;
    const tile = Math.floor(i / verticesPerPetal) % (tilesX * tilesY);
    const u = (local % verticesPerRow) / segments;
    const v = Math.floor(local / verticesPerRow) / segments;
    uv.setXY(i, (tile % tilesX + margin + u * size) / tilesX,
      (Math.floor(tile / tilesX) + margin + v * size) / tilesY);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setAttribute("uv", uv);
  return geometry;
}

export function createOilPaintStudies({ open, garden, bluePetals, mutedPetals, inlay, segments, lifecycle, prototypes }) {
  const maps = atlas();
  const pigment = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, map: maps.blue, bumpMap: maps.relief, bumpScale: .006,
    roughnessMap: maps.relief, roughness: 1,
  });
  const muted = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, vertexColors: true, map: maps.neutral, bumpMap: maps.relief, bumpScale: .004,
    roughnessMap: maps.relief, roughness: 1,
  });
  const oldFoil = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide, color: 0xb09463, roughness: .77, metalness: .10,
  });
  pigment.userData.artSurface="midnight";
  muted.userData.artSurface="ivory";
  oldFoil.userData.artSurface="gold";
  const surfaces = new Map();
  for (const [geometries, material] of [[bluePetals, pigment], [mutedPetals, muted]]) {
    for (const geometry of geometries) surfaces.set(geometry, { geometry: withPaintUV(geometry, segments), material });
  }

  function painted(group) {
    const copy = group.clone();
    for (const mesh of copy.children) {
      const paint = surfaces.get(mesh.geometry);
      if (paint) {
        mesh.geometry = paint.geometry;
        mesh.material = paint.material;
      } else if (mesh.geometry === inlay) {
        mesh.material = oldFoil;
      }
    }
    return copy;
  }

  if (lifecycle) {
    for (const kind of ["r4", "r4Bud", "r4Ivory", "r4Wilt"]) {
      lifecycle[kind] = prototypes[kind].map(part => surfaces.get(part.geometry) ??
        (part.geometry === inlay ? { geometry: inlay, material: oldFoil } : part));
    }
    lifecycle.petalSegments = segments;
  }
  return [painted(open), painted(garden)];
}
