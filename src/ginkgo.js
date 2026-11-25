import { createFallingFoliage } from "./falling-foliage.js";
import { createGinkgoGround } from "./ginkgo-ground.js";
import { createGinkgoNight, createLeafGlow } from "./ginkgo-night.js";
import * as THREE from "three";
import { GOLDEN_GINKGO, seeded, terrainHeight } from "./map.js";

const { x, z, canopyRadius } = GOLDEN_GINKGO;
const DYNAMIC_LEAVES = 54;
const CANOPY_LEAVES = 960;
const CHAMPAGNE_GOLD = [
  [0xfff0c4, 15], [0xffe49a, 35], [0xf8d875, 35], [0xeac46a, 10], [0xfff5dc, 5],
];
const FALLING_COLORS = CHAMPAGNE_GOLD.map(([tint]) => tint);

function fanGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-.025, -.25);
  shape.lineTo(.035, -.25);
  shape.lineTo(.055, 0);
  shape.lineTo(.42, .22);
  shape.quadraticCurveTo(.63, .48, .31, .6);
  shape.quadraticCurveTo(.13, .68, 0, .53);
  shape.quadraticCurveTo(-.17, .7, -.41, .57);
  shape.quadraticCurveTo(-.63, .47, -.45, .24);
  shape.lineTo(-.035, 0);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 2);
}

export function createGinkgo(parent) {
  const random = seeded(2079);
  const root = new THREE.Group();
  root.name = "Golden Ginkgo";
  root.position.set(x, terrainHeight(x, z), z);
  parent.add(root);

  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  const vertical = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const branches = [];
  const clusters = [[0, 7.2, 0, 2.25, 1.25]];
  function branch(start, end, width) {
    branches.push({ start: new THREE.Vector3(...start), end: new THREE.Vector3(...end), width });
  }

  const fork = [.1, 3.8, .1];
  branch([0, -.2, 0], fork, 1.04);
  branch(fork, [-.4, 7.35, -.45], .68);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + (random() - .5) * .38;
    const reach = 4.5 + random() * 1.4;
    const headingX = Math.cos(angle), headingZ = Math.sin(angle);
    const middle = [headingX * reach * .53, 5.5 + random(), headingZ * reach * .53];
    const tip = [headingX * reach, 4.6 + random() * .85, headingZ * reach];
    branch([.1, 3.35 + random() * 1.4, .1], middle, .52 - random() * .15);
    branch(middle, tip, .24);
    clusters.push([middle[0], middle[1] + .65, middle[2], 2.05, 1.25]);
    clusters.push([tip[0], tip[1] + .25, tip[2], 1.62, 1.24]);
    for (const bend of [-.72, .67]) {
      const end = [middle[0] + Math.cos(angle + bend) * 2.1, middle[1] + .48,
        middle[2] + Math.sin(angle + bend) * 2.1];
      branch(middle, end, .15);
      clusters.push([...end, 1.36, .98]);
    }
  }

  const barkMaterial = new THREE.MeshLambertMaterial({
    color: 0x865336, flatShading: true, emissive: 0xdca060, emissiveIntensity: 0,
  });
  const bark = new THREE.InstancedMesh(new THREE.CylinderGeometry(.31, .62, 1, 7), barkMaterial, branches.length);
  bark.name = "Ginkgo trunk and branches";
  branches.forEach(({ start, end, width }, i) => {
    pose.position.copy(start).lerp(end, .5);
    axis.subVectors(end, start);
    const length = axis.length();
    pose.quaternion.setFromUnitVectors(vertical, axis.divideScalar(length));
    pose.scale.set(width, length + width * .18, width);
    pose.updateMatrix();
    bark.setMatrixAt(i, pose.matrix);
  });
  root.add(bark);

  const geometry = fanGeometry();
  const material = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide, emissive: 0xffedce, emissiveIntensity: .12,
  });
  const crownMaterial = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide, emissive: 0xfff4e2, emissiveIntensity: 0, toneMapped: false,
  });
  const crownNight = { value: 0 };
  crownMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.ginkgoNight = crownNight;
    shader.uniforms.ginkgoMoonTint = { value: crownMaterial.emissive };
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform float ginkgoNight;
      uniform vec3 ginkgoMoonTint;
    `).replace("#include <opaque_fragment>", `
      // Keep the sRGB palette in the normal output transform. Use the scene lights for
      // shading and backlight without tinting the leaf pigment or applying the global filmic curve.
      const vec3 lumaWeights = vec3(0.2126, 0.7152, 0.0722);
      float incident = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, lumaWeights)
        / max(0.05, dot(diffuseColor.rgb, lumaWeights));
      float shade = smoothstep(0.12, 0.94, incident);
      float backlight = 0.0;
      #if NUM_DIR_LIGHTS > 0
        backlight = max(0.0, -dot(normal, directionalLights[0].direction));
      #endif
      vec3 pigment = mix(diffuseColor.rgb, ginkgoMoonTint, ginkgoNight * 0.30);
      float brightness = mix(0.85, 0.73, ginkgoNight) + 0.15 * shade
        + backlight * backlight * mix(0.085, 0.045, ginkgoNight);
      outgoingLight = pigment * (brightness + totalEmissiveRadiance);
      #include <opaque_fragment>
    `);
  };
  const crown = new THREE.InstancedMesh(geometry, crownMaterial, CANOPY_LEAVES);
  crown.name = "Ginkgo canopy";
  crown.userData.ignoreTouchOcclusion = true;
  const remainingColors = CHAMPAGNE_GOLD.flatMap(([tint, weight]) => Array(CANOPY_LEAVES * weight / 100).fill(tint));
  for (let i = 0; i < crown.count; i++) {
    const [cx, cy, cz, width, height] = clusters[i % clusters.length];
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random());
    pose.position.set(cx + width * radius * Math.cos(angle), cy + height * (random() * 2 - 1) * Math.sqrt(1 - radius ** 2),
      cz + width * radius * Math.sin(angle));
    pose.rotation.set(-1.0 + random() * 1.65, random() * 6.28, random() * 6.28);
    pose.scale.setScalar((.54 + random() * .85) * .82);
    pose.updateMatrix();
    crown.setMatrixAt(i, pose.matrix);
    const paletteIndex = Math.floor(random() * remainingColors.length);
    crown.setColorAt(i, color.setHex(remainingColors[paletteIndex]));
    remainingColors[paletteIndex] = remainingColors[remainingColors.length - 1];
    remainingColors.pop();
  }
  root.add(crown);

  const ground = createGinkgoGround(root, geometry, material);
  const updateNight = createGinkgoNight(root);

  function renew(leaf, spread) {
    const angle = random() * Math.PI * 2;
    const radius = .8 + Math.sqrt(random()) * (canopyRadius - .8);
    leaf.x = Math.cos(angle) * radius;
    leaf.z = Math.sin(angle) * radius;
    leaf.y = 4.7 + random() * 2.8 - radius * .16;
    leaf.speed = .48 + random() * .48;
    leaf.phase = random() * Math.PI * 2;
    leaf.size = .17 + random() * .22;
    leaf.age = spread ? random() * 6.8 : -random() * 1.7;
    leaf.drift = random() < .1 ? .34 : .095 + random() * .095;
    leaf.rest = 0;
    leaf.landed = false;
  }

  const fallingGeometry = geometry.clone();
  const fallingMaterial = material.clone();
  const glow = createLeafGlow(fallingGeometry, fallingMaterial, DYNAMIC_LEAVES);
  const falling = createFallingFoliage(root, fallingGeometry, fallingMaterial, {
    name: "Falling ginkgo leaves", count: DYNAMIC_LEAVES, colors: FALLING_COLORS, renew, surface: terrainHeight, glow,
  });
  return {
    listen: ground.listen,
    update(player, camera, dt, night) {
      const distance = Math.hypot(player.x - x, player.z - z);
      ground.update(distance < 18 ? dt : Infinity, night);
      updateNight(distance, dt, night);
      barkMaterial.emissiveIntensity = night * .065;
      crownNight.value = night;
      crownMaterial.emissiveIntensity = night * .07;
      falling.update(player, camera, dt, night);
    },
  };
}
