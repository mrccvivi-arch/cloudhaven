import * as THREE from "three";
import { part } from "./models.js";
import { beam, surface } from "./summer-geometry.js";
import { GALLERY_HATCH_RADIUS, GALLERY_OPENING, TOWER, TOWER_CAP_RADIUS, TOWER_DOOR_HALF_ANGLE,
  TOWER_LANDING, TOWER_TURNS, TOWER_WALL_THICKNESS, towerDoorTop, towerPoint, towerRadiusAt, towerRise } from "./summer-layout.js";

const TAU = Math.PI * 2;
const ivory = 0xf8f5eb, trim = 0xfff8e8, iron = 0x5b8396, brass = 0xd5a458;
const stone = 0xd6d2c8, wood = 0xc49f7b;

const material = (color, options) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...options });
const at = (radius, angle, y) => {
  const { x, z } = towerPoint(radius, angle);
  return [x, y, z];
};

function cylinder(parent, top, bottom, height, y, color, sides = 32, open = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides, 1, open), material(color));
  mesh.position.set(TOWER.x, y, TOWER.z);
  parent.add(mesh);
  return mesh;
}

function shellRadius(y) {
  return towerRadiusAt(y) + TOWER_WALL_THICKNESS;
}

function band(parent, inner, outer, y, height, color, from = 0, to = TAU) {
  const span = Math.ceil((to - from) * 10);
  const finish = material(color);
  surface(parent, span, 1, (t, u) => at(THREE.MathUtils.lerp(inner, outer, u), from + t * (to - from), y), finish);
  surface(parent, span, 1, (t, u) => at(outer, from + t * (to - from), y - height * u), finish);
}

function doorway(parent) {
  const z = TOWER.z + shellRadius(TOWER.y) - .1;
  for (const side of [-1, 1]) {
    part(parent, "box", trim, TOWER.x + side * 1.63, TOWER.y + 1.35, z, .32, 2.7, .63);
    part(parent, "box", stone, TOWER.x + side * 1.63, TOWER.y + .15, z + .06, .46, .30, .75);
    part(parent, "log", iron, TOWER.x + side * 2.14, TOWER.y + 1.82, z + .47, .18, .52, .18);
    part(parent, "box", 0xffdc9c, TOWER.x + side * 2.14, TOWER.y + 1.80, z + .51, .27, .33, .24);
  }
  for (let i = 0; i <= 12; i++) {
    const theta = Math.PI * i / 12;
    const x = TOWER.x + Math.cos(theta) * 1.61;
    const piece = part(parent, "box", trim, x, TOWER.y + 2.67 + Math.sin(theta) * .66, z, .27, .36, .65);
    piece.rotation.z = theta - Math.PI / 2;
  }
  part(parent, "box", stone, TOWER.x, TOWER.y + .025, z, 3.14, .05, .91);
}

function windows(parent) {
  for (const [angle, height] of [[.54, 5.5], [3.65, 8.7], [5.71, 11.8], [1.59, 14.4], [.39, 17.9], [4.16, 19.0]]) {
    const y = TOWER.y + height;
    const r = shellRadius(y);
    const frame = part(parent, "box", stone, ...at(r + .06, angle, y), 1.02, 1.63, .19);
    frame.rotation.y = angle;
    const sash = part(parent, "box", 0x8bbdd0, ...at(r + .159, angle, y + .04), .72, 1.27, .09);
    sash.rotation.y = angle;
    const bar = part(parent, "box", trim, ...at(r + .22, angle, y + .06), .72, .074, .054);
    bar.rotation.y = angle;
    const sill = part(parent, "box", trim, ...at(r + .17, angle, y - .84), 1.24, .15, .45);
    sill.rotation.y = angle;
  }
}

function lantern(parent) {
  const y = TOWER_LANDING;
  const radius = TOWER_CAP_RADIUS;
  const floor = y + .57;
  const height = 3.23;
  cylinder(parent, radius + .10, radius + .10, .38, y + .22, iron, 16);
  cylinder(parent, radius + .11, radius + .11, .19, y + .50, trim, 16);
  cylinder(parent, radius, radius, height, floor + height / 2, 0xcce9ef, 16, true).material = material(0xcce9ef, {
    transparent: true, opacity: .30, depthWrite: false, forceSinglePass: true,
  });
  for (let i = 0; i < 16; i++) {
    const angle = i * TAU / 16;
    const [x, , z] = at(radius, angle, y);
    part(parent, "log", iron, x, floor + height / 2, z, .076, height, .076);
  }
  cylinder(parent, radius + .05, radius + .05, .085, floor + 1.04, iron, 16, true);
  cylinder(parent, radius + .10, radius + .10, .18, y + 3.82, iron, 16);
  cylinder(parent, 3.34, 3.52, .22, y + 4.00, 0xa5ccdf, 16);
  cylinder(parent, .87, 3.43, 1.32, y + 4.73, 0x83b8d5, 16);
  cylinder(parent, .17, .89, .44, y + 5.60, 0x9bc7dd, 16);
  part(parent, "log", brass, TOWER.x, y + 5.94, TOWER.z, .10, .29, .10);
  part(parent, "ball", brass, TOWER.x, y + 6.03, TOWER.z, .17, .17, .17);

  const crescent = new THREE.Shape();
  // Intersecting arcs meet at the tips of the ornament.
  const tipX = (.69 ** 2 - .55 ** 2 + .35 ** 2) / (.35 * 2);
  const outerTip = Math.acos(tipX / .69);
  const innerTip = Math.acos((tipX - .35) / .55);
  crescent.absarc(0, 0, .69, outerTip, TAU - outerTip, false);
  crescent.absarc(.35, 0, .55, TAU - innerTip, innerTip, true);
  crescent.closePath();
  const ornament = new THREE.Mesh(new THREE.ExtrudeGeometry(crescent, { depth: .12, bevelEnabled: false, curveSegments: 20 }), material(0xffd675));
  ornament.position.set(TOWER.x + .10, y + 6.40, TOWER.z);
  ornament.scale.set(1.31, 1.31, 1);
  ornament.material.emissive.setHex(0xf5c55f);
  ornament.material.emissiveIntensity = .22;
  ornament.rotation.z = -.24;
  parent.add(ornament);

  const sphere = new THREE.SphereGeometry(radius * .43, 24, 16);
  const normals = sphere.attributes.normal;
  const highlights = new THREE.Color(0xfff4cd);
  const gold = new THREE.Color(0xe6ab51);
  const color = new THREE.Color(), colors = [];
  for (let i = 0; i < normals.count; i++) {
    const light = .68 + .26 * normals.getY(i) - .10 * normals.getX(i) + .03 * normals.getZ(i);
    color.copy(gold).lerp(highlights, light);
    colors.push(color.r, color.g, color.b);
  }
  sphere.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const core = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  // Keep the static lens available independently of any future lighting.
  core.name = "lighthouse-lantern-core";
  core.position.set(TOWER.x, floor + height / 2, TOWER.z);
  parent.add(core);
}

export function createLighthouse(parent) {
  const plaster = material(ivory, { emissive: 0xe2e8eb, emissiveIntensity: .34 });
  const interior = material(0xe7d8c5, { emissive: 0xb5a393, emissiveIntensity: .20 });
  const openingAngle = TOWER_DOOR_HALF_ANGLE;
  // Two concentric walls leave a real doorway and give the windowed shaft thickness.
  for (const [radial, finish] of [[shellRadius, plaster], [towerRadiusAt, interior]]) {
    surface(parent, 64, 1, (t, u) => {
      const y = TOWER.y - .17 + u * (TOWER.rise + .17);
      return at(radial(y), openingAngle + t * (TAU - 2 * openingAngle), y);
    }, finish);
    surface(parent, 16, 1, (t, u) => {
      const a = (t * 2 - 1) * openingAngle;
      const lintel = towerDoorTop(a);
      const y = THREE.MathUtils.lerp(lintel, TOWER_LANDING, u);
      return at(radial(y), a, y);
    }, finish);
  }
  for (const angle of [-openingAngle, openingAngle]) {
    surface(parent, 1, 1, (t, u) => {
      const y = THREE.MathUtils.lerp(TOWER.y, towerDoorTop(angle), t);
      return at(THREE.MathUtils.lerp(towerRadiusAt(y), shellRadius(y), u), angle, y);
    }, plaster);
  }
  const base = shellRadius(TOWER.y);
  band(parent, base - .05, base + .34, TOWER.y + .42, .55, stone, openingAngle, TAU - openingAngle);
  band(parent, base - .12, base + .20, TOWER.y + .68, .18, trim, openingAngle, TAU - openingAngle);
  const cornice = shellRadius(TOWER_LANDING - 1.28);
  band(parent, cornice - .08, cornice + .44, TOWER_LANDING - 1.05, .24, trim);
  band(parent, cornice - .08, cornice + .23, TOWER_LANDING - 1.37, .12, stone);
  doorway(parent);
  windows(parent);

  cylinder(parent, TOWER.inner - .10, TOWER.inner - .10, TOWER.rise, TOWER.y + TOWER.rise / 2, 0xbc9b83, 24);
  const ramp = material(wood, { vertexColors: true });
  const railColor = 0x9f7860;
  const plankLight = new THREE.Color(0xffffff), plankDark = new THREE.Color(0xd8c9b7);
  const walk = (t, u, lowered = 0) => {
    const angle = t * TOWER_TURNS, y = towerRise(angle);
    return at(THREE.MathUtils.lerp(TOWER.inner, towerRadiusAt(y), u), angle, y - lowered);
  };
  surface(parent, 240, 4, (t, u) => walk(t, u), ramp,
    (t, u) => plankLight.clone().lerp(plankDark, (Math.floor(t * 241) % 5) * .13 + .17 * Math.abs(u - .55)));
  surface(parent, 240, 1, (t, u) => walk(t, 0, u * .24), material(railColor));
  surface(parent, 240, 1, (t, u) => {
    const p = walk(t, 0);
    p[1] += 1.02 + u * .10;
    return p;
  }, material(trim));
  for (let i = 0; i <= 50; i++) {
    const p = walk(i / 50, 0);
    part(parent, "log", trim, p[0], p[1] + .52, p[2], .075, 1.04, .075);
    if (i % 5 === 1 && p[1] + 2.2 < TOWER_LANDING) {
      const a = i / 50 * TOWER_TURNS;
      part(parent, "log", brass, ...at(towerRadiusAt(p[1] + 1.92) - .045, a, p[1] + 1.92), .13, .43, .13);
      part(parent, "ball", 0xffe1ac, ...at(towerRadiusAt(p[1] + 1.91) - .09, a, p[1] + 1.91), .19, .16, .19);
    }
  }

  band(parent, GALLERY_HATCH_RADIUS, TOWER.gallery, TOWER_LANDING, .36, trim);
  band(parent, TOWER.inner, GALLERY_HATCH_RADIUS, TOWER_LANDING, .28, trim, Math.PI, TAU + Math.PI - GALLERY_OPENING);
  band(parent, GALLERY_HATCH_RADIUS + .01, GALLERY_HATCH_RADIUS + .09, TOWER_LANDING + .94, .075, iron,
    Math.PI - GALLERY_OPENING, Math.PI - .06);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI - GALLERY_OPENING + i * (GALLERY_OPENING - .06) / 3;
    part(parent, "log", iron, ...at(GALLERY_HATCH_RADIUS + .06, angle, TOWER_LANDING + .46), .064, .94, .064);
  }
  for (const railHeight of [.30, .96]) band(parent, TOWER.gallery - .14, TOWER.gallery - .035, TOWER_LANDING + railHeight, .10, iron);
  for (let i = 0; i < 40; i++) {
    const angle = i * TAU / 40;
    part(parent, "log", iron, ...at(TOWER.gallery - .10, angle, TOWER_LANDING + .49), .073, .98, .073);
    if (i % 4 === 0) {
      beam(parent, "box", stone, at(shellRadius(TOWER_LANDING) + .03, angle, TOWER_LANDING - 1.46),
        at(TOWER.gallery - .27, angle, TOWER_LANDING - .32), .22);
    }
  }
  lantern(parent);
}
