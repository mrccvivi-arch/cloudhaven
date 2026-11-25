import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { altarPillars, gardenBasin, platformPosts, platformRails, starStones } from "./construction-sites.js";
import { seeded, terrainHeight } from "./map.js";

const shared = new Set();
function reuse(resource) {
  shared.add(resource);
  return resource;
}

const box = reuse(new THREE.BoxGeometry());
const cobble = reuse(new THREE.IcosahedronGeometry(1, 0));
const rock = reuse(new THREE.DodecahedronGeometry(1));
const gem = reuse(new THREE.OctahedronGeometry(1));
const cylinder = reuse(new THREE.CylinderGeometry(1, 1, 1, 12));
const leaf = reuse(new THREE.SphereGeometry(1, 5, 3));
const up = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const TAU = Math.PI * 2;

function finish(color, properties = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: .86, flatShading: true, ...properties });
}

const colors = (values) => values.map((value) => reuse(finish(value)));
const slate = colors([0x5c6b70, 0x778485, 0x909994, 0xaab3a5]);
const limestone = colors([0x8e8772, 0xa49c82, 0xb0a789, 0xc1ba9d]);
const moss = colors([0x557151, 0x698452, 0x849950]);
const wood = colors([0x50382d, 0x714e38, 0x976b49, 0xab805c, 0xba906b]);
const tiles = [0x254d4a, 0x38615a, 0x416955, 0x4e7461, 0x34594e].map((color) =>
  reuse(finish(color, { side: THREE.DoubleSide })));
const brass = reuse(finish(0xa38b5d, { metalness: .22, roughness: .54 }));
const silver = reuse(finish(0xabbfc1, { metalness: .15, roughness: .62 }));
const teal = reuse(finish(0x5b9695, { roughness: .48 }));
const water = reuse(finish(0x588f81, { roughness: .38, metalness: .16 }));
const gardenLeaves = colors([0x3e7158, 0x587c52, 0x77935a, 0x9aa75f]);
const flowers = colors([0xf1d791, 0xf3e1be, 0xe7c46b, 0xcab8ce]);
const pathStone = reuse(finish(0x9a9b83, { side: THREE.DoubleSide }));
const starPath = reuse(finish(0x737f7d, { side: THREE.DoubleSide }));
const plantedSoil = reuse(finish(0x60644d, { side: THREE.DoubleSide }));

function piece(parent, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function beam(parent, geometry, material, from, to, width, depth = width) {
  direction.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = direction.length();
  const result = piece(parent, geometry, material, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2, width, length, depth);
  result.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
  return result;
}

function groundAt(site, preview, x, z) {
  return preview ? 0 : terrainHeight(site.x + x, site.z + z) - site.y;
}

function surface(vertices, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function ribbonGeometry(samples) {
  const vertices = samples.flat(2);
  const indices = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const j = i * 2;
    indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  }
  return surface(vertices, indices);
}

function ribbon(parent, material, samples) {
  piece(parent, ribbonGeometry(samples), material, 0, 0, 0);
}

function arch(parent, material, radius, width, start, end, y, z, ellipse = 1) {
  const shape = Array.from({ length: 33 }, (_, i) => {
    const angle = start + (end - start) * i / 32;
    return [radius - width, radius].map((r) => [
      Math.cos(angle) * r, y + Math.sin(angle) * r * ellipse, z,
    ]);
  });
  const doubleSided = material.clone();
  doubleSided.side = THREE.DoubleSide;
  ribbon(parent, doubleSided, shape);
}

function column(parent, material, x, y, z, radius, height, seed) {
  const random = seeded(seed);
  const vertices = [], indices = [], sides = 7;
  const profile = [[-.13, .92], [.18, 1], [.58, .79], [.91, .69], [1, .44]];
  const lobes = Array.from({ length: sides }, () => .88 + random() * .22);
  for (const [elevation, taper] of profile) {
    const shiftX = (random() - .5) * radius * .27;
    const shiftZ = (random() - .5) * radius * .23;
    for (let i = 0; i < sides; i++) {
      const angle = i * TAU / sides + seed;
      const r = radius * taper * lobes[i];
      vertices.push(Math.cos(angle) * r + shiftX, height * elevation + (random() - .5) * .12,
        Math.sin(angle) * r + shiftZ);
    }
  }
  for (let row = 0; row < profile.length - 1; row++) {
    for (let i = 0; i < sides; i++) {
      const a = row * sides + i, b = row * sides + (i + 1) % sides;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const last = (profile.length - 1) * sides;
  for (let i = 1; i < sides - 1; i++) indices.push(last, last + i + 1, last + i);
  return piece(parent, surface(vertices, indices), material, x, y, z);
}

function lantern(parent, glow, x, y, z, size) {
  piece(parent, cylinder, bronzeTrim, x, y - size * .62, z, size * .72, size * .17, size * .72);
  piece(parent, gem, glow, x, y, z, size * .49, size * .69, size * .49);
  piece(parent, cylinder, bronzeTrim, x, y + size * .62, z, size * .72, size * .17, size * .72);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
    piece(parent, box, bronzeTrim, x + dx * size * .52, y, z + dz * size * .52, .028, size * 1.18, .028);
  }
}

const bronzeTrim = reuse(finish(0x5d5142, { metalness: .28, roughness: .68 }));

function starlight(root, site, preview) {
  const glow = finish(0xbbd3cc, { emissive: 0xadd8ce, emissiveIntensity: 0 });
  const floor = (x, z) => groundAt(site, preview, x, z);
  // An elliptical stone circuit with open north and south approaches.
  ribbon(root, starPath, Array.from({ length: 81 }, (_, i) => {
    const angle = i * TAU / 80;
    return [[3.18, 2.57], [4.52, 3.72]].map(([rx, rz]) => {
      const x = Math.cos(angle) * rx, z = Math.sin(angle) * rz;
      return [x, floor(x, z) + .037, z];
    });
  }));
  const random = seeded(1207);
  for (const [i, point] of starStones(site).entries()) {
    const x = point.x - site.x, z = point.z - site.z, y = floor(x, z);
    column(root, slate[i % 3], x, y, z, point.radius, point.height, i + 3);
    piece(root, rock, slate[(i + 1) % 3], x * 1.04, y + .02, z * 1.04, .45, .31, .39);
    piece(root, cobble, moss[i % moss.length], x * .96, y + .18, z * .96, .42, .21, .31);
    const angle = Math.atan2(-x, -z);
    const insetX = x + Math.sin(angle) * point.radius * .76;
    const insetZ = z + Math.cos(angle) * point.radius * .76;
    const medallion = piece(root, gem, glow, insetX, y + point.height * .53, insetZ, .15, .29, .065);
    medallion.rotation.y = angle;
  }
  for (let i = 0; i < 34; i++) {
    const a = i * TAU / 34, x = Math.cos(a) * 3.64, z = Math.sin(a) * 2.94;
    piece(root, box, brass, x, floor(x, z) + .062, z, .13, .028, i % 4 === 0 ? .39 : .20).rotation.y = -a + Math.PI / 2;
  }
  piece(root, cylinder, slate[0], 0, .02, 0, 1.27, .37, 1.27);
  piece(root, cylinder, slate[2], 0, .24, 0, 1.16, .18, 1.16);
  piece(root, cylinder, teal, 0, .343, 0, .84, .05, .84);
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8;
    const x = Math.cos(a) * .93, z = Math.sin(a) * .93;
    piece(root, box, brass, x, .354, z, .13, .03, .35).rotation.y = -a + Math.PI / 2;
  }
  piece(root, gem, glow, -.10, 1.48, .06, .63, 1.22, .57).rotation.z = -.19;
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5;
    const shard = piece(root, gem, i % 2 ? teal : glow, Math.cos(a) * .62, .56 + random() * .19,
      Math.sin(a) * .62, .18, .39 + random() * .28, .17);
    shard.rotation.set(Math.sin(a) * .34, a, -Math.cos(a) * .26);
  }
  return (night) => { glow.emissiveIntensity = .27 * night; };
}

function roofProfile(x, z) {
  const across = Math.abs(x) / 5.03;
  return 4 + 1.73 * (1 - across ** .72) + .24 * (Math.abs(z + 1.8) / 3.17) ** 2 + .15 * across ** 5;
}

function woodenPlatform(root, site, preview) {
  const deck = site.decks.at(-1);
  const y = deck.y - site.y;
  const floor = (x, z) => groundAt(site, preview, x, z);
  const glow = finish(0xffdfa3, { emissive: 0xffc37a, emissiveIntensity: 0 });
  const edgeX = deck.w / 2, edgeZ = deck.d / 2;
  for (const z of [-4.58, 4.58]) {
    for (const x of [-6.35, -3.18, 0, 3.18, 6.35]) {
      const baseY = floor(x, z);
      piece(root, rock, slate[1], x, baseY + .02, z, .59, .40, .60);
      piece(root, box, wood[1], x, (y + baseY) / 2 - .1, z, .43, y - baseY, .46);
      beam(root, box, wood[0], [x, y - .92, z], [x + (x < 0 ? .77 : -.77), y - .22, z], .21);
    }
    piece(root, box, wood[0], 0, y - .30, z, deck.w + .12, .31, .33);
  }
  for (const x of [-edgeX + .13, edgeX - .13]) {
    piece(root, box, wood[1], x, y - .26, 0, .22, .40, deck.d + .16);
  }
  piece(root, box, wood[1], 0, y - .21, 0, deck.w - .04, .09, deck.d - .04);
  for (let i = 0; i < 34; i++) {
    const z = (i + .5) * deck.d / 34 - edgeZ;
    const joint = 1.1 * Math.sin(i * 1.45);
    for (const [a, b] of [[-edgeX, joint - .01], [joint + .01, edgeX]]) {
      piece(root, box, wood[2 + i % 3], (a + b) / 2, y - .093, z, b - a, .186, deck.d / 34 - .014);
    }
  }
  for (const [i, step] of site.decks.slice(0, -1).entries()) {
    const z = step.z - site.z, top = step.y - site.y;
    const bottom = Math.min(floor(-1.9, z), floor(0, z), floor(1.9, z)) - .13;
    piece(root, box, limestone[i % 3], 0, (top + bottom) / 2 - .04, z, step.w - .16, top - bottom - .08, step.d);
    piece(root, box, limestone[2], 0, top - .048, z, step.w, .096, step.d - .01);
  }
  for (const rail of platformRails(site)) {
    const x = rail.x - site.x, z = rail.z - site.z, wide = rail.w > rail.d;
    const length = wide ? rail.w : rail.d;
    const count = Math.ceil(length / 1.78);
    for (let i = 0; i <= count; i++) {
      const offset = length * (i / count - .5);
      const px = x + (wide ? offset : 0), pz = z + (wide ? 0 : offset);
      piece(root, box, wood[1], px, y + .46, pz, .19, .96, .19);
      if (i === count) continue;
      const next = offset + length / count;
      const end = x + (wide ? next : 0), endZ = z + (wide ? 0 : next);
      beam(root, box, wood[2], [px, y + .26, pz], [end, y + .66, endZ], .08);
    }
    for (const height of [.26, .91]) {
      piece(root, box, height > .8 ? wood[3] : wood[1], x, y + height, z, rail.w, .15, rail.d);
    }
  }
  for (const [i, post] of platformPosts(site).entries()) {
    const x = post.x - site.x, z = post.z - site.z;
    piece(root, cylinder, slate[1], x, y + .17, z, .34, .34, .34);
    const height = roofProfile(x, z) - .08;
    piece(root, box, wood[1], x, y + height / 2, z, .38, height, .40);
    beam(root, box, wood[2], [x, y + height - .75, z], [x - Math.sign(x) * .85, y + height, z], .16);
    beam(root, box, wood[0], [x, y + height - .83, z], [x, y + height, z + (i % 2 ? -.82 : .82)], .16);
    if (i % 2) {
      const lampX = x - Math.sign(x) * .68;
      beam(root, box, wood[0], [x, y + 3.41, z], [lampX, y + 3.41, z], .106);
      beam(root, box, bronzeTrim, [lampX, y + 3.41, z], [lampX, y + 2.96, z], .036);
      lantern(root, glow, lampX, y + 2.77, z, .26);
    }
  }
  for (const side of [-1, 1]) {
    const x = side * (site.decks[0].w / 2 + .24), z = edgeZ - .23;
    piece(root, box, wood[0], x, y + .45, z, .24, .90, .24);
    lantern(root, glow, x, y + 1.07, z, .17);
  }
  // Merge the roof courses per finish, retaining the seams in five draw calls.
  const courses = tiles.map(() => []);
  for (const side of [-1, 1]) {
    for (let course = 0; course < 9; course++) {
      const edge = 5.03 * course / 9;
      const start = side * edge;
      const edgeEnd = side * 5.03 * (course + 1) / 9;
      const end = edgeEnd - side * .013;
      courses[0].push(ribbonGeometry(Array.from({ length: 25 }, (_, j) => {
        const z = -4.98 + j * .265;
        return [[start, y + roofProfile(start, z) - .077, z], [edgeEnd, y + roofProfile(edgeEnd, z) - .077, z]];
      })));
      for (let tile = 0; tile < 12; tile++) {
        const z0 = -4.98 + tile * .53;
        const z1 = z0 + .516;
        const mid = (z0 + z1) / 2;
        courses[(course * 3 + tile * 2) % tiles.length].push(ribbonGeometry([z0, mid, z1].map((z) => [
          [start, y + roofProfile(start, z), z], [end, y + roofProfile(end, z), z],
        ])));
      }
    }
    for (const z of [-4.96, 1.31]) {
      for (let section = 0; section < 7; section++) {
        const a = side * 5.03 * section / 7, b = side * 5.03 * (section + 1) / 7;
        beam(root, box, wood[2], [a, y + roofProfile(a, z), z], [b, y + roofProfile(b, z), z], .20);
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = -4.96 + i * .627, x = side * 5.05;
      beam(root, box, wood[0], [x, y + roofProfile(x, a), a],
        [x, y + roofProfile(x, a + .637), a + .637], .21);
      piece(root, box, wood[2], side * 4.86, y + roofProfile(x, a) - .13, a, .37, .19, .12);
    }
  }
  for (const [i, geometries] of courses.entries()) {
    piece(root, mergeGeometries(geometries), tiles[i], 0, 0, 0);
    for (const geometry of geometries) geometry.dispose();
  }
  for (let i = 0; i < 10; i++) {
    const z = -4.96 + i * .627;
    beam(root, box, wood[0], [0, y + roofProfile(0, z), z],
      [0, y + roofProfile(0, z + .637), z + .637], .24);
  }
  for (const z of [-5.07, 1.41]) {
    piece(root, gem, brass, 0, y + roofProfile(0, z) + .04, z, .16, .21, .14);
  }
  return (night) => { glow.emissiveIntensity = night * .52; };
}

function garden(root, site, preview) {
  const random = seeded(316);
  const floor = (x, z) => groundAt(site, preview, x, z);
  const glow = finish(0xffde99, { emissive: 0xffc477, emissiveIntensity: 0 });
  function pathCenter(z) { return .47 * Math.sin(z * .98); }
  ribbon(root, pathStone, Array.from({ length: 35 }, (_, i) => {
    const z = -4.35 + i * 8.7 / 34;
    const w = .91 * Math.sqrt(Math.max(.055, 1 - (z / 4.56) ** 2));
    return [-w, w].map((offset) => {
      const x = pathCenter(z) + offset;
      return [x, floor(x, z) + .042, z];
    });
  }));
  const beds = [[-1, -1.0, .82, 2.74], [1, -.80, 1.3, 2.71], [-1, 2.45, .62, 1.03]];
  for (const [side, center, width, length] of beds) {
    function bedPoint(angle, radius = 1) {
      const z = center + Math.sin(angle) * length * radius;
      const x = side * (2.36 + Math.cos(angle) * width * radius - .26 * Math.sin(angle)) + pathCenter(z) * .43;
      return [x, z];
    }
    ribbon(root, plantedSoil, Array.from({ length: 21 }, (_, i) => {
      const t = i * TAU / 20;
      return [bedPoint(t, .04), bedPoint(t)].map(([x, z]) => [x, floor(x, z) + .083, z]);
    }));
    for (let i = 0; i < 20; i++) {
      const a = (i + random() * .34) * TAU / 20;
      const [x, z] = bedPoint(a);
      if (Math.hypot(x, z) > 4.29) continue;
      const y = floor(x, z);
      piece(root, rock, limestone[i % 4], x, y + .04, z,
        .24 + random() * .15, .17 + random() * .09, .18 + random() * .12).rotation.y = a;
    }
    for (let i = 0; i < 34; i++) {
      const theta = random() * TAU;
      const [x, z] = bedPoint(theta, Math.sqrt(random()) * .80);
      if (Math.hypot(x, z) > 4.04) continue;
      const y = floor(x, z) + .06;
      const size = .58 + random() * .67;
      if (i % 3 === 0) {
        for (let j = 0; j < 5; j++) {
          const angle = theta + j * TAU / 5;
          const dx = Math.cos(angle), dz = Math.sin(angle);
          const frond = piece(root, leaf, gardenLeaves[(i + j) % gardenLeaves.length],
            x + dx * .18 * size, y + (.21 + j * .038) * size, z + dz * .18 * size,
            .084 * size, .37 * size, .055 * size);
          frond.quaternion.setFromUnitVectors(up, direction.set(dx * .82, .60, dz * .82).normalize());
        }
      } else {
        const height = (.28 + random() * .25) * size;
        beam(root, box, gardenLeaves[i % 3], [x, y, z], [x, y + height, z], .022);
        for (let j = 0; j < 5; j++) {
          const angle = j * TAU / 5 + theta;
          piece(root, leaf, flowers[i % flowers.length], x + Math.cos(angle) * .10 * size,
            y + height, z + Math.sin(angle) * .10 * size, .10 * size, .052 * size, .075 * size).rotation.y = angle;
        }
        piece(root, cobble, brass, x, y + height + .029, z, .058 * size, .041 * size, .058 * size);
      }
    }
  }
  const basin = gardenBasin(site);
  const x = basin.x - site.x, z = basin.z - site.z, y = floor(x, z);
  piece(root, cylinder, limestone[0], x, y + .08, z, .54, .24, .54);
  piece(root, cylinder, limestone[1], x, y + .29, z, .35, .25, .35);
  piece(root, cylinder, limestone[3], x, y + .49, z, .69, .25, .69);
  piece(root, cylinder, water, x, y + .622, z, .56, .023, .56);
  const rim = new THREE.TorusGeometry(.605, .059, 5, 24);
  piece(root, rim, limestone[3], x, y + .652, z).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4, r = .08 + i * .043;
    piece(root, leaf, flowers[i % 3], x + r * Math.cos(a), y + .646, z + r * Math.sin(a), .10, .012, .061).rotation.y = a;
  }
  for (const [lx, lz] of [[1.57, 2.62], [-1.52, -3.15], [2.82, -.73]]) {
    const h = floor(lx, lz);
    piece(root, rock, limestone[0], lx, h + .14, lz, .22, .24, .21);
    lantern(root, glow, lx, h + .46, lz, .153);
  }
  return (night) => { glow.emissiveIntensity = night * .36; };
}

function moonAltar(root, site, preview) {
  const floor = (x, z) => groundAt(site, preview, x, z);
  const glow = finish(0xd4e0de, { emissive: 0xb4d2d7, emissiveIntensity: 0 });
  const lamp = finish(0xe0cfaa, { emissive: 0xffcf8e, emissiveIntensity: 0 });
  ribbon(root, pathStone, Array.from({ length: 57 }, (_, i) => {
    const a = i * TAU / 56;
    return [1.34, 3.76].map((r) => {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      return [x, floor(x, z) + .036, z];
    });
  }));
  for (let i = 0; i < 25; i++) {
    const a = i * TAU / 25;
    const x = 3.53 * Math.cos(a), z = 3.53 * Math.sin(a);
    piece(root, rock, slate[(i + 1) % 4], x, floor(x, z) + .035, z,
      .40, i % 4 === 0 ? .23 : .14, .26).rotation.y = -a + Math.PI / 2;
  }
  for (const [i, pillar] of altarPillars(site).entries()) {
    const x = pillar.x - site.x, z = pillar.z - site.z, y = floor(x, z);
    piece(root, cylinder, slate[0], x, y + .025, z, .75, .29, .75);
    column(root, slate[i], x, y, z, pillar.radius, pillar.height, i + 23);
    const inset = piece(root, gem, glow, x, y + pillar.height * .68, z + .48, .18, .50, .10);
    inset.rotation.z = i ? .08 : -.13;
    piece(root, cobble, moss[i + 1], x * 1.10, y + .19, z + .31, .35, .21, .37);
  }
  // Two offset orbital ribs cradle the crescent above the offering stone.
  arch(root, brass, 3.21, .105, .17, 2.88, 1.2, -2.22, .88);
  arch(root, silver, 2.83, .081, .29, 2.34, 1.30, -2.08);
  const shape = new THREE.Shape();
  shape.moveTo(.43, 1.51);
  shape.bezierCurveTo(-.94, 1.70, -1.65, .49, -1.39, -.51);
  shape.bezierCurveTo(-1.15, -1.60, .46, -1.79, 1.22, -.73);
  shape.bezierCurveTo(-.02, -1.19, -.91, .19, .43, 1.51);
  const moon = new THREE.ExtrudeGeometry(shape, {
    depth: .17, curveSegments: 12, bevelSegments: 2, bevelSize: .064, bevelThickness: .058,
  });
  piece(root, moon, glow, .28, 2.88, -1.82).rotation.z = -.14;
  piece(root, cylinder, slate[1], 0, .12, -.55, 1.47, .54, 1.25);
  piece(root, cylinder, slate[3], 0, .43, -.55, 1.33, .17, 1.12);
  piece(root, cylinder, bronzeTrim, 0, .55, -.55, .94, .075, .94);
  piece(root, rock, teal, 0, .65, -.55, .67, .20, .60);
  for (const side of [-1, 1]) {
    const x = side * 2.4, z = 1.47;
    const y = floor(x, z);
    piece(root, rock, slate[1], x, y + .16, z, .25, .29, .24);
    lantern(root, lamp, x, y + .53, z, .177);
  }
  return (night) => {
    glow.emissiveIntensity = night * .31;
    lamp.emissiveIntensity = night * .40;
  };
}

const builders = {
  "starlight-circle": starlight,
  "forest-platform": woodenPlatform,
  "golden-garden": garden,
  "moon-altar": moonAltar,
};

export function buildFacility(parent, site, preview = false) {
  return builders[site.id](parent, site, preview);
}

export function disposeFacilityPreview(model) {
  const disposable = new Set();
  model.traverse((object) => {
    if (!object.isMesh) return;
    if (!shared.has(object.geometry)) disposable.add(object.geometry);
    if (!shared.has(object.material)) disposable.add(object.material);
    if (object.isInstancedMesh) disposable.add(object);
  });
  for (const resource of disposable) resource.dispose();
}
