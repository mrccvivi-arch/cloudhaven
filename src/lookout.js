import * as THREE from "three";
import { PLATFORMS, seeded } from "./map.js";

export const LOOKOUT_SECONDS = 3;
const RUNE_INTERVAL = .35;
const RUNE_COUNT = 6;
export function lookoutProgress(elapsed) {
  return Math.min(1, Math.max(0, elapsed / LOOKOUT_SECONDS));
}
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
    uniforms: { strength: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 surface;
      void main() { surface = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 surface;
      uniform float strength;
      void main() {
        vec2 edge = abs(surface - .5);
        float rim = max(edge.x, edge.y);
        float glow = exp(-abs(rim - .433) * 48.0);
        float alpha = glow * (1.0 - smoothstep(.455, .5, rim)) * strength;
        vec3 tint = mix(vec3(.30,.71,1.), vec3(1.,.73,.34), smoothstep(.10,.90,surface.x));
        gl_FragColor = vec4(tint, alpha);
      }`,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(w + 1.25, d + 1), haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(x, y + .045, z);
  halo.visible = false;
  parent.add(halo);

  const runeGeo = new THREE.OctahedronGeometry(.19);
  const runes = Array.from({ length: RUNE_COUNT }, (_, index) => {
    const tint = index % 2 ? gold : blue;
    const material = new THREE.MeshLambertMaterial({ color: 0x758198, emissive: tint, emissiveIntensity: .05 });
    const rune = new THREE.Mesh(runeGeo, material);
    const angle = Math.PI * index / (RUNE_COUNT - 1);
    rune.position.set(x - Math.cos(angle) * 4.08, y + .19, z - Math.sin(angle) * 3.22);
    rune.rotation.y = angle;
    parent.add(rune);
    return rune;
  });

  const random = seeded(1217);
  const texture = sparkTexture();
  const seeds = Array.from({ length: 28 }, () => [random(), random(), random()]);
  const sparks = points(parent, new Float32Array(seeds.length * 3), texture, .26);
  sparks.frustumCulled = false;
  const distant = [];
  for (let n = 0; n < 22; n++) distant.push((random() - .5) * 58, 25 + random() * 9, -38 - random() * 24);
  const stars = points(parent, distant, texture, .46);
  let elapsed = -1;
  let drift = 0;
  const baseColors = clouds.map(({ material }) => material.color.clone());

  return {
    start() { if (elapsed < 0) elapsed = 0; },
    restore(lit) { if (lit && elapsed < 0) elapsed = LOOKOUT_SECONDS; },
    get lighting() { return elapsed >= 0 && elapsed < LOOKOUT_SECONDS; },
    update(dt, night, onRune) {
      drift += dt;
      if (this.lighting) {
        const previous = activeRunes(elapsed);
        elapsed = Math.min(LOOKOUT_SECONDS, elapsed + dt);
        for (let i = previous; i < activeRunes(elapsed); i++) onRune?.(i);
      }
      const lit = elapsed >= 0;
      const progress = lookoutProgress(elapsed);
      const reveal = THREE.MathUtils.smoothstep(progress, 0, 1);
      lamp.material.color.copy(lampColor).lerp(gold, lit ? .7 + .3 * reveal : 0);
      lamp.material.emissiveIntensity = lit ? .75 + .35 * night + .24 * Math.sin(drift * 3) * (1 - progress) : .05;
      halo.visible = lit;
      haloMaterial.uniforms.strength.value = lit ? .34 + .25 * reveal + .24 * night : 0;

      runes.forEach((rune, i) => {
        const charge = THREE.MathUtils.smoothstep(elapsed - i * RUNE_INTERVAL, -.045, .3);
        rune.material.color.setHex(0x758198).lerp(i % 2 ? gold : blue, charge);
        rune.material.emissiveIntensity = .05 + charge * (.69 + .32 * night);
        rune.position.y = y + .19 + charge * .16;
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

      sparks.visible = this.lighting;
      if (sparks.visible) {
        sparks.material.opacity = .92 * Math.min(1, (1 - progress) * 4);
        const positions = sparks.geometry.attributes.position;
        seeds.forEach(([angle, radius, delay], i) => {
          const rise = (elapsed * .79 + delay) % 1;
          positions.setXYZ(i, x + Math.cos(angle * 6.28) * (radius * 4.1 + .15),
            y + .20 + rise * 3.5, z + Math.sin(angle * 6.28) * (radius * 3.5 + .15));
        });
        positions.needsUpdate = true;
      }
    },
  };
}
