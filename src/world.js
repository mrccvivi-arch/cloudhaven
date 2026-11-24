import * as THREE from "three";
import { BORDER_ROCKS, BRIDGE_RAMPS, DAILY_WORLD, FOREST_DECOR, GROUND_DECKS, PLATFORMS, POIS, ROCK_SCALE, ROUTE, SKY_TREES, TREES, creekZ, railPositions, rawHeight, seeded, terrainHeight } from "./map.js";
import { createGinkgo } from "./ginkgo.js";
import { createPianoModel } from "./piano-model.js";
import { createCloudHabitat } from "./cloud-house.js";
import { lookoutCloud } from "./lookout-cloud.js";
import { createLookout } from "./lookout.js";
import { gateOpenings } from "./sky-gate.js";
import { part } from "./models.js";

const wood = 0x916344;
const plank = 0xbd8e61;
const soil = 0x907458;
const grass = 0x83ae70;
const moss = 0x779e65;
const cream = 0xffdfaa;
const stone = 0x9ba7a0;

function batch(parent) {
  parent.updateMatrixWorld(true);
  const groups = new Map();
  parent.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.material.transparent) return;
    const key = mesh.geometry.uuid + mesh.material.uuid;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mesh);
  });
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const { geometry, material } = meshes[0];
    const instances = new THREE.InstancedMesh(geometry, material, meshes.length);
    meshes.forEach((mesh, index) => {
      instances.setMatrixAt(index, mesh.matrixWorld);
      mesh.removeFromParent();
    });
    instances.instanceMatrix.needsUpdate = true;
    parent.add(instances);
  }
}

function ribbon(parent, points, width, sample, color, depthBias = 0) {
  const data = [];
  // Terrain-following paths need samples across their width where the ground changes slope.
  const strips = depthBias ? Math.ceil(width * 3) : 1;
  for (let i = 0; i < points.length - 1; i++) {
    const [x, z] = points[i];
    const [nx, nz] = points[i + 1];
    const span = Math.hypot(nx - x, nz - z);
    const ox = (nz - z) / span * width / 2;
    const oz = (x - nx) / span * width / 2;
    const steps = Math.ceil(span * (depthBias ? 3 : 2));
    for (let j = 0; j < steps; j++) {
      const a = j / steps;
      const b = (j + 1) / steps;
      const px = x + (nx - x) * a, pz = z + (nz - z) * a;
      const qx = x + (nx - x) * b, qz = z + (nz - z) * b;
      for (let strip = 0; strip < strips; strip++) {
        const left = 2 * strip / strips - 1;
        const right = 2 * (strip + 1) / strips - 1;
        const point = (x, z, side) => {
          const rx = x + ox * side;
          const rz = z + oz * side;
          return [rx, sample(rx, rz), rz];
        };
        const l = point(px, pz, left), r = point(px, pz, right);
        const L = point(qx, qz, left), R = point(qx, qz, right);
        data.push(...l, ...L, ...r, ...r, ...L, ...R);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
  geometry.computeVertexNormals();
  parent.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color, side: THREE.DoubleSide,
    polygonOffset: depthBias !== 0, polygonOffsetFactor: depthBias, polygonOffsetUnits: depthBias,
  })));
}

const canopyColors = [
  [0x4e815e, 0x64966b, 0x47765c, 0x658e6d],
  [0x668e61, 0x93b777, 0x507b38, 0x83ae55],
  [0x54877d, 0x75a89b, 0x507f74, 0x709d8a],
  [0x7d9e59, 0xa0bd74, 0x6b893a, 0xa3ba60],
];

function tree(parent, x, z, size, style, y = terrainHeight(x, z), forestMaterials) {
  const [low, high] = canopyColors[style];
  function foliage(shape, tint, ...transform) {
    const piece = part(parent, shape, tint, ...transform);
    if (forestMaterials) piece.material = forestMaterials.get(tint).material;
    return piece;
  }
  part(parent, "log", wood, x, y + 1.14 * size, z, .24 * size, 2.4 * size, .24 * size);
  if (style % 2) {
    foliage("rock", low, x, y + 2.62 * size, z, 1.16 * size, 1.35 * size, 1.09 * size);
    foliage("rock", high, x + .43 * size, y + 3.23 * size, z, .85 * size, 1.02 * size, .82 * size);
  } else {
    for (let i = 0; i < 3; i++) {
      const radius = size * (1.45 - i * .32);
      foliage("cone", i === 2 ? high : low, x, y + size * (2.36 + i * .75), z, radius, size * 1.9, radius).rotation.y = i * .42;
    }
  }
}

function flowers(parent, x, y, z, palette = [0xf2b086, 0xffdc87, 0xf1e9bb]) {
  for (let i = 0; i < 5; i++) {
    const px = x + Math.cos(i * 2.399) * .74;
    const pz = z + Math.sin(i * 2.399) * .74;
    const bloomY = y + .22 + (i % 3) * .085;
    part(parent, "log", 0x608858, px, bloomY - .17, pz, .035, .45, .035);
    part(parent, "rock", palette[i % palette.length], px, bloomY, pz, .125, .087, .126);
  }
}

function arch(parent, x, y, z, palette) {
  for (const offset of [-1.65, 1.65]) {
    part(parent, "box", wood, x + offset, y + 1.8, z, .34, 3.6, .42);
    part(parent, "rock", palette, x + offset, y + 3.65, z, .35, .39, .35);
  }
  part(parent, "box", plank, x, y + 3.47, z, 3.75, .3, .45);
  part(parent, "ring", palette, x, y + 3.46, z + .25, .55, .55, .36);
}

function createGateMist(parent, { x, y, z, halfWidth, height }) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 openingUv;
      void main() {
        openingUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 openingUv;
      void main() {
        vec2 p = openingUv;
        vec2 edge = smoothstep(vec2(0.0), vec2(0.23), min(p, 1.0 - p));
        float drift = sin(p.y * 17.0 - time + sin(p.x * 6.0 + time * 0.6));
        float wisps = sin(p.x * 10.0 + p.y * 9.0 - time * 0.75 + drift);
        float opacity = edge.x * edge.y * (0.027 + 0.081 * smoothstep(-0.45, 0.95, wisps));
        gl_FragColor = vec4(0.96, 0.92, 1.0, opacity);
      }
    `,
  });
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, height), material);
  mist.position.set(x, y + height / 2, z);
  parent.add(mist);
  return (time) => { material.uniforms.time.value = time * .001; };
}

function deck(parent, platform, rail = false) {
  const { x, y, z, w, d } = platform;
  const count = Math.ceil(d / .55);
  for (let i = 0; i < count; i++) {
    const depth = d / count;
    part(parent, "box", i % 3 === 0 ? 0xcea376 : plank,
      x, y - .095, z - d / 2 + depth * (i + .5), w, .19, depth * .96);
  }
  if (rail) {
    for (const rail of railPositions(platform)) {
      part(parent, "box", wood, rail.x, y + .68, z, .12, .12, d);
      for (const pos of [-.43, -.12, .19, .43]) {
        part(parent, "box", wood, rail.x, y + .36, z + pos * d, .16, .74, .16);
      }
    }
  }
}

function drawBridgeRamp(parent, { xs, heights, y, bridgeZ, landZ }) {
  const surface = [];
  const sides = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = [xs[i], y, bridgeZ], b = [xs[i + 1], y, bridgeZ];
    const c = [xs[i], heights[i], landZ], d = [xs[i + 1], heights[i + 1], landZ];
    surface.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  for (const index of [0, xs.length - 1]) {
    const x = xs[index];
    const high = [x, y, bridgeZ];
    const low = [x, heights[index], landZ];
    // Extend the skirt into the irregular bank so the approach looks supported.
    const footer = [x, terrainHeight(x, bridgeZ) - .08, bridgeZ];
    const toe = [x, heights[index] - .08, landZ];
    sides.push(...high, ...footer, ...low, ...footer, ...toe, ...low);
  }
  for (const [positions, color] of [[surface, 0xc9b88a], [sides, soil]]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    parent.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
      color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    })));
  }
}

function baseDecor(parent) {
  const { x, z } = POIS.find((spot) => spot.id === "build");
  part(parent, "box", 0xc5c38b, x, .014, z, 8, .028, 6);
  for (const offset of [-1, 1]) {
    for (const side of [-1, 1]) {
      part(parent, "box", wood, x + side * 3.96, .27, z + offset * 2.97, .16, .54, .18);
    }
  }
  for (const x of [-50.5, -36]) flowers(parent, x, 0, 28.8);
}

function createGround(parent, items) {
  const ground = new THREE.PlaneGeometry(160, 160, 80, 80).rotateX(-Math.PI / 2);
  const p = ground.attributes.position;
  const nightColors = new Float32Array(p.count * 3);
  const dayColors = new Float32Array(p.count * 3);
  const color = new THREE.Color();
  const meadow = new THREE.Color(0xb8d88a);
  const deepGrass = new THREE.Color(0xa8c979);
  const sunlitGrass = new THREE.Color(0xc9da91);
  const canopyShadows = TREES.map(({ x, z, size }) => ({ x, z: z + size * .8, radius: size * 2.25 }));

  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, rawHeight(x, z));
    color.setHSL(.25 + .015 * Math.sin(x * .1 + z * .06), .26, .46 + .07 * Math.sin(z * .115) * Math.cos(x * .05));
    color.toArray(nightColors, i * 3);
    const variation = .5 + .22 * Math.sin(x * .107 + z * .14) + .21 * Math.cos(x * .19 - z * .078);
    const sunlight = THREE.MathUtils.smoothstep(Math.sin(x * .163 + z * .11) * Math.cos(z * .138), .65, .97);
    let shade = 0;
    for (const shadow of canopyShadows) {
      const dz = (z - shadow.z) * .75;
      const dx = x - shadow.x;
      if (Math.abs(dx) >= shadow.radius || Math.abs(dz) >= shadow.radius) continue;
      shade = Math.max(shade, 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz) / shadow.radius, 0, 1));
    }
    color.copy(deepGrass).lerp(meadow, variation)
      .lerp(sunlitGrass, sunlight * .65 * (1 - shade)).multiplyScalar(1 - shade * .22);
    color.toArray(dayColors, i * 3);
  }
  const terrainColors = new THREE.BufferAttribute(dayColors.slice(), 3).setUsage(THREE.DynamicDrawUsage);
  ground.setAttribute("color", terrainColors);
  ground.computeVertexNormals();
  parent.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  ribbon(parent, ROUTE, 2.5, (x, z) => terrainHeight(x, z) + .06, 0xc9b88a, -2);
  ribbon(parent, [[14, 4], [8, 1], [2, -5], [-5, -11], [-12, -12]], 1.05, (x, z) => terrainHeight(x, z) + .05, 0xabb17c, -1);
  const creek = Array.from({ length: 49 }, (_, i) => {
    const x = i * 3.3 - 79.2;
    return [x, creekZ(x)];
  });
  ribbon(parent, creek, 4.3, () => -.43, 0x77b8bc);

  const foliage = new Map();
  for (const [low, high, dayLow, dayHigh] of canopyColors) {
    for (const [original, daylight] of [[low, dayLow], [high, dayHigh]]) {
      foliage.set(original, {
        material: new THREE.MeshLambertMaterial({ color: daylight, flatShading: true }),
        original: new THREE.Color(original), daylight: new THREE.Color(daylight),
      });
    }
  }
  TREES.forEach(({ x, z, size, style }) => tree(parent, x, z, size, style, terrainHeight(x, z), foliage));
  for (const { x, y, z, kind } of FOREST_DECOR) {
    if (kind === "flower") flowers(parent, x, y, z);
    else if (kind === "rock") part(parent, "rock", stone, x, y + .23, z, ROCK_SCALE.x, ROCK_SCALE.y, ROCK_SCALE.z).rotation.y = x;
    else {
      part(parent, "log", cream, x, y + .19, z, .09, .39, .09);
      part(parent, "ball", 0xbb6655, x, y + .39, z, .28, .12, .29);
    }
  }
  for (const { x, y, z, sx, sy, sz, yaw, color } of BORDER_ROCKS) {
    part(parent, "rock", color, x, y, z, sx, sy, sz).rotation.y = yaw;
  }
  ROUTE.slice(1).forEach(([x, z]) => {
    if (Math.abs(z - creekZ(x)) < 7) return;
    const y = terrainHeight(x + 1.8, z);
    part(parent, "log", wood, x + 1.8, y + .6, z, .11, 1.2, .11);
    part(parent, "rock", 0xffd98d, x + 1.8, y + 1.22, z, .24, .24, .24);
  });
  GROUND_DECKS.forEach((platform) => {
    if (platform.id === "creek-bridge") {
      deck(parent, platform, true);
      for (const ramp of BRIDGE_RAMPS) drawBridgeRamp(parent, ramp);
    } else {
      const mossDepth = .13;
      const soilDepth = .78 - mossDepth;
      // The two boxes share only their internal seam, with no overlapping outer faces.
      part(parent, "box", soil, platform.x, platform.y - mossDepth - soilDepth / 2,
        platform.z, platform.w, soilDepth, platform.d);
      part(parent, "box", moss, platform.x, platform.y - mossDepth / 2,
        platform.z, platform.w, mossDepth, platform.d);
    }
  });
  baseDecor(parent);
  const gate = gateOpenings.ground;
  arch(parent, gate.x, gate.y, gate.z, 0xc3b5f0);

  batch(parent);
  for (const spot of POIS.filter((entry) => entry.item)) {
    const group = new THREE.Group();
    const y = terrainHeight(spot.x, spot.z);
    const color = { wood: 0xd9a473, stone: 0xb3c4d0, seed: 0xe9bf62 }[spot.item];
    part(group, "ring", 0xf5e2ab, spot.x, y + .035, spot.z, .59, .59, .28).rotation.x = -Math.PI / 2;
    part(group, spot.item === "wood" ? "log" : "rock", color,
      spot.x, y + .25, spot.z, .28, spot.item === "wood" ? 1.05 : .45, .33).rotation.z = 1.1;
    part(group, "rock", cream, spot.x, y + .91, spot.z, .12, .17, .12);
    items.set(spot.id, group);
    parent.add(group);
  }

  let lastBlend = 0;
  return (night) => {
    const blend = Math.round(night * 32) / 32;
    if (blend === lastBlend) return;
    lastBlend = blend;
    for (let i = 0; i < terrainColors.array.length; i++) {
      terrainColors.array[i] = THREE.MathUtils.lerp(dayColors[i], nightColors[i], blend);
    }
    terrainColors.needsUpdate = true;
    for (const { material, daylight, original } of foliage.values()) {
      material.color.copy(daylight).lerp(original, blend);
    }
  };
}

function createSky(parent) {
  for (const platform of PLATFORMS) {
    const { x, z, y, w, d } = platform;
    if (platform.id === "bridge") {
      deck(parent, platform, true);
      continue;
    }
    part(parent, "box", grass, x, y - .36, z, w, .72, d);
    part(parent, "box", 0xa98b72, x, y - .94, z, w * .91, .54, d * .92);
    part(parent, "rock", 0x9e8a8d, x, y - 2.6, z, w * .49, 2.72, d * .49).rotation.y = x;
    part(parent, "ring", 0xe9d4a8, x, y + .027, z + .4, 1.25, 1.25, .21).rotation.x = -Math.PI / 2;
    flowers(parent, x + w * .3, y, z + .78, [0xbaa3da, 0xe1bddb, 0xf6e6ba]);
    flowers(parent, x - w * .29, y, z - .85, [0xb8c0e4, 0xf1c1c4, 0xf6e6ba]);
  }
  for (const { x, y, z, size, style } of SKY_TREES) tree(parent, x, z, size, style, y);
  const gate = gateOpenings.sky;
  arch(parent, gate.x, gate.y, gate.z, 0xe4c98e);
  const lookoutGate = gateOpenings.lookout;
  arch(parent, lookoutGate.x, lookoutGate.y, lookoutGate.z, 0xcabcf1);
  part(parent, "log", 0xe3c895, -.8, 31.12, -25, .26, 1.45, .26);
  const lamp = part(parent, "rock", 0xe8cc9c, -.8, 32.18, -25, .49, .55, .49);
  const random = seeded(195);
  const gray = [0x94a7c1, 0xa1b1ca, 0x8e9fba];
  const clouds = [0xa9e1ff, 0xc1adf2, 0xffd998].map((color, index) => {
    const mesh = new THREE.Group();
    const material = new THREE.MeshLambertMaterial({ color: gray[index], flatShading: true });
    parent.add(mesh);
    return { mesh, material, tint: new THREE.Color(color) };
  });
  function cloud(x, y, z, index) {
    const { mesh, material } = clouds[index % clouds.length];
    for (const offset of [-1, 0, 1]) {
      const lobe = part(mesh, "ball", 0xffffff, x + offset * 3.1, y - Math.abs(offset), z, 4.8, 1.8, 3);
      lobe.material = material;
    }
  }
  for (let i = 0; i < 65; i++) {
    const x = random() * 120 - 60;
    const z = random() * 105 - 70;
    cloud(x, 15 + random() * 10, z, i);
  }
  // The higher banks sit beyond the lookout where they clear the platform's silhouette.
  const banks = [[-18, 26, -50], [-4, 25, -48], [12, 26.5, -51], [24, 25, -57],
    [-28, 25, -64], [-10, 26.5, -65], [5, 26, -64], [19, 27, -69]];
  banks.forEach(([x, y, z], i) => cloud(x, y, z, i));
  for (const { mesh } of clouds) batch(mesh);
  batch(parent);
  for (const { material } of clouds) {
    material.transparent = true;
    material.opacity = .94;
  }
  const outline = new THREE.Shape(lookoutCloud.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const depth = .48;
  const bevel = .16;
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4,
  });
  const material = new THREE.MeshLambertMaterial({
    color: 0xfff5e7, emissive: 0xe5edff, emissiveIntensity: .18,
    // The cloud overlaps the lookout at the same height; keep its top behind the grass.
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
  });
  const cloudLanding = new THREE.Mesh(geometry, material);
  cloudLanding.rotation.x = -Math.PI / 2;
  cloudLanding.position.y = lookoutCloud.y - depth - bevel;
  parent.add(cloudLanding);
  return createLookout(parent, lamp, clouds);
}

function createNewsBoard(parent) {
  const board = new THREE.Group();
  board.position.set(DAILY_WORLD.x, terrainHeight(DAILY_WORLD.x, DAILY_WORLD.z), DAILY_WORLD.z);
  parent.add(board);
  for (const side of [-1, 1]) {
    part(board, "box", plank, side * .78, .76, 0, .16, 1.52, .21);
    part(board, "ball", 0xfff1da, side * .64, 2.07, 0, .61, .43, .28);
  }
  part(board, "ball", 0xfff1da, 0, 2.24, 0, .77, .48, .31);
  part(board, "box", plank, 0, 1.52, 0, 2.33, 1.2, .26);
  part(board, "box", 0xffefd2, 0, 1.52, 0, 2.08, .96, .29);
  for (const side of [-1, 1]) {
    part(board, "box", 0xcfb799, -.4, 1.65, side * .15, .81, .08, .018);
    part(board, "box", 0xcfb799, 0, 1.42, side * .15, 1.61, .06, .018);
  }
  if (typeof document !== "undefined") {
    const sign = document.createElement("canvas");
    sign.width = 512;
    sign.height = 128;
    const ink = sign.getContext("2d");
    if (ink) {
      ink.font = '600 99px "Songti SC", "Noto Serif CJK SC", serif';
      ink.textAlign = "center";
      ink.textBaseline = "middle";
      ink.fillStyle = "#53412b";
      ink.fillText(DAILY_WORLD.name, 256, 68);
      const texture = new THREE.CanvasTexture(sign);
      texture.colorSpace = THREE.SRGBColorSpace;
      const lettering = new THREE.Mesh(new THREE.PlaneGeometry(1.53, .3825),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
      lettering.position.set(0, 1.81, .147);
      board.add(lettering);
    }
  }
  return board;
}

export function createWorld(scene) {
  const ground = new THREE.Group(), sky = new THREE.Group();
  const items = new Map();
  const updateForestPalette = createGround(ground, items);
  const groundGateMist = createGateMist(ground, gateOpenings.ground);
  const habitat = createCloudHabitat(ground);
  const newsBoard = createNewsBoard(ground);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const radius = i % 2 ? .074 : .23;
    starShape[i ? "lineTo" : "moveTo"](Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  const diaryStar = new THREE.Mesh(new THREE.ShapeGeometry(starShape), new THREE.MeshBasicMaterial({
    color: 0xffefbf, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  diaryStar.name = "Unread diary star";
  diaryStar.position.copy(newsBoard.position).add(new THREE.Vector3(1.55, 2.03, .1));
  diaryStar.visible = false;
  ground.add(diaryStar);

  const ginkgo = createGinkgo(ground);
  const piano = createPianoModel(ground);
  const lookout = createSky(sky);
  const skyGateMist = createGateMist(sky, gateOpenings.sky);
  const lookoutGateMist = createGateMist(sky, gateOpenings.lookout);
  scene.add(ground, sky);
  const opaque = Object.fromEntries(Object.entries({ ground, sky }).map(([layer, group]) => {
    const meshes = [];
    group.traverse((object) => {
      if (object.isMesh && !object.userData.ignoreTouchOcclusion && [object.material].flat().every((material) => !material.transparent)) meshes.push(object);
    });
    return [layer, meshes];
  }));
  return {
    ground, piano, habitat, newsBoard, lookout, ginkgo, updateForestPalette,
    updateDiaryStar(unread, time) {
      diaryStar.visible = unread;
      if (!unread) return;
      const breath = Math.sin(time * .00135);
      diaryStar.material.opacity = .78 + breath * .16;
      diaryStar.scale.setScalar(1 + breath * .09);
    },
    updateGateMist(layer, time) {
      const update = layer === "ground" ? groundGateMist : skyGateMist;
      update(time);
      if (layer === "sky") lookoutGateMist(time);
    },
    occludes(ray, layer, distance, ignoredGroup) {
      const far = ray.far;
      ray.far = distance - .02;
      try {
        return ray.intersectObjects(opaque[layer], false).some(({ object }) => {
          if (!object.visible || !object.parent.visible) return false;
          if (!ignoredGroup) return true;
          for (let parent = object; parent; parent = parent.parent) if (parent === ignoredGroup) return false;
          return true;
        });
      } finally {
        ray.far = far;
      }
    },
    showLayer(layer) {
      ground.visible = layer === "ground";
      sky.visible = layer === "sky";
    },
    sync(state) {
      for (const [id, object] of items) object.visible = !state.collected.includes(id);
    },
  };
}
