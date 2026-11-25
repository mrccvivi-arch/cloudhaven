import * as THREE from "three";
import { GOLDEN_GINKGO, seeded, terrainHeight } from "./map.js";

const { x, z, canopyRadius } = GOLDEN_GINKGO;
const TAU = 2 * Math.PI;

export function createLeafGlow(geometry, material, count) {
  const glow = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("leafGlow", glow);
  const tint = new THREE.Color(0xffce83);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.leafGlowTint = { value: tint };
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute float leafGlow;
      varying float vLeafGlow;
    `).replace("#include <begin_vertex>", `
      #include <begin_vertex>
      vLeafGlow = leafGlow;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform vec3 leafGlowTint;
      varying float vLeafGlow;
    `).replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      totalEmissiveRadiance += leafGlowTint * vLeafGlow;
    `);
  };
  const random = seeded(8317);
  const strengths = Array.from({ length: count }, () => 0);
  const slots = strengths.map((_, i) => i);
  // Keep roughly one in five leaves luminous, with independent brightness.
  for (let i = 0; i < Math.round(count * .2); i++) {
    const slot = Math.floor(random() * slots.length);
    strengths[slots.splice(slot, 1)[0]] = .18 + random() * .30;
  }
  return { attribute: glow, strengths };
}

export function createGinkgoNight(parent) {
  // A bounded fill with no inverse-square hotspot on the nearby trunk.
  const light = new THREE.PointLight(0xffc481, 0, 7.8, 0);
  light.name = "Ginkgo warm clearing light";
  light.position.set(.2, 2.1, 1.05);
  parent.add(light);

  const count = 21;
  const random = seeded(7131);
  const fireflies = Array.from({ length: count }, (_, i) => {
    const angle = random() * TAU;
    const rising = i % 5 === 0;
    const radius = rising ? .75 + random() * 1.45 : 1.5 + Math.sqrt(random()) * (canopyRadius - 2.1);
    const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
    return {
      x: dx, z: dz, ground: terrainHeight(x + dx, z + dz) - parent.position.y,
      rising, phase: random() * TAU, rate: .19 + random() * .38,
      height: .52 + random() * 2.55, drift: .22 + random() * .62, brightness: .76 + random() * .24,
    };
  });
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const brightness = new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("brightness", brightness);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.6, 0), 7);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { night: { value: 0 }, projectionScale: { value: 1 }, tint: { value: new THREE.Color(0xffce83) } },
    vertexShader: `
      attribute float brightness;
      varying float glow;
      uniform float projectionScale;
      void main() {
        vec4 point = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * point;
        gl_PointSize = clamp(projectionScale * 0.24 / max(0.1, -point.z), 4.0, 22.0);
        glow = brightness;
      }
    `,
    fragmentShader: `
      uniform float night;
      uniform vec3 tint;
      varying float glow;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        float core = 1.0 - smoothstep(0.08, 0.28, radius);
        float edge = 1.0 - smoothstep(0.05, 0.5, radius);
        vec3 color = mix(tint, vec3(1.0, 0.88, 0.66), core * 0.75);
        gl_FragColor = vec4(color, glow * night * (0.71 * core + 0.28 * edge * edge));
        #include <colorspace_fragment>
      }
    `,
  });
  const sparks = new THREE.Points(geometry, material);
  sparks.name = "Ginkgo fireflies";
  sparks.visible = false;
  const viewport = new THREE.Vector2();
  sparks.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(viewport);
    material.uniforms.projectionScale.value = viewport.y * camera.projectionMatrix.elements[5] * .5;
  };
  parent.add(sparks);

  let elapsed = 0, time = 0;
  return (distance, dt, night) => {
    // The same twilight blend eases in the light without changing the world palette.
    light.intensity = night * .79;
    const visible = night > 0 && distance < 22;
    if (!visible) {
      sparks.visible = false;
      elapsed = 0;
      return;
    }
    elapsed += dt;
    if (sparks.visible && elapsed < (distance > canopyRadius + .8 ? .16 : .033)) return;
    time += elapsed;
    elapsed = 0;
    material.uniforms.night.value = night;
    fireflies.forEach((fly, i) => {
      const clock = time * fly.rate + fly.phase;
      const rise = (clock / TAU) % 1;
      const hover = Math.sin(clock * 1.26 + fly.phase) * .31;
      const height = fly.rising ? .14 + (fly.height + .8) * rise : fly.height + hover;
      const pulse = .56 + .44 * Math.cos(clock + Math.sin(clock * .42 + fly.phase));
      const fade = fly.rising
        ? THREE.MathUtils.smoothstep(rise, 0, .16) * (1 - THREE.MathUtils.smoothstep(rise, .72, 1))
        : THREE.MathUtils.smoothstep(pulse, .11, .31) * (.47 + .53 * pulse);
      positions.setXYZ(i, fly.x + Math.sin(clock) * fly.drift, fly.ground + height,
        fly.z + Math.cos(clock * .83 + fly.phase) * fly.drift);
      brightness.setX(i, fade * fly.brightness);
    });
    positions.needsUpdate = brightness.needsUpdate = true;
    sparks.visible = true;
  };
}
