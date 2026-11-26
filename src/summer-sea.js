import * as THREE from "three";
import { surface } from "./summer-geometry.js";
import { coastPoint, islandHeight, SUMMER_WATER } from "./summer-layout.js";

const TAU = 2 * Math.PI;
const { lerp, smoothstep } = THREE.MathUtils;

const FOAM_INNER = -.036;
const FOAM_OUTER = .080;
const WAVE_RATE = .184;
const APPROACH_END = .57;
const CREST_SEA = .056;
const CREST_SAND = -.019;
const FOAM_PHASE = "(.13 * sin(3.0 * angle + .4) + .08 * sin(7.0 * angle - .7))";

export function waveReachesSand(time, angle, shoreOffset) {
  if (shoreOffset < FOAM_INNER || shoreOffset > .012) return false;
  const phase = THREE.MathUtils.euclideanModulo(time * WAVE_RATE +
    .13 * Math.sin(3 * angle + .4) + .08 * Math.sin(7 * angle - .7), 1);
  const advance = smoothstep(phase, 0, APPROACH_END);
  const retreat = smoothstep(phase, APPROACH_END, 1);
  const crest = lerp(CREST_SEA, CREST_SAND, advance - retreat);
  return phase > .20 && phase < .84 && shoreOffset >= crest - .005;
}

function foamBand(parent) {
  const clock = { value: 0 };
  const material = new THREE.MeshBasicMaterial({
    color: 0xf5fffa, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false, forceSinglePass: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.foamTime = clock;
    shader.vertexShader = `attribute vec2 shore;
      varying vec3 vShore;
      ${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\n vShore = vec3(shore, position.y);");
    shader.fragmentShader = `uniform float foamTime;
      varying vec3 vShore;
      ${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
      float angle = vShore.x;
      float phase = fract(foamTime * ${WAVE_RATE} + ${FOAM_PHASE});
      float advance = smoothstep(0.0, ${APPROACH_END}, phase);
      float retreat = smoothstep(${APPROACH_END}, 1.0, phase);
      float crest = mix(${CREST_SEA}, ${CREST_SAND}, advance - retreat);
      float brokenEdge = .0027 * sin(angle * 31.0 + phase * 4.0) + .0017 * cos(angle * 67.0);
      float offset = vShore.y - crest - brokenEdge;
      float width = mix(.008, .023, advance - retreat);
      float whiteEdge = 1.0 - smoothstep(.0006, .0058, abs(offset));
      float wash = smoothstep(-.005, .002, offset) * (1.0 - smoothstep(.002, width, offset));
      float lace = .7 + .23 * sin(angle * 29.0 - offset * 383.0 + phase * 9.0)
        + .07 * cos(angle * 73.0 + offset * 515.0);
      float fade = smoothstep(.03, .27, phase) * (1.0 - smoothstep(.61, .98, phase));
      float breakup = .61 + .39 * smoothstep(-.6, .6, sin(angle * 57.0 - phase * 7.0));
      float cliff = 1.0 - smoothstep(.15, .36, vShore.z);
      diffuseColor.a *= fade * cliff * clamp(whiteEdge * breakup * .67 + wash * lace * .71, 0.0, 1.0);
    `);
  };
  const rows = 288, columns = 12;
  const mesh = surface(parent, rows, columns, (t, u) => {
    const [x, z] = coastPoint(t * TAU, 1 + lerp(FOAM_INNER, FOAM_OUTER, u));
    return [x, Math.max(SUMMER_WATER, islandHeight(x, z)) + .023, z];
  }, material);
  const shore = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      shore.push(row / rows * TAU, lerp(FOAM_INNER, FOAM_OUTER, col / columns));
    }
  }
  mesh.geometry.setAttribute("shore", new THREE.Float32BufferAttribute(shore, 2));
  mesh.renderOrder = 1;
  return (time, night) => {
    clock.value = time;
    material.opacity = .84 - .34 * night;
  };
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

  const updateFoam = foamBand(parent);
  const smallWaves = ripples(parent, random, 234, 0xc8f4f3, false);
  const highlights = ripples(parent, random, 48, 0xfffdeb, true);
  return (time, night) => {
    seaMaterial.color.setRGB(lerp(1, .28, night), lerp(1, .39, night), lerp(1, .61, night));
    updateFoam(time, night);
    smallWaves.position.x = Math.sin(time * .46) * .44;
    smallWaves.position.z = Math.cos(time * .32) * .37;
    smallWaves.material.opacity = (.25 + .065 * Math.sin(time * .92)) * (1 - .48 * night);
    highlights.position.x = -.58 * Math.sin(time * .42);
    highlights.material.opacity = (.49 + .12 * Math.cos(time * .76)) * (1 - .86 * night);
  };
}
