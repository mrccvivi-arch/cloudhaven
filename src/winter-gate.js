import * as THREE from "three";
import { snowTexture } from "../previews/snow-whale/snow.js";
import { seeded, terrainHeight } from "./map.js";
import { createGateTrigger } from "./sky-gate.js";
import { SNOW_GATE, WINTER, WINTER_GATE, winterHeight } from "./winter-layout.js";

function opening(gate, floor) {
  return { ...gate, halfWidth: 1.73, halfDepth: .24, y: floor(gate.x, gate.z) - .12, height: 3.7 };
}

const openings = { ground: opening(WINTER_GATE, terrainHeight), [WINTER]: opening(SNOW_GATE, winterHeight) };

export function createWinterGateTrigger() {
  return createGateTrigger(openings, undefined, 1500);
}

export function createWinterGate(parent, layer) {
  const root = new THREE.Group();
  const gate = openings[layer];
  root.position.set(gate.x, gate.y, gate.z);
  parent.add(root);
  const ice = new THREE.MeshStandardMaterial({ color: 0xcae5ff, roughness: .55,
    emissive: 0x77b8ea, emissiveIntensity: .24 });
  const arc = [];
  for (let i = 0; i <= 22; i++) {
    const a = i / 22 * Math.PI;
    arc.push(new THREE.Vector3(1.91 * Math.cos(a), .44 + 3.47 * Math.sin(a) ** .79, .09 * Math.sin(a * 3)));
  }
  root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 32, .145, 7, false), ice));
  for (const side of [-1, 1]) {
    const crystal = new THREE.Mesh(new THREE.DodecahedronGeometry(.38), ice);
    crystal.position.set(1.92 * side, .37, 0);
    crystal.scale.set(.96, 1.77, .99);
    crystal.rotation.z = side * .17;
    root.add(crystal);
  }
  const shimmer = new THREE.Mesh(new THREE.PlaneGeometry(4.16, 4.16), new THREE.ShaderMaterial({
    uniforms: { clock: { value: 0 }, night: { value: 0 } },
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 uvGate; void main() {
      uvGate = uv * 2. - 1.; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
    }`,
    fragmentShader: `varying vec2 uvGate; uniform float clock, night; void main() {
      float radius = length(uvGate * vec2(1.10, .97));
      float silk = .5 + .5 * sin(18. * uvGate.x + 5. * sin(5. * uvGate.y - clock *.7));
      float edge = 1. - smoothstep(.72, 1., radius);
      vec3 ice = mix(vec3(.30,.62,.91), vec3(.90,.97,1.), silk);
      gl_FragColor = vec4(ice, edge * (.18 + .19 * silk + .11 * night));
      #include <colorspace_fragment>
    }`,
  }));
  shimmer.position.y = 1.86;
  root.add(shimmer);
  const random = seeded(45021);
  const flakes = Array.from({ length: 58 }, () => [(random() - .5) * 6.6, random() * 6, (random() - .5) * 4, .42 + random() * .9]);
  const geometry = new THREE.BufferGeometry();
  const points = new THREE.Float32BufferAttribute(new Float32Array(flakes.length * 3), 3);
  geometry.setAttribute("position", points);
  const snow = new THREE.Points(geometry, new THREE.PointsMaterial({ map: snowTexture("snow"), size: .15, color: 0xedfaff, transparent: true, opacity: .78, depthWrite: false }));
  snow.frustumCulled = false;
  root.add(snow);
  return (time, night) => {
    shimmer.material.uniforms.clock.value = time;
    shimmer.material.uniforms.night.value = night;
    ice.emissiveIntensity = .24 + .35 * night;
    flakes.forEach(([x, y, z, speed], i) => points.setXYZ(i, x + .24 * Math.sin(time + i),
      THREE.MathUtils.euclideanModulo(y - time * speed, 6), z));
    points.needsUpdate = true;
  };
}
