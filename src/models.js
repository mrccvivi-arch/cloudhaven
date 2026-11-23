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

export function chinchilla() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = 0x9398a2;
  const pale = 0xdde0df;
  const pink = 0xd5a5aa;
  const dark = 0x39373f;
  part(body, "ball", fur, 0, .53, .14, .49, .55, .53);
  part(body, "ball", pale, 0, .40, -.23, .36, .37, .3);
  part(body, "ball", fur, 0, .92, -.24, .43, .37, .39);
  part(body, "ball", pale, 0, .77, -.52, .25, .16, .19);
  part(body, "ball", pink, 0, .86, -.697, .076, .045, .046);
  for (const side of [-1, 1]) {
    part(body, "ball", fur, side * .29, 1.29, -.13, .182, .285, .104).rotation.z = -side * .38;
    part(body, "ball", pink, side * .292, 1.31, -.222, .109, .196, .029).rotation.z = -side * .38;
    part(body, "ball", dark, side * .305, .99, -.495, .065, .077, .053);
    part(body, "ball", 0xfff9e7, side * .318, 1.02, -.535, .019, .019, .012);
    part(body, "ball", fur, side * .25, .11, -.14, .14, .095, .22);
    part(body, "ball", fur, side * .2, .35, -.41, .1, .135, .108);
  }
  const tail = part(body, "ball", fur, .11, .5, .59, .15, .16, .39);
  tail.rotation.x = .61;
  part(body, "ball", fur, .19, .68, .86, .141, .13, .23).rotation.x = .83;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.71, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x284538, transparent: true, opacity: .23, depthWrite: false })
  );
  return { root, body, tail, shadow };
}
