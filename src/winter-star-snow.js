import * as THREE from "three";
import { makePoints, snowTexture } from "../previews/snow-whale/snow.js";
import { WINTER_TREE, winterHeight } from "./winter-layout.js";

const { smoothstep } = THREE.MathUtils;
const silver = new THREE.Color(0xf3faff);
const ice = new THREE.Color(0x91cbff);
const gold = new THREE.Color(0xffebbf);
const color = new THREE.Color();

export function createWinterStarSnow(parent, whale, reduced) {
  let seed = 0x7a91fb;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  const layers = [
    { kind: "crystal", high: 132, near: 104, size: .51 },
    { kind: "star", high: 84, near: 72, size: .43 },
    { kind: "snow", high: 132, near: 70, size: .25 },
  ].map(({ kind, high, near, size }) => {
    const count = high + near;
    const points = makePoints(parent, snowTexture(kind), count, size, 4);
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
        mat2 spin = mat2(c, -s, s, c);
        vec2 uv = spin * point * (1.0 + .42 * vStarMotion.y) + .5;
        float silhouette = texture2D(map, uv).a;
        if (vStarMotion.y > .0) {
          vec2 ghost = spin * (point - vec2(-.045, .25)) * 1.9 + .5;
          float inside = step(0.0, ghost.x) * step(ghost.x, 1.0) * step(0.0, ghost.y) * step(ghost.y, 1.0);
          silhouette = max(silhouette, texture2D(map, ghost).a * .24 * inside);
        }
        diffuseColor.a *= silhouette * (1.0 - smoothstep(.45, .5, length(point)));
      `);
    };
    return {
      points, geometry, motion, high, count, cursor: [0, high],
      particles: Array.from({ length: count }, () => ({ born: -Infinity, life: 0 })),
    };
  });

  const position = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const screen = new THREE.Vector3();
  const highInterval = reduced ? .29 : .24;
  const nearInterval = reduced ? .20 : .16;
  let highClock, nearClock, localStart, localEnd, notified;

  function emit(layer, time, near) {
    const slot = Number(near);
    const index = layer.cursor[slot]++;
    if (layer.cursor[slot] >= (near ? layer.count : layer.high)) layer.cursor[slot] = near ? layer.high : 0;
    const particle = layer.particles[index];
    particle.born = time;
    particle.life = near ? 4.0 + random() * 3.2 : 13 + random() * 9;
    particle.x = position.x;
    particle.y = position.y;
    particle.z = position.z;
    particle.floor = winterHeight(position.x, position.z);
    particle.fall = near ? .75 + random() * 1.18 : 1.22 + random() * 1.19;
    particle.drift = (random() - .5) * (near ? 1.5 : 2.4);
    particle.phase = random() * Math.PI * 2;
    particle.spin = (random() - .5) * .95;
    particle.blue = .18 + random() * .78;
    particle.gold = layer === layers[1] && random() < .24;
    particle.tail = layer === layers[1] && random() < .24 ? 1 : 0;
    particle.size = (.72 + random() * .67) * (particle.tail ? 1.38 : 1);
    particle.opacity = .57 + random() * .37;
  }

  function highSnow(time, age) {
    for (let i = 0; i < layers.length; i++) {
      const source = Math.floor(random() * 6);
      whale.snowPoint(position, age, source, random(), random());
      emit(layers[i], time, false);
    }
  }

  function localSnow(time, player, camera, weight) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < .001) forward.set(0, 0, -1);
    forward.normalize();
    right.set(-forward.z, 0, forward.x);
    for (let i = 0; i < (reduced ? 5 : 6); i++) {
      if (i > 0 && random() > weight) continue;
      position.copy(player).addScaledVector(forward, -2.6 + random() * 14)
        .addScaledVector(right, (random() - .5) * 13);
      position.y = Math.max(player.y, winterHeight(position.x, position.z)) + 2.4 + random() ** 1.35 * 9;
      emit(layers[i < 2 ? 0 : i < 4 ? 1 : 2], time, true);
    }
  }

  function render(time, night, camera) {
    let nearVisible = false;
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
        const z = p.z + .45 * age + .36 * (Math.cos(p.phase + age) - Math.cos(p.phase));
        const opacity = p.opacity * smoothstep(age, 0, .65) * (1 - smoothstep(age / p.life, .72, 1)) *
          smoothstep(y - p.floor, .08, .88) * (.84 + .16 * Math.sin(p.phase + age * 1.5));
        if (opacity < .008) continue;
        color.copy(p.gold ? gold : silver);
        if (!p.gold) color.lerp(ice, p.blue * (.78 - night * .22));
        positions.setXYZ(count, x, y, z);
        colors.setXYZW(count, color.r, color.g, color.b, opacity * (.82 + night * .18));
        scales.setX(count, p.size);
        layer.motion.setXY(count, p.phase + p.spin * age, p.tail);
        if (!notified && !nearVisible && i >= layer.high && opacity > .22 && age > .65) {
          screen.set(x, y, z).project(camera);
          nearVisible = screen.z > -1 && screen.z < 1 && Math.abs(screen.x) < .9 && Math.abs(screen.y) < .9;
        }
        count++;
      }
      material.visible = count > 0;
      if (!material.visible) continue;
      positions.needsUpdate = colors.needsUpdate = scales.needsUpdate = layer.motion.needsUpdate = true;
      layer.geometry.setDrawRange(0, count);
    }
    return nearVisible;
  }

  function reset() {
    highClock = nearClock = 0;
    localStart = localEnd = -Infinity;
    notified = false;
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
    update(dt, time, age, player, camera, night, releasing, nearby) {
      if (releasing) {
        highClock += dt;
        while (highClock >= highInterval) {
          highClock -= highInterval;
          highSnow(time - highClock, age);
        }
      } else highClock = 0;

      if (nearby) {
        localStart = time;
        localEnd = time + 10.25;
        notified = false;
      }
      const shelter = smoothstep(Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z), ...WINTER_TREE.shelter);
      if (time < localEnd && shelter > .04) {
        nearClock += dt;
        const weight = shelter * smoothstep(time - localStart, 0, 1.8) * (1 - smoothstep(time, localEnd - 2, localEnd));
        while (nearClock >= nearInterval) {
          nearClock -= nearInterval;
          localSnow(time - nearClock, player, camera, weight);
        }
      } else nearClock = 0;

      const visible = render(time, night, camera);
      if (!notified && visible && time - localStart >= 1.1 && time < localEnd) {
        notified = true;
        return true;
      }
      return false;
    },
  };
}
