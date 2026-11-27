import * as THREE from "three";
import { WINTER_LAKE, winterLakeExtent } from "./winter-layout.js";

const { smoothstep } = THREE.MathUtils;

// Bake the existing loft once. A slight oblique projection lets the fins
// separate in the silhouette without rendering the whale a second time.
function iceWhaleStamp(model) {
  const width = 160, height = 80;
  const mask = new Uint8Array(width * height);
  const transform = new THREE.Matrix4();
  const point = new THREE.Vector3();
  model.updateWorldMatrix(true, true);
  const inverse = model.matrixWorld.clone().invert();
  function edge(a, b, x, y) {
    return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  }
  model.traverse(part => {
    if (!part.isMesh) return;
    transform.multiplyMatrices(inverse, part.matrixWorld);
    const { position } = part.geometry.attributes;
    const indices = part.geometry.index;
    const vertices = Array.from({ length: position.count }, (_, i) => {
      point.fromBufferAttribute(position, i).applyMatrix4(transform);
      return [(point.x / 18 + .5) * width, ((point.y + point.z * .34) / 9 + .5) * height];
    });
    for (let i = 0; i < (indices?.count ?? vertices.length); i += 3) {
      const a = vertices[indices ? indices.getX(i) : i];
      const b = vertices[indices ? indices.getX(i + 1) : i + 1];
      const c = vertices[indices ? indices.getX(i + 2) : i + 2];
      const winding = Math.sign(edge(a, b, c[0], c[1]));
      if (!winding) continue;
      for (let y = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))); y < Math.min(height, Math.ceil(Math.max(a[1], b[1], c[1]))); y++) {
        for (let x = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))); x < Math.min(width, Math.ceil(Math.max(a[0], b[0], c[0]))); x++) {
          if (winding * edge(a, b, x + .5, y + .5) >= 0 && winding * edge(b, c, x + .5, y + .5) >= 0 &&
              winding * edge(c, a, x + .5, y + .5) >= 0) mask[y * width + x] = 255;
        }
      }
    }
  });

  const texels = new Uint8Array(mask.length * 4);
  for (let y = 4; y < height - 4; y++) {
    for (let x = 4; x < width - 4; x++) {
      let core = 0, halo = 0;
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const alpha = mask[(y + dy) * width + x + dx];
          halo += alpha;
          if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) core += alpha;
        }
      }
      const i = (y * width + x) * 4;
      texels[i] = core / 25;
      texels[i + 1] = halo / 81;
      texels[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(texels, width, height);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createWinterLakeEcho() {
  const position = new THREE.Vector4(0, 0, 1, 0);
  const axis = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const uniforms = {
    winterWhaleStamp: { value: null },
    winterWhaleEcho: { value: position },
    winterWhaleEchoStrength: { value: 0 },
  };
  let noticed = false;

  return {
    uniforms,
    attach(model) { uniforms.winterWhaleStamp.value = iceWhaleStamp(model); },
    reset() {
      uniforms.winterWhaleEchoStrength.value = 0;
      noticed = false;
    },
    update(dt, whale, reveal, player, camera) {
      let target = 0;
      if (whale.visible) {
        const { x, z } = whale.position;
        axis.set(1, 0, 0).applyQuaternion(whale.quaternion).setY(0).normalize();
        position.set(x, z, axis.x, axis.z);
        target = reveal * (1 - smoothstep(winterLakeExtent(x, z), .89, 1.18));
      }
      const strength = uniforms.winterWhaleEchoStrength;
      strength.value += (target - strength.value) * (1 - Math.exp(-dt * (target > strength.value ? 2.1 : 1.25)));
      if (target === 0 && strength.value < .008) strength.value = 0;
      if (noticed || target < .16 || strength.value < .30 || winterLakeExtent(player.x, player.z) > 1.16 ||
          Math.hypot(player.x - position.x, player.z - position.y) > 69) return false;
      probe.set(position.x, WINTER_LAKE.shoreHeight, position.y).project(camera);
      noticed = probe.z > -1 && probe.z < 1 && Math.abs(probe.x) < .93 && Math.abs(probe.y) < .95;
      return noticed;
    },
  };
}
