import * as THREE from "three";

// Shared falling foliage, including ground contact and clearance around the avatar and camera.
export function createFallingFoliage(root, geometry, fallingMaterial, {
  name, count, colors, renew, surface, range = 29, restScale = 1,
}) {
  const { x, z } = root.position;
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  const falling = new THREE.InstancedMesh(geometry, fallingMaterial, count);
  falling.name = name;
  falling.userData.ignoreTouchOcclusion = true;
  falling.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  falling.frustumCulled = false;
  falling.visible = false;
  root.add(falling);

  const leaves = Array.from({ length: falling.count }, (_, i) => {
    const leaf = {};
    renew(leaf, true);
    falling.setColorAt(i, color.setHex(colors[i % colors.length]));
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
      if (distance >= range) { falling.visible = false; elapsed = 0; return; }
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
        const ground = surface(x + dx, z + dz) - root.position.y + .05;
        const height = leaf.y - age * leaf.speed + Math.cos(sway) * .095;
        if (!leaf.landed && height <= ground) {
          leaf.landed = true;
          leaf.landX = dx;
          leaf.landZ = dz;
          leaf.landAngle = sway;
        }
        if (leaf.landed) leaf.rest += step / restScale;
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
