import * as THREE from "three";
import { GOLDEN_GINKGO, seeded, terrainHeight } from "./map.js";

const { x, z, canopyRadius } = GOLDEN_GINKGO;
const DYNAMIC_LEAVES = 54;
const CANOPY_LEAVES = 960;
const GOLD = [0xcf8226, 0xde9825, 0xeab337, 0xf1bd42, 0xffce58, 0xffdf76];

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

  const bark = new THREE.InstancedMesh(new THREE.CylinderGeometry(.31, .62, 1, 7),
    new THREE.MeshLambertMaterial({ color: 0x865336, flatShading: true }), branches.length);
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
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const crown = new THREE.InstancedMesh(geometry, material, CANOPY_LEAVES);
  crown.userData.ignoreTouchOcclusion = true;
  for (let i = 0; i < crown.count; i++) {
    const [cx, cy, cz, width, height] = clusters[i % clusters.length];
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random());
    pose.position.set(cx + width * radius * Math.cos(angle), cy + height * (random() * 2 - 1) * Math.sqrt(1 - radius ** 2),
      cz + width * radius * Math.sin(angle));
    pose.rotation.set(-1.0 + random() * 1.65, random() * 6.28, random() * 6.28);
    pose.scale.setScalar(.54 + random() * .85);
    pose.updateMatrix();
    crown.setMatrixAt(i, pose.matrix);
    crown.setColorAt(i, color.setHex(GOLD[(i + Math.floor(random() * GOLD.length)) % GOLD.length]));
  }
  root.add(crown);

  const litter = new THREE.InstancedMesh(geometry, material, 108);
  litter.userData.ignoreTouchOcclusion = true;
  for (let i = 0; i < litter.count; i++) {
    const angle = random() * Math.PI * 2, radius = .9 + Math.sqrt(random()) * (canopyRadius - .9);
    const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
    pose.position.set(dx, terrainHeight(x + dx, z + dz) - root.position.y + .035, dz);
    pose.rotation.set(-Math.PI / 2, 0, angle);
    pose.scale.setScalar(.16 + random() * .22);
    pose.updateMatrix();
    litter.setMatrixAt(i, pose.matrix);
    litter.setColorAt(i, color.setHex(GOLD[i % GOLD.length]).multiplyScalar(.78 + random() * .19));
  }
  root.add(litter);

  const fallingMaterial = material.clone();
  const falling = new THREE.InstancedMesh(geometry, fallingMaterial, DYNAMIC_LEAVES);
  falling.name = "Falling ginkgo leaves";
  falling.userData.ignoreTouchOcclusion = true;
  falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  falling.frustumCulled = false;
  falling.visible = false;
  root.add(falling);

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

  const leaves = Array.from({ length: falling.count }, (_, i) => {
    const leaf = {};
    renew(leaf, true);
    falling.setColorAt(i, color.setHex(GOLD[i % GOLD.length]));
    return leaf;
  });
  const cameraToRabbit = new THREE.Vector3();
  const cameraToLeaf = new THREE.Vector3();
  const nearest = new THREE.Vector3();
  let elapsed = 0;
  let populated = false;

  return {
    update(player, camera, dt, night) {
      const distance = Math.hypot(player.x - x, player.z - z);
      if (distance >= 29) { falling.visible = false; elapsed = 0; return; }
      falling.visible = populated;
      elapsed += dt;
      if (elapsed < (distance > 13 ? .13 : .028)) return;
      const step = elapsed;
      elapsed = 0;
      fallingMaterial.color.setRGB(1 - night * .12, 1 - night * .07, 1 - night * .035);
      cameraToRabbit.set(player.x, player.y + .9, player.z).sub(camera.position);
      const viewingLength = cameraToRabbit.lengthSq();
      for (const [i, leaf] of leaves.entries()) {
        leaf.age += step;
        const age = Math.max(0, leaf.age);
        const sway = leaf.phase + age * 1.37;
        const dx = leaf.landed ? leaf.landX : leaf.x + age * leaf.drift + Math.sin(sway) * .48;
        const dz = leaf.landed ? leaf.landZ : leaf.z + Math.cos(sway * .84 + leaf.phase) * .38;
        const ground = terrainHeight(x + dx, z + dz) - root.position.y + .05;
        const height = leaf.y - age * leaf.speed + Math.cos(sway) * .095;
        if (!leaf.landed && height <= ground) {
          leaf.landed = true;
          leaf.landX = dx;
          leaf.landZ = dz;
          leaf.landAngle = sway;
        }
        if (leaf.landed) leaf.rest += step;
        pose.position.set(dx, leaf.landed ? ground : height, dz);
        if (leaf.landed) pose.rotation.set(-Math.PI / 2, 0, leaf.landAngle);
        else pose.rotation.set(Math.sin(sway) * .92, sway, leaf.phase + age * 1.25);
        let scale = leaf.size * Math.min(1, age * 4, Math.max(0, (1.5 - leaf.rest) * 2));
        const playerGap = Math.hypot(dx + x - player.x, dz + z - player.z);
        pose.position.add(root.position);
        cameraToLeaf.subVectors(pose.position, camera.position);
        const alongView = viewingLength > 0 ? cameraToLeaf.dot(cameraToRabbit) / viewingLength : 0;
        const viewClearance = alongView > 0 && alongView < 1
          ? Math.max(0, (nearest.copy(cameraToLeaf).addScaledVector(cameraToRabbit, -alongView).length() - .28) * 3)
          : 1;
        scale *= Math.min(1, Math.max(0, (cameraToLeaf.length() - .45) * 2),
          Math.max(0, (playerGap - .35) * 2), viewClearance);
        pose.position.sub(root.position);
        pose.scale.setScalar(scale);
        pose.updateMatrix();
        falling.setMatrixAt(i, pose.matrix);
        if (leaf.rest >= 1.5) renew(leaf, false);
      }
      falling.instanceMatrix.needsUpdate = true;
      populated = falling.visible = true;
    },
  };
}
