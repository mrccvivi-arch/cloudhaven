import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { part } from "./models.js";
import { GATHERING, MATERIALS, MATERIAL_SLOTS, canReachMaterial, materialAvailable } from "./materials.js";

function goldLeaf() {
  const leaf = new THREE.Shape();
  leaf.moveTo(0, -.36);
  leaf.quadraticCurveTo(-.18, -.15, -.33, -.03);
  leaf.quadraticCurveTo(-.54, .23, -.19, .35);
  leaf.quadraticCurveTo(-.09, .39, 0, .30);
  leaf.quadraticCurveTo(.09, .39, .19, .35);
  leaf.quadraticCurveTo(.54, .23, .33, -.03);
  leaf.quadraticCurveTo(.18, -.15, 0, -.36);
  return new THREE.ExtrudeGeometry(leaf, { depth: .04, curveSegments: 5, bevelEnabled: false });
}

function starShape() {
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 ? .20 : .43;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) star.moveTo(x, y);
    else star.lineTo(x, y);
  }
  star.closePath();
  return new THREE.ExtrudeGeometry(star, { depth: .13, bevelThickness: .04, bevelSize: .045, bevelSegments: 1 });
}

function buildModel(id) {
  const model = new THREE.Group();
  const materials = [];
  function shape(geometry, color, y, tilt) {
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.rotation.x = tilt;
    model.add(mesh);
    materials.push(mesh);
  }

  switch (id) {
    case "stone":
      part(model, "ball", 0xc1c4bd, 0, .20, 0, .44, .25, .34).rotation.z = -.18;
      break;
    case "branch": {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-.48, .12, -.1), new THREE.Vector3(-.18, .21, .07),
        new THREE.Vector3(.12, .32, .13), new THREE.Vector3(.49, .39, -.08),
      ]);
      shape(new THREE.TubeGeometry(curve, 7, .085, 6, false), 0xb78762, 0, 0);
      part(model, "log", 0xc19873, .11, .29, -.02, .055, .35, .055).rotation.x = -1.33;
      break;
    }
    case "golden_leaf":
      shape(goldLeaf(), 0xe8bb59, .34, -1.05);
      part(model, "log", 0xb58b3e, 0, .19, .35, .027, .32, .027).rotation.x = -1.05;
      break;
    case "wildflower":
      part(model, "log", 0x72965c, 0, .26, 0, .055, .52, .055);
      part(model, "ball", 0xd5ae66, 0, .55, 0, .105, .055, .105);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * .4;
        const petal = part(model, "ball", 0xc89fbc, Math.sin(angle) * .17, .52, Math.cos(angle) * .17, .098, .055, .16);
        petal.rotation.y = angle;
      }
      break;
    case "stardust":
      shape(starShape(), 0xf6cc75, .60, -.65);
      break;
  }

  const pieces = model.children.map((mesh) => {
    mesh.updateMatrix();
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    geometry.deleteAttribute("uv");
    const color = mesh.material.color;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let offset = 0; offset < colors.length; offset += 3) color.toArray(colors, offset);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const geometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  for (const mesh of materials) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  return geometry;
}

export function createMaterialModels(parent) {
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffc85f, emissiveIntensity: .36 });
  const transform = new THREE.Object3D();
  const center = new THREE.Vector3();
  const sphere = new THREE.Sphere(center, GATHERING.hitRadius);
  const hit = new THREE.Vector3();
  const modelById = Object.fromEntries(Object.entries(MATERIALS).map(([id, { limit }]) => {
    const mesh = new THREE.InstancedMesh(buildModel(id), id === "stardust" ? glow : lit, limit);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    parent.add(mesh);
    return [id, mesh];
  }));

  const visible = [];
  return {
    sync(state, now) {
      visible.length = 0;
      for (const mesh of Object.values(modelById)) mesh.count = 0;
      for (const slot of MATERIAL_SLOTS) {
        if (!materialAvailable(state, slot, now)) continue;
        visible.push(slot);
        const mesh = modelById[slot.id];
        transform.position.set(slot.x, slot.y, slot.z);
        transform.rotation.y = slot.yaw;
        transform.updateMatrix();
        mesh.setMatrixAt(mesh.count++, transform.matrix);
      }
      for (const mesh of Object.values(modelById)) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    },
    update(time) {
      glow.emissiveIntensity = .37 + .08 * Math.sin(time * .002);
    },
    pick(ray, player, state, now) {
      let closest;
      let distance = Infinity;
      for (const slot of visible) {
        if (!canReachMaterial(player, slot) || !materialAvailable(state, slot, now)) continue;
        center.set(slot.x, slot.y + (slot.id === "stardust" ? .60 : .32), slot.z);
        if (!ray.ray.intersectSphere(sphere, hit)) continue;
        const depth = ray.ray.origin.distanceTo(hit);
        if (depth >= distance) continue;
        distance = depth;
        closest = { slot, distance };
      }
      return closest;
    },
  };
}
