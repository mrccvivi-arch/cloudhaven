import * as THREE from "three";
import { createIceBlossoms } from "./winter-flowers.js";
import { winterHeight } from "./winter-layout.js";

function animatedBlossoms(parent, capacity, night, clock) {
  const mesh = createIceBlossoms(parent, capacity, night, clock, true);
  const cycle = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4)
    .setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute("trailCycle", cycle);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const compile = mesh.material.onBeforeCompile;
  mesh.material.customProgramCacheKey = () => "winter-blossom-trail";
  mesh.material.onBeforeCompile = shader => {
    compile(shader);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute vec4 trailCycle;
      varying vec2 vTrailBloom;
    `).replace("#include <project_vertex>", `
      float age = blossomClock - trailCycle.x;
      float growth = max(.01, trailCycle.y);
      float seedling = smoothstep(.09, .37, age / growth);
      float open = smoothstep(.26, 1., age / growth);
      transformed.xz *= mix(.11, 1., open);
      transformed.y = transformed.y * mix(1.25, 1., open) * seedling;
      float appear = smoothstep(.13, .42, age / growth);
      float fade = 1. - smoothstep(0., max(.01, trailCycle.w - trailCycle.z), blossomClock - trailCycle.z);
      float heartGlow = smoothstep(.82, 1., age / growth) *
        (1. - smoothstep(1.03, 1.6, age / growth));
      vTrailBloom = vec2(appear * fade * step(.10, trailCycle.y), heartGlow);
      #include <project_vertex>
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec2 vTrailBloom;
    `).replace("#include <opaque_fragment>", `
      if (vTrailBloom.x < .009) discard;
      diffuseColor.a *= vTrailBloom.x;
      vec3 flowering = mix(vec3(.87,.96,1.), vec3(1.,.84,.57), blossomNight);
      outgoingLight += flowering * vBlossom.x * (blossomNight * .115 + vTrailBloom.y * .44);
      #include <opaque_fragment>
    `);
  };
  return { mesh, cycle };
}

export function createWinterBloomTrail(parent, random, night, clock, reduced, particles, permitted) {
  const softLimit = reduced ? 318 : 371;
  const capacity = softLimit + 68;
  const { mesh, cycle } = animatedBlossoms(parent, capacity, night, clock);
  const slots = Array.from({ length: capacity }, (_, index) => ({
    index, x: 0, y: 0, z: 0, birth: 0, growth: 0, fade: 0, end: 0, dusted: false,
  }));
  const holes = Array.from({ length: capacity }, (_, index) => capacity - index - 1);
  const clusters = [];
  const dummy = new THREE.Object3D();
  let active = 0;
  let lastIndex = -1;

  function writeCycle(flower) {
    cycle.setXYZW(flower.index, flower.birth, flower.growth, flower.fade, flower.end);
    cycle.needsUpdate = true;
  }

  function retireOldest(count, now) {
    let excess = active + count - softLimit;
    if (excess <= 0) return;
    for (const cluster of clusters) {
      if (cluster.end <= now + 1.7) {
        excess -= cluster.flowers.length;
      } else if (excess > 0) {
        cluster.end = now + 1.65;
        for (const flower of cluster.flowers) {
          flower.fade = Math.min(flower.fade, now + .19);
          flower.end = cluster.end;
          writeCycle(flower);
        }
        excess -= cluster.flowers.length;
      }
      if (excess <= 0) break;
    }
  }

  return {
    plant(x, z, dx, dz, now) {
      const count = Math.min(holes.length, 2 + Math.floor(random() * 4));
      if (count < 2 || !permitted(x, z)) return false;
      const end = now + 20 + random() * 10;
      const offsets = [];
      const side = random() < .5 ? -1 : 1;
      for (let i = 0; i < count; i++) {
        const along = .30 + random() * .80;
        const across = side * (.38 + random() * .95) * (i === count - 1 && count > 2 ? -1 : 1);
        const px = x - dx * along - dz * across;
        const pz = z - dz * along + dx * across;
        if (permitted(px, pz)) offsets.push([px, pz]);
      }
      if (offsets.length < 2) return false;
      const flowers = [];
      retireOldest(offsets.length, now);
      for (const [px, pz] of offsets) {
        const size = .20 + random() ** 1.28 * .39 + (random() < .075 ? .13 : 0);
        const y = winterHeight(px, pz) + .031;
        const flower = slots[holes.pop()];
        Object.assign(flower, { x: px, y, z: pz, birth: now + random() * .12,
          growth: .62 + random() * .47, fade: end - 2.35, end, dusted: false });
        flowers.push(flower);
        dummy.position.set(px, y, pz);
        dummy.rotation.set((random() - .5) * .44, random() * Math.PI * 2, (random() - .5) * .45);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        mesh.setMatrixAt(flower.index, dummy.matrix);
        writeCycle(flower);
        lastIndex = Math.max(lastIndex, flower.index);
        particles.seed(px, y, pz, now);
      }
      clusters.push({ flowers, end });
      active += flowers.length;
      mesh.count = lastIndex + 1;
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },
    update(now, camera) {
      for (let i = clusters.length - 1; i >= 0; i--) {
        const cluster = clusters[i];
        if (now >= cluster.end) {
          for (const flower of cluster.flowers) holes.push(flower.index);
          active -= cluster.flowers.length;
          clusters.splice(i, 1);
          continue;
        }
        for (const flower of cluster.flowers) {
          if (!flower.dusted && now >= flower.fade) {
            flower.dusted = true;
            const near = !camera || (camera.position.x - flower.x) ** 2 +
              (camera.position.z - flower.z) ** 2 < 32 ** 2;
            if (near || flower.index % 4 === 0) particles.blossom(flower.x, flower.y, flower.z, now, near);
          }
        }
      }
      if (!active) {
        mesh.count = 0;
        lastIndex = -1;
      }
    },
    clear() {
      clusters.length = 0;
      holes.length = 0;
      for (let i = capacity - 1; i >= 0; i--) holes.push(i);
      active = 0;
      lastIndex = -1;
      mesh.count = 0;
      // A new visit restarts the clock. Expired instances must not become active when reused sparsely.
      cycle.array.fill(0);
      cycle.needsUpdate = true;
    },
  };
}
