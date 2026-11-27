import { WINTER } from "./winter-layout.js";
import { CYCLE_LENGTH } from "./day-night.js";
import { createSummerLight } from "./summer-light.js";
import { SUMMER } from "./summer-layout.js";
import * as THREE from "three";
import { seeded } from "./map.js";
import { createAtmosphere, solarPhase } from "./atmosphere.js";

const MASK_SIZE = 64;

export function moonlightMask(kind) {
  const pixels = new Uint8Array(MASK_SIZE * MASK_SIZE * 4).fill(255);
  const smooth = THREE.MathUtils.smoothstep;
  for (let y = 0; y < MASK_SIZE; y++) {
    for (let x = 0; x < MASK_SIZE; x++) {
      const px = x + .5;
      const py = MASK_SIZE - y - .5;
      const radius = Math.hypot(px - 32, py - 32);
      const alpha = kind === "moon"
        ? (1 - smooth(radius, 24.4, 25.6)) * smooth(Math.hypot(px - 43, py - 23), 22.4, 23.6)
        : Math.max(0, 1 - radius / 32) ** 2.15;
      pixels[(y * MASK_SIZE + x) * 4 + 3] = Math.round(255 * alpha);
    }
  }
  return pixels;
}

function maskTexture(kind) {
  const texture = new THREE.DataTexture(moonlightMask(kind), MASK_SIZE, MASK_SIZE);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function sprite(parent, map, color, size) {
  const material = new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const object = new THREE.Sprite(material);
  object.scale.set(size, size, 1);
  parent.add(object);
  return object;
}

export function createMoonlight(scene) {
  const hemisphere = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const sky = new THREE.Group();
  scene.add(hemisphere, key, sky);

  const atmosphere = createAtmosphere(sky);
  const summerLight = createSummerLight();
  const regularMoon = new THREE.Vector3(58, 4, -58);
  const summerDirection = new THREE.Vector3();
  const showerHaze = new THREE.Color(0xc8dae6);
  const glowMap = maskTexture("glow");
  const moonMap = maskTexture("moon");
  const moon = sprite(sky, moonMap, 0xe3edff, 7.2);
  const moonGlow = sprite(sky, glowMap, 0x91b9ff, 16);
  moon.position.set(58, 4, -58);
  moonGlow.position.copy(moon.position);
  moonGlow.renderOrder = -5;
  moon.renderOrder = -4;

  const random = seeded(312);
  const starPositions = [];
  const ordinaryStars = 144, summerStars = 390;
  const starDetail = [];
  const detailRandom = seeded(3921);
  for (let i = 0; i < summerStars; i++) {
    const angle = random() * Math.PI * 2;
    const y = random() ** 1.6 * .65 + .005;
    const radius = 81 * Math.sqrt(1 - y * y);
    starPositions.push(radius * Math.cos(angle), y * 81, radius * Math.sin(angle));
    const choice = detailRandom();
    starDetail.push(.58 + choice ** 1.8 * 1.03, .47 + choice * .53,
      detailRandom() * 2 * Math.PI, detailRandom() < .18 ? .15 : 0);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    map: glowMap, color: 0xdbeaff, size: .38, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }));
  const starClock = { value: 0 }, summerStarStyle = { value: 0 };
  starGeometry.setAttribute("summerDetail", new THREE.Float32BufferAttribute(starDetail, 4));
  stars.material.onBeforeCompile = (shader) => {
    shader.uniforms.summerStyle = summerStarStyle;
    shader.uniforms.starClock = starClock;
    shader.vertexShader = `attribute vec4 summerDetail;
      uniform float summerStyle, starClock;
      varying float starAlpha;
      ${shader.vertexShader}`.replace("gl_PointSize = size;", `
        gl_PointSize = size * mix(1., summerDetail.x, summerStyle);
        starAlpha = mix(1., summerDetail.y * (1. + summerDetail.w * sin(starClock + summerDetail.z)), summerStyle);`);
    shader.fragmentShader = `varying float starAlpha;
      ${shader.fragmentShader}`.replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.a *= starAlpha;");
  };
  sky.add(stars);

  const day = {
    [WINTER]: new THREE.Color(0xafccef), ground: new THREE.Color(0xa8cfe9), sky: new THREE.Color(0xd4e2f5), [SUMMER]: new THREE.Color(0x9fd1e9),
    ambient: new THREE.Color(0xfff0d5), bounce: new THREE.Color(0x92b5a5), key: new THREE.Color(0xffebc5),
    warmKey: new THREE.Color(0xffc08d),
    warmAmbient: new THREE.Color(0xffded4),
  };
  const forestDay = {
    ambient: new THREE.Color(0xebf5ff), bounce: new THREE.Color(0x91b29a), key: new THREE.Color(0xffedce),
  };
  const summerDay = {
    ambient: new THREE.Color(0xeaf6ff), bounce: new THREE.Color(0xb3cec8), key: new THREE.Color(0xfff7e6),
  };
  const summerNight = {
    ambient: new THREE.Color(0xc2ddff), bounce: new THREE.Color(0xa2b9d6), key: new THREE.Color(0xc8deff),
    direction: new THREE.Vector3(9, 20, 13),
  };
  const night = {
    [WINTER]: new THREE.Color(0x3e5785), ground: new THREE.Color(0x142545), sky: new THREE.Color(0x1c2d53), [SUMMER]: new THREE.Color(0x31567f),
    ambient: new THREE.Color(0xaac8ff), bounce: new THREE.Color(0x8a9bbf), key: new THREE.Color(0xb6d3ff),
    direction: new THREE.Vector3(12, 20, -18),
  };

  const winterSun = new THREE.Vector3(38, 25, -11);
  const winterDay = {
    ambient: new THREE.Color(0xe0edff), bounce: new THREE.Color(0xaecbf1), key: new THREE.Color(0xfff8ed),
  };
  const winterNight = {
    ambient: new THREE.Color(0xc5dbff), bounce: new THREE.Color(0x99b2e2), key: new THREE.Color(0xecf3ff),
    direction: new THREE.Vector3(-31, 22, -9),
  };

  return {
    objects: [hemisphere, key, sky],
    summerLook: summerLight.look,
    update(time, layer, camera, elapsed = 0, weather) {
      const phase = solarPhase(time);
      const blend = phase.night;
      const forest = layer === "ground";
      const summer = layer === SUMMER;
      const winter = layer === WINTER;
      const light = winter ? winterDay : summer ? summerDay : forest ? forestDay : day;
      const darkLight = winter ? winterNight : summer ? summerNight : night;
      const warmth = phase.twilight * (winter ? .07 : summer ? .22 : 1);
      const look = summer ? summerLight.update(time) : undefined;
      const overcast = summer ? weather?.overcast ?? 0 : 0;
      atmosphere.update(phase, elapsed, forest, summer, look, overcast, winter);
      scene.background.copy(day[layer]).lerp(night[layer], blend);
      scene.fog.color.copy(scene.background);
      scene.fog.near = winter ? 116 : summer ? 87 : THREE.MathUtils.lerp(forest ? 42 : 28, 28, blend);
      scene.fog.far = winter ? 260 : summer ? 218 : THREE.MathUtils.lerp(forest ? 100 : 86, 86, blend);
      hemisphere.color.copy(light.ambient).lerp(day.warmAmbient, warmth * .46).lerp(darkLight.ambient, blend);
      hemisphere.groundColor.copy(light.bounce).lerp(darkLight.bounce, blend);
      hemisphere.intensity = THREE.MathUtils.lerp(forest ? 1.34 : summer ? 1.55 : 1.77, summer ? 1.45 : 1.03, blend);
      key.color.copy(light.key).lerp(day.warmKey, warmth * .7).lerp(darkLight.key, blend);
      key.intensity = THREE.MathUtils.lerp((forest ? 1.88 : summer ? 1.62 : 1.99) - warmth * .44, summer ? .79 : .58, blend);
      const moonDirectionBlend = THREE.MathUtils.smoothstep(blend, .64, 1);
      if (summer) key.position.set(atmosphere.direction.x * 15 - 10, 20, 12);
      else key.position.copy(atmosphere.direction).multiplyScalar(25);
      key.position.lerp(darkLight.direction, moonDirectionBlend);
      if (winter) {
        hemisphere.intensity = THREE.MathUtils.lerp(1.09, 1.00, blend);
        key.intensity = THREE.MathUtils.lerp(2.02, 1.13, blend);
        key.position.copy(winterSun).lerp(winterNight.direction, blend);
      }
      sky.position.copy(camera.position);
      if (look) {
        scene.background.lerp(look.horizon, look.skyMix).lerp(showerHaze, overcast * .37);
        scene.fog.color.copy(scene.background);
        scene.fog.near = THREE.MathUtils.lerp(87, 113, look.star);
        scene.fog.far = THREE.MathUtils.lerp(218, 259, look.star);
        hemisphere.color.copy(look.ambient);
        hemisphere.groundColor.copy(look.bounce);
        hemisphere.intensity = look.fill;
        key.color.copy(look.key);
        key.intensity = look.direct * (1 - overcast * .24);
        summerDirection.set(look.sunDirection.x * 24, 9, look.sunDirection.z * 24)
          .lerp(summerNight.direction, look.moon);
        key.position.lerp(summerDirection, look.skyMix);
        moon.position.copy(look.moonDirection).multiplyScalar(82);
      } else {
        moon.position.copy(regularMoon);
      }
      moonGlow.position.copy(moon.position);
      const lunar = look?.moon ?? blend;
      moon.visible = moonGlow.visible = !winter && lunar > 0;
      stars.visible = (look?.star ?? blend) > 0;
      moon.scale.setScalar(look ? 9.4 : 7.2);
      moonGlow.scale.setScalar(look ? 20.5 : 16);
      moon.material.opacity = lunar;
      moonGlow.material.opacity = lunar * (look ? .64 : .48);
      starGeometry.setDrawRange(0, look ? summerStars : winter ? 78 : ordinaryStars);
      stars.material.size = look ? .71 : .38;
      summerStarStyle.value = look ? 1 : 0;
      starClock.value = time * (2 * Math.PI * 31 / CYCLE_LENGTH);
      stars.material.opacity = look ? look.star * (.87 + .05 * Math.sin(time * Math.PI * 2 * 76 / CYCLE_LENGTH)) : blend * (winter ? .60 : .9);
    },
    attachCharge(root) {
      const group = new THREE.Group();
      group.visible = false;
      root.add(group);
      const halo = sprite(group, glowMap, 0x9ecaff, 2.65);
      halo.position.y = .8;
      const marker = sprite(group, moonMap, 0xcdeaff, .34);
      marker.position.y = 1.94;
      const positions = new Float32Array(8 * 3);
      const geometry = new THREE.BufferGeometry();
      const vertices = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", vertices);
      const sparks = new THREE.Points(geometry, new THREE.PointsMaterial({
        map: glowMap, color: 0xe0f3ff, size: .17, opacity: .9, transparent: true,
        depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
      }));
      sparks.frustumCulled = false;
      group.add(sparks);

      let strength = 0;
      let phase = 0;
      return (charging, elapsed) => {
        strength = THREE.MathUtils.clamp(strength + (charging ? 1 : -1) * elapsed * 3, 0, 1);
        group.visible = strength > 0;
        if (!group.visible) return;
        phase += elapsed;
        halo.material.opacity = strength * .36;
        marker.material.opacity = strength * .95;
        sparks.material.opacity = strength * .9;
        for (let i = 0; i < vertices.count; i++) {
          const rise = (phase * .48 + i / vertices.count) % 1;
          const angle = i * 2.399 + phase * .65;
          const orbit = .74 + .22 * Math.sin(i * 2.1);
          vertices.setXYZ(i, Math.cos(angle) * orbit, .24 + rise * 1.5, Math.sin(angle) * orbit);
        }
        vertices.needsUpdate = true;
      };
    },
  };
}
