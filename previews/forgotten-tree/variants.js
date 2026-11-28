import * as THREE from "three";
import { createWinterTree } from "../../src/winter-tree.js";
import { createClassicalTree } from "./classical.js";

const ivory = new THREE.Color(0xd6cfc0);
const limestone = new THREE.Color(0x9f9a8f);
const indigo = new THREE.Color(0x293b59);
const slate = new THREE.Color(0x6c788d);
const gold = new THREE.Color(0x94805f);
const { smoothstep } = THREE.MathUtils;

function woodMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .91 });
}

function colorWood(geometry) {
  const tint = new THREE.Color();
  const positions = geometry.attributes.position;
  const colors = geometry.attributes.color;
  const grain = geometry.attributes.grain;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const drift = .5 + .5 * Math.sin(x * 1.6 + z * 1.1 + .25 * Math.sin(y * 1.5));
    const streak = Math.min(1, grain.getX(i) * 1.8);
    tint.copy(ivory).lerp(limestone, .12 + .26 * drift + .18 * streak);
    colors.setXYZ(i, tint.r, tint.g, tint.b);
  }
  return geometry;
}

export function growth(point) {
  return point.x - 1.55 * Math.sin(point.y * .31 + point.z * .27)
    + 1.35 * Math.sin(point.z * .47) - .36 * point.z;
}

function foliage(source, sparse) {
  const geometry = source.geometry.clone();
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .88 });
  const leaves = new THREE.InstancedMesh(geometry, material, source.count);
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const tint = new THREE.Color();
  let used = 0;
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix);
    const division = growth(point);
    const seed = (i * .61803398875) % 1;
    if (sparse && seed > smoothstep(division, -2.4, 2.8) * .97) continue;
    if (sparse) {
      const reduction = .77 + .23 * smoothstep(division, -.8, 5.1);
      matrix.scale(new THREE.Vector3(reduction, reduction, reduction));
    }
    leaves.setMatrixAt(used, matrix);
    const variation = .5 + .5 * Math.sin(point.x * .71 + point.y * .57 + point.z * .43);
    tint.copy(indigo).lerp(slate, .17 + .51 * variation ** 2 + .16 * seed);
    leaves.setColorAt(used++, tint);
  }
  leaves.count = used;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  return leaves;
}

function ornaments(source, sparse) {
  const group = new THREE.Group();
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  for (const mesh of source) {
    if (!mesh.isInstancedMesh) continue;
    const glass = Boolean(mesh.userData.globeTypes);
    const color = glass ? 0x8794a6 : mesh.geometry.attributes.heart ? 0x5b697f : 0x978f81;
    const material = new THREE.MeshStandardMaterial({
      color, roughness: .89, side: mesh.material.side,
      transparent: glass, opacity: glass ? .23 : 1, depthWrite: !glass,
    });
    if (glass) {
      // Keep the outline of the suspended glass without the original glow or snowy contents.
      material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
          float rim = 1. - abs(dot(normal, normalize(vViewPosition)));
          diffuseColor.a *= .10 + .90 * rim * rim;
          #include <opaque_fragment>
        `);
      };
    }
    const copy = new THREE.InstancedMesh(mesh.geometry, material, mesh.count);
    let used = 0;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      if (sparse && growth(point.setFromMatrixPosition(matrix)) < 1.8) continue;
      copy.setMatrixAt(used++, matrix);
    }
    copy.count = used;
    copy.renderOrder = mesh.renderOrder;
    group.add(copy);
  }
  return group;
}

// The original merge preserves the tube vertex order and each tube's independent rings.
function tubes(geometry) {
  const index = geometry.index.array;
  const ranges = [];
  for (let start = 0; start < index.length;) {
    const vertex = index[start];
    const sides = index[start + 2] - vertex;
    let end = start + 6;
    let last = Math.max(index[start + 3], index[start + 4], index[start + 5]);
    while (end < index.length && index[end] <= last) {
      for (let i = end; i < end + 6; i++) last = Math.max(last, index[i]);
      end += 6;
    }
    ranges.push({ start, end, vertex, sides, rings: (last - vertex + 1) / sides });
    start = end;
  }
  return ranges;
}

function makeFragment(source, tube, first, last, splitRing, splitDirection) {
  const { sides, vertex } = tube;
  const positions = [], colors = [], indices = [];
  const position = source.attributes.position;
  const color = source.attributes.color;
  const sample = new THREE.Vector3(), neighbor = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (let ring = first; ring <= last; ring++) {
    for (let side = 0; side < sides; side++) {
      const index = vertex + ring * sides + side;
      sample.fromBufferAttribute(position, index);
      if (ring === splitRing) {
        neighbor.fromBufferAttribute(position, index + sides * splitDirection);
        sample.lerp(neighbor, .11 + .36 * Math.sin(side * 4.71 + vertex) ** 2);
        center.addScaledVector(sample, 1 / sides);
      }
      positions.push(...sample);
      const at = (ring - first) * sides + side;
      const next = (ring - first) * sides + (side + 1) % sides;
      colors.push(color.getX(index), color.getY(index), color.getZ(index));
      if (ring < last) indices.push(at, next, at + sides, next, next + sides, at + sides);
    }
  }
  const cap = positions.length / 3;
  positions.push(...center);
  const capTint = ivory.clone().lerp(limestone, .52);
  colors.push(capTint.r, capTint.g, capTint.b);
  for (let side = 0; side < sides; side++) {
    const ring = (splitRing - first) * sides;
    const a = ring + side, b = ring + (side + 1) % sides;
    if (splitRing === first) indices.push(cap, b, a);
    else indices.push(cap, a, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function fracture(wood, ranges, material) {
  const group = new THREE.Group();
  const tip = new THREE.Vector3(), start = new THREE.Vector3();
  const position = wood.attributes.position;
  const candidates = ranges.filter(branch => {
    if (branch.sides !== 7) return false;
    tip.fromBufferAttribute(position, branch.vertex + (branch.rings - 1) * branch.sides);
    start.fromBufferAttribute(position, branch.vertex);
    return tip.y > 7 && tip.y < 19 && growth(tip) < -6 && tip.x < start.x - 2.1;
  });
  const chosen = candidates.length > 2
    ? [candidates[0], candidates[Math.floor(candidates.length * .58)]]
    : candidates;
  const index = wood.index.array;
  const kept = [];
  let previous = 0;
  for (const [i, branch] of chosen.entries()) {
    for (let j = previous; j < branch.start; j++) kept.push(index[j]);
    previous = branch.end;
    const split = Math.floor((branch.rings - 1) * .44);
    const stump = new THREE.Mesh(makeFragment(wood, branch, 0, split, split, 1), material);
    const shard = new THREE.Mesh(makeFragment(wood, branch, split + 1, branch.rings - 1, split + 1, -1), material);
    shard.position.set(-1.02 + i * .28, .53 + i * .20, .31 - i * .51);
    stump.castShadow = shard.castShadow = true;
    group.add(stump, shard);
  }
  for (let j = previous; j < index.length; j++) kept.push(index[j]);
  wood.setIndex(kept);
  return group;
}

function cracks(wood, trunkRange) {
  const geometry = wood.clone();
  geometry.setDrawRange(trunkRange.start, trunkRange.end - trunkRange.start);
  const probe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.updateMatrixWorld();
  const cast = new THREE.Raycaster();
  const radial = new THREE.Vector3();
  const lines = [
    { y: 1.5, length: 5.8, azimuth: 1.25, width: .052 },
    { y: 3.2, length: 2.45, azimuth: 1.02, width: .032 },
    { y: 8.3, length: 2.7, azimuth: .09, width: .037 },
    { y: 3.2, length: 3.5, azimuth: 2.77, width: .041 },
  ];
  const points = [], indices = [];
  for (const [index, line] of lines.entries()) {
    let previous = -1;
    for (let i = 0; i <= 23; i++) {
      const t = i / 23;
      const y = line.y + t * line.length;
      const angle = line.azimuth + .18 * t + .11 * Math.sin(t * 11 + index) + .045 * Math.sin(t * 43);
      const width = line.width * (.16 + .84 * Math.sin(Math.PI * t) ** .8) * (.75 + .25 * Math.sin(t * 16 + 1));
      const edges = [-1, 1].map(side => {
        radial.set(Math.cos(angle + side * width), 0, Math.sin(angle + side * width));
        cast.set(radial.clone().multiplyScalar(10).setY(y + side * .02), radial.clone().negate());
        const hit = cast.intersectObject(probe, false)[0];
        return hit?.point.addScaledVector(radial, .026);
      });
      if (edges.some(edge => !edge)) {
        previous = -1;
        continue;
      }
      const start = points.length / 3;
      for (const edge of edges) points.push(...edge);
      if (previous >= 0) indices.push(previous, start, previous + 1, start, start + 1, previous + 1);
      previous = start;
    }
  }
  geometry.dispose();
  probe.material.dispose();
  const surface = new THREE.BufferGeometry();
  surface.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  surface.setIndex(indices);
  surface.computeVertexNormals();
  return new THREE.Mesh(surface, new THREE.MeshStandardMaterial({
    color: gold, roughness: .96, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
}

export function createTreeVersions(camera) {
  const originalScene = new THREE.Group();
  const update = createWinterTree(originalScene);
  update(.8, .16, camera);
  const original = originalScene.children[0];
  original.position.set(0, 0, 0);
  const wood = original.children.find(mesh => mesh.geometry?.attributes.grain);
  const crown = original.children.find(mesh => mesh.isInstancedMesh && mesh.renderOrder === 1 && mesh.geometry.attributes.petalEdge);
  const decorations = original.children.filter(mesh => mesh !== wood && mesh !== crown);
  wood.castShadow = wood.receiveShadow = true;
  crown.castShadow = true;

  const timber = colorWood(wood.geometry.clone());
  const ranges = tubes(timber);
  const material = woodMaterial();
  const altered = [1, 2, 3].map(version => {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(version === 3 ? timber.clone() : timber, material);
    trunk.castShadow = trunk.receiveShadow = true;
    group.add(trunk, foliage(crown, version > 1), ornaments(decorations, version > 1));
    if (version === 3) {
      group.add(cracks(timber, ranges[0]), fracture(trunk.geometry, ranges, material));
    }
    return group;
  });

  const v2Leaves = altered[1].children.find(mesh => mesh.isInstancedMesh);
  const classical = createClassicalTree(wood.geometry, crown, ranges, growth, v2Leaves.count);
  return [original, ...altered, classical];
}
