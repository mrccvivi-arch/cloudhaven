import * as THREE from "three";
import { cloudTexture } from "./atmosphere.js";
import { seeded, terrainHeight } from "./map.js";
import { part } from "./models.js";
import { createGateTrigger } from "./sky-gate.js";
import { beam, surface, trail } from "./summer-geometry.js";
import { createLighthouse } from "./summer-lighthouse.js";
import { createSummerSea } from "./summer-sea.js";
import { createSummerClouds } from "./summer-clouds.js";
import { addMeadowFlowers } from "./summer-flowers.js";
import { CAPE_ROCKS, COAST_TREES, FOREST_BRIDGE, ISLAND_BRIDGE, PIER, PIER_PATH, POND, RAINBOW_WIDTH, SUMMER, SUMMER_PATH,
  SWING, TOWER, bridgeCenter, capeWeight, coastDistance, coastPoint, inlandCoastDistance, inlandCoastPoint, islandHeight, islandNodeHeight,
  pierHeight, pierPoint, pierWidth, pondDistance, rainbowHeight } from "./summer-layout.js";

const TAU = 2 * Math.PI;
const ROCK = [0xbab7a8, 0xc9c5b8, 0xa9b2ae];
const WOOD = 0x976749;
const SAND = 0xf3e8cb;
const TRAIL = 0xe9dfbd;
const TRAILS = [
  { path: SUMMER_PATH, width: 2.65 },
  { path: PIER_PATH, width: 1.63 },
  { path: [[-3, 3], [-9, 1], [-13, 3], [-17, 5], [-20, 6]], width: 1.34 },
];
const PASTEL = [0xefacad, 0xf5cda6, 0xffe7ad, 0xc2dfa4, 0xa4dbd6, 0xafd2ee, 0xc9b5e6];
const LEAF_GEOMETRY = new THREE.IcosahedronGeometry(1, 1);
const LEAVES = [0x488c49, 0x57a653, 0x65aa59, 0x77b75c, 0x8ac66a]
  .map((color) => new THREE.MeshLambertMaterial({ color }));
const VERGE_PATCHES = [[-28, 11, 3.9], [-21, 13, 3], [-17, 24, 4.2], [-10, 27, 2.5],
  [-8, 18, 2.4], [-14, -4, 3.7], [-25, -9, 3.3], [3, -9, 2.1], [10, -13, 3.2],
  [21, -13, 3.4], [26, -4, 3.5], [29, 5, 3.1], [16, 16, 2.8], [29, 16, 3.1]];

function bridgeSparkles(parent, point, bridge) {
  const random = seeded(930 + bridge.direction);
  const motes = Array.from({ length: 22 }, () => ({
    t: .08 + random() * .86,
    u: (.04 + random() * .35) * (random() < .5 ? 1 : -1) + .5,
    lift: .10 + random() * .59, phase: random() * TAU,
  }));
  const pixels = new Uint8Array(24 * 24 * 4).fill(255);
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const r = Math.hypot(x - 11.5, y - 11.5) / 11.5;
      pixels[4 * (y * 24 + x) + 3] = Math.round(255 * Math.max(0, 1 - r) ** 1.7);
    }
  }
  const texture = new THREE.DataTexture(pixels, 24, 24);
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const positions = new THREE.BufferAttribute(new Float32Array(motes.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positions);
  const material = new THREE.PointsMaterial({
    color: 0xfff8ef, map: texture, size: .23, transparent: true, depthWrite: false, toneMapped: false,
  });
  const sparks = new THREE.Points(geometry, material);
  sparks.renderOrder = 3;
  parent.add(sparks);
  function update(time, night) {
    motes.forEach(({ t, u, lift, phase }, i) => {
      const [x, y, z] = point(t + .024 * Math.sin(time * .53 + phase), u);
      positions.setXYZ(i, x + .17 * Math.cos(time * .68 + phase), y + lift + .08 * Math.sin(time * .65 + phase), z);
    });
    positions.needsUpdate = true;
    material.opacity = .65 + .29 * night;
  }
  update(0, 0);
  return update;
}

export function createRainbowGateTrigger() {
  const openings = Object.fromEntries([FOREST_BRIDGE, ISLAND_BRIDGE].map((bridge) => {
    const height = bridge.layer === SUMMER ? islandHeight : terrainHeight;
    return [bridge.layer, { x: bridgeCenter(bridge, bridge.gate), z: bridge.gate, halfWidth: RAINBOW_WIDTH / 2,
      halfDepth: .23, y: rainbowHeight(bridge, bridge.gate, height(bridge.x, bridge.start)), height: 4.6 }];
  }));
  return createGateTrigger(openings, undefined, 1500);
}

function addRainbowBridge(parent, bridge, height) {
  const base = height(bridge.x, bridge.start);
  const colors = PASTEL.map((hex) => new THREE.Color(hex));
  const white = new THREE.Color(0xf5ecff);
  const point = (t, u) => {
    const z = THREE.MathUtils.lerp(bridge.start, bridge.end, t);
    return [bridgeCenter(bridge, z) + (u - .5) * RAINBOW_WIDTH,
      rainbowHeight(bridge, z, base) + .045, z];
  };
  const finish = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    toneMapped: false, forceSinglePass: true,
  });
  const rows = 44, columns = 63;
  const rail = surface(parent, rows, columns, (t, u) => point(t, u * 1.11 - .055), finish);
  const rgba = [];
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    for (let col = 0; col <= columns; col++) {
      const across = col / columns * 1.11 - .055;
      const edge = Math.abs(across - .5) * 2;
      const band = Math.max(0, Math.min(6, Math.floor(across * 7)));
      const halo = THREE.MathUtils.smoothstep(edge, .88, 1.007);
      const alpha = 1 - THREE.MathUtils.smoothstep(edge, .991, 1.109);
      const sheen = .045 + .12 * (1 - Math.abs(2 * t - 1));
      const color = colors[band].clone().lerp(white, sheen + .46 * halo);
      rgba.push(color.r, color.g, color.b, alpha);
    }
  }
  rail.geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgba, 4));
  rail.renderOrder = 2;
  const updateSparkles = bridgeSparkles(parent, point, bridge);
  const texture = cloudTexture(286, true);
  for (let i = 0; i < 4; i++) {
    const offset = i < 2 ? -1 : 1;
    const mist = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, color: 0xf1f4ff, transparent: true, depthWrite: false, opacity: i % 2 ? .78 : .9, toneMapped: false,
    }));
    const island = bridge.layer === SUMMER;
    const drift = island ? 10.1 + i % 2 * 3.4 : -(i % 2) * 2.4;
    mist.position.set(bridge.x + offset * ((island ? 5.1 : 3.1) + i % 2),
      base + bridge.rise - .6 + i % 2 * .58, bridge.end + bridge.direction * drift);
    mist.scale.set(9 + i * .75, 3.1 + i * .48, 1);
    mist.renderOrder = 4;
    parent.add(mist);
  }
  function update(time, night) {
    finish.opacity = .83 + .12 * night;
    finish.color.setRGB(.96 + .08 * night, .96 + .08 * night, .99 + .12 * night);
    updateSparkles(time, night);
  }
  update(0, 0);
  return update;
}

export function createForestRainbow(parent) {
  const bridge = FOREST_BRIDGE;
  trail(parent, [[34, -48.5], [38.5, -51.5], [45, -54], [48, -58], [48, -63]], 2.15, terrainHeight, 0xcbb993);
  return addRainbowBridge(parent, bridge, terrainHeight);
}

function ground(parent) {
  const geometry = new THREE.PlaneGeometry(101, 111, 101, 111).rotateX(-Math.PI / 2).translate(.5, 0, 5.5);
  const points = geometry.attributes.position;
  const colors = new Float32Array(points.count * 3);
  const grass = new THREE.Color(0x96c86c);
  const sunlit = new THREE.Color(0xaed780);
  const grassShade = new THREE.Color(0x79a85a);
  const sand = new THREE.Color(SAND);
  const damp = new THREE.Color(0xe1d5ba);
  const stone = new THREE.Color(0xb8bab3);
  const seam = new THREE.Color(0x929c9b);
  const color = new THREE.Color();

  for (let i = 0; i < points.count; i++) {
    const x = Math.round(points.getX(i)), z = Math.round(points.getZ(i));
    const y = islandNodeHeight(x, z);
    points.setXYZ(i, x, y, z);
    const coast = inlandCoastDistance(x, z);
    const mottling = .47 + .22 * Math.sin(x * .19 + z * .21) + .20 * Math.cos(x * .52 - z * .27);
    color.copy(grassShade).lerp(grass, .54 + .46 * mottling).lerp(sunlit, mottling ** 1.3);
    const sandLine = THREE.MathUtils.smoothstep(coast + .019 * (mottling - .5), .83, .947);
    color.lerp(sand, sandLine);
    color.lerp(damp, THREE.MathUtils.smoothstep(coastDistance(x, z), .985, 1.09));
    const face = capeWeight(x, z) * THREE.MathUtils.smoothstep(coast, .855, .925) *
      (1 - THREE.MathUtils.smoothstep(coast, .971, 1.00));
    const layers = .33 + .27 * Math.sin(y * 2.2 + x * .34 + z * .29);
    color.lerp(stone, face).lerp(seam, face * layers);
    const pond = pondDistance(x, z);
    color.lerp(damp, (1 - THREE.MathUtils.smoothstep(pond, .83, 1.09)) * .72);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  parent.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
}

function pond(parent, random) {
  const pondMaterial = new THREE.MeshBasicMaterial({ color: 0x76bdb9, side: THREE.DoubleSide });
  surface(parent, 68, 2, (t, u) => {
    const angle = t * TAU;
    const r = u * (1 + .13 * Math.sin(angle * 3 + .6));
    return [POND.x + Math.cos(angle) * POND.rx * r, POND.y, POND.z + Math.sin(angle) * POND.rz * r];
  }, pondMaterial);
  for (let i = 0; i < 14; i++) {
    const angle = random() * TAU;
    const x = POND.x + Math.cos(angle) * POND.rx * .72;
    const z = POND.z + Math.sin(angle) * POND.rz * .72;
    part(parent, "ball", i % 4 ? 0x7aa372 : 0xb3b98b, x, POND.y + .025, z, .31, .044, .24);
    if (i % 4 === 0) part(parent, "rock", 0xf4e2df, x, POND.y + .16, z, .12, .15, .13);
  }
  const light = new THREE.Color(0x76bdb9), dark = new THREE.Color(0x476c87);
  return (night) => pondMaterial.color.copy(light).lerp(dark, night);
}

function swing(parent) {
  const { x, z, yaw } = SWING;
  const y = islandHeight(x, z);
  const p = (across, height, depth) => [x + Math.cos(yaw) * across + Math.sin(yaw) * depth, height,
    z - Math.sin(yaw) * across + Math.cos(yaw) * depth];
  for (const side of [-1, 1]) {
    for (const foot of [-1, 1]) {
      const [fx, , fz] = p(side * 2.28, 0, foot * 1.24);
      beam(parent, "log", WOOD, [fx, islandHeight(fx, fz) - .12, fz], p(side * 1.99, y + 4.02, 0), .22);
    }
    beam(parent, "log", 0xab7953, p(side * 2.13, y + 1.92, -.69), p(side * 2.13, y + 1.92, .69), .12);
    beam(parent, "log", 0xc7aa7f, p(side * .93, y + 3.94, 0), p(side * .93, y + 1.13, .09), .054);
    part(parent, "ring", 0x74685e, ...p(side * .93, y + 3.98, 0), .15, .19, .15);
  }
  beam(parent, "log", WOOD, p(-2.34, y + 4.05, 0), p(2.34, y + 4.05, 0), .24);
  const seat = part(parent, "box", 0xc69968, ...p(0, y + 1.08, .09), 2.30, .16, .78);
  seat.rotation.y = yaw;
}

function pier(parent) {
  const yaws = PIER.yaw;
  const planks = [0xc89465, 0xd0a475, 0xc19773, 0xb8875f];
  for (let i = 0; i < 60; i++) {
    const along = .25 + i * .5;
    const y = pierHeight(along);
    const { x, z } = pierPoint(0, along);
    const plank = part(parent, "box", planks[i % planks.length], x, y - .11, z, pierWidth(along), .22, .496);
    plank.rotation.y = yaws;
  }
  for (let along = 3; along <= 29; along += 2.9) {
    const y = pierHeight(along);
    for (const side of [-1, 1]) {
      const { x, z } = pierPoint(side * (pierWidth(along) / 2 - .19), along);
      part(parent, "log", WOOD, x, (y - 1.12) / 2, z, .20, y + 1.54, .20);
      part(parent, "log", 0xe1b786, x, y + .30, z, .22, .11, .22);
    }
  }
  const { x, z } = pierPoint(2.65, PIER.length - 1);
  part(parent, "log", 0x835f48, x, PIER.y + 1.34, z, .105, 2.79, .105);
  part(parent, "box", 0xffdfaa, x, PIER.y + 2.37, z, .33, .41, .33);
  part(parent, "cone", 0x87664e, x, PIER.y + 2.65, z, .27, .22, .27);
}

function boat(parent) {
  const group = new THREE.Group();
  const material = new THREE.MeshLambertMaterial({ color: 0xa4724e, side: THREE.DoubleSide });
  const inside = new THREE.MeshLambertMaterial({ color: 0xe0b284, side: THREE.DoubleSide });
  const outline = (t) => {
    const a = t * TAU;
    const bow = Math.abs(Math.cos(a));
    return [Math.sin(a) * (1 - .44 * bow ** 1.6) * 1.72, .66 + .43 * bow ** 4, Math.cos(a) * 3.23];
  };
  const hull = (t, u, interior) => {
    const [x, lip, z] = outline(t);
    const width = interior ? THREE.MathUtils.lerp(.936, .40, u) : 1 - u * .86;
    const length = interior ? THREE.MathUtils.lerp(.97, .65, u) : 1 - u * .48;
    const y = interior ? THREE.MathUtils.lerp(lip + .045, .075, u) : THREE.MathUtils.lerp(lip, -.23, u);
    return [x * width, y, z * length];
  };
  surface(group, 36, 7, (t, u) => hull(t, u, false), material);
  surface(group, 36, 6, (t, u) => hull(t, u, true), inside);
  surface(group, 36, 1, (t, u) => {
    const [x, , z] = hull(t, 1, true);
    return [x * u, .075, z * u];
  }, material);
  surface(group, 36, 1, (t, u) => {
    const [x, y, z] = outline(t);
    return [x * (1 - u * .064), y + .045 * u, z * (1 - u * .03)];
  }, inside);
  for (const [z, width] of [[-1.10, 1.94], [.48, 2.27], [1.62, 1.55]]) {
    part(group, "box", 0xc9986a, 0, .47, z, width, .14, .43);
  }
  // Position the boat before batching so its fittings keep their world transforms.
  const boatPosition = pierPoint(5.5, PIER.length - 5.5);
  group.position.set(boatPosition.x, -.035, boatPosition.z);
  group.rotation.y = PIER.yaw + .13;
  parent.add(group);
}

function coastTree(parent, { x, z, size: s }, i) {
  const y = islandHeight(x, z);
  const random = seeded(1731 + i * 97);
  const height = (2.9 + random() * .76) * s;
  const wood = i % 2 ? 0x987453 : 0x816246;
  const lean = .18 + random() * .40;
  beam(parent, "log", wood, [x, y - .14, z], [x + lean * s, y + height, z + .13 * s], .43 * s);
  function canopy(dx, dy, dz, width, crownHeight, color, angle) {
    const lobe = new THREE.Mesh(LEAF_GEOMETRY, LEAVES[color]);
    lobe.position.set(x + dx, y + dy, z + dz);
    lobe.scale.set(width, crownHeight, width * (.81 + .24 * random()));
    lobe.rotation.y = angle;
    parent.add(lobe);
  }
  const spread = (.98 + .37 * random()) * s;
  for (let k = 0; k < 5; k++) {
    const a = k * TAU / 5 + i * .82 + random() * .46;
    const dx = Math.cos(a) * spread, dz = Math.sin(a) * spread;
    const top = height * (.94 + random() * .29);
    beam(parent, "log", wood, [x, y + height * .51, z], [x + dx, y + top, z + dz], .14 * s);
    canopy(dx, top, dz, (1.02 + random() * .54) * s, (1.0 + random() * .38) * s, (i + k) % 4, a);
  }
  canopy(lean * s, height + .96 * s, .12 * s, 1.60 * s, (1.39 + .20 * random()) * s, 3 + i % 2, i);
  canopy(-.58 * s, height + .67 * s, -.70 * s, 1.28 * s, 1.12 * s, 3, .8 * i);
}

function treeShade(parent) {
  const positions = [], alpha = [], indices = [];
  const sides = 16;
  for (const { x, z, size } of COAST_TREES) {
    const cx = x + .68 * size, cz = z + .55 * size;
    const start = positions.length / 3;
    function vertex(px, pz, density) {
      positions.push(px, islandHeight(px, pz) + .032, pz);
      alpha.push(.16, .22, .14, density);
    }
    vertex(cx, cz, .27);
    for (let ring = 1; ring <= 2; ring++) {
      for (let i = 0; i < sides; i++) {
        const angle = TAU * i / sides;
        vertex(cx + Math.cos(angle) * 1.38 * size * ring, cz + Math.sin(angle) * 1.12 * size * ring,
          ring === 1 ? .105 : 0);
      }
    }
    for (let i = 0; i < sides; i++) {
      const a = start + 1 + i, b = start + 1 + (i + 1) % sides;
      indices.push(start, a, b, a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(alpha, 4));
  geometry.setIndex(indices);
  parent.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false,
  })));
}

function starfish(parent) {
  const rim = Array.from({ length: 20 }, (_, i) => {
    const angle = i * TAU / 20;
    const radius = [.36, .55, 1, .55][i % 4];
    return [Math.cos(angle) * radius, i % 4 === 2 ? .04 : .10, Math.sin(angle) * radius];
  });
  const vertices = rim.flatMap((point, i) => [0, .26, 0, ...rim[(i + 1) % rim.length], ...point]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const positions = [[.56, .938, .41], [.66, .963, .48], [.72, .935, .37], [1.38, .958, .43],
    [1.86, .944, .46], [1.98, .954, .54], [2.01, .931, .39], [2.15, .921, .43]];
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), positions.length);
  mesh.userData.ignoreTouchOcclusion = true;
  const colors = [0xf3b98f, 0xedaea5, 0xf3d9af];
  const pose = new THREE.Object3D(), color = new THREE.Color();
  positions.forEach(([angle, offset, size], i) => {
    const [x, z] = coastPoint(angle, offset);
    pose.position.set(x, islandHeight(x, z) + .024, z);
    pose.rotation.y = i * 1.34;
    pose.scale.setScalar(size);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, color.setHex(colors[i % colors.length]));
  });
  parent.add(mesh);
}

function details(parent, random) {
  COAST_TREES.forEach((tree, i) => coastTree(parent, tree, i));
  const limestone = [0xb7b6b2, 0xc7c0b3, 0xb6bfbe];
  CAPE_ROCKS.forEach(({ x, y, z, w, h, d, yaw }, i) => {
    const rock = part(parent, "rock", limestone[i % limestone.length], x, y, z, w, h, d);
    rock.rotation.set(.075 * Math.sin(i * 1.3), yaw, .105 * Math.cos(i * 1.4));
  });
  for (const [angle, range, count, scale] of [[.33, .20, 7, .64], [1.04, .12, 6, .64], [1.91, .11, 5, .76],
    [2.21, .14, 9, .92], [2.88, .21, 11, .83], [3.71, .25, 13, 1.06], [5.66, .49, 25, 1.75]]) {
    for (let i = 0; i < count; i++) {
      const a = angle + (random() - .5) * range * 2;
      const [x, z] = inlandCoastPoint(a, .88 + random() * .22);
      if (Math.abs(x - ISLAND_BRIDGE.x) < 4.2 && z > 32) continue;
      const size = (.24 + .99 * random() ** 2) * scale;
      const height = size * (.56 + random() * .44), yaw = random() * TAU;
      if (a > .69 && a < 2.04) continue;
      const mesh = part(parent, "rock", ROCK[i % 3], x, islandHeight(x, z) + size * .17,
        z, size, height, size * .79);
      mesh.rotation.y = yaw;
    }
  }
  for (const [angle, offset, size, yaw] of [[.43, .98, 1.05, .8], [.45, .96, .68, 1.73], [.48, .99, .45, 2.2],
    [2.12, .955, .54, .5], [2.14, .99, 1.17, 1.6], [2.15, .968, .80, 2.1], [2.17, 1.01, .69, .32]]) {
    const [x, z] = coastPoint(angle, offset);
    const mesh = part(parent, "rock", ROCK[Math.floor(yaw) % 3], x, islandHeight(x, z) + size * .13,
      z, size, size * .68, size * .77);
    mesh.rotation.y = yaw;
  }
  for (let i = 0; i < 50; i++) {
    const angle = .32 + random() * 2.3;
    const [x, z] = coastPoint(angle, .895 + .10 * random());
    const y = islandHeight(x, z) + .09;
    const color = [0xf8ecd1, 0xe7b1a2, 0xe4cad5, 0xffe4bd][i % 4];
    const size = .13 + random() * .32;
    const yaw = random() * TAU;
    if (i % 3 !== 0) continue;
    if (i % 4 === 0) {
      const whorl = part(parent, "ball", color, x, y + .07, z, size, size * .52, size * .71);
      whorl.rotation.y = yaw;
      const lip = part(parent, "ring", 0xd2a896, x + size * .61, y + .11, z, size * .24, size * .24, size * .23);
      lip.rotation.y = Math.PI / 2;
    } else {
      for (let k = -2; k <= 2; k++) {
        const a = yaw + .33 * k;
        const shell = part(parent, "ball", color, x + Math.sin(a) * size * .36, y, z + Math.cos(a) * size * .36,
          size * .18, size * .29, size * .69);
        shell.rotation.y = a;
      }
    }
  }
  starfish(parent);
  const flowers = [0xfff8e7, 0xffdf83, 0xadd3f1];
  for (const [index, [x, z, radius]] of VERGE_PATCHES.entries()) {
    for (let k = 0; k < 15; k++) {
      const a = random() * TAU, reach = radius * Math.sqrt(random());
      const px = x + Math.cos(a) * reach, pz = z + Math.sin(a) * reach;
      if (pondDistance(px, pz) < 1.04 || inlandCoastDistance(px, pz) > .87) continue;
      const h = .19 + random() * .34, y = islandHeight(px, pz);
      part(parent, "log", 0x639c50, px, y + h / 2, pz, .023, h, .023);
      const palette = (index + (k % 5 === 0 ? 1 : 0)) % flowers.length;
      const bloom = .126 + random() * .055;
      part(parent, "rock", flowers[palette], px, y + h, pz, bloom, .060, bloom);
      if (k % 2 === 0) part(parent, "rock", 0xe5ac55, px, y + h + .055, pz, .039, .025, .039);
    }
  }
}

function grass(parent, random) {
  const data = [], flex = [];
  for (let i = 0; i < 690; i++) {
    const [centerX, centerZ, radius] = VERGE_PATCHES[i % VERGE_PATCHES.length];
    const a = random() * TAU, reach = radius * 1.28 * Math.sqrt(random());
    const x = centerX + Math.cos(a) * reach, z = centerZ + Math.sin(a) * reach;
    if (inlandCoastDistance(x, z) > .87) continue;
    if (pondDistance(x, z) < 1.06 || Math.hypot(x - TOWER.x, z - TOWER.z) < 6.8) continue;
    const y = islandHeight(x, z) - .035;
    for (let j = 0; j < 3; j++) {
      const a = random() * TAU, h = .24 + random() * .32;
      data.push(x + Math.sin(a) * .095, y, z + Math.cos(a) * .095,
        x, y + h, z - .10, x - Math.sin(a) * .087, y, z - Math.cos(a) * .087);
      flex.push(0, i % 4 === 0 ? h * .32 : 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
  geometry.setAttribute("bladeFlex", new THREE.Float32BufferAttribute(flex, 1));
  geometry.computeVertexNormals();
  const windTime = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ color: 0x86bc58, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = "uniform float windTime; attribute float bladeFlex;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n transformed.xz += vec2(1.0, 0.45) * bladeFlex * sin(windTime + position.x * 0.34 + position.z * 0.27);"
    );
  };
  parent.add(new THREE.Mesh(geometry, material));
  return (time) => { windTime.value = time * 1.62; };
}

export function createSummerIsland(batch) {
  const root = new THREE.Group();
  root.name = SUMMER;
  const solids = new THREE.Group();
  root.add(solids);
  const random = seeded(719);
  ground(solids);
  treeShade(solids);
  for (const { path, width } of TRAILS) trail(solids, path, width, islandHeight, TRAIL, .075);
  const updatePond = pond(solids, random);
  swing(solids);
  pier(solids);
  boat(solids);
  createLighthouse(solids);
  details(solids, random);
  batch(solids);
  addMeadowFlowers(solids, TRAILS);
  const updateSea = createSummerSea(root, random);
  const updateGrass = grass(root, random);
  const updateClouds = createSummerClouds(root);
  const updateRainbow = addRainbowBridge(root, ISLAND_BRIDGE, islandHeight);
  const occluders = [];
  solids.traverse((object) => {
    if (object.isMesh && !object.material.transparent && !object.userData.ignoreTouchOcclusion) occluders.push(object);
  });
  return {
    root, occluders,
    update(time, night) {
      updatePond(night);
      updateSea(time, night);
      updateGrass(time);
      updateClouds(time, night);
      updateRainbow(time, night);
    },
  };
}
