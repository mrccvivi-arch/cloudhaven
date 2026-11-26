import * as THREE from "three";
import { seeded } from "./map.js";
import { islandHeight, POND, pondDistance } from "./summer-layout.js";

const COUNT = 26;
const TAU = 2 * Math.PI;
const { lerp, smoothstep } = THREE.MathUtils;

export function createPondFireflies(parent) {
  const random = seeded(1903);
  const geometry = new THREE.BufferGeometry();
  const attribute = (key, width) => {
    const data = new THREE.BufferAttribute(new Float32Array(COUNT * width), width).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(key, data);
    return data;
  };
  const positions = attribute("position", 3);
  const intensity = attribute("intensity", 1);
  const size = attribute("size", 1);
  const hue = attribute("hue", 1);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float intensity, size, hue;
      varying vec2 glow;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.);
        glow = vec2(intensity, hue);
        gl_PointSize = clamp(size * 320. / max(.1, -view.z), 2., 35.);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      varying vec2 glow;
      void main() {
        float r = length(gl_PointCoord * 2. - 1.);
        float halo = pow(1. - smoothstep(0., 1., r), 2.3);
        float core = 1. - smoothstep(.12, .30, r);
        vec3 tint = mix(vec3(1., .72, .26), vec3(.65, .90, .26), glow.y);
        gl_FragColor = vec4(mix(tint, vec3(1., 1., .78), core * .75), (halo * .38 + core * .60) * glow.x);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  points.frustumCulled = false;
  points.renderOrder = 5;
  points.name = "summer-pond-fireflies";
  parent.add(points);
  const motes = Array.from({ length: COUNT }, (_, index) => {
    size.setX(index, .35 + random() * .34);
    hue.setX(index, random() < .25 ? .70 : random() * .22);
    return { phase: random() * TAU, speed: .13 + random() * .35,
      radius: .35 + random() * 1.04, lift: .29 + random() * 1.19 };
  });
  let inside = false, orbitAt = -Infinity, orbitFor = 0, nextApproach = 0, orbitSpoken = false, nextFrame = 0;
  let orbitX = POND.x, orbitZ = POND.z, releasedAt = -Infinity;
  return {
    pause() {
      points.visible = inside = false;
      orbitAt = releasedAt = -Infinity;
      nextApproach = nextFrame = 0;
    },
    update(time, darkness, player, emit, weather) {
      const distance = player ? Math.hypot(player.x - POND.x, player.z - POND.z) : Infinity;
      points.visible = darkness > .015 && distance < 49;
      if (!points.visible) {
        if (inside) releasedAt = time;
        inside = false;
        return;
      }
      const withinPond = distance < 10.6 && player.y < POND.y + 4.5;
      if (withinPond && !inside && time >= nextApproach) {
        orbitAt = time;
        releasedAt = Infinity;
        orbitFor = 5 + random() * 3;
        nextApproach = time + 32;
        orbitSpoken = false;
        emit?.("summer-fireflies-near");
      }
      if (withinPond && releasedAt === Infinity) {
        orbitX = player.x;
        orbitZ = player.z;
      } else if (inside && releasedAt === Infinity) {
        releasedAt = time;
      }
      inside = withinPond;
      const elapsed = time - orbitAt;
      const orbit = smoothstep(elapsed, 0, 1.4) * (1 - smoothstep(elapsed, orbitFor - 1.5, orbitFor)) *
        (1 - smoothstep(time - releasedAt, 0, 1.4));
      if (orbit > .6 && !orbitSpoken) {
        orbitSpoken = true;
        emit?.("summer-fireflies-around");
      }
      if (time < nextFrame) return;
      nextFrame = time + (distance > 24 ? .12 : 0);
      motes.forEach(({ phase, radius, lift, speed }, i) => {
        const angle = time * speed + phase + .23 * Math.sin(time * .27 + phase);
        const wander = radius + .15 * Math.sin(time * .36 + phase);
        let x = POND.x + Math.cos(angle) * POND.rx * wander;
        let z = POND.z + Math.sin(angle) * POND.rz * wander;
        if (i < 5 && orbit > 0) {
          const circling = time * .64 + phase;
          x = lerp(x, orbitX + Math.cos(circling) * 2.55, orbit);
          z = lerp(z, orbitZ + Math.sin(circling) * 2.55, orbit);
        }
        x += (weather?.x ?? 0) * .49;
        z += (weather?.z ?? 0) * .49;
        const floor = islandHeight(x, z);
        const water = pondDistance(x, z);
        const height = Math.max(floor, water < 1 ? POND.y : floor) + lift + .21 * Math.sin(angle * 2.1);
        positions.setXYZ(i, x, height, z);
        const pulse = Math.sin(time * (1.07 + speed * 2.8) + phase) * .55 +
          Math.sin(time * (.63 + speed) + phase * 2.6) * .45;
        intensity.setX(i, darkness * (.27 + .73 * smoothstep(pulse, -.46, .73)) * (1 - smoothstep(distance, 35, 49)));
      });
      positions.needsUpdate = intensity.needsUpdate = true;
    },
  };
}
