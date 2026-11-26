import * as THREE from "three";
import { DAY_LENGTH, NIGHT_LENGTH, nightBlend } from "./day-night.js";
import { seeded } from "./map.js";

const smooth = THREE.MathUtils.smoothstep;

export function solarPhase(time) {
  const daylight = THREE.MathUtils.clamp(time / DAY_LENGTH, 0, 1);
  const night = nightBlend(time);
  // During the last part of the night, prepare the eastern colors for sunrise.
  const morning = time < DAY_LENGTH / 2 || time > DAY_LENGTH + NIGHT_LENGTH / 2;
  const arc = time >= DAY_LENGTH && morning ? 0 : daylight;
  const twilight = 1 - smooth(Math.min(arc, 1 - arc), 0, .24);
  return { arc, night, twilight, morning };
}

export function sunDirection(arc, direction) {
  const angle = Math.PI * arc;
  return direction.set(Math.cos(angle), .045 + Math.sin(angle) * 1.44, -.28 - Math.sin(angle) * .29).normalize();
}

const CLOUD_WIDTH = 192;
const CLOUD_HEIGHT = 96;

export function cloudPixels(seed, edgeFade = false) {
  const random = seeded(seed);
  const alpha = new Float32Array(CLOUD_WIDTH * CLOUD_HEIGHT);
  const luminance = new Float32Array(alpha.length);

  function puff(x, y, wider, higher) {
    const left = Math.max(0, Math.floor(x - wider));
    const right = Math.min(CLOUD_WIDTH, Math.ceil(x + wider));
    const top = Math.max(0, Math.floor(y - higher));
    const bottom = Math.min(CLOUD_HEIGHT, Math.ceil(y + higher));
    for (let row = top; row < bottom; row++) {
      const dy = (row + .5 - y) / higher;
      const shade = .97 - .2 * smooth(dy, -.4, .96);
      for (let col = left; col < right; col++) {
        const dx = (col + .5 - x) / wider;
        const opacity = .96 * (1 - smooth(dx * dx + dy * dy, .22, 1));
        const index = (CLOUD_HEIGHT - 1 - row) * CLOUD_WIDTH + col;
        luminance[index] = shade * opacity + luminance[index] * (1 - opacity);
        alpha[index] = opacity + alpha[index] * (1 - opacity);
      }
    }
  }

  puff(94, 63, 80, 22);
  for (let i = 0; i < 7; i++) {
    const x = 30 + 21 * i + (random() - .5) * 10;
    const middle = Math.sin(Math.PI * (i + .35) / 7);
    puff(x, 64 - middle * (13 + random() * 12), 20 + random() * 19, 14 + middle * (13 + random() * 13));
  }
  for (let i = 0; i < 4; i++) puff(35 + 40 * i, 64 + random() * 7, 26 + random() * 13, 11 + random() * 6);

  // Keep RGB achromatic even where alpha is zero, independent of Canvas2D upload.
  const data = new Uint8Array(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) {
    const value = Math.round(255 * (alpha[i] ? luminance[i] / alpha[i] : .84));
    const offset = i * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value;
    const x = i % CLOUD_WIDTH, y = Math.floor(i / CLOUD_WIDTH);
    const fade = edgeFade ? smooth(Math.min(x, CLOUD_WIDTH - 1 - x), 0, 24) *
      smooth(Math.min(y, CLOUD_HEIGHT - 1 - y), 0, 14) : 1;
    data[offset + 3] = Math.round(alpha[i] * fade * 255);
  }
  return data;
}

export function cloudTexture(seed, edgeFade = false) {
  const texture = new THREE.DataTexture(cloudPixels(seed, edgeFade), CLOUD_WIDTH, CLOUD_HEIGHT);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

const colors = {
  noon: { top: 0x337fbf, horizon: 0xbdddf0, haze: 0xe9f4f6, cloud: 0xffffff },
  summer: { top: 0x3e94d6, horizon: 0xbce5fa, haze: 0xe1f5ff, cloud: 0xffffff },
  summerNight: { top: 0x173664, horizon: 0x365b86, haze: 0x365b86, cloud: 0x799aca },
  forest: { top: 0x79b9ec, horizon: 0xc6e5f5, haze: 0xb7d9ef, cloud: 0xffffff },
  dawn: { top: 0x6d9bd0, horizon: 0xc6dceb, haze: 0xffd5a1, cloud: 0xffe2bf },
  dusk: { top: 0x8d86bd, horizon: 0xf4c4cc, haze: 0xffb27d, cloud: 0xffcbb4 },
  night: { top: 0x101a34, horizon: 0x142545, haze: 0x142545, cloud: 0x7386b4 },
};

export function createAtmosphere(sky) {
  const uniforms = {
    topColor: { value: new THREE.Color() },
    horizonColor: { value: new THREE.Color() },
    hazeColor: { value: new THREE.Color() },
    sun: { value: new THREE.Vector3() },
    daylight: { value: 1 },
    warmth: { value: 0 },
    forest: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w * .999;
      }`,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform vec3 topColor, horizonColor, hazeColor, sun;
      uniform float daylight, warmth, forest;
      void main() {
        vec3 direction = normalize(skyDirection);
        float h = max(0., direction.y);
        float facing = max(0., dot(direction, sun));
        float elevation = smoothstep(0., .81, pow(h, mix(.47, .31, forest)));
        vec3 color = mix(horizonColor, topColor, elevation);
        float aerosol = exp(-h * (7. + warmth * 3.));
        float forwardGlow = pow(facing, 9.);
        color = mix(color, hazeColor, daylight * aerosol * (.13 + .28 * forwardGlow + .22 * warmth) * mix(1., .66, forest));
        color += daylight * (vec3(.31,.20,.105) * pow(facing, 120.) + vec3(.11,.10,.09) * forwardGlow);
        float disc = smoothstep(.99965, .99991, facing);
        color = mix(color, vec3(1.,.93,.75), smoothstep(.36, .66, daylight) * disc * .98);
        gl_FragColor = vec4(color, 1.);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(95, 24, 12), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  sky.add(dome);

  // High, distant cumulus sit behind the existing lower lookout cloud banks.
  const textures = [cloudTexture(26), cloudTexture(98), cloudTexture(555)];
  const random = seeded(641);
  const clouds = Array.from({ length: 11 }, (_, index) => {
    const phase = (index + (random() - .5) * .85) / 11 * Math.PI * 2;
    const y = index % 3 === 0 ? .048 + random() * .076 : .105 + random() * .22;
    const width = 13 + random() * 17;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: textures[index % textures.length], transparent: true,
      depthTest: true, depthWrite: false, blending: THREE.NormalBlending,
      fog: false, toneMapped: false,
    }));
    sprite.scale.set(width, width * (.37 + random() * .14), 1);
    // Composite behind the nearer transparent cloud banks and effects.
    sprite.renderOrder = -10;
    sky.add(sprite);
    return { sprite, phase, y, opacity: .65 + random() * .31 };
  });
  const palette = Object.fromEntries(Object.entries(colors).map(([phase, set]) =>
    [phase, Object.fromEntries(Object.entries(set).map(([key, value]) => [key, new THREE.Color(value)]))]));
  const skyColors = [["top", uniforms.topColor.value], ["horizon", uniforms.horizonColor.value], ["haze", uniforms.hazeColor.value]];
  const cloudColor = new THREE.Color();
  let drift = 0;

  return {
    direction: uniforms.sun.value,
    update({ arc, night, twilight, morning }, dt, forest = false, summer = false) {
      sunDirection(arc, uniforms.sun.value);
      const warm = morning ? palette.dawn : palette.dusk;
      const daylight = 1 - night;
      uniforms.daylight.value = daylight;
      uniforms.warmth.value = twilight;
      uniforms.forest.value = forest ? daylight : 0;
      const noon = summer ? palette.summer : forest ? palette.forest : palette.noon;
      const darkness = summer ? palette.summerNight : palette.night;
      for (const [key, color] of skyColors) {
        color.copy(noon[key]).lerp(warm[key], summer ? twilight * .20 : twilight).lerp(darkness[key], night);
      }
      cloudColor.copy(palette.noon.cloud).lerp(warm.cloud, twilight * .79).lerp(palette.night.cloud, night);
      drift += dt;
      for (const { sprite, phase, y, opacity } of clouds) {
        sprite.visible = !summer;
        if (summer) continue;
        const angle = phase + drift * .0023;
        const radius = 83 * Math.sqrt(1 - y * y);
        sprite.position.set(Math.sin(angle) * radius, y * 83 + Math.sin(phase + drift * .017) * .58, Math.cos(angle) * radius);
        sprite.material.color.copy(cloudColor);
        sprite.material.opacity = opacity * (daylight * .9 + .07);
      }
    },
  };
}
