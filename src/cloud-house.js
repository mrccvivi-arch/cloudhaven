import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CLOUD_HOUSE, CLOUD_LOBES, CLOUD_WALLS, STAR_CHEST, inCloudHouse } from "./cloud-house-layout.js";

function starShape() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 4;
    const radius = i % 2 ? .095 : .28;
    shape[i === 0 ? "moveTo" : "lineTo"](Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function crescentShape() {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, .16, Math.PI / 3, 5 * Math.PI / 3, false);
  shape.quadraticCurveTo(-.076, -.05, .08, .16 * Math.sin(Math.PI / 3));
  return new THREE.ShapeGeometry(shape, 12);
}

function groundGlow(parent, x, y, z, width, depth, color, opacity) {
  const material = new THREE.ShaderMaterial({
    uniforms: { strength: { value: opacity }, tint: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 shapeUV;
      void main() { shapeUV = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec2 shapeUV;
      uniform float strength;
      uniform vec3 tint;
      void main() {
        float edge = 1. - smoothstep(.07,.49,length(shapeUV-.5));
        gl_FragColor = vec4(tint, edge * edge * strength);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return material.uniforms.strength;
}

export function createCloudHouse(parent) {
  const { x, z } = CLOUD_HOUSE;
  const landmark = new THREE.Group();
  parent.add(landmark);
  landmark.position.set(x, 0, z);

  const puffs = [];
  const sphere = new THREE.SphereGeometry(1, 14, 9);
  const shellColors = [[0xfff5e8, 0xbecae2], [0xf3f1f7, 0xacb9d6], [0xe4eaf6, 0x9faed0]];
  const shell = shellColors.map(([day, night]) => ({
    day: new THREE.Color(day), night: new THREE.Color(night),
    material: new THREE.MeshLambertMaterial({ color: day, emissive: 0x849cc4, emissiveIntensity: .24 }),
  }));
  const wood = new THREE.MeshLambertMaterial({ color: 0xf4e4df, emissive: 0xc0a7c6, emissiveIntensity: .2 });
  const brass = new THREE.MeshLambertMaterial({ color: 0xefbf73, emissive: 0xc67b43, emissiveIntensity: .3 });
  const lavender = new THREE.MeshLambertMaterial({ color: 0xd5c5ee, emissive: 0x9b77a3, emissiveIntensity: .22 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xffe0ae, emissive: 0xffac62, emissiveIntensity: .3, side: THREE.DoubleSide });
  const lilac = new THREE.MeshLambertMaterial({ color: 0xeedcef, emissive: 0xcb9ded, emissiveIntensity: .29, side: THREE.DoubleSide });

  function puff(px, py, pz, sx, sy, sz, shade, yaw = 0) {
    const mesh = new THREE.Mesh(sphere, shell[shade].material);
    mesh.position.set(px, py, pz);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.y = yaw;
    landmark.add(mesh);
    puffs.push(mesh);
  }
  for (const [i, wall] of CLOUD_WALLS.entries()) {
    const entranceSide = i === 0 || i === CLOUD_WALLS.length - 1;
    puff(wall.x - x, (entranceSide ? 1.58 : 1.84) + .15 * Math.sin(i * 1.9), wall.z - z,
      wall.w * .75, (entranceSide ? 1.98 : 2.34) + .24 * Math.sin(i * 1.3), 1.08 + (i % 3) * .16,
      i % 4 === 0 ? 1 : 0, wall.yaw);
  }
  for (const { dx, y, dz, sx, sy, sz, shade, yaw } of CLOUD_LOBES) puff(dx, y, dz, sx, sy, sz, shade, yaw);
  puff(0, 4.57, -.18, 5.35, 1.02, 3.91, 1);
  puff(-.95, 4.92, -.48, 3.61, 1.64, 3.19, 0, .12);
  puff(2.39, 4.68, -.51, 2.52, 1.42, 2.63, 1, -.22);
  puff(-3.77, 3.68, -.64, 1.89, 1.46, 2.12, 0, .3);
  puff(.03, 4.1, 2.94, 2.34, 1.04, 1.14, 0);

  groundGlow(landmark, 0, .012, -.17, 16, 11, 0x52617c, .42);
  const carpet = new THREE.Mesh(new THREE.CircleGeometry(1, 32), wood);
  carpet.rotation.x = -Math.PI / 2;
  carpet.scale.set(3.92, 2.85, 1);
  carpet.position.set(0, .021, -.02);
  landmark.add(carpet);
  const interior = groundGlow(landmark, 0, .033, -1, 8.9, 6.6, 0xffbd87, .12);
  const entry = groundGlow(landmark, 0, .035, 2.25, 6.3, 7.5, 0xffca9f, .09);
  const violet = groundGlow(landmark, -1.5, .037, -.67, 4.7, 4.9, 0xcdb1f0, .06);

  const star = starShape();
  const fixtures = [];
  for (const [i, [sx, sy, sz]] of [[-2.4, 1.84, -2.02], [-.65, 2.68, -2.53],
    [1.78, 2.08, -2.15], [3.06, 1.4, -.97], [-1.12, 2.9, 3.04], [1.18, 2.83, 3.13]].entries()) {
    const light = new THREE.Mesh(star, i % 2 ? lilac : gold);
    light.position.set(sx, sy, sz);
    light.rotation.y = -.29 * sx;
    light.scale.setScalar(i % 2 ? .68 : .9);
    landmark.add(light);
    fixtures.push(light);
  }

  // Narrow opaque insets at the entrance suggest warm light between overlapping puffs.
  for (const [sx, sy, sz, rz] of [[-1.88, 2.36, 3.21, -.28], [2.01, 2.1, 3.17, .32]]) {
    const seam = new THREE.Mesh(sphere, gold);
    seam.position.set(sx, sy, sz);
    seam.scale.set(.08, .47, .055);
    seam.rotation.z = rz;
    landmark.add(seam);
  }

  const chest = new THREE.Group();
  chest.position.set(STAR_CHEST.x, 0, STAR_CHEST.z);
  parent.add(chest);
  const base = new THREE.Mesh(new RoundedBoxGeometry(STAR_CHEST.w, .60, STAR_CHEST.d, 2, .12), lavender);
  base.position.y = .3;
  chest.add(base);
  const rim = new THREE.Mesh(new RoundedBoxGeometry(STAR_CHEST.w + .025, .11, STAR_CHEST.d + .025, 2, .045), brass);
  rim.position.y = .55;
  chest.add(rim);
  const lining = new THREE.Mesh(new RoundedBoxGeometry(1.22, .042, .82, 2, .02), lilac);
  lining.position.y = .607;
  chest.add(lining);

  const hinge = new THREE.Group();
  hinge.position.set(0, .62, -.46);
  chest.add(hinge);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(1.49, .315, 1.07, 3, .143), wood);
  lid.position.set(0, .145, .46);
  hinge.add(lid);
  const lock = new THREE.Mesh(new RoundedBoxGeometry(.35, .33, .07, 2, .034), lavender);
  lock.position.set(0, -.018, 1.011);
  hinge.add(lock);
  const moon = new THREE.Mesh(crescentShape(), brass);
  moon.position.set(0, -.016, 1.05);
  hinge.add(moon);
  for (const dx of [-.37, .39]) {
    const badge = new THREE.Mesh(star, brass);
    badge.rotation.x = -Math.PI / 2;
    badge.position.set(dx, .306, .5);
    badge.scale.setScalar(.48);
    hinge.add(badge);
  }

  const twinkles = Array.from({ length: 5 }, () => {
    const sparkle = new THREE.Mesh(star, gold);
    sparkle.visible = false;
    sparkle.scale.setScalar(.4);
    chest.add(sparkle);
    return sparkle;
  });
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const cutaway = new Set();
  landmark.updateWorldMatrix(true, true);

  return {
    chest, hinge,
    clipCamera(focus, position) {
      const oldCutaway = cutaway.size > 0;
      for (const puff of cutaway) puff.visible = true;
      cutaway.clear();
      const inside = inCloudHouse(focus.x, focus.z);
      fixtures[4].visible = fixtures[5].visible = !inside;
      if (Math.hypot(focus.x - x, focus.z - z) > 13) return;
      direction.subVectors(position, focus);
      let distance = direction.length();
      if (distance < .6) return;
      direction.normalize();
      if (inside && distance > 4.3) {
        distance = 4.3;
        position.copy(focus).addScaledVector(direction, distance);
      }
      ray.set(focus, direction);
      ray.far = distance + .24;
      const hits = ray.intersectObjects(puffs, false);
      // Inside the cavity, cut away only the near-side puffs that would obscure the view.
      for (const { object, distance: at } of hits) {
        if (inside && at < (oldCutaway ? 3.18 : 2.9)) {
          object.visible = false;
          cutaway.add(object);
        } else if (!cutaway.has(object)) {
          position.copy(focus).addScaledVector(direction, Math.max(.58, at - .27));
          break;
        }
      }
    },
    update(night, seconds, opening) {
      for (const tone of shell) {
        tone.material.color.copy(tone.day).lerp(tone.night, night * .64);
        tone.material.emissiveIntensity = .24 + night * .2;
      }
      wood.emissiveIntensity = .23 + night * .42;
      gold.emissiveIntensity = .3 + night * .91;
      lilac.emissiveIntensity = .29 + night * .72;
      interior.value = .12 + night * .47;
      entry.value = .09 + night * .40;
      violet.value = .06 + night * .31;
      fixtures.forEach((light, i) => {
        const pulse = 1 + night * .13 * Math.sin(seconds * 2.1 + i * 1.4);
        light.scale.setScalar((i % 2 ? .68 : .9) * pulse);
      });
      twinkles.forEach((sparkle, i) => {
        sparkle.visible = opening > 0 && opening < 1;
        if (!sparkle.visible) return;
        const angle = i * 2.4 + opening;
        sparkle.position.set(Math.cos(angle) * opening * .7, .73 + opening * (1.1 + i * .07),
          Math.sin(angle) * opening * .5);
        sparkle.rotation.y = angle;
        sparkle.scale.setScalar(Math.sin(Math.PI * opening) * .62);
      });
    },
  };
}
