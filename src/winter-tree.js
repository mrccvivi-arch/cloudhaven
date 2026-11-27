import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makePoints, snowTexture } from "../previews/snow-whale/snow.js";
import { createIceBlossoms } from "./winter-flowers.js";
import { createWinterGlobes } from "./winter-globes.js";
import { seeded } from "./map.js";
import { WINTER_TREE, winterHeight } from "./winter-layout.js";

const vector = (x, y, z) => new THREE.Vector3(x, y, z);
const { smoothstep } = THREE.MathUtils;

function treeWood(night, clock) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .76 });
  material.onBeforeCompile = shader => {
    shader.uniforms.treeNight = night;
    shader.uniforms.treeClock = clock;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute float grain;
      varying vec3 vTreeGrain;
    `).replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vTreeGrain = vec3(grain, position.y, length(position.xz));
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform float treeNight, treeClock;
      varying vec3 vTreeGrain;
    `).replace("#include <opaque_fragment>", `
      float facing = clamp(dot(normal, normalize(vViewPosition)), 0., 1.);
      float ice = (1. - facing) * (1. - facing);
      float vein = smoothstep(.16, .84, vTreeGrain.x);
      float drift = .83 + .14 * sin(.35 * vTreeGrain.y + .16 * vTreeGrain.z - treeClock * .42)
        + .07 * sin(vTreeGrain.y * .97 - treeClock * .26);
      outgoingLight *= mix(vec3(.81,.90,1.), vec3(1.), facing);
      outgoingLight += vec3(.58,.76,1.) * (.090 + .08 * treeNight) * ice;
      outgoingLight += vec3(.84,.91,.99) * (.041 + .064 * ice) * (1. - treeNight);
      outgoingLight += vec3(1.,.57,.21) * vein * drift * (.19 + 1.19 * treeNight);
      outgoingLight += vec3(1.,.73,.38) * vTreeGrain.x * (.054 + .22 * treeNight);
      #include <opaque_fragment>
    `);
  };
  return material;
}

function makeCrown(root, clusters, random, reduced, night, clock, limits, hangers) {
  const rosettes = clusters.flatMap(({ tip, radius }) => {
    const density = .49 + .28 * Math.sin(tip.x * .68 + tip.y * .39)
      + .23 * Math.cos(tip.z * .73 - tip.x * .34);
    const count = density < .19 ? 2 : (reduced ? 4 : 5) + (density > .59 ? 2 : 0);
    return Array.from({ length: count }, (_, leaf) => {
      const angle = leaf * 2.39996 + random() * .83;
      const spread = radius * Math.sqrt(random()) * (density < .26 ? .62 : .94);
      const size = .30 + random() ** 1.44 * .49;
      const point = vector(tip.x + spread * Math.cos(angle), tip.y + (random() - .57) * radius * .91,
        tip.z + spread * Math.sin(angle));
      // Keep the denser rosettes inside the established silhouette.
      point.x = THREE.MathUtils.clamp(point.x, limits.min.x + size, limits.max.x - size);
      point.z = THREE.MathUtils.clamp(point.z, limits.min.z + size, limits.max.z - size);
      point.y = Math.min(point.y, limits.max.y - size);
      return { point, angle, size };
    });
  }).filter(({ point, size }) => !hangers.some(({ base, length, size: radius }) =>
    Math.hypot(point.x - base.x, point.y - base.y + length, point.z - base.z) < radius + size + .12));
  const crown = createIceBlossoms(root, rosettes.length, night, clock, true);
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  rosettes.forEach(({ point, angle, size }, index) => {
    dummy.position.copy(point);
    dummy.rotation.set((random() - .5) * 2.16, angle, (random() - .5) * 2.62);
    dummy.scale.set(size, size * .91, size);
    dummy.updateMatrix();
    crown.setMatrixAt(index, dummy.matrix);
    tint.setHex(index % 8 === 0 ? 0xc9e4ff : index % 5 === 0 ? 0xe1eefa : 0xffffff);
    crown.setColorAt(index, tint);
  });
  return rosettes;
}

function crownStarlight(root, rosettes, random, reduced) {
  const step = reduced ? 4 : 3;
  const seeds = rosettes.filter((entry, index) => index % step === 0);
  const points = makePoints(root, snowTexture("star"), seeds.length, .269, 2);
  const silver = new THREE.Color(0xf4f9ff);
  const gold = new THREE.Color(0xffddb1);
  const ice = new THREE.Color(0xa9d6ff);
  const lights = seeds.map(({ point, size, angle }, index) => {
    const height = .09 + random() * size * .45;
    points.positions.setXYZ(index, point.x + .19 * Math.cos(angle), point.y + height, point.z + .18 * Math.sin(angle));
    points.scales.setX(index, .37 + random() ** 1.9 * 1.35);
    const chance = random();
    const tint = chance < .14 ? gold : chance < .29 ? ice : silver;
    points.colors.setXYZW(index, tint.r, tint.g, tint.b, 0);
    return { phase: random() * Math.PI * 2, speed: .30 + random() * .54, strength: .48 + random() * .46,
      pulsing: random() > .42 };
  });
  return (time, night) => {
    lights.forEach(({ phase, speed, strength, pulsing }, index) => {
      const pulse = pulsing ? .57 + .43 * Math.sin(time * speed + phase) ** 2 : .83;
      points.colors.setW(index, strength * pulse * (.27 + .73 * night));
    });
    points.colors.needsUpdate = true;
  };
}

export function createWinterTree(parent, reduced = false) {
  const random = seeded(108227);
  const root = new THREE.Group();
  root.position.set(WINTER_TREE.x, winterHeight(WINTER_TREE.x, WINTER_TREE.z), WINTER_TREE.z);
  parent.add(root);
  const limbs = [], clusters = [], hangers = [];
  const white = new THREE.Color(0xf1f5fc);
  const amber = new THREE.Color(0xf7d9a0);
  const frost = new THREE.Color(0x87aed5);
  const paint = new THREE.Color();
  function tube(points, width, tip, segments, sides, warmth, tucked = false) {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(segments, false);
    const vertices = [], colors = [], indices = [], grain = [];
    const offset = vector(0, 0, 0);
    const radial = vector(0, 0, 0);
    for (let i = 0; i <= segments; i++) {
      const fraction = i / segments;
      const center = curve.getPointAt(fraction);
      const flare = tucked ? .61 + .39 * smoothstep(fraction, 0, .15) : 1;
      const radius = tip + (width - tip) * (1 - fraction) ** 1.19 * flare;
      for (let j = 0; j < sides; j++) {
        const angle = Math.PI * 2 * j / sides;
        const spiral = .5 + .5 * Math.sin(angle * 5 + fraction * 6.7);
        const narrow = .5 + .5 * Math.sin(angle * 3 - fraction * 7.2);
        const ridges = .93 + .17 * spiral + .051 * Math.sin(angle * 7 - fraction * 4.3);
        radial.copy(frames.normals[i]).multiplyScalar(Math.cos(angle))
          .addScaledVector(frames.binormals[i], Math.sin(angle));
        offset.copy(center).addScaledVector(radial, radius * ridges);
        vertices.push(offset.x, offset.y, offset.z);
        const glowing = warmth * (1 - .62 * fraction) * (.23 + .77 * spiral ** 2) * (.72 + .28 * narrow);
        grain.push(glowing);
        paint.copy(white).lerp(frost, .13 + .43 * (1 - spiral)).lerp(amber, .14 * glowing);
        colors.push(paint.r, paint.g, paint.b);
        const a = i * sides + j;
        const b = i * sides + (j + 1) % sides;
        if (i < segments) indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
    const mesh = new THREE.BufferGeometry();
    mesh.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    mesh.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    mesh.setAttribute("grain", new THREE.Float32BufferAttribute(grain, 1));
    mesh.setIndex(indices);
    mesh.computeVertexNormals();
    limbs.push(mesh);
    return curve;
  }

  const trunk = tube([vector(0, -.73, 0), vector(-.34, 2.8, .22), vector(-.02, 5.8, -.59),
    vector(1.20, 9.25, -.11), vector(.75, 14.2, .94), vector(-1.13, 19.8, .52), vector(-.62, 24.7, -.23)],
  1.91, .10, 36, 18, 1);
  for (let i = 0; i < 9; i++) {
    const angle = i * Math.PI * 2 / 9 + random() * .29;
    const length = 5.6 + random() * 4.85;
    const x = Math.cos(angle) * length, z = Math.sin(angle) * length;
    const end = winterHeight(root.position.x + x, root.position.z + z) - root.position.y;
    tube([vector(0, 1.8, 0), vector(x * .22, .43, z * .21), vector(x * .53, end + .20, z * .63),
      vector(x, end - .19, z)], .79 + random() * .39, .025, 17, 10, 1);
  }
  for (let i = 0; i < 12; i++) {
    const layer = i / 11;
    const angle = i * 2.39996 + random() * .44;
    const start = trunk.getPointAt(.20 + layer * .59);
    const reach = 13.9 + Math.sin(layer * 3.8) * 4.6 + random() * 2.3 - layer * 5.7;
    const end = start.clone().add(vector(Math.cos(angle) * reach, 2.85 + layer * 2.7 + random() * 1.6, Math.sin(angle) * reach));
    end.y = Math.min(24.5, end.y);
    const arc = tube([start, start.clone().lerp(end, .23).add(vector(-.29, 1.14 + .69 * (i % 2), .51)),
      start.clone().lerp(end, .59).add(vector(.48, 1.30, -.68)),
      start.clone().lerp(end, .87).add(vector(.72, i % 3 === 0 ? 1.25 : -.68, .07)),
      end.add(vector(0, i % 3 === 0 ? -1.39 : -.20, 0))], .98 - layer * .51, .029, 26, 12, .83, true);
    for (let fork = 0; fork < 5; fork++) {
      const base = arc.getPointAt(.24 + fork * .156);
      const direction = angle + (fork % 2 ? -1 : 1) * (.46 + random() * .83);
      const length = 3.17 + random() * 2.64 - layer * .94;
      const tip = base.clone().add(vector(Math.cos(direction) * length, .57 + random() * 2.36 - (fork === 4 ? .76 : 0), Math.sin(direction) * length));
      tip.y = Math.min(25.2, tip.y);
      const twig = tube([base, base.clone().lerp(tip, .52).add(vector(.19, -.30, -.18)), tip],
        .29 - fork * .039, .015, 13, 7, .40, true);
      clusters.push({ tip: tip.clone(), radius: .98 + random() * .70 });
      if (fork % 2 === 0 && i % 3 !== 1) clusters.push({ tip: twig.getPointAt(.69), radius: .59 + fork * .08 });
      for (let j = 0; j < 3; j++) {
        const branch = twig.getPointAt(.37 + j * .20);
        const turn = direction + (j % 2 ? -.95 : .88) + (random() - .5) * .35;
        const reach = .65 + random() * 1.1;
        const leaf = branch.clone().add(vector(Math.cos(turn) * reach, .39 + random() * 1.05, Math.sin(turn) * reach));
        leaf.y = Math.min(25.5, leaf.y);
        tube([branch, branch.clone().lerp(leaf, .56).add(vector(0, -.115, 0)), leaf], .059, .008, 5, 5, .13);
        if (j !== 0 || fork > 2) clusters.push({ tip: leaf, radius: .51 + random() * .53 });
      }
      if (fork === 1 || (fork === 3 && i < 10)) {
        const base = twig.getPointAt(i < 4 ? .57 : .42);
        const length = i < 4 ? 1.55 + random() * 1.0 : .68 + random() * 1.58;
        const size = (i < 4 ? .67 : .45) + random() ** 1.6 * .63;
        hangers.push({ base, length, size, phase: random() * Math.PI * 2 });
      }
    }
  }

  const night = { value: 0 };
  const clock = { value: 0 };
  const merged = mergeGeometries(limbs);
  limbs.forEach(geometry => geometry.dispose());
  root.add(new THREE.Mesh(merged, treeWood(night, clock)));
  merged.computeBoundingBox();
  const bounds = merged.boundingBox.clone().expandByScalar(.69);
  const rosettes = makeCrown(root, clusters, random, reduced, night, clock, bounds, hangers);
  const stars = crownStarlight(root, rosettes, random, reduced);
  const globes = createWinterGlobes(root, hangers, night, clock, reduced);

  function update(time, darkness, camera) {
    night.value = darkness;
    clock.value = time;
    stars(time, darkness);
    globes(time, darkness, camera);
  }
  update(0, 0);
  return update;
}
