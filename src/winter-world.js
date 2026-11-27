import * as THREE from "three";
import { seeded } from "./map.js";
import { createWinterGate } from "./winter-gate.js";
import { WINTER, WINTER_TREE, winterCanopy, winterHeight } from "./winter-layout.js";
import { createWinterSnow } from "./winter-snow.js";
import { createWinterTree } from "./winter-tree.js";
import { addGroundBlossoms } from "./winter-flowers.js";
import { createWinterMotion } from "./winter-motion.js";
import { createWinterWhale } from "./winter-whale.js";

function frostTexture() {
  const side = 128;
  const random = seeded(8831);
  const data = new Uint8Array(side * side * 4);
  for (let i = 0; i < data.length; i += 4) {
    const fleck = random();
    data[i] = fleck > .964 ? 171 + random() * 84 : random() * 18;
    data[i + 1] = random() * 255;
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, side, side);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function snowfield(root, night) {
  const ground = new THREE.PlaneGeometry(344, 344, 152, 152);
  ground.rotateX(-Math.PI / 2);
  const positions = ground.attributes.position;
  const palette = new Float32Array(positions.count * 3);
  const pearl = new THREE.Color(0xf1f5fc);
  const deep = new THREE.Color(0x8daed9);
  const lilac = new THREE.Color(0xa3abd6);
  const distant = new THREE.Color(0xabc5e6);
  const warm = new THREE.Color(0xf7d9a0);
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const height = winterHeight(x, z);
    positions.setY(i, height);
    const wave = .5 + .5 * Math.sin(x * .081 + z * .060 + .68 * Math.sin(z * .055));
    const route = 1 - THREE.MathUtils.smoothstep(Math.abs(Math.hypot(x / 55, z / 52) - 1), .045, .112);
    const patch = winterCanopy(x + 2.35 * Math.sin(z * .41), z + 1.8 * Math.sin(x * .27));
    const crest = THREE.MathUtils.smoothstep(wave, .36, .96);
    const offshore = THREE.MathUtils.smoothstep(Math.hypot(x, z), 69, 134);
    const swell = .49 + .51 * Math.sin(z * .13 - x * .077);
    const lee = THREE.MathUtils.smoothstep((winterHeight(x + .85, z - .46) - height) / .85, -.035, .21);
    tint.copy(deep).lerp(lilac, .27 * swell).lerp(pearl, .44 + .52 * crest)
      .lerp(deep, lee * (.22 + .17 * offshore)).lerp(pearl, route * .19)
      .lerp(distant, offshore * (.13 + .26 * swell)).lerp(warm, patch * .32);
    tint.toArray(palette, i * 3);
  }
  ground.setAttribute("color", new THREE.BufferAttribute(palette, 3));
  ground.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 });
  const frost = { value: frostTexture() };
  material.onBeforeCompile = shader => {
    shader.uniforms.fieldNight = night;
    shader.uniforms.fieldFrost = frost;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      varying vec2 vFrostPosition;
    `).replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vFrostPosition = position.xz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform float fieldNight;
      uniform sampler2D fieldFrost;
      varying vec2 vFrostPosition;
    `).replace("#include <opaque_fragment>", `
      vec2 uv = vFrostPosition * .25;
      vec2 frost = texture2D(fieldFrost, uv).rg;
      float distanceFade = 1. - smoothstep(13., 31., length(vViewPosition));
      vec3 view = normalize(vViewPosition);
      float facing = clamp(dot(normal, view), 0., 1.);
      float pearl = (1. - facing) * (1. - facing);
      float beds = .50 + .28 * sin(dot(vFrostPosition, vec2(.27,.14))) +
        .22 * sin(dot(vFrostPosition, vec2(-.15,.26)));
      float angle = dot(view, vec3(.43,.63,.64));
      float flash = smoothstep(.53, .85, frost.r) * (1. - smoothstep(.10, .40, abs(frost.g * 2. - 1. - angle)));
      outgoingLight += vec3(.70,.86,1.) * (pearl * .035 +
        flash * distanceFade * smoothstep(.39, .73, beds) * (.28 + fieldNight * .14));
      outgoingLight += diffuseColor.rgb * vec3(.65,.76,1.) * (.032 + fieldNight * .13);
      float day = 1. - fieldNight;
      float reflected = .37 + .63 * smoothstep(.34, .84, diffuseColor.r);
      outgoingLight += vec3(.83,.91,1.) * pearl * reflected * .045 * day;
      float blueValley = 1. - smoothstep(.40, .74, diffuseColor.r);
      outgoingLight *= mix(vec3(1.), vec3(.88,.94,1.), day * blueValley * .34);
      #include <opaque_fragment>
    `);
  };
  const floor = new THREE.Mesh(ground, material);
  root.add(floor);
  return floor;
}

function snowWaves(root) {
  const material = new THREE.ShaderMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true,
    uniforms: { clock: { value: 0 }, night: { value: 0 } },
    vertexShader: `varying vec2 wave; void main() {
      wave = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
    fragmentShader: `varying vec2 wave; uniform float clock, night; void main() {
      float profile = smoothstep(0., .36, wave.y) * (1. - smoothstep(.54, 1., wave.y));
      float end = smoothstep(0., .19, wave.x) * (1. - smoothstep(.77, 1., wave.x));
      float crest = .53 + .28 * sin(24. * wave.x + 5. * wave.y - clock * .52);
      float silk = .50 + .50 * sin(68. * wave.x + 17. * wave.y + sin(wave.x * 25. - clock));
      vec2 dust = wave * vec2(99., 21.) + vec2(clock * .66, -.32 * clock);
      vec2 cell = floor(dust);
      float seed = fract(sin(dot(cell, vec2(19.7, 137.1))) * 2387.46);
      vec2 point = vec2(.24 + .52 * seed, .24 + .52 * fract(seed * 31.));
      float flake = (1. - smoothstep(.04, .18, length(fract(dust) - point))) * step(.43, seed);
      vec3 color = mix(vec3(.67,.83,1.), vec3(.60,.76,.95), night);
      gl_FragColor = vec4(mix(color, vec3(.95,.98,1.), flake), end * profile * (.044 + .076 * crest + .035 * silk + .56 * flake));
      #include <colorspace_fragment>
    }`,
  });
  const ribbons = [[0, 18, 22], [-32, -13, 27], [34, -43, 26]].map(([x, z, width], i) => {
    const geometry = new THREE.PlaneGeometry(1, 1, 38, 5);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    root.add(mesh);
    return { x, z, width, angle: .16 + i * .87, geometry };
  });
  return (time, night) => {
    material.uniforms.clock.value = time;
    material.uniforms.night.value = night;
    for (const { x, z, width, angle, geometry } of ribbons) {
      const positions = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      for (let i = 0; i < positions.count; i++) {
        const across = uv.getX(i) * 2 - 1;
        const layer = uv.getY(i);
        const crest = 4.1 * across * across + 1.22 * Math.sin(across * 2.6 + time * .21) + (layer - .5) * 7.1;
        const offset = 6.2 * Math.sin(time * .123 + angle);
        const px = x + across * width * Math.cos(angle) - (crest + offset) * Math.sin(angle);
        const pz = z + across * width * Math.sin(angle) + (crest + offset) * Math.cos(angle);
        const lift = Math.sin(Math.PI * layer) * (.40 + .33 * (1 - across * across));
        positions.setXYZ(i, px, winterHeight(px, pz) + .065 + lift, pz);
      }
      positions.needsUpdate = true;
    }
  };
}

export function createWinterWorld(reduced = false) {
  const root = new THREE.Group();
  root.name = "Snow Sea";
  const random = seeded(149016);
  const dayNight = { value: 0 };
  const clock = { value: 0 };
  const floor = snowfield(root, dayNight);
  const blossomGlints = addGroundBlossoms(root, dayNight, clock);
  const gate = createWinterGate(root, WINTER);
  const tree = createWinterTree(root, reduced);
  const waves = snowWaves(root);
  const snow = createWinterSnow(root, seeded(43287), reduced);
  const whale = createWinterWhale(root, random);
  const warmth = new THREE.PointLight(0xffcb83, 52, 24, 2);
  warmth.position.set(WINTER_TREE.x - .75, winterHeight(WINTER_TREE.x, WINTER_TREE.z) + 2.65, WINTER_TREE.z + 1.6);
  root.add(warmth);
  const shadowMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
    vertexShader: `varying vec2 shadowUV; void main() {
      shadowUV = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
    }`,
    fragmentShader: `varying vec2 shadowUV; void main() {
      float shadow = 1. - smoothstep(.13, 1., length(shadowUV));
      gl_FragColor = vec4(.090,.146,.245, .49 * shadow * shadow);
      #include <colorspace_fragment>
    }`,
  });
  const motion = createWinterMotion(root, dayNight, clock, reduced);
  let time = 0;
  return {
    root, shadowMaterial, occluders: [floor],
    enter() {
      time = 0;
      whale.enter();
      motion.clear();
    },
    clearMotion: motion.clear,
    update(player, camera, dt, night, step) {
      time += dt;
      const whaleWind = whale.update(dt, player, camera, night);
      gate(time, night);
      tree(time, night, camera);
      waves(time, night);
      snow(player, camera, time, night, whaleWind);
      dayNight.value = night;
      clock.value = time;
      blossomGlints(time);
      warmth.intensity = 37 + night * 108 + Math.sin(time * .43) * 2.5;
      return motion.update(player, camera, step, dt, time);
    },
    takeSighting: whale.takeSighting,
  };
}
