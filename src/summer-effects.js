import * as THREE from "three";
import { coastDistance, islandHeight, SHORE_X, SHORE_Z, SUMMER_WATER, summerSurface } from "./summer-layout.js";
import { summerHaloMap } from "./summer-glow.js";
import { waveReachesSand } from "./summer-sea.js";

const { smoothstep, lerp } = THREE.MathUtils;
const WATER_Y = SUMMER_WATER + .041;

function softMask(profile) {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) * 2 / size - 1, v = (y + .5) * 2 / size - 1;
      pixels[(y * size + x) * 4 + 1] = Math.round(profile(u, v) * 255);
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function createPool(parent, capacity, geometry, options, renderOrder) {
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("effectOpacity", opacity);
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...options });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float effectOpacity;
      varying float vEffectOpacity;
      ${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\n vEffectOpacity = effectOpacity;");
    shader.fragmentShader = `varying float vEffectOpacity;
      ${shader.fragmentShader}`.replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.a *= vEffectOpacity;");
  };
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  mesh.count = 0;
  parent.add(mesh);

  const entries = Array.from({ length: capacity }, () => ({ life: 0, age: 0 }));
  const pose = new THREE.Object3D();
  let cursor = 0;
  return {
    add(life) {
      const entry = entries[cursor];
      cursor = (cursor + 1) % capacity;
      entry.age = 0;
      entry.life = life;
      return entry;
    },
    update(dt, sample) {
      let count = 0;
      for (const entry of entries) {
        entry.age += dt;
        if (entry.age >= entry.life) continue;
        const alpha = sample(entry, pose);
        if (alpha <= .003) continue;
        pose.updateMatrix();
        mesh.setMatrixAt(count, pose.matrix);
        opacity.setX(count++, alpha);
      }
      if (count) {
        mesh.instanceMatrix.needsUpdate = true;
        opacity.needsUpdate = true;
      }
      mesh.count = count;
    },
    setColor(color) { material.color.copy(color); },
    clear() {
      for (const entry of entries) entry.life = 0;
      cursor = mesh.count = 0;
    },
  };
}

export function createSummerEffects(parent, rocks = []) {
  const waterTint = new THREE.Color(0xd9fffc);
  const glowTint = new THREE.Color();
  const tint = new THREE.Color();
  let glowStrength = 0;
  const rippleMask = softMask((x, y) => {
    const r = Math.hypot(x, y);
    return smoothstep(r, .60, .80) * (1 - smoothstep(r, .80, .99));
  });
  const sandMask = softMask((x, y) => {
    const radius = Math.hypot(x, y) + .055 * Math.cos(3 * Math.atan2(y, x) + .6);
    return (1 - smoothstep(radius, .36, .97)) * (.81 + .19 * smoothstep(y, -.65, .65));
  });
  const droplets = createPool(parent, 42, new THREE.IcosahedronGeometry(1, 1), { color: waterTint }, 4);
  const ripples = createPool(parent, 12, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    { color: waterTint, alphaMap: rippleMask }, 2);
  const tracks = createPool(parent, 60, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    { color: 0xb69a77, alphaMap: sandMask, polygonOffset: true, polygonOffsetFactor: -1 }, 0);
  const nightEffects = new THREE.Group();
  nightEffects.name = "summer-water-glow";
  parent.add(nightEffects);
  const halo = createPool(nightEffects, 52, new THREE.PlaneGeometry(2, 2),
    { color: 0x35baff, map: summerHaloMap, blending: THREE.AdditiveBlending }, 4);
  const trail = createPool(nightEffects, 82, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    { color: 0x38ddff, map: summerHaloMap, blending: THREE.AdditiveBlending }, 3);
  const softRing = softMask((x, y) => {
    const r = Math.hypot(x, y);
    return smoothstep(r, .38, .77) * (1 - smoothstep(r, .78, .99));
  });
  const glowRing = createPool(nightEffects, 20, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    { color: 0x42deff, alphaMap: softRing, blending: THREE.AdditiveBlending }, 3);
  const { random } = Math;
  let sandDistance = 0, waterDistance = 0, side = 1;
  let headingX = 0, headingZ = -1;
  let lastSurface;

  function splash(x, z, fx, fz, running, landing) {
    const strength = landing ? 1.55 : running ? 1.19 : .86;
    const count = landing ? 13 : running ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const drop = droplets.add(.29 + random() * .28);
      const side = i % 2 ? -1 : 1;
      const across = (.42 + random() * .52) * side;
      drop.x = x + fz * across - fx * .40;
      drop.z = z - fx * across - fz * .40;
      const sideways = (1.05 + random() * 1.55) * strength * side;
      const backwards = (.75 + random() * 1.60) * strength;
      drop.vx = fz * sideways - fx * backwards;
      drop.vz = -fx * sideways - fz * backwards;
      drop.vy = (1.27 + random() * 1.31) * strength;
      drop.size = (.065 + random() * .08) * Math.sqrt(strength);
      drop.brightness = .50 + random() * .48;
      if (glowStrength > .01) {
        const shimmer = halo.add(drop.life);
        Object.assign(shimmer, { x: drop.x, z: drop.z, vx: drop.vx, vz: drop.vz, vy: drop.vy, size: drop.size });
      }
    }
    const ring = ripples.add(landing ? 1.20 : .86);
    ring.x = x - fx * .44;
    ring.z = z - fz * .44;
    ring.heading = Math.atan2(fx, fz);
    ring.reach = strength;
    ring.opacity = landing ? .83 : running ? .68 : .52;
    if (glowStrength > .01) {
      const glow = glowRing.add(landing ? 3.5 : 2.45);
      Object.assign(glow, { x: ring.x, z: ring.z, reach: strength, opacity: ring.opacity });
      for (let i = 0; i < (landing ? 12 : running ? 7 : 4); i++) {
        const spread = landing ? 2.15 : 1.20;
        const side = (random() - .5) * spread * 2;
        const behind = .36 + random() * spread;
        const sx = x + fz * side - fx * behind, sz = z - fx * side - fz * behind;
        if (summerSurface(sx, sz) !== "water") continue;
        const spark = trail.add(2 + random() * 2);
        spark.x = sx;
        spark.z = sz;
        spark.size = .061 + random() * .17;
        spark.opacity = .30 + random() * .55;
      }
    }
  }

  function footprint(x, z, fx, fz) {
    x = x - fx * .41 + fz * side * .19;
    z = z - fz * .41 - fx * side * .19;
    side *= -1;
    if (summerSurface(x, z) !== "sand" ||
        rocks.some((rock) => (x - rock.x) ** 2 + (z - rock.z) ** 2 < rock.radius ** 2)) return;
    const mark = tracks.add(18 + random() * 5);
    mark.x = x;
    mark.z = z;
    mark.y = islandHeight(x, z) + .020;
    mark.heading = Math.atan2(fx, fz);
    mark.slopeX = (islandHeight(x + .15, z) - islandHeight(x - .15, z)) / .30;
    mark.slopeZ = (islandHeight(x, z + .15) - islandHeight(x, z - .15)) / .30;
    mark.size = .29 + random() * .065;
    mark.angle = Math.atan2(z / SHORE_Z, x / SHORE_X);
    mark.shoreOffset = coastDistance(x, z) - 1;
    mark.washedAt = Infinity;
    mark.originalLife = mark.life;
  }

  return {
    // Preserve the original water emission cadence and layer the night glints on those same steps.
    setWaterGlow(color, strength = 0) {
      glowTint.set(color);
      glowStrength = Math.max(0, Math.min(1, strength));
    },
    update(time, dt, night, step, camera) {
      if (step) {
        const { x, z, grounded, surface, dx, dz, landed, running } = step;
        const distance = Math.hypot(dx, dz);
        if (distance > .001) {
          headingX = dx / distance;
          headingZ = dz / distance;
        }
        if (!grounded || surface !== lastSurface) sandDistance = waterDistance = 0;
        if (surface === "water" && grounded) {
          waterDistance += distance;
          if (landed || (distance > .001 && (surface !== lastSurface || waterDistance >= (running ? 1.35 : 1.55)))) {
            splash(x, z, headingX, headingZ, running, landed);
            waterDistance = 0;
          }
        } else if (surface === "sand" && grounded) {
          sandDistance += distance;
          if (distance > .001 && (surface !== lastSurface || sandDistance >= (running ? 3.45 : 2.75))) {
            footprint(x, z, headingX, headingZ);
            sandDistance = 0;
          }
        }
        lastSurface = surface;
      }

      tint.copy(waterTint).multiplyScalar(1 - night * .37).lerp(glowTint, glowStrength);
      droplets.setColor(tint);
      ripples.setColor(tint);
      droplets.update(dt, (drop, pose) => {
        const { age, life, size } = drop;
        const height = .043 + drop.vy * age - 7.2 * age ** 2;
        if (height < 0) return 0;
        const s = size * lerp(1, .54, age / life);
        pose.position.set(drop.x + drop.vx * age, WATER_Y + height, drop.z + drop.vz * age);
        pose.rotation.set(.26, Math.atan2(drop.vx, drop.vz), 0);
        pose.scale.set(s, s * (1.18 + drop.vy * .16), s);
        return drop.brightness * (1 - smoothstep(age / life, .28, 1));
      });
      ripples.update(dt, (ring, pose) => {
        const progress = ring.age / ring.life;
        const size = .36 + ring.reach * progress * 1.38;
        pose.position.set(ring.x, WATER_Y, ring.z);
        pose.rotation.set(0, ring.heading, 0);
        pose.scale.set(size, 1, size * .81);
        return ring.opacity * (1 - smoothstep(progress, .02, 1));
      });
      halo.update(dt, (drop, pose) => {
        const height = .043 + drop.vy * drop.age - 7.2 * drop.age ** 2;
        if (height < 0) return 0;
        const size = drop.size * 4.5;
        pose.position.set(drop.x + drop.vx * drop.age, WATER_Y + height, drop.z + drop.vz * drop.age);
        if (camera) pose.quaternion.copy(camera.quaternion);
        pose.scale.set(size, size, 1);
        return glowStrength * .76 * (1 - drop.age / drop.life);
      });
      trail.update(dt, (spark, pose) => {
        pose.position.set(spark.x, WATER_Y + .004, spark.z);
        pose.rotation.set(0, 0, 0);
        pose.scale.set(spark.size, 1, spark.size * 1.35);
        return glowStrength * spark.opacity * (1 - smoothstep(spark.age / spark.life, .10, 1));
      });
      glowRing.update(dt, (ring, pose) => {
        const progress = ring.age / ring.life;
        const size = .39 + ring.reach * progress * 2.05;
        pose.position.set(ring.x, WATER_Y + .003, ring.z);
        pose.rotation.set(0, 0, 0);
        pose.scale.set(size, 1, size * .87);
        return glowStrength * ring.opacity * .68 * (1 - smoothstep(progress, 0, 1));
      });
      tracks.update(dt, (mark, pose) => {
        if (mark.washedAt === Infinity && waveReachesSand(time, mark.angle, mark.shoreOffset)) {
          mark.washedAt = mark.age + .28;
          mark.life = Math.min(mark.life, mark.washedAt);
        }
        pose.position.set(mark.x, mark.y, mark.z);
        pose.rotation.set(Math.atan(mark.slopeZ), mark.heading, -Math.atan(mark.slopeX), "XZY");
        pose.scale.set(mark.size, 1, mark.size * 1.19);
        const dryFade = 1 - smoothstep(mark.age, 5, mark.originalLife);
        const washFade = mark.washedAt === Infinity ? 1 : Math.min(1, (mark.washedAt - mark.age) / .28);
        return .53 * (1 - .42 * night) * dryFade * washFade;
      });
    },
    clear() {
      droplets.clear();
      ripples.clear();
      tracks.clear();
      halo.clear();
      trail.clear();
      glowRing.clear();
      sandDistance = waterDistance = headingX = 0;
      side = 1;
      headingZ = -1;
      lastSurface = undefined;
    },
  };
}
