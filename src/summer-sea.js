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

function seaLight(material) {
  const uniforms = {
    seaTime: { value: 0 },
    radiance: { value: new THREE.Vector2() },
    sunRay: { value: new THREE.Vector3() },
    moonRay: { value: new THREE.Vector3() },
    goldTint: { value: new THREE.Color() },
    seaHorizon: { value: new THREE.Color() },
    horizonMix: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 seaPosition;
      ${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\n seaPosition = (modelMatrix * vec4(position, 1.)).xyz;");
    shader.fragmentShader = `varying vec3 seaPosition;
      uniform float seaTime, horizonMix;
      uniform vec2 radiance;
      uniform vec3 sunRay, moonRay, goldTint, seaHorizon;
      float glints(vec2 eyeRay, float distanceToEye, vec2 direction, float phase) {
        float along = dot(eyeRay, direction);
        float across = dot(eyeRay, vec2(-direction.y, direction.x));
        float rolling = sin(along * .78 + phase) * .54 + sin(along * 2.7 - phase * 1.2) * .23;
        float width = 2.9 + 6.4 * smoothstep(9., 67., along);
        float lane = 1. - smoothstep(.13, 1., abs(across + rolling * 1.9) / width);
        float wave = sin(along * 2.75 + sin(across * 1.14 - phase) * .86 - phase * 1.5);
        float fleck = sin(along * 5.4 - across * 2.75 + phase) * .32 +
          sin(along * 1.2 + across * 3.8 - phase * 1.2) * .28;
        float shimmer = smoothstep(.31, 1.04, wave * .71 + fleck);
        float fine = 1. - smoothstep(56., 180., distanceToEye);
        return lane * smoothstep(1.8, 11., along) * (shimmer * fine + .16 + .10 * rolling);
      }
      ${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
        if (horizonMix > 0.) {
          vec2 viewRay = seaPosition.xz - cameraPosition.xz;
          float seaDistance = length(viewRay);
          diffuseColor.rgb = mix(diffuseColor.rgb, seaHorizon * .85, smoothstep(70., 296., seaDistance) * horizonMix);
          float pulse = seaTime * .72;
          float golden = radiance.x > .002 ? glints(viewRay, seaDistance, normalize(sunRay.xz), pulse) * radiance.x : 0.;
          float silver = radiance.y > .002 ? glints(viewRay, seaDistance, normalize(moonRay.xz), -pulse * .8) * radiance.y : 0.;
          diffuseColor.rgb = mix(diffuseColor.rgb, goldTint, clamp(golden, 0., .87));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.70, .85, 1.), clamp(silver, 0., .77));
        }`);
  };
  return (time, look) => {
    uniforms.horizonMix.value = look?.waterMix ?? 0;
    if (!look) return;
    uniforms.seaTime.value = time;
    uniforms.radiance.value.set(look.sunGlow * 1.06, look.moon * .79);
    uniforms.sunRay.value.copy(look.sunDirection);
    uniforms.moonRay.value.copy(look.moonDirection);
    uniforms.goldTint.value.copy(look.sunTint);
    uniforms.seaHorizon.value.copy(look.horizon);
  };
}

export function createSummerSea(parent, random) {
  const rings = [0, .93, .99, 1.055, 1.13, 1.24, 1.42, 1.72, 2.20, 2.95, 4.2, 8];
  const seaColors = [0xb7f0e3, 0xb7f0e3, 0xb6f0e7, 0x91e4de, 0x76dcd9, 0x63d4d6,
    0x4dc7d3, 0x45b8d0, 0x3a9fc7, 0x328bb9, 0x449ac5, 0x7abbd7].map((color) => new THREE.Color(color));
  const seaMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
  const updateReflections = seaLight(seaMaterial);
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
  return (time, night, look) => {
    if (look) seaMaterial.color.copy(look.sea);
    else seaMaterial.color.setRGB(lerp(1, .28, night), lerp(1, .39, night), lerp(1, .61, night));
    updateReflections(time, look);
    updateFoam(time, night);
    smallWaves.position.x = Math.sin(time * .46) * .44;
    smallWaves.position.z = Math.cos(time * .32) * .37;
    smallWaves.material.opacity = (.25 + .065 * Math.sin(time * .92)) * (1 - .48 * night);
    highlights.position.x = -.58 * Math.sin(time * .42);
    highlights.material.opacity = (.49 + .12 * Math.cos(time * .76)) * (1 - .86 * night);
  };
}
