import * as THREE from "three";
import { seeded } from "./map.js";
import { CAPE_ROCKS, ISLAND_BRIDGE, POND, SWING, TOWER, coastDistance, islandHeight, onRainbow, pondDistance } from "./summer-layout.js";

const TAU = Math.PI * 2;
const beds = [
  // Bridge approach and the verges of the lighthouse road.
  [-11.1, 33.5, 1.65, 8, 0], [-5.1, 34.2, 1.56, 7, 2], [-10.1, 30.1, 1.46, 8, 1],
  [-1.0, 24.4, 1.54, 7, 0], [-8.9, 11.4, 1.55, 7, 1], [-2.5, 8.0, 1.14, 6, 0],
  [6.9, -5.3, 1.59, 9, 0], [2.5, -10.0, 1.30, 7, 1],
  [10.1, -11.1, 1.27, 8, 0], [16.7, -13.1, 1.60, 9, 2],
  // The swing, pool and a few crevices at the rock line.
  [21.0, 11.2, 1.68, 9, 0], [28.2, 9.1, 1.44, 8, 2], [24.0, 4.7, 1.21, 7, 1],
  [POND.x + 6.5, POND.z - 2.6, 1.58, 10, 2], [POND.x - 4.5, POND.z + 5.5, 1.52, 8, 0],
  [POND.x + 2.3, POND.z + 6.2, 1.21, 7, 1],
  [23.8, -24.7, 1.35, 7, 0], [26.2, -20.4, 1.41, 7, 2], [8.0, -30.9, 1.18, 6, 1],
];

function flowerGeometry(kind) {
  const positions = [], colors = [];
  const tint = new THREE.Color();
  function triangle(a, b, c, hex) {
    positions.push(...a, ...b, ...c);
    tint.setHex(hex);
    for (let i = 0; i < 3; i++) colors.push(tint.r, tint.g, tint.b);
  }
  const blue = kind === 2;
  const h = blue ? .56 : .47;
  const stemTop = [0, h, 0];
  for (const [dx, dz] of [[.023, 0], [0, .023]]) {
    triangle([-dx, -.04, -dz], [dx, -.04, dz], stemTop, 0x4c804a);
  }
  for (const [angle, y] of [[.46, .20], [3.5, .29]]) {
    const length = blue ? .28 : .21, width = blue ? .088 : .043;
    const c = Math.cos(angle), s = Math.sin(angle);
    const root = [0, y, 0], end = [c * length, y + .10, s * length];
    const spine = [c * length * .53, y + .084, s * length * .53];
    const east = [spine[0] - s * width, y + .046, spine[2] + c * width];
    const west = [spine[0] + s * width, y + .046, spine[2] - c * width];
    triangle(root, spine, east, 0x78a65b);
    triangle(east, spine, end, 0x78a65b);
    triangle(root, west, spine, 0x55864e);
    triangle(west, end, spine, 0x55864e);
  }

  if (blue) {
    const source = new THREE.IcosahedronGeometry(1, 0);
    const v = source.attributes.position;
    const palette = [0x9fc6eb, 0xb7d8f4, 0x92b7df, 0xcadff5];
    for (let i = 0; i < 6; i++) {
      const a = i / 5 * TAU;
      const center = i === 5;
      const size = center ? .137 : .116;
      const x = center ? .025 : Math.cos(a) * .116;
      const y = h + (center ? .126 : .035);
      const z = center ? -.023 : Math.sin(a) * .116;
      const point = (k) => [x + v.getX(k) * size, y + v.getY(k) * size * .76, z + v.getZ(k) * size];
      for (let j = 0; j < v.count; j += 3) {
        triangle(point(j), point(j + 1), point(j + 2), palette[i % palette.length]);
      }
      const bloom = [x, y + size * .87, z];
      for (let petal = 0; petal < 4; petal++) {
        const heading = a + petal * Math.PI / 2;
        const c = Math.cos(heading), s = Math.sin(heading);
        const left = [x + c * .036 - s * .019, bloom[1] + .006, z + s * .036 + c * .019];
        const right = [x + c * .036 + s * .019, bloom[1] + .006, z + s * .036 - c * .019];
        const tip = [x + c * .064, bloom[1] - .025, z + s * .064];
        triangle(bloom, left, right, 0xc4dbf5);
        triangle(left, tip, right, 0xc4dbf5);
      }
    }
    source.dispose();
  } else {
    const petals = kind === 0 ? 8 : 6;
    const flowerTint = kind === 0 ? 0xfff9ea : 0xffe3a0;
    const disk = [0, h + .026, 0];
    for (let i = 0; i < petals; i++) {
      const angle = TAU * i / petals;
      const point = (r, a, lift) => [r * Math.cos(a), h + lift, r * Math.sin(a)];
      const length = (kind === 0 ? .195 : .17) * (i % 2 === 0 ? 1 : .92);
      const root = point(.033, angle, .005);
      const edge = point(length, angle, .018);
      const crest = point(length * .62, angle, .037);
      const left = point(length * .69, angle - .31, .006);
      const right = point(length * .69, angle + .31, .006);
      triangle(root, left, crest, flowerTint);
      triangle(left, edge, crest, flowerTint);
      triangle(edge, right, crest, flowerTint);
      triangle(right, root, crest, flowerTint);
      triangle(disk, point(.062, angle, .014), point(.062, angle + TAU / petals, .014),
        kind === 0 ? 0xe9bd57 : 0xe2aa50);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function clearOfPath(x, z, path, clearance) {
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const dx = bx - ax, dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) < clearance) return false;
  }
  return true;
}

export function addMeadowFlowers(parent, trails) {
  const random = seeded(7081);
  const groups = [[], [], []];
  for (const [cx, cz, radius, count, main] of beds) {
    let placed = 0;
    for (let i = 0; i < count * 4 && placed < count; i++) {
      const angle = random() * TAU, distance = radius * Math.sqrt(random());
      const x = cx + Math.cos(angle) * distance, z = cz + Math.sin(angle) * distance;
      if (coastDistance(x, z) > .96 || onRainbow(ISLAND_BRIDGE, x, z, 7.4) || pondDistance(x, z) < 1.02 ||
          Math.hypot(x - SWING.x, z - SWING.z) < 2.85 || Math.hypot(x - TOWER.x, z - TOWER.z) < 6.35 ||
          CAPE_ROCKS.some((rock) => Math.hypot(x - rock.x, z - rock.z) < Math.max(rock.w, rock.d) * .70) ||
          !trails.every(({ path, width }) => clearOfPath(x, z, path, width / 2 + .38))) continue;
      const kind = placed % 5 === 4 ? (main + 1) % groups.length : main;
      groups[kind].push({ x, z, scale: .78 + random() * .56, yaw: random() * TAU, pitch: (random() - .5) * .25 });
      placed++;
    }
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x3a422b, emissiveIntensity: .13 });
  const pose = new THREE.Object3D();
  groups.forEach((flowers, kind) => {
    const batch = new THREE.InstancedMesh(flowerGeometry(kind), material, flowers.length);
    flowers.forEach(({ x, z, scale, yaw, pitch }, i) => {
      pose.position.set(x, islandHeight(x, z) - .025, z);
      pose.scale.setScalar(scale);
      pose.rotation.set(pitch, yaw, pitch * .5);
      pose.updateMatrix();
      batch.setMatrixAt(i, pose.matrix);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingSphere();
    // Decorative stems and petals should never occlude taps on the character.
    batch.userData.ignoreTouchOcclusion = true;
    parent.add(batch);
  });
}
