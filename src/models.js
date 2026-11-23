import * as THREE from "three";

const geometries = {
  box: new THREE.BoxGeometry(),
  ball: new THREE.SphereGeometry(1, 11, 8),
  rock: new THREE.DodecahedronGeometry(1),
  cone: new THREE.ConeGeometry(1, 1, 8),
  log: new THREE.CylinderGeometry(.81, 1, 1, 8),
  ring: new THREE.TorusGeometry(1, .13, 6, 24),
};

const materials = new Map();
export function part(parent, shape, color, x, y, z, sx, sy, sz) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  const mesh = new THREE.Mesh(geometries[shape], materials.get(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
