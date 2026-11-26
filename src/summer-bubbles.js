import * as THREE from "three";
import { BODY_RADIUS } from "./cotton-candy.js";
import {
  CAPE_ROCKS, COAST_TREES, ISLAND_BRIDGE, PIER, SUMMER_WATER, SWING, TOWER, capeWeight, coastPoint, islandHeight,
  onRainbow, pierLocal, pierWidth, pondDistance, summerWalkable, wadePoint,
} from "./summer-layout.js";

const TAU = Math.PI * 2;
const { lerp, smoothstep } = THREE.MathUtils;
const between = (random, min, max) => lerp(min, max, random());
const within = (x, z, other, radius) => (x - other.x) ** 2 + (z - other.z) ** 2 < radius ** 2;
const spots = [[-8, 30], [-2, 34], [0, 11], [10, 12], [2, 1]];
for (const angle of [.58, .87, 1.19, 1.49, 1.75, 1.97]) {
  const shore = coastPoint(angle);
  const shallow = wadePoint(angle, BODY_RADIUS + 1);
  spots.push(coastPoint(angle, .92), shore, [lerp(shore[0], shallow[0], .44), lerp(shore[1], shallow[1], .44)]);
}
const GROUP_COUNT = 3;
const GROUP_SIZE = 12;
const POP_SECONDS = .76;
const palette = [0xffb2c6, 0xffd7ab, 0xfff3ab, 0xc8f2bd, 0xaeeaed, 0xadc8ff, 0xe1baff];

function openGround(x, z) {
  const { across, along } = pierLocal(x, z);
  if (along > -1 && along < PIER.length + 1 && Math.abs(across) < pierWidth(along) / 2 + 1) return false;
  return capeWeight(x, z) < .35 && !within(x, z, SWING, 3.6) &&
    !CAPE_ROCKS.some((rock) => within(x, z, rock, Math.max(rock.w, rock.d) + BODY_RADIUS)) &&
    !onRainbow(ISLAND_BRIDGE, x, z, 8) && pondDistance(x, z) > 1.15 &&
    !within(x, z, TOWER, TOWER.gallery + 2) &&
    !COAST_TREES.some((tree) => within(x, z, tree, tree.size + .7)) &&
    summerWalkable({ x, z, y: 0 }, x, z, BODY_RADIUS + 1.15);
}

function bubbleTexture() {
  const size = 96;
  const pixels = new Uint8Array(size * size * 4);
  const color = new THREE.Color(), rim = new THREE.Color(), highlight = new THREE.Color(0xfffbff);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + .5) / size * 2 - 1, y = (j + .5) / size * 2 - 1;
      const r = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      rim.setHSL((angle / TAU + .62 + .08 * Math.sin(angle * 3) + 1) % 1, .88, .65, THREE.SRGBColorSpace);
      const edge = smoothstep(r, .57, .91) * (1 - smoothstep(r, .91, .995));
      const glint = Math.exp(-(((x + .32 + .55 * (y - .48)) / .12) ** 2 + ((y - .48) / .24) ** 2));
      color.copy(rim).lerp(highlight, glint * .96 + .12).convertLinearToSRGB();
      const index = (j * size + i) * 4;
      pixels[index] = color.r * 255;
      pixels[index + 1] = color.g * 255;
      pixels[index + 2] = color.b * 255;
      pixels[index + 3] = Math.min(1, edge * .92 + glint * .86 + .045) * (1 - smoothstep(r, .97, 1)) * 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function spriteMaterials(map, color) {
  return Array.from({ length: 9 }, (_, level) => new THREE.SpriteMaterial({
    map, color, opacity: level / 8, transparent: true, depthWrite: false, toneMapped: false,
  }));
}

export function createSummerBubbles(parent, random = Math.random) {
  const bubbleMaterials = spriteMaterials(bubbleTexture(), 0xffffff);
  const ringGeometry = new THREE.RingGeometry(.89, 1, 24);
  const ringFinishes = bubbleMaterials.map(({ opacity }) => new THREE.MeshBasicMaterial({
    opacity, color: 0xffe6f5, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }));
  const bubbles = Array.from({ length: GROUP_COUNT * GROUP_SIZE }, (_, i) => {
    const sprite = new THREE.Sprite(bubbleMaterials[8]);
    sprite.visible = false;
    sprite.renderOrder = 5;
    parent.add(sprite);
    const ring = new THREE.Mesh(ringGeometry, ringFinishes[8]);
    ring.visible = false;
    ring.renderOrder = 5;
    parent.add(ring);
    return { sprite, ring, index: i % GROUP_SIZE, active: false, popped: -Infinity };
  });
  const groups = Array.from({ length: GROUP_COUNT }, (_, i) => ({
    bubbles: bubbles.slice(i * GROUP_SIZE, (i + 1) * GROUP_SIZE), started: 0, end: 0,
  }));
  for (const group of groups) {
    for (const bubble of group.bubbles) bubble.group = group;
  }
  const particles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ toneMapped: false }), bubbles.length * 5);
  particles.frustumCulled = false;
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.count = 0;
  const velocities = Array.from({ length: bubbles.length * 5 }, () => new THREE.Vector3());
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  const inView = new THREE.Vector3();
  parent.add(particles);
  let age = 0, next = between(random, 3, 5), first = true, seen = false;

  function visible(x, y, z, camera) {
    inView.set(x, y, z).project(camera);
    return inView.z > -1 && inView.z < 1 && Math.abs(inView.x) < .85 && Math.abs(inView.y) < .85;
  }

  function spawn(group, player, camera) {
    const occupied = bubbles.filter((bubble) => bubble.active && bubble.group.end > age);
    const wantInView = !groups.some(({ bubbles: members, end }) => end > age && members.filter(({ sprite }) => {
      const { x, y, z } = sprite.position;
      return sprite.visible && visible(x, y, z, camera);
    }).length >= 3);
    const candidates = [];
    function consider(x, z) {
      const distance = Math.hypot(x - player.x, z - player.z);
      if (distance < 6.5 || !openGround(x, z) ||
          occupied.some((other) => within(x, z, other, 7.5))) return;
      const inFrame = visible(x, islandHeight(x, z) + 1, z, camera);
      const viewPenalty = inFrame === wantInView ? 0 : 35;
      candidates.push({ x, z, distance, inFrame, priority: viewPenalty + Math.abs(distance - (wantInView ? 9 : 15)) + random() * 5 });
    }

    const heading = random() * TAU;
    for (const radius of [8, 13, 19]) {
      for (let i = 0; i < 12; i++) {
        const angle = heading + i * TAU / 12;
        consider(player.x + radius * Math.cos(angle), player.z + radius * Math.sin(angle));
      }
    }
    // The bridge arrival can be above the water, outside all nearby ground samples.
    for (const [x, z] of spots) consider(x, z);
    candidates.sort((a, b) => a.priority - b.priority);
    if (!candidates.length) return false;

    const { x: cx, z: cz, distance, inFrame } = candidates[0];
    const count = Math.floor(between(random, 6, 13));
    const direction = distance >= 12
      ? Math.atan2(player.z - cz, player.x - cx) + between(random, -.7, .7)
      : random() * TAU;
    for (let i = 0; i < count; i++) {
      const bubble = group.bubbles[i];
      const keepInFrame = wantInView && inFrame && i < Math.ceil(count / 2);
      let x = cx, z = cz;
      for (let attempt = 0; attempt < 8; attempt++) {
        const px = cx + between(random, -3.3, 3.3), pz = cz + between(random, -3.3, 3.3);
        if (!openGround(px, pz) || within(px, pz, player, 4.2) ||
            occupied.some((other) => within(px, pz, other, 4.2)) ||
            (keepInFrame && !visible(px, islandHeight(px, pz) + 1, pz, camera))) continue;
        x = px;
        z = pz;
        break;
      }
      const angle = direction + between(random, -.45, .45), speed = between(random, .09, .23);
      Object.assign(bubble, { x, z, dx: Math.cos(angle) * speed, dz: Math.sin(angle) * speed,
        lift: i >= count - 2 ? between(random, 1.85, 2.23) : between(random, .62, 1.19),
        phase: random() * TAU, frequency: between(random, .74, 1.43), size: between(random, .33, .77), active: true });
    }
    for (let i = count; i < GROUP_SIZE; i++) group.bubbles[i].active = group.bubbles[i].sprite.visible = false;
    group.started = age;
    group.end = age + between(random, 35, 50);
    return true;
  }

  return {
    reset() {
      age = 0;
      first = true;
      next = between(random, 3, 5);
      for (const group of groups) group.end = 0;
      for (const bubble of bubbles) {
        bubble.active = bubble.sprite.visible = bubble.ring.visible = false;
        bubble.popped = -Infinity;
      }
      particles.count = 0;
    },
    update(elapsed, night, player, camera, interactive, emit) {
      age += elapsed;
      if (age >= next) {
        const group = groups.find(({ bubbles: members, end }) =>
          !members.some(({ active, popped }) => (active && age < end) || age - popped < POP_SECONDS));
        if (group) {
          if (night >= .8) next = age + between(random, 10, 20);
          else if (first || night === 0 || random() < lerp(.86, .43, night)) {
            camera.updateMatrixWorld();
            if (spawn(group, player, camera)) {
              next = age + between(random, 15, 25);
              first = false;
            } else next = age + 2;
          } else next = age + between(random, 15, 25);
        }
      }

      let count = 0;
      for (const [i, bubble] of bubbles.entries()) {
        const { sprite, ring, group } = bubble;
        if (bubble.active) {
          const x = bubble.x + bubble.dx * elapsed, z = bubble.z + bubble.dz * elapsed;
          if (openGround(x, z)) {
            bubble.x = x;
            bubble.z = z;
          } else {
            bubble.dx *= -1;
            bubble.dz *= -1;
          }
          const y = Math.max(islandHeight(bubble.x, bubble.z), SUMMER_WATER - .12) +
            bubble.lift + .16 * Math.sin(age * bubble.frequency + bubble.phase);
          const fade = Math.min(1, (age - group.started) / 1.3, (group.end - age) / 3);
          sprite.position.set(bubble.x, y, bubble.z);
          sprite.scale.set(bubble.size, bubble.size, 1);
          sprite.visible = fade > 0;
          sprite.material = bubbleMaterials[Math.round(8 * Math.max(0, fade))];
          if (fade <= 0 && age >= group.end) bubble.active = false;
          if (interactive && fade > .25) {
            const dx = player.x - bubble.x, dz = player.z - bubble.z, dy = player.y + BODY_RADIUS - y;
            if (!seen && dx * dx + dz * dz < 20 ** 2 && Math.abs(dy) < 4) {
              inView.copy(sprite.position).project(camera);
              if (inView.z > -1 && inView.z < 1 && Math.abs(inView.x) < .85 && Math.abs(inView.y) < .85) {
                seen = true;
                emit("summer-bubble-meet");
              }
            }
            if (dx * dx + dy * dy + dz * dz < (BODY_RADIUS + bubble.size * .42) ** 2) {
              bubble.active = sprite.visible = false;
              bubble.popped = age;
              for (let j = 0; j < 5; j++) {
                const angle = (j / 5 + random() * .13) * TAU;
                velocities[i * 5 + j].set(Math.cos(angle), between(random, -.30, .65), Math.sin(angle))
                  .multiplyScalar(between(random, .38, .91));
              }
              emit("summer-bubble-pop");
            }
          }
        }

        const life = (age - bubble.popped) / POP_SECONDS;
        ring.visible = life < 1;
        if (!ring.visible) continue;
        ring.position.copy(sprite.position);
        ring.quaternion.copy(camera.quaternion);
        ring.scale.setScalar(bubble.size * (.49 + life * .85));
        ring.material = ringFinishes[Math.round(8 * (1 - life) ** 2)];
        for (let j = 0; j < 5; j++) {
          pose.position.copy(sprite.position).addScaledVector(velocities[i * 5 + j], life);
          pose.scale.setScalar(.052 * (1 - life) ** .65);
          pose.updateMatrix();
          particles.setMatrixAt(count, pose.matrix);
          particles.setColorAt(count++, color.setHex(palette[(bubble.index + j) % palette.length]));
        }
      }
      particles.count = count;
      if (count) {
        particles.instanceMatrix.needsUpdate = true;
        particles.instanceColor.needsUpdate = true;
      }
    },
  };
}
