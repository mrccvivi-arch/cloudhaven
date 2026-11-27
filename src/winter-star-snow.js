import * as THREE from "three";
import { makePoints } from "../previews/snow-whale/snow.js";
import { WINTER_TREE, winterHeight, winterLakeExtent } from "./winter-layout.js";

const { smoothstep } = THREE.MathUtils;
const pearl = new THREE.Color(0xfff6dc);
const haloGold = new THREE.Color(0xf4dfb3);
const champagne = new THREE.Color(0xddbb78);
const warmGold = new THREE.Color(0xc9a05c);
const sizeGain = 1.40;
const glowGain = 1.30;
const sprite = { mote: 0, foil: 1, glint: 2 };
const color = new THREE.Color();

export function createWinterStarSnow(parent, whale, reduced) {
  let seed = 0x7a91fb;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const layers = [
    { shape: sprite.foil, high: 132, near: 104, size: .51 },
    { shape: sprite.foil, high: 84, near: 72, size: .43 },
    { shape: sprite.mote, high: 132, near: 70, size: .25 },
  ].map(({ shape, high, near, size }) => {
    const count = high + near;
    const points = makePoints(parent, null, count, size * sizeGain, 4);
    const { geometry } = points;
    const motion = new THREE.BufferAttribute(new Float32Array(count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("starMotion", motion);
    const compile = points.material.onBeforeCompile;
    points.material.onBeforeCompile = shader => {
      compile(shader);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `
        #include <common>
        attribute vec2 starMotion;
        varying vec2 vStarMotion;
      `).replace("#include <begin_vertex>", "#include <begin_vertex>\nvStarMotion = starMotion;");
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
        #include <common>
        varying vec2 vStarMotion;
      `).replace("#include <map_particle_fragment>", `
        vec2 point = vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) - .5;
        float c = cos(vStarMotion.x);
        float s = sin(vStarMotion.x);
        vec2 local = mat2(c, -s, s, c) * point;
        float radius = length(point);
        float halo = .28 * (1.0 - smoothstep(.07, .48, radius));
        float pigment;
        float highlight;
        if (vStarMotion.y > 1.5) {
          vec2 axis = abs(local);
          pigment = .74 * (1.0 - smoothstep(.012, .068, min(axis.x, axis.y))) *
            (1.0 - smoothstep(.08, .42, max(axis.x, axis.y)));
          highlight = 1.0 - smoothstep(.018, .13, radius);
        } else if (vStarMotion.y > .5) {
          vec2 facet = vec2(local.x + .38 * local.y, local.y * 1.65);
          float edge = abs(facet.x) + abs(facet.y) + .16 * facet.x - .12 * facet.y;
          pigment = .86 * (1.0 - smoothstep(.20, .34, edge));
          highlight = .80 * (1.0 - smoothstep(.01, .19, length(facet - vec2(.06, .04))));
        } else {
          float grain = length(local * vec2(.86, 1.27));
          pigment = .83 * (1.0 - smoothstep(.08, .30, grain));
          highlight = .76 * (1.0 - smoothstep(.015, .15, grain));
        }
        float coverage = max(halo, max(pigment, highlight));
        diffuseColor.a *= coverage;
      `).replace("#include <color_fragment>", `
        #include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${haloGold.toArray().join(", ")}),
          .80 * halo / max(coverage, .001));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${pearl.toArray().map(channel => channel.toFixed(6)).join(", ")}), highlight);
      `);
    };
    return {
      points, geometry, motion, shape, high, count, cursor: [0, high],
      particles: Array.from({ length: count }, () => ({ born: -Infinity, life: 0 })),
    };
  });

  const position = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const highInterval = reduced ? .29 : .24;
  const nearInterval = reduced ? .20 : .16;
  let highClock, nearClock;

  function emit(layer, time, near, strength) {
    const slot = Number(near);
    const index = layer.cursor[slot]++;
    if (layer.cursor[slot] >= (near ? layer.count : layer.high)) layer.cursor[slot] = near ? layer.high : 0;
    const particle = layer.particles[index];
    particle.born = time;
    particle.life = near ? 2.6 + random() * 1.5 : 8 + random() * 4;
    particle.x = position.x;
    particle.y = position.y;
    particle.z = position.z;
    particle.floor = winterHeight(position.x, position.z);
    particle.fall = near ? .62 + random() * .78 : .86 + random() * .73;
    particle.drift = (random() - .5) * (near ? 1.4 : 5.1);
    particle.sideDrift = (random() - .5) * 2.2;
    particle.phase = random() * Math.PI * 2;
    particle.spin = (random() - .5) * .67;
    particle.tint = .29 + random() * .69;
    const accent = layer === layers[1] ? random() : 1;
    particle.sprite = accent < .14 ? sprite.glint : layer.shape;
    particle.size = (.63 + random() * .73) * (accent < .53 ? 1.43 : 1);
    particle.opacity = (.58 + random() * .38) * strength;
  }

  function highSnow(time, age) {
    for (const layer of layers) {
      if (layer === layers[0] && random() > .26) continue;
      whale.snowPoint(position, age, Math.floor(random() * 3), random(), random());
      emit(layer, time, false, 1);
    }
  }

  function localSnow(time, player, camera, strength) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < .001) forward.set(0, 0, -1);
    forward.normalize();
    right.set(-forward.z, 0, forward.x);
    for (let i = 0; i < (reduced ? 6 : 7); i++) {
      if (random() > strength) continue;
      position.copy(player).addScaledVector(forward, -2.6 + random() ** 1.6 * 18)
        .addScaledVector(right, (random() - .5) * 13);
      position.y = Math.max(player.y, winterHeight(position.x, position.z)) + .65 + random() ** 1.18 * 4.8;
      const layer = random() < .08 ? layers[0] : i < 3 ? layers[1] : layers[2];
      emit(layer, time, true, .48 + .52 * strength);
    }
  }

  function render(time, night) {
    for (const layer of layers) {
      let count = 0;
      const { positions, colors, scales, material } = layer.points;
      for (let i = 0; i < layer.count; i++) {
        const p = layer.particles[i];
        const age = time - p.born;
        if (age >= p.life) continue;
        const y = p.y - p.fall * age;
        if (y <= p.floor + .08) continue;
        const x = p.x + p.drift * age + .53 * (Math.sin(p.phase + age * 1.7) - Math.sin(p.phase));
        const z = p.z + p.sideDrift * age + .36 * (Math.cos(p.phase + age) - Math.cos(p.phase));
        const shimmer = .84 + .11 * Math.sin(p.phase + age * (1.4 + p.spin)) +
          .05 * Math.cos(1.7 * p.phase - 1.03 * age);
        const opacity = p.opacity * smoothstep(age, 0, .65) * (1 - smoothstep(age / p.life, .72, 1)) *
          smoothstep(y - p.floor, .08, .88) * shimmer;
        if (opacity < .008) continue;
        color.copy(warmGold).lerp(champagne, p.tint);
        positions.setXYZ(count, x, y, z);
        colors.setXYZW(count, color.r, color.g, color.b, opacity * (.82 + night * .18) * glowGain);
        const dust = .46 + .54 * smoothstep(y - p.floor, .10, .95);
        scales.setX(count, p.size * dust);
        layer.motion.setXY(count, p.phase + p.spin * age, p.sprite);
        count++;
      }
      material.visible = count > 0;
      if (!material.visible) continue;
      positions.needsUpdate = colors.needsUpdate = scales.needsUpdate = layer.motion.needsUpdate = true;
      layer.geometry.setDrawRange(0, count);
    }
  }

  function reset() {
    highClock = nearClock = 0;
    for (const layer of layers) {
      layer.cursor[0] = 0;
      layer.cursor[1] = layer.high;
      for (const particle of layer.particles) particle.born = -Infinity;
      layer.points.material.visible = false;
    }
  }
  reset();

  return {
    reset,
    update(dt, time, age, player, camera, night, releasing, glow) {
      if (releasing) {
        highClock += dt;
        while (highClock >= highInterval) {
          highClock -= highInterval;
          highSnow(time - highClock, age);
        }
      } else highClock = 0;

      const shelter = smoothstep(Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z), ...WINTER_TREE.shelter);
      const near = 1 - smoothstep(winterLakeExtent(player.x, player.z), .95, 1.27);
      const strength = glow * shelter * near;
      if (strength > .02) {
        nearClock += dt;
        while (nearClock >= nearInterval) {
          nearClock -= nearInterval;
          localSnow(time - nearClock, player, camera, strength);
        }
      } else nearClock = 0;
      render(time, night);
    },
  };
}
