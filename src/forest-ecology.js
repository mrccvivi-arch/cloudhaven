import * as THREE from "three";
import { forestLayout, FOREST_MUSHROOMS } from "./forest-layout.js";
import { terrainHeight } from "./map.js";

const flowerColors = [0xf5ecdb, 0xebd89f, 0xc2b3d3];
const butterflyColors = [0xeac39b, 0xb7b5d5, 0xe9dfb0];
const capColors = [0xd5baa0, 0xba9379, 0xe1c8a4];
const TWO_PI = Math.PI * 2;

export function createForestEcology(parent, seed, reduced) {
  const group = new THREE.Group();
  group.name = "Forest ecology";
  parent.add(group);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const stemGeometry = new THREE.CylinderGeometry(1, 1.2, 1, 5);
  const sphere = new THREE.SphereGeometry(1, 7, 5);
  const cap = new THREE.SphereGeometry(1, 9, 4, 0, TWO_PI, 0, Math.PI / 2);
  const wing = new THREE.CircleGeometry(1, 7);
  wing.translate(.68, 0, 0);
  wing.rotateX(-Math.PI / 2);
  const plantMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const wingsMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  function mesh(name, geometry, material, capacity, dynamic = false) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = dynamic ? false : true;
    if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  }
  function instance(mesh, x, y, z, sx, sy, sz, tint, yaw = 0, roll = 0) {
    const index = mesh.count++;
    transform.position.set(x, y, z);
    transform.rotation.set(0, yaw, roll, "YXZ");
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, color.set(tint));
  }
  function commit(mesh) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  let stems, foliage, caps;
  const butterflies = mesh("Butterfly wings", wing, wingsMaterial, reduced ? 8 : 12, true);
  const fireflies = mesh("Fireflies", sphere, new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending, transparent: true, opacity: .72, depthWrite: false, toneMapped: false,
  }), reduced ? 8 : 14, true);
  const seedPuffs = mesh("Dandelion seeds", sphere, new THREE.MeshBasicMaterial({
    transparent: true, opacity: .78,
  }), reduced ? 12 : 24, true);
  let date, plants = [], butterfliesAt = [], firefliesAt = [], previousFlowerIds;
  let nearby = [], flying = [], activeAnchors = [];
  let elapsed = 0, rescanAt = 0, nextSeeds = 7, night;
  const seeds = [];

  function plant(entry) {
    const { kind, x, y, z, size: s, style, yaw } = entry;
    if (kind === "flower") {
      for (let i = 0; i < 3; i++) {
        const angle = yaw + i * TWO_PI / 3;
        const px = x + Math.cos(angle) * .23 * s, pz = z + Math.sin(angle) * .23 * s;
        const base = terrainHeight(px, pz), height = (.24 + i * .065) * s;
        instance(stems, px, base + height / 2, pz, .018 * s, height, .018 * s, 0x6f8b5b);
        for (let petal = 0; petal < 4; petal++) {
          const direction = angle + petal * Math.PI / 2;
          instance(foliage, px + Math.sin(direction) * .052 * s, base + height, pz + Math.cos(direction) * .052 * s,
            .037 * s, .025 * s, .052 * s, flowerColors[style], direction);
        }
        instance(foliage, px, base + height + .021 * s, pz, .037 * s, .03 * s, .037 * s, 0xdac088);
      }
    } else if (kind === "dandelion") {
      instance(stems, x, y + .24 * s, z, .022 * s, .48 * s, .022 * s, 0x758c58);
      instance(foliage, x, y + .49 * s, z, .112 * s, .105 * s, .112 * s, 0xf1edda);
    } else if (kind === "mushroom") {
      for (let i = 0; i < 3; i++) {
        const angle = yaw + i * TWO_PI / 3;
        const px = x + Math.cos(angle) * .17, pz = z + Math.sin(angle) * .17;
        const base = terrainHeight(px, pz), size = s * (.7 + i * .14);
        instance(stems, px, base + .095 * size, pz, .045 * size, .19 * size, .045 * size, 0xe5d9bf);
        instance(caps, px, base + .17 * size, pz, .145 * size, .09 * size, .145 * size, capColors[style]);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const angle = yaw + i * Math.PI / 2;
        instance(foliage, x + Math.sin(angle) * .066 * s, y + .06 * s, z + Math.cos(angle) * .066 * s,
          .046 * s, .018 * s, .072 * s, 0x698a54, angle);
      }
    }
  }

  function rebuild(nextDate, previousDate) {
    date = nextDate;
    const layout = forestLayout(date, seed);
    plants = layout.plants;
    const wet = plants.filter(({ kind }) => kind === "mushroom");
    butterfliesAt = plants.filter(({ kind }) => kind === "flower");
    firefliesAt = [...wet, ...layout.glades];
    previousFlowerIds = previousDate && new Set(forestLayout(previousDate, seed).plants
      .filter(({ kind }) => kind === "flower").map(({ id }) => id));
    for (const previous of [stems, foliage, caps].filter(Boolean)) {
      group.remove(previous);
      previous.dispose();
    }
    const capacity = Math.max(1, plants.length);
    stems = mesh("Forest plant stems", stemGeometry, plantMaterial, capacity * 3);
    const heads = plants.reduce((count, entry) => count + ({ flower: 15, clover: 4, dandelion: 1 }[entry.kind] ?? 0), 0);
    foliage = mesh("Wildflowers, dandelions and clover", sphere, plantMaterial, Math.max(1, heads));
    caps = mesh("Forest mushroom caps", cap, plantMaterial, capacity * 3);
    for (const entry of plants) plant(entry);
    for (const mesh of [stems, foliage, caps]) commit(mesh);
    rescanAt = 0;
  }

  function distance(point, player) {
    return (point.x - player.x) ** 2 + (point.z - player.z) ** 2;
  }

  return {
    update(player, dt, isNight, getDay) {
      group.visible = player.layer === "ground";
      if (!group.visible) {
        flying = [];
        rescanAt = 0;
        return;
      }
      elapsed += dt;
      if (night !== isNight || elapsed >= rescanAt) {
        const day = getDay();
        if (date !== day.date) rebuild(day.date, day.previousDate);
        night = isNight;
        rescanAt = elapsed + .65;
        nearby = plants.filter((plant) => distance(plant, player) < 20 ** 2);
        const anchors = night ? firefliesAt : butterfliesAt;
        activeAnchors = anchors.map((point) => [point, distance(point, player)])
          .filter(([, d]) => d <= 24 ** 2).sort((a, b) => a[1] - b[1])
          .slice(0, night ? (reduced ? 8 : 14) : (reduced ? 4 : 6)).map(([point]) => point);
      }

      butterflies.count = fireflies.count = seedPuffs.count = 0;
      flying = [];
      for (const point of activeAnchors) {
        const phase = point.x * .79 + point.z * .66;
        const t = elapsed * .43 + phase;
        const x = point.x + Math.sin(t) * 1.25 + Math.sin(t * .46 + phase) * .4;
        const z = point.z + Math.cos(t * .84) * 1.28;
        const y = terrainHeight(x, z) + .85 + Math.sin(t * 1.7) * .25;
        flying.push({ x, y, z });
        if (night) {
          const glow = (.5 + Math.sin(elapsed * (1.7 + Math.abs(Math.sin(phase))) + phase * 3) * .5) ** 2;
          const size = .025 + glow * .035;
          color.setRGB(.20 + glow * .38, .25 + glow * .46, .10 + glow * .17);
          instance(fireflies, x, y, z, size, size, size, color);
        } else {
          const yaw = Math.atan2(Math.cos(t), -Math.sin(t * .84));
          const flap = .25 + Math.sin(elapsed * 15 + phase) * .92;
          const tint = butterflyColors[point.style];
          instance(butterflies, x, y, z, .15, .10, .11, tint, yaw, flap);
          instance(butterflies, x, y, z, .15, .10, .11, tint, yaw + Math.PI, flap);
        }
      }

      if (elapsed >= nextSeeds) {
        nextSeeds = elapsed + 9 + Math.random() * 13;
        const dandelions = nearby.filter((plant) => plant.kind === "dandelion" && distance(plant, player) < 14 ** 2);
        const tuft = dandelions[Math.floor(Math.random() * dandelions.length)];
        if (tuft) for (let i = 0; i < 3; i++) seeds.push({
          x: tuft.x, y: tuft.y + .48, z: tuft.z, age: -i * .42, drift: .11 + Math.random() * .14,
        });
      }
      for (let i = seeds.length - 1; i >= 0; i--) {
        const seed = seeds[i];
        seed.age += dt;
        if (seed.age >= 7 || distance(seed, player) > 24 ** 2) {
          seeds.splice(i, 1);
        } else if (seed.age >= 0) {
          const size = .028 * Math.min(1, (7 - seed.age) / 1.5);
          instance(seedPuffs, seed.x + seed.age * seed.drift, seed.y + seed.age * .175,
            seed.z + Math.sin(seed.age) * .25, size, size, size, 0xfff9eb);
        }
      }
      for (const mesh of [butterflies, fireflies, seedPuffs]) commit(mesh);
    },
    features(player) {
      const hasFlying = flying.some((point) => distance(point, player) < 3.6 ** 2 && Math.abs(point.y - player.y) < 2.8);
      const near = (point) => distance(point, player) < 3.2 ** 2 && Math.abs(point.y - player.y) < 2;
      return {
        butterfly: !night && hasFlying,
        firefly: night && hasFlying,
        mushroom: nearby.some((plant) => plant.kind === "mushroom" && near(plant)) || FOREST_MUSHROOMS.some(near),
        newFlower: Boolean(previousFlowerIds && nearby.some((plant) =>
          plant.kind === "flower" && !previousFlowerIds.has(plant.id) && near(plant))),
      };
    },
  };
}
