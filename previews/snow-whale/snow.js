import * as THREE from "three";
import { varyPointSize } from "./skin.js";

export function snowTexture(kind) {
  const side = 48;
  const data = new Uint8Array(side * side * 4);
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      const x = (column + .5) / side * 2 - 1;
      const y = (row + .5) / side * 2 - 1;
      const radius = Math.hypot(x, y);
      let opacity;
      let shade = 1;
      if (kind === "crystal" || kind === "fall") {
        const angle = Math.atan2(y, x);
        const sector = THREE.MathUtils.euclideanModulo(angle + Math.PI / 6, Math.PI / 3) - Math.PI / 6;
        const edge = Math.abs(radius * Math.cos(sector) - .67);
        const arms = 1 - THREE.MathUtils.smoothstep(Math.abs(radius * Math.sin(sector)), .025, .087);
        const hexagon = 1 - THREE.MathUtils.smoothstep(edge, .016, .09);
        const limit = 1 - THREE.MathUtils.smoothstep(radius, .77, .95);
        opacity = kind === "crystal" ? Math.max(.72 * hexagon, arms) * limit :
          Math.max(.82 * arms * limit, .57 * Math.max(0, 1 - radius) ** 1.8);
        shade = .83 + .17 * arms;
      } else {
        const core = (1 - THREE.MathUtils.smoothstep(radius, .16, .70)) ** 1.25;
        const halo = (1 - THREE.MathUtils.smoothstep(radius, .16, 1)) ** 1.5;
        const ray = (1 - THREE.MathUtils.smoothstep(Math.min(Math.abs(x), Math.abs(y)), .02, .14)) *
          (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(y)), .20, 1));
        opacity = Math.max(core, kind === "star" ? .64 * ray + .26 * halo : .40 * halo);
        shade = .66 + .34 * core;
      }
      const index = (row * side + column) * 4;
      data[index] = 255 * shade;
      data[index + 1] = 246 + 9 * shade;
      data[index + 2] = 255;
      data[index + 3] = 255 * opacity;
    }
  }
  const texture = new THREE.DataTexture(data, side, side);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function makePoints(scene, map, count, size, order) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.BufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const scales = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("color", colors);
  geometry.setAttribute("pointScale", scales);
  const material = new THREE.PointsMaterial({
    map, size, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
  });
  varyPointSize(material);
  const points = new THREE.Points(geometry, material);
  points.renderOrder = order;
  points.frustumCulled = false;
  scene.add(points);
  return { positions, colors, scales, material };
}

const interval = .10;
const longestLife = 12;
// Each pool has room for its full lifetime of emissions.
const wakeLayers = [
  { count: 728, rate: 6, size: .33, kind: "snow", strength: .85 },
  { count: 368, rate: 3, size: .36, kind: "star", strength: .95 },
  { count: 32, rate: 1, size: .76, kind: "crystal", strength: .86 },
];

export function createSnow(scene, random, whale, { weather = true, wakeClarity = 1 } = {}) {
  const maps = Object.fromEntries(["snow", "star", "crystal"].map(kind => [kind, snowTexture(kind)]));
  const snowfall = weather ? makePoints(scene, maps.snow, 666, .30, 2) : null;
  const layers = [
    { count: 84, width: 54, front: 26, depth: 21, height: 42, size: .85, opacity: .46 },
    { count: 244, width: 88, front: 5, depth: 48, height: 62, size: 1.13, opacity: .66 },
    { count: 338, width: 164, front: -43, depth: 75, height: 80, size: 1.84, opacity: .73 },
  ];
  const flakes = !weather ? [] : layers.flatMap(layer => Array.from({ length: layer.count }, () => ({
    x: (random() - .5) * layer.width, y: random() * layer.height, z: layer.front - random() * layer.depth,
    height: layer.height, speed: .53 + random() * 1.2, size: layer.size * (.50 + random() ** 2 * 1.16),
    opacity: layer.opacity * (.63 + random() * .37),
  })));
  flakes.forEach((flake, index) => {
    snowfall.scales.setX(index, flake.size);
    snowfall.colors.setXYZW(index, 1, 1, 1, 0);
  });

  const pools = wakeLayers.map(config => ({
    config, cursor: 0, points: makePoints(scene, maps[config.kind], config.count, config.size * wakeClarity, 3),
    particles: Array.from({ length: config.count }, () => ({
      position: new THREE.Vector3(), drift: new THREE.Vector3(), born: -Infinity,
      life: 0, strength: 0, phase: 0,
    })),
  }));

  const tail = new THREE.Vector3();
  const sideways = new THREE.Vector3();
  const behind = new THREE.Vector3();
  const pose = new THREE.Object3D();
  pose.scale.copy(whale.group.scale);
  const silver = new THREE.Color(0xf5fbff);
  const pearl = new THREE.Color(0xfcfaff);
  const blue = new THREE.Color(0x9ecfff);
  const violet = new THREE.Color(0xd3c5ff);
  const color = new THREE.Color();
  let emission = 0;

  function emit(time, samplePose) {
    samplePose(pose, time);
    pose.updateMatrix();
    sideways.set(0, 0, 1).applyQuaternion(pose.quaternion);
    behind.set(1, 0, 0).applyQuaternion(pose.quaternion);
    for (const pool of pools) {
      const crystal = pool.config.kind === "crystal";
      if (crystal && emission % 4 !== 0) continue;
      for (let i = 0; i < pool.config.rate; i++) {
        const index = pool.cursor;
        const particle = pool.particles[index];
        pool.cursor = (index + 1) % pool.particles.length;
        const span = (random() + random() - 1) * 3.8;
        whale.tailPoint(tail, time, span);
        tail.x += .4 + random() * .42;
        tail.y += (random() - .5) * .75;
        particle.position.copy(tail).applyMatrix4(pose.matrix);
        const spread = span * .24 + (random() - .5) * 1.8;
        particle.drift.copy(sideways).multiplyScalar(spread).addScaledVector(behind, .05 + random() * .37);
        particle.drift.y += (random() - .5) * .50;
        particle.born = time;
        particle.life = 8 + random() * 4;
        particle.phase = random() * Math.PI * 2;
        particle.strength = .54 + random() * .46;
        pool.points.scales.setX(index, .63 + random() ** 2 * (crystal ? .60 : 1.05));
      }
      pool.points.scales.needsUpdate = true;
    }
  }

  return {
    starTexture: maps.star,
    reset(history = longestLife) {
      emission = -Math.round(history / interval);
      for (const pool of pools) {
        pool.cursor = 0;
        for (const particle of pool.particles) particle.born = -Infinity;
      }
    },
    light(night) {
      if (!snowfall) return;
      snowfall.material.color.setHex(night ? 0xcce6ff : 0xf8fcff);
      snowfall.material.opacity = night ? .85 : .77;
    },
    update(time, weatherTime, samplePose, night, producing = true) {
      while (emission * interval <= time) {
        if (producing) emit(emission * interval, samplePose);
        emission++;
      }

      flakes.forEach((flake, index) => {
        const y = THREE.MathUtils.euclideanModulo(flake.y - weatherTime * flake.speed, flake.height);
        snowfall.positions.setXYZ(index, flake.x + 1.1 * Math.sin(weatherTime * .39 + index), y - 8, flake.z);
        const wrapFade = THREE.MathUtils.smoothstep(y, 0, 2) *
          (1 - THREE.MathUtils.smoothstep(y, flake.height - 2, flake.height));
        snowfall.colors.setW(index, flake.opacity * wrapFade);
      });
      if (snowfall) snowfall.positions.needsUpdate = snowfall.colors.needsUpdate = true;

      for (const { config, points, particles } of pools) {
        const crystal = config.kind === "crystal";
        const star = config.kind === "star";
        particles.forEach(({ position, drift, born, life, strength, phase }, i) => {
          const age = time - born;
          if (age >= life) {
            points.colors.setW(i, 0);
            return;
          }
          const spread = 4.1 * (1 - Math.exp(-age / 4.1));
          const sway = .63 * (Math.sin(age * .60 + phase) - Math.sin(phase));
          const fall = age * (crystal ? .51 : .19);
          points.positions.setXYZ(i, position.x + drift.x * spread + sway * .38,
            position.y + drift.y * spread - fall, position.z + drift.z * spread + sway);
          const fade = THREE.MathUtils.smoothstep(age, 0, .38) *
            (1 - THREE.MathUtils.smoothstep(age / life, .40, 1));
          color.copy(night ? silver : pearl);
          if (star && night) color.lerp(i % 13 === 0 ? violet : blue, .38 + .30 * Math.sin(phase));
          if (crystal) color.lerp(blue, night ? .33 : .24);
          const shimmer = star ? .87 + .13 * Math.sin(phase + age * 1.32) : 1;
          const alpha = Math.min(1, fade * strength * config.strength * shimmer * (night ? 1 : .91) * wakeClarity);
          points.colors.setXYZW(i, color.r, color.g, color.b, alpha);
        });
        points.positions.needsUpdate = points.colors.needsUpdate = true;
      }
    },
  };
}
