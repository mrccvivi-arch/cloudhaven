import * as THREE from "three";
import { PIANO, terrainHeight } from "./map.js";
import { NOTES } from "./piano-rules.js";

export function createPianoModel(parent) {
  const group = new THREE.Group();
  const radius = PIANO.radius;
  const ground = terrainHeight(PIANO.x, PIANO.z);
  const top = .32;
  const depth = .68;
  group.position.set(PIANO.x, ground, PIANO.z);
  group.rotation.y = -2.34;
  parent.add(group);

  const stone = new THREE.MeshLambertMaterial({ color: 0x727d91, flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius - .09, radius, depth, 20), stone);
  base.position.y = top - depth / 2;
  group.add(base);

  const crescent = new THREE.Shape();
  crescent.absarc(0, 0, .34, Math.PI / 3, 5 * Math.PI / 3, false);
  crescent.quadraticCurveTo(-.18, -.03, .17, .34 * Math.sin(Math.PI / 3));
  const inlay = new THREE.Mesh(new THREE.ShapeGeometry(crescent, 16), new THREE.MeshLambertMaterial({
    color: 0xd6e5ee, emissive: 0x596b91, emissiveIntensity: .22,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.set(0, top + .005, .26);
  group.add(inlay);

  const gem = new THREE.CylinderGeometry(.19, .26, .48, 5, 1, false);
  const tip = new THREE.ConeGeometry(.19, .27, 5);
  const supports = new THREE.CylinderGeometry(.32, .34, .10, 8);
  const flashes = NOTES.map(() => 0);
  const surfaces = NOTES.map(({ color }, index) => {
    const angle = (index - 2) * .57;
    const x = Math.sin(angle) * 1.08;
    const z = -Math.cos(angle) * 1.02 + .1;
    const support = new THREE.Mesh(supports, stone);
    support.position.set(x, top + .05, z);
    group.add(support);
    const material = new THREE.MeshLambertMaterial({
      color, emissive: color, emissiveIntensity: .18, flatShading: true,
      transparent: true, opacity: .83, depthWrite: false,
    });
    const crystal = new THREE.Mesh(gem, material);
    const point = new THREE.Mesh(tip, material);
    crystal.position.set(x, top + .34, z);
    point.position.set(x, top + .715, z);
    crystal.rotation.y = point.rotation.y = index * .32;
    group.add(crystal, point);
    return material;
  });

  const eye = new THREE.Vector3(1.05, 3.25, 4.65).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y)
    .add(group.position);
  const target = new THREE.Vector3(PIANO.x, ground - .43, PIANO.z);
  return {
    frame(camera) {
      camera.position.copy(eye);
      camera.lookAt(target);
    },
    flash(index) { flashes[index] = performance.now() + 370; },
    clear() { flashes.fill(0); },
    update(night, time) {
      surfaces.forEach((material, index) => {
        const pulse = Math.max(0, (flashes[index] - time) / 370);
        material.emissiveIntensity = .18 + .27 * night + 1.2 * Math.min(1, pulse * 1.8);
      });
    },
  };
}
