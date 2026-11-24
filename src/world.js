import * as THREE from "three";
import { BORDER_ROCKS, BRIDGE_RAMPS, FOREST_DECOR, GROUND_DECKS, PLATFORMS, POIS, ROCK_SCALE, ROUTE, SKY_GATE, SKY_TREES, TREES, creekZ, railPositions, rawHeight, seeded, terrainHeight } from "./map.js";
import { createGinkgo } from "./ginkgo.js";
import { createPianoModel } from "./piano-model.js";
import { createCloudHabitat } from "./cloud-house.js";
import { createLookout } from "./lookout.js";
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

function tree(parent, x, z, size, style, y = terrainHeight(x, z)) {
  const greens = [[0x4e815e, 0x64966b], [0x668e61, 0x93b777], [0x54877d, 0x75a89b], [0x7d9e59, 0xa0bd74]];
  const [low, high] = greens[style];
  part(parent, "log", wood, x, y + 1.14 * size, z, .24 * size, 2.4 * size, .24 * size);
  if (style % 2) {
    part(parent, "rock", low, x, y + 2.62 * size, z, 1.16 * size, 1.35 * size, 1.09 * size);
    part(parent, "rock", high, x + .43 * size, y + 3.23 * size, z, .85 * size, 1.02 * size, .82 * size);
  } else {
    for (let i = 0; i < 3; i++) {
      const radius = size * (1.45 - i * .32);
      part(parent, "cone", i === 2 ? high : low, x, y + size * (2.36 + i * .75), z, radius, size * 1.9, radius).rotation.y = i * .42;
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
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, rawHeight(x, z));
    color.setHSL(.25 + .015 * Math.sin(x * .1 + z * .06), .26, .46 + .07 * Math.sin(z * .115) * Math.cos(x * .05));
    colors.push(color.r, color.g, color.b);
  }
  ground.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  ground.computeVertexNormals();
  parent.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  ribbon(parent, ROUTE, 2.5, (x, z) => terrainHeight(x, z) + .06, 0xc9b88a, -2);
  ribbon(parent, [[14, 4], [8, 1], [2, -5], [-5, -11], [-12, -12]], 1.05, (x, z) => terrainHeight(x, z) + .05, 0xabb17c, -1);
  const creek = Array.from({ length: 49 }, (_, i) => {
    const x = i * 3.3 - 79.2;
    return [x, creekZ(x)];
  });
  ribbon(parent, creek, 4.3, () => -.43, 0x77b8bc);

  TREES.forEach(({ x, z, size, style }) => tree(parent, x, z, size, style));
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
  arch(parent, SKY_GATE.x, terrainHeight(SKY_GATE.x, SKY_GATE.z), SKY_GATE.z, 0xc3b5f0);

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
  arch(parent, -4, 29, 15, 0xe4c98e);
  arch(parent, 2.4, 30.4, -25, 0xcabcf1);
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
  return createLookout(parent, lamp, clouds);
}

export function createWorld(scene) {
  const ground = new THREE.Group(), sky = new THREE.Group();
  const items = new Map();
  createGround(ground, items);
  const habitat = createCloudHabitat(ground);
  const ginkgo = createGinkgo(ground);
  const piano = createPianoModel(ground);
  const lookout = createSky(sky);
  scene.add(ground, sky);
  const opaque = Object.fromEntries(Object.entries({ ground, sky }).map(([layer, group]) => {
    const meshes = [];
    group.traverse((object) => {
      if (object.isMesh && !object.userData.ignoreTouchOcclusion && [object.material].flat().every((material) => !material.transparent)) meshes.push(object);
    });
    return [layer, meshes];
  }));
  return {
    piano, habitat, lookout, ginkgo,
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
