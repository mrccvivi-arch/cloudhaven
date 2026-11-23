import * as THREE from "three";
import { PIANO, PIANO_APPROACH, ROUTE, terrainHeight } from "./map.js";
import { NOTES } from "./piano-rules.js";

function noteGeometry() {
  const head = new THREE.Shape();
  head.absellipse(-.064, -.155, .137, .096, 0, 2 * Math.PI, false, .22);
  const stem = new THREE.Shape();
  stem.moveTo(.013, -.145);
  stem.lineTo(.075, -.145);
  stem.lineTo(.075, .16);
  stem.quadraticCurveTo(.195, .125, .174, .042);
  stem.quadraticCurveTo(.266, .156, .013, .255);
  stem.closePath();
  return new THREE.ShapeGeometry([head, stem], 8);
}

function addSigns(parent, geometry, timber, face, ink) {
  const [[startX, startZ], [endX, endZ]] = PIANO_APPROACH;
  const [previousX, previousZ] = ROUTE[ROUTE.indexOf(PIANO_APPROACH[0]) - 1];
  const roadYaw = Math.atan2(previousX - startX, previousZ - startZ);
  const spurYaw = Math.atan2(startX - endX, startZ - endZ);
  const signs = [
    [startX + Math.cos(roadYaw) * 1.48, startZ - Math.sin(roadYaw) * 1.48, roadYaw],
    [THREE.MathUtils.lerp(startX, endX, .82) - Math.cos(spurYaw) * .82,
      THREE.MathUtils.lerp(startZ, endZ, .82) + Math.sin(spurYaw) * .82, spurYaw],
  ];
  const post = new THREE.BoxGeometry(.13, .99, .13);
  const board = new THREE.BoxGeometry(.66, .53, .095);
  for (const [x, z, yaw] of signs) {
    const sign = new THREE.Group();
    sign.position.set(x, terrainHeight(x, z), z);
    sign.rotation.y = yaw;
    parent.add(sign);
    const stand = new THREE.Mesh(post, timber);
    stand.position.y = .45;
    sign.add(stand);
    const plate = new THREE.Mesh(board, face);
    plate.position.y = 1.01;
    sign.add(plate);
    for (const side of [-1, 1]) {
      const note = new THREE.Mesh(geometry, ink);
      note.scale.setScalar(.83);
      note.position.set(0, 1.015, side * .053);
      note.rotation.y = side === 1 ? 0 : Math.PI;
      sign.add(note);
    }
  }
}

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
  const timber = new THREE.MeshLambertMaterial({ color: 0x9e613d });
  const floorboards = new THREE.MeshLambertMaterial({ color: 0xd69a61 });
  const brass = new THREE.MeshLambertMaterial({ color: 0xffcf83, emissive: 0xa35820, emissiveIntensity: .28 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius - .09, radius, depth, 24),
    [timber, floorboards, timber]);
  base.position.y = top - depth / 2;
  group.add(base);

  const seams = [];
  for (let z = -1.2; z <= 1.21; z += .3) {
    const width = Math.sqrt((radius - .13) ** 2 - z ** 2);
    seams.push(-width, top + .008, z, width, top + .008, z);
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute("position", new THREE.Float32BufferAttribute(seams, 3));
  group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0xb77c51 })));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius - .12, .024, 5, 32), brass);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = top + .012;
  group.add(rim);

  const glow = new THREE.MeshLambertMaterial({ color: 0xffd185, emissive: 0xffa33e, emissiveIntensity: .43 });
  const lanternPole = new THREE.CylinderGeometry(.045, .057, .66, 6);
  const lanternGlass = new THREE.CylinderGeometry(.105, .135, .23, 6);
  const lanternCap = new THREE.ConeGeometry(.165, .115, 6);
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(lanternPole, timber);
    const bulb = new THREE.Mesh(lanternGlass, glow);
    const roof = new THREE.Mesh(lanternCap, timber);
    pole.position.set(side * 1.25, top + .32, -.34);
    bulb.position.set(side * 1.25, top + .72, -.34);
    roof.position.set(side * 1.25, top + .89, -.34);
    group.add(pole, bulb, roof);
  }

  const music = noteGeometry();
  const ink = new THREE.MeshLambertMaterial({ color: 0xffe2a9, emissive: 0xffb755, emissiveIntensity: .42 });
  addSigns(parent, music, timber, new THREE.MeshLambertMaterial({ color: 0x435a67 }), ink);
  const notes = [-.86, 0, .86].map((x, i) => {
    const tint = [0x7bd6ed, 0xffd480, 0xdbadf0][i];
    const material = new THREE.MeshLambertMaterial({
      color: tint, emissive: tint, emissiveIntensity: .5, side: THREE.DoubleSide,
    });
    const note = new THREE.Mesh(music, material);
    note.position.set(x, top + 1.29 + (i === 1 ? .24 : 0), -.67);
    group.add(note);
    return note;
  });

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
      glow.emissiveIntensity = .43 + .72 * night;
      ink.emissiveIntensity = .42 + .66 * night;
      notes.forEach((note, index) => {
        const phase = time * .00125 + index * 1.9;
        note.position.y = top + 1.29 + (index === 1 ? .24 : 0) + Math.sin(phase) * .14;
        note.rotation.y = Math.sin(phase * .59) * .32;
        note.material.emissiveIntensity = .5 + .54 * night;
      });
      surfaces.forEach((material, index) => {
        const pulse = Math.max(0, (flashes[index] - time) / 370);
        material.emissiveIntensity = .18 + .27 * night + 1.2 * Math.min(1, pulse * 1.8);
      });
    },
  };
}
