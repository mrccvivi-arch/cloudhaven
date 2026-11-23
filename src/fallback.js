import * as THREE from "three";
import { HOME } from "./map.js";

export const practiceHalfWidth = 17;

export function createPracticeWorld(scene) {
  scene.background.setHex(0xc5dfe4);
  scene.fog.color.copy(scene.background);
  const world = new THREE.Group();
  scene.add(world);

  function mesh(parent, geometry, color, x, y, z) {
    const object = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  mesh(world, new THREE.BoxGeometry(36, .5, 36), 0x94b977, HOME.x, -.25, HOME.z);
  mesh(world, new THREE.BoxGeometry(3, .012, 22), 0xddcaa0, HOME.x, .006, HOME.z - 4);
  for (const offset of [-10, 10]) {
    mesh(world, new THREE.CylinderGeometry(.22, .27, 2, 7), 0x8a6248, HOME.x + offset, 1, HOME.z - 8);
    mesh(world, new THREE.ConeGeometry(1.85, 3.2, 8), 0x588a66, HOME.x + offset, 3, HOME.z - 8);
  }

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  scene.add(root);
  mesh(body, new THREE.SphereGeometry(.52, 10, 7), 0x9a9fa8, 0, .56, 0).scale.y = 1.1;
  mesh(body, new THREE.SphereGeometry(.39, 10, 7), 0xadb0b8, 0, .92, -.28);
  const tail = mesh(body, new THREE.SphereGeometry(.17, 8, 6), 0x9a9fa8, 0, .48, .59);
  for (const side of [-1, 1]) {
    mesh(body, new THREE.SphereGeometry(.16, 8, 6), 0xb69fa4, side * .25, 1.26, -.16).scale.y = 1.65;
    mesh(body, new THREE.SphereGeometry(.055, 8, 6), 0x39373f, side * .21, 1, -.59);
  }

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.57, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x31503b, transparent: true, opacity: .25, depthWrite: false }),
  );
  scene.add(shadow);
  return { root, body, tail, shadow };
}
