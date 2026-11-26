import * as THREE from "three";
import { part } from "./models.js";

export function surface(parent, rows, columns, sample, material, tint) {
  const positions = [], colors = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const point = sample(row / rows, col / columns);
      positions.push(...point);
      if (tint) {
        const color = tint(row / rows, col / columns, point);
        colors.push(color.r, color.g, color.b);
      }
      if (row === rows || col === columns) continue;
      const a = row * (columns + 1) + col;
      const b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (tint) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  parent.add(mesh);
  return mesh;
}

export function beam(parent, shape, color, a, b, width) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const middle = start.clone().lerp(end, .5);
  const delta = end.sub(start);
  const mesh = part(parent, shape, color, middle.x, middle.y, middle.z, width, delta.length(), width);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}

export function trail(parent, points, width, height, color, offsetY = .044) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const material = new THREE.MeshLambertMaterial({ color, vertexColors: true, side: THREE.DoubleSide });
  const center = new THREE.Vector3(), tangent = new THREE.Vector3();
  const sun = new THREE.Color(0xffffff), edge = new THREE.Color(0xc8c5a6);
  return surface(parent, Math.ceil(curve.getLength() * 2), 8, (t, u) => {
    curve.getPointAt(t, center);
    curve.getTangentAt(t, tangent);
    const offset = (u - .5) * width * (.82 + .18 * Math.sin(t * 24) ** 2);
    const x = center.x + tangent.z * offset, z = center.z - tangent.x * offset;
    return [x, height(x, z) + offsetY, z];
  }, material, (t, u) => edge.clone().lerp(sun, Math.sin(Math.PI * u) ** .46 * (.92 + .08 * Math.sin(t * 80))));
}
