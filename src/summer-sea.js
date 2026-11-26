import * as THREE from "three";
import { surface } from "./summer-geometry.js";
import { coastPoint, SUMMER_WATER } from "./summer-layout.js";

const TAU = 2 * Math.PI;
const { lerp, smoothstep } = THREE.MathUtils;

function foamBand(parent, phase) {
  const steps = 192;
  const columns = 4;
  const material = new THREE.MeshBasicMaterial({
    color: 0xf5fffa, transparent: true, vertexColors: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
  });
  const mesh = surface(parent, steps, columns, (t, u) => {
    const a = t * TAU;
    const width = .015 + .004 * Math.sin(a * 15 + phase) + .0025 * Math.cos(a * 27);
    const cut = Math.sin(a * 9 + phase) * .005 + Math.cos(a * 17 - phase) * .0035;
    const [x, z] = coastPoint(a, 1 + cut + width * (u - .46));
    return [x, .027 + phase * .006, z];
  }, material);
  const rgba = [];
  for (let row = 0; row <= steps; row++) {
    const a = row / steps * TAU;
    const lacing = .49 + .28 * Math.sin(a * 11 + phase) + .20 * Math.sin(a * 24 - phase);
    for (let col = 0; col <= columns; col++) {
      const u = col / columns;
      const crest = Math.sin(Math.PI * u) ** 2.2;
      const edge = .74 + .26 * Math.cos(a * 42 + u * 4);
      rgba.push(1, 1, 1, crest * edge * (.35 + .65 * smoothstep(lacing, .08, .83)));
    }
  }
  mesh.geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgba, 4));
  return mesh;
}

function ripples(parent, random, count, tint, glints) {
  const positions = [], colors = [], indices = [];
  for (let i = 0; i < count; i++) {
    const a = random() * TAU;
    const r = glints ? 1.16 + random() * 1.14 : 1.04 + random() ** 1.8 * 1.92;
    const [x, z] = coastPoint(a, r);
    const length = (.32 + random() ** 1.5 * (glints ? 1.0 : 1.85)) * r ** .45;
    const width = .05 + random() * (glints ? .10 : .12);
    const heading = -.12 + random() * .52;
    const cs = Math.cos(heading), sn = Math.sin(heading);
    const root = positions.length / 3;
    const alpha = .24 + random() * .59;
    for (let j = 0; j <= 4; j++) {
      const t = j / 4, profile = Math.sin(t * Math.PI);
      const crest = .22 * Math.sin(t * Math.PI);
      for (const [side, opacity] of [[-1, 0], [0, alpha], [1, 0]]) {
        const along = (t - .5) * length * 2.0;
        const across = crest + profile * width * side;
        positions.push(x + cs * along - sn * across, .019 + .004 * glints, z + sn * along + cs * across);
        colors.push(1, 1, 1, opacity * profile ** 1.2);
      }
      if (j < 4) {
        const a = root + 3 * j;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({
    color: tint, vertexColors: true, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

export function createSummerSea(parent, random) {
  const rings = [0, .93, .99, 1.055, 1.13, 1.24, 1.42, 1.72, 2.20, 2.95, 4.2, 8];
  const seaColors = [0xb7f0e3, 0xb7f0e3, 0xb6f0e7, 0x91e4de, 0x76dcd9, 0x63d4d6,
    0x4dc7d3, 0x45b8d0, 0x3a9fc7, 0x328bb9, 0x449ac5, 0x7abbd7].map((color) => new THREE.Color(color));
  const seaMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
  const ringIndex = (u) => Math.round(u * (rings.length - 1));
  surface(parent, 192, rings.length - 1, (t, u) => {
    const [x, z] = coastPoint(t * TAU, rings[ringIndex(u)]);
    return [x, SUMMER_WATER, z];
  }, seaMaterial, (t, u) => {
    const ring = ringIndex(u), a = t * TAU;
    const banks = .5 + .27 * Math.sin(a * 13 + ring * 1.4) + .23 * Math.cos(a * 21 - ring * .7);
    const hint = ring < 7 ? (.12 * banks - .045) * Math.sin(ring / 7 * Math.PI) : 0;
    return seaColors[ring].clone().multiplyScalar(1 + hint);
  });

  const foam = [foamBand(parent, 0), foamBand(parent, 1)];
  const smallWaves = ripples(parent, random, 234, 0xc8f4f3, false);
  const highlights = ripples(parent, random, 48, 0xfffdeb, true);
  return (time, night) => {
    seaMaterial.color.setRGB(lerp(1, .28, night), lerp(1, .39, night), lerp(1, .61, night));
    foam.forEach((mesh, index) => {
      const t = (time * .17 + .49 * index) % 1;
      const spread = lerp(1.057, .997, smoothstep(t, .03, .84));
      mesh.scale.x = mesh.scale.z = spread;
      mesh.material.opacity = (.65 - index * .18) * Math.sin(Math.PI * t) ** 1.13 * (1 - .42 * night);
    });
    smallWaves.position.x = Math.sin(time * .46) * .44;
    smallWaves.position.z = Math.cos(time * .32) * .37;
    smallWaves.material.opacity = (.25 + .065 * Math.sin(time * .92)) * (1 - .48 * night);
    highlights.position.x = -.58 * Math.sin(time * .42);
    highlights.material.opacity = (.49 + .12 * Math.cos(time * .76)) * (1 - .86 * night);
  };
}
