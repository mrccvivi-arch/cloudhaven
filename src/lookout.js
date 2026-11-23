import * as THREE from "three";
import { PLATFORMS, seeded } from "./map.js";

export const LOOKOUT_ON_SECONDS = 2;
export const LOOKOUT_OFF_SECONDS = 1.5;
const RUNE_INTERVAL = .24;
const RUNE_COUNT = 6;
export function activeRunes(elapsed) {
  return Math.max(0, Math.min(RUNE_COUNT, 1 + Math.floor(elapsed / RUNE_INTERVAL)));
}

function sparkTexture() {
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      data.set([255, 255, 255, 255 * Math.max(0, 1 - Math.hypot(x - 7.5, y - 7.5) / 7.5) ** 1.6], offset);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function points(parent, data, texture, size) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
  const material = new THREE.PointsMaterial({
    map: texture, color: 0xd9edff, size, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.visible = false;
  parent.add(mesh);
  return mesh;
}

export function createLookout(parent, lamp, clouds) {
  const { x, y, z, w, d } = PLATFORMS.find(({ id }) => id === "overlook");
  const lampColor = new THREE.Color(0xe8cc9c);
  const gold = new THREE.Color(0xffe39b);
  const blue = new THREE.Color(0x89dfff);
  lamp.material = new THREE.MeshLambertMaterial({ color: lampColor, emissive: gold, emissiveIntensity: .05 });

  const haloMaterial = new THREE.ShaderMaterial({
    uniforms: { strength: { value: 0 }, aspect: { value: (w + 1.25) / (d + 1) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 surface;
      void main() { surface = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 surface;
      uniform float strength;
      uniform float aspect;
      void main() {
        vec2 edge = abs(surface - .5);
        float rim = max(edge.x, edge.y);
        float glow = exp(-abs(rim - .433) * 48.0);
        float circle = length((surface - .5) * vec2(aspect, 1.0));
        float roundGlow = exp(-abs(circle - .219) * 47.0);
        float core = 1.0 - smoothstep(.003, .019, abs(circle - .219));
        float alpha = max(glow * (1.0 - smoothstep(.455, .5, rim)), roundGlow * .46 + core * .45) * strength;
        vec3 tint = mix(vec3(.30,.71,1.), vec3(1.,.73,.34), smoothstep(.10,.90,surface.x));
        gl_FragColor = vec4(tint, alpha);
      }`,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.25, d + 1), haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(x, y + .064, z);
  halo.visible = false;
  parent.add(halo);

  const fill = new THREE.PointLight(0xaedfff, 0, 11, 2);
  fill.position.set(x, y + 2.8, z);
  parent.add(fill);

  const runeGeo = new THREE.OctahedronGeometry(.27);
  const runes = Array.from({ length: RUNE_COUNT }, (_, index) => {
    const tint = index % 2 ? gold : blue;
    const material = new THREE.MeshLambertMaterial({ color: 0x758198, emissive: tint, emissiveIntensity: .05 });
    const rune = new THREE.Mesh(runeGeo, material);
    const angle = Math.PI * index / (RUNE_COUNT - 1);
    rune.position.set(x - Math.cos(angle) * 4.08, y + .19, z - Math.sin(angle) * 3.22);
    rune.rotation.y = angle;
    rune.visible = false;
    parent.add(rune);
    return rune;
  });

  const crown = Array.from({ length: 3 }, (_, i) => {
    const rune = new THREE.Mesh(runeGeo, new THREE.MeshBasicMaterial({
      color: i % 2 ? gold : blue, toneMapped: false, transparent: true, depthWrite: false,
    }));
    rune.scale.set(.65, .94, .65);
    rune.position.set(lamp.position.x + (i - 1) * .64, lamp.position.y + .63 + (i === 1 ? .21 : 0), lamp.position.z);
    rune.visible = false;
    parent.add(rune);
    return rune;
  });

  const random = seeded(1217);
  const texture = sparkTexture();
  const seeds = Array.from({ length: 20 }, () => [random(), random(), random()]);
  const sparks = points(parent, new Float32Array(seeds.length * 3), texture, .3);
  sparks.frustumCulled = false;
  const distant = [];
  for (let n = 0; n < 22; n++) distant.push((random() - .5) * 58, 25 + random() * 9, -38 - random() * 24);
  const stars = points(parent, distant, texture, .46);
  let lit = false;
  let transition = 0;
  let elapsed = 0;
  let drift = 0;
  const baseColors = clouds.map(({ material }) => material.color.clone());

  return {
    restore(savedLit) { lit = savedLit; transition = 0; },
    toggle() {
      if (transition) return null;
      lit = !lit;
      elapsed = 0;
      transition = lit ? LOOKOUT_ON_SECONDS : LOOKOUT_OFF_SECONDS;
      return lit;
    },
    get transitioning() { return transition !== 0; },
    update(dt, night, onRune) {
      drift += dt;
      if (transition) {
        const previous = activeRunes(elapsed);
        elapsed = Math.min(transition, elapsed + dt);
        if (lit) {
          for (let i = previous; i < activeRunes(elapsed); i++) onRune?.(i);
        }
        if (elapsed >= transition) transition = 0;
      }
      const progress = transition ? THREE.MathUtils.smoothstep(elapsed / transition, 0, 1) : 1;
      const reveal = lit ? progress : 1 - progress;
      const strength = transition && lit ? .38 + reveal * .62 : reveal;
      lamp.material.color.copy(lampColor).lerp(gold, strength);
      lamp.material.emissiveIntensity = .05 + strength * (.79 + .44 * night);
      halo.visible = strength > 0;
      haloMaterial.uniforms.strength.value = strength * (.69 + .26 * night);
      fill.intensity = strength * (31 + 19 * night);

      runes.forEach((rune, i) => {
        const charge = transition && lit
          ? THREE.MathUtils.smoothstep(elapsed - i * RUNE_INTERVAL, -.11, .27) : strength;
        rune.visible = charge > .02;
        rune.material.color.setHex(0x758198).lerp(i % 2 ? gold : blue, charge);
        rune.material.emissiveIntensity = charge * (.87 + .32 * night);
        rune.position.y = y + .23 + charge * .16;
      });
      crown.forEach((rune, i) => {
        rune.visible = strength > 0;
        rune.rotation.y = drift * .48 + i;
        rune.material.opacity = strength;
      });
      clouds.forEach(({ mesh, material, tint }, index) => {
        mesh.position.x = Math.sin(drift * (.056 + index * .009) + index) * (1.45 + index * .18);
        mesh.position.z = Math.sin(drift * .042 + index) * 1.05;
        material.color.copy(baseColors[index]).lerp(tint, reveal);
        material.opacity = .94 + .06 * reveal;
        material.emissive.copy(tint);
        material.emissiveIntensity = .07 + reveal * (.39 + .24 * night);
      });
      stars.visible = reveal > .01;
      stars.material.opacity = reveal * (.51 + .33 * night) * (.88 + .12 * Math.sin(drift * 1.3));
      stars.position.x = Math.sin(drift * .09) * 1.2;

      sparks.visible = strength > .01;
      if (sparks.visible) {
        sparks.material.opacity = strength * (.72 + night * .18);
        const positions = sparks.geometry.attributes.position;
        seeds.forEach(([angle, radius, delay], i) => {
          const rise = (drift * .32 + delay) % 1;
          positions.setXYZ(i, x + Math.cos(angle * 6.28) * (radius * 4.1 + .15),
            y + .20 + rise * 3.5, z + Math.sin(angle * 6.28) * (radius * 3.5 + .15));
        });
        positions.needsUpdate = true;
      }
    },
  };
}
