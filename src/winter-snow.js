import * as THREE from "three";
import { snowTexture } from "../previews/snow-whale/snow.js";
import { WINTER_TREE } from "./winter-layout.js";

const { smoothstep, euclideanModulo } = THREE.MathUtils;

export const winterSnowFields = [
  { count: 545, mobile: 460, width: 14, depth: 14, height: 9.4, lift: 2.0, size: .234, opacity: .82, camera: true },
  { count: 2450, mobile: 2110, width: 35, depth: 35, height: 17.5, lift: 5.0, size: .285, opacity: .94 },
  { count: 1480, mobile: 820, width: 210, depth: 210, height: 46, lift: 17, size: .59, opacity: .76, fixed: true },
];

export function winterSnowStrength(time) {
  const phase = euclideanModulo(time + 10, 86);
  return smoothstep(phase, 32, 37) * (1 - smoothstep(phase, 49, 55));
}

function flakeAtlas() {
  const kinds = ["snow", "fall", "crystal"];
  const rowSize = 48 * 4;
  const width = 48 * kinds.length;
  const data = new Uint8Array(width * 48 * 4);
  kinds.forEach((kind, column) => {
    const tile = snowTexture(kind);
    for (let row = 0; row < 48; row++) {
      data.set(tile.image.data.subarray(row * rowSize, (row + 1) * rowSize), row * width * 4 + column * rowSize);
    }
    tile.dispose();
  });
  const map = new THREE.DataTexture(data, width, 48);
  map.minFilter = map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return map;
}

function createField(parent, field, random, reduced, shared, atlas) {
  const count = reduced ? field.mobile : field.count;
  const positions = new Float32Array(count * 3);
  const details = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const variant = random();
    const kind = variant < (field.fixed ? .77 : .60) ? 0 : variant < (field.camera ? .958 : .981) ? 1 : 2;
    positions.set([(random() - .5) * field.width, random() * field.height, (random() - .5) * field.depth], i * 3);
    const size = (.67 + random() ** 1.57 * 1.05) * (kind === 2 ? 1.65 : kind === 1 ? 1.21 : 1);
    details.set([size, random(), .78 + random() * 2.12, kind + .48 * random()], i * 4);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("flake", new THREE.BufferAttribute(details, 4));
  const material = new THREE.PointsMaterial({
    map: atlas, size: field.size, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  });
  const domain = { value: new THREE.Vector3(field.width, field.height, field.depth) };
  const anchor = { value: new THREE.Vector3() };
  const options = { value: new THREE.Vector3(field.opacity, Number(!!field.camera), Number(!!field.fixed)) };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, shared, { snowDomain: domain, snowAnchor: anchor, snowOptions: options });
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute vec4 flake;
      uniform vec3 snowDomain, snowAnchor, snowOptions;
      uniform float snowTime, snowStorm, snowWind, snowNight;
      uniform vec2 snowTree;
      uniform vec2 snowShelter;
      varying vec4 vFlake;
    `).replace("#include <begin_vertex>", `
      float seed = flake.y * 37.1 + position.x * .67 + position.z * .28;
      float time = snowTime;
      vec3 drift = vec3(snowWind + sin(time * (.43 + .28 * flake.y) + seed) * (1.09 + .51 * snowStorm),
        -time * flake.z, cos(seed + time * .68) * .86 + snowWind * .13);
      vec3 radius = snowDomain * .5;
      vec3 transformed = snowAnchor + mod(position + drift - snowAnchor + radius, snowDomain) - radius;
      vec3 edge = abs(transformed - snowAnchor) / radius;
      float seam = (1. - smoothstep(.83, 1., max(edge.x, edge.z))) * (1. - smoothstep(.90, 1., edge.y));
      float distanceTree = length(transformed.xz - snowTree);
      float ceiling = 18. - 5. * smoothstep(4., 15., distanceTree);
      float belowCrown = 1. - smoothstep(ceiling, ceiling + 5.5, transformed.y);
      float shelter = 1. - .986 * belowCrown * (1. - smoothstep(snowShelter.x, snowShelter.y, distanceTree));
      float coverage = 1. - smoothstep(.78 + snowStorm * mix(.21, .12, snowOptions.z), .87 + snowStorm * .21, flake.y);
      float eye = length(cameraPosition - transformed);
      float front = smoothstep(snowOptions.y > .5 ? 1.15 : 1.8, snowOptions.y > .5 ? 2.63 : 3.5, eye);
      float farFade = mix(1., 1. - smoothstep(106., 177., eye), snowOptions.z);
      float alpha = snowOptions.x * seam * coverage * shelter * front * farFade;
      float phase = .5 + .5 * sin(time * (.69 + .32 * flake.y) + seed);
      float shine = smoothstep(.86, .99, phase);
      vFlake = vec4(alpha * (.72 + .28 * flake.y), floor(flake.w), seed + time * (.24 + flake.y * .44), shine);
    `).replace("gl_PointSize = size;", "gl_PointSize = size * flake.x;").replace("#include <logdepthbuf_vertex>", `
      gl_PointSize = min(gl_PointSize, scale * mix(.044, .072, snowOptions.y));
      #include <logdepthbuf_vertex>
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec4 vFlake;
      uniform float snowNight;
    `).replace("#include <map_particle_fragment>", `
      vec2 p = gl_PointCoord - .5;
      float c = cos(vFlake.z), s = sin(vFlake.z);
      vec2 shape = mat2(c, s, -s, c) * p + .5;
      if (min(shape.x, shape.y) < 0. || max(shape.x, shape.y) > 1.) discard;
      vec2 tile = (shape * 47. + .5) / 48.;
      vec4 stamp = texture2D(map, vec2((vFlake.y + tile.x) / 3., tile.y));
      float crystalline = step(.5, vFlake.y);
      float blur = (1. - smoothstep(.03, .53, length(p))) * .43;
      float form = mix(max(stamp.a, blur), stamp.a, crystalline);
      float core = smoothstep(.08, .79, form);
      vec3 dayTint = mix(vec3(.39,.57,.74), vec3(1.), core);
      vec3 nightTint = mix(vec3(.58,.77,1.), vec3(.96,.99,1.), core);
      diffuseColor.rgb *= mix(dayTint, nightTint, snowNight);
      diffuseColor.rgb += crystalline * vFlake.w * vec3(.13,.17,.20);
      diffuseColor.a *= vFlake.x * form * (1. + crystalline * vFlake.w * .24);
    `);
  };
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 6;
  points.frustumCulled = false;
  parent.add(points);
  return { field, anchor: anchor.value };
}

export function createWinterSnow(parent, random, reduced) {
  const atlas = flakeAtlas();
  const uniforms = {
    snowTime: { value: 0 },
    snowStorm: { value: 0 },
    snowWind: { value: 0 },
    snowNight: { value: 0 },
    snowTree: { value: new THREE.Vector2(WINTER_TREE.x, WINTER_TREE.z) },
    snowShelter: { value: new THREE.Vector2(...WINTER_TREE.shelter) },
  };
  const fields = winterSnowFields.map(field => createField(parent, field, random, reduced, uniforms, atlas));
  let wind = 0;
  let previous = 0;
  return (player, camera, time, night, whaleWind) => {
    const storm = Math.min(1, winterSnowStrength(time) + whaleWind * .35);
    wind = (time < previous ? 0 : wind) + Math.max(0, time - previous) * (.61 + storm * 2.01);
    previous = time;
    uniforms.snowTime.value = time;
    uniforms.snowStorm.value = storm;
    uniforms.snowWind.value = wind + 1.58 * Math.sin(time * .27) + .78 * Math.sin(time * .61);
    uniforms.snowNight.value = night;
    for (const { field, anchor } of fields) {
      const subject = field.camera ? camera.position : player;
      if (field.fixed) anchor.set(0, field.lift, 0);
      else anchor.set(subject.x, subject.y + field.lift, subject.z);
    }
  };
}
