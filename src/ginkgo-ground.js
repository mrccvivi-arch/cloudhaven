import * as THREE from "three";
import { GOLDEN_GINKGO, seeded, terrainHeight } from "./map.js";

const { x, z, canopyRadius } = GOLDEN_GINKGO;
const LITTER_COLORS = [0xe6bd58, 0xeac981, 0xf3d784, 0xd4a753, 0xc99e68, 0xb78954, 0xe8cc9b];
const LISTEN_LEAVES = 16;
const LISTEN_DURATION = 5;
const TAU = Math.PI * 2;

function addRoots(parent, heightAt, random) {
  const positions = [], indices = [], colors = [];
  const steps = 8, sides = 7;
  const bark = new THREE.Color();
  for (let root = 0; root < 7; root++) {
    const start = positions.length / 3;
    const heading = root * TAU / 7 + .36 + (random() - .5) * .27;
    const reach = 1.75 + random() * 1.7;
    const bend = (random() - .5) * 1.35;
    const width = .25 + random() * .13;
    for (let row = 0; row <= steps; row++) {
      const t = row / steps;
      const radius = .28 + reach * t;
      const angle = heading + bend * t + Math.sin(t * Math.PI) * .22;
      const dx = Math.cos(angle) * radius;
      const dz = Math.sin(angle) * radius;
      const taper = (1 - t) ** 1.30;
      for (let side = 0; side < sides; side++) {
        const profile = side * TAU / sides;
        const lateral = Math.cos(profile) * (.024 + width * taper);
        const px = dx - lateral * Math.sin(angle);
        const pz = dz + lateral * Math.cos(angle);
        const py = heightAt(px, pz) - .042 + taper * (.20 + Math.sin(profile) * .28);
        positions.push(px, py, pz);
        colors.push(...bark.setHex(0x865336)
          .multiplyScalar(.78 + .24 * Math.max(0, Math.sin(profile)) + random() * .11).toArray());
        if (row === steps) continue;
        const a = start + row * sides + side;
        const b = start + row * sides + (side + 1) % sides;
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const roots = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true, emissive: 0xdca060, emissiveIntensity: 0,
  }));
  roots.name = "Exposed ginkgo roots";
  roots.userData.ignoreTouchOcclusion = true;
  parent.add(roots);
  return roots;
}

export function createGinkgoGround(parent, leafGeometry, leafMaterial) {
  const random = seeded(4403);
  const heightAt = (dx, dz) => terrainHeight(x + dx, z + dz) - parent.position.y;
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  function batch(name, geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.userData.ignoreTouchOcclusion = true;
    parent.add(mesh);
    return mesh;
  }
  function place(mesh, index, dx, dz, y, sx, sy, sz, angle, tint) {
    pose.position.set(dx, heightAt(dx, dz) + y, dz);
    pose.scale.set(sx, sy, sz);
    pose.rotation.set(0, angle, 0);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
    mesh.setColorAt(index, color.setHex(tint));
  }

  const roots = addRoots(parent, heightAt, random);
  const decorMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  const pebbles = batch("Ginkgo pebbles and moss", new THREE.IcosahedronGeometry(1, 0), decorMaterial, 28);
  const stems = batch("Ginkgo mushroom stems", new THREE.CylinderGeometry(.035, .055, .18, 6), decorMaterial, 9);
  const caps = batch("Ginkgo mushroom caps", new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, Math.PI * .56), decorMaterial, 9);
  const pockets = [[-1.48, 1.3], [2.4, 1.45], [.3, -1.9], [-2.6, -.45]];
  const stones = [0x9a9b88, 0x888d8c, 0xa9a795];
  const mossColors = [0x6a843f, 0x7b9049, 0x8a9d53];
  for (let i = 0; i < pebbles.count; i++) {
    const [cx, cz] = pockets[i % pockets.length];
    const moss = i >= 11;
    const size = moss ? .11 + random() * .13 : .12 + random() * .15;
    const colors = moss ? mossColors : stones;
    place(pebbles, i, cx + (random() - .5) * 1.08, cz + (random() - .5) * 1.04, 0,
      size * 1.36, size * (moss ? .28 : .63), size, random() * TAU, colors[i % colors.length]);
  }
  for (let i = 0; i < stems.count; i++) {
    const [cx, cz] = pockets[i % 3];
    const angle = Math.floor(i / 3) * TAU / 3 + random() * .8;
    const distance = .18 + random() * .24;
    const dx = cx + Math.cos(angle) * distance, dz = cz + Math.sin(angle) * distance;
    const size = .66 + random() * .63;
    place(stems, i, dx, dz, .077 * size, size, size, size, angle, 0xe4d6b7);
    place(caps, i, dx, dz, .159 * size, .125 * size, .078 * size, .118 * size, angle,
      i % 2 ? 0xffeccc : 0xf7e4bc);
  }

  const litter = batch("Ginkgo leaf carpet", leafGeometry, leafMaterial, 690);
  const lifted = batch("Listening leaves", leafGeometry, leafMaterial, LISTEN_LEAVES);
  lifted.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lifted.frustumCulled = false;
  const listening = [];
  function setLeaf(mesh, i, leaf, progress = 0, lift = 0) {
    const orbit = progress * 2.3 + leaf.angle;
    const dx = leaf.x + lift * (Math.cos(orbit) - Math.cos(leaf.angle)) * .75;
    const dz = leaf.z + lift * (Math.sin(orbit) - Math.sin(leaf.angle)) * .75;
    pose.position.set(dx, heightAt(dx, dz) + leaf.height + lift * leaf.rise, dz);
    pose.rotation.set(-Math.PI / 2 + lift * Math.sin(orbit) * .85, lift * Math.cos(orbit) * .7,
      leaf.angle + progress * 2.1 * lift);
    pose.scale.setScalar(leaf.scale);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
  }

  for (const mesh of [litter, lifted]) {
    for (let i = 0; i < mesh.count; i++) {
      const angle = (i + random()) * 2.399963;
      const edge = canopyRadius * (.84 + .11 * Math.sin(angle * 3 + .5) + .08 * Math.cos(angle * 5));
      const radius = mesh === litter ? .57 + (edge - .57) * random() ** 1.25 : 1.3 + random() * 2.8;
      const leaf = {
        x: radius * Math.cos(angle), z: radius * Math.sin(angle), angle: random() * TAU,
        height: .021 + random() * .012, scale: .16 + random() * .22, rise: .48 + random() * .87,
        delay: random() * .18,
      };
      setLeaf(mesh, i, leaf);
      mesh.setColorAt(i, color.setHex(LITTER_COLORS[Math.floor(random() * LITTER_COLORS.length)]));
      if (mesh === lifted) listening.push(leaf);
    }
  }

  let listenTime = LISTEN_DURATION;
  return {
    listen() { listenTime = 0; },
    update(dt, night) {
      roots.material.emissiveIntensity = night * .065;
      if (listenTime >= LISTEN_DURATION) return;
      listenTime = Math.min(LISTEN_DURATION, listenTime + dt);
      listening.forEach((leaf, i) => {
        const progress = THREE.MathUtils.clamp(listenTime / LISTEN_DURATION - leaf.delay, 0, .82) / .82;
        const lift = Math.sin(Math.PI * progress) ** 2;
        setLeaf(lifted, i, leaf, progress, lift);
      });
      lifted.instanceMatrix.needsUpdate = true;
    },
  };
}
