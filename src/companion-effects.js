import * as THREE from "three";
import { moonlightMask } from "./moonlight.js";

export function createCompanionEffects(root) {
  const group = new THREE.Group();
  group.visible = false;
  root.add(group);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(new Float32Array(27), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.Float32BufferAttribute(new Float32Array(27), 3);
  geometry.setAttribute("position", positions);
  geometry.setAttribute("color", colors);
  const texture = new THREE.DataTexture(moonlightMask("glow"), 64, 64);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    map: texture, vertexColors: true, size: .32, transparent: true, depthWrite: false, toneMapped: false,
  }));
  stars.frustumCulled = false;
  group.add(stars);

  const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.ShaderMaterial({
    uniforms: { alpha: { value: 0 } },
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 surface;
      void main() {
        surface = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `varying vec2 surface;
      uniform float alpha;
      void main() {
        float r = length(surface - .5);
        float edge = 1. - smoothstep(.44, .5, r);
        float band = exp(-abs(r - .36) * 36.);
        vec3 tint = mix(vec3(1., .76, .42), vec3(.72, .5, 1.), surface.x);
        gl_FragColor = vec4(tint, alpha * edge * band);
      }`,
  }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .09;
  group.add(ring);
  const gold = new THREE.Color(0xffdf9e);
  const palette = [gold, new THREE.Color(0xd9beff), new THREE.Color(0xffe4ed)];
  let start = 0;
  let level = 0;
  let duration = 0;

  return {
    play(next, time) {
      if (next < 4 || (next === 4 && Math.random() > .55)) return;
      level = next;
      start = time;
      duration = next === 4 ? .95 : next === 5 ? 1.55 : 1.85;
      geometry.setDrawRange(0, next === 4 ? 4 : next === 5 ? 7 : 9);
      for (let i = 0; i < colors.count; i++) {
        const color = next === 6 ? palette[i % palette.length] : gold;
        colors.setXYZ(i, color.r, color.g, color.b);
      }
      colors.needsUpdate = true;
    },
    update(time) {
      const elapsed = (time - start) / 1000;
      const life = elapsed / duration;
      group.visible = duration > 0 && life >= 0 && life < 1;
      if (!group.visible) return;
      const fade = Math.min(1, life * 11) * (1 - life);
      stars.material.opacity = fade;
      for (let i = 0; i < positions.count; i++) {
        const angle = i * 2.399 + elapsed * .92;
        const radius = .82 + (i % 3) * .19 + life * (level === 6 ? .45 : .18);
        positions.setXYZ(i, Math.cos(angle) * radius, .42 + (i % 5) * .21 + elapsed * .8, Math.sin(angle) * radius);
      }
      positions.needsUpdate = true;
      ring.visible = level === 6;
      ring.scale.setScalar(.62 + life * .65);
      ring.material.uniforms.alpha.value = fade * .94;
    },
  };
}
