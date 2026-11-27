import * as THREE from "three";
import { applyWhaleReveal, createSkin, galaxyAngle, varyPointSize } from "./skin.js";

// Stations from the rounded rostrum to the caudal peduncle.
// Each station describes x, center height, vertical radius and half width.
const profile = new THREE.CatmullRomCurve3([
  [-7.4, .48, .018], [-7.25, .48, .36], [-6.75, .53, .66],
  [-5.65, .49, 1.04], [-4.15, .34, 1.48], [-2.2, .16, 1.80],
  [.05, -.02, 1.63], [2.25, -.30, 1.13], [4.25, -.58, .66],
  [6.0, -.73, .36], [6.92, -.71, .23], [7.24, -.70, .005],
].map(([x, y, radius]) => new THREE.Vector3(x, y, radius)));
const widths = new THREE.SplineCurve([
  .018, .43, .80, 1.13, 1.39, 1.53, 1.41, 1.01, .61, .40, .25, .005,
].map((width, index) => new THREE.Vector2(index, width)));

function bodyPoint(u, angle, offset = 0) {
  const p = profile.getPoint(u);
  const vertical = Math.cos(angle);
  const throat = .028 * Math.cos(41 * angle) * Math.max(0, -vertical) *
    Math.sin(Math.PI * THREE.MathUtils.smoothstep(u, .1, .51));
  return new THREE.Vector3(p.x, p.y + vertical * (p.z + offset + throat),
    Math.sin(angle) * (widths.getPoint(u).y + offset + throat));
}

// Each loft uses a wrapped cross section so surface normals stay smooth across the seam.
function loft(length, sides, point, tint, flip = false, tip = () => -1) {
  const vertices = [], colors = [], indices = [], surface = [];
  const back = new THREE.Color(0xfffaf0);
  const belly = new THREE.Color(0xdeebf3);
  for (let row = 0; row <= length; row++) {
    const u = row / length;
    for (let col = 0; col < sides; col++) {
      const angle = col * Math.PI * 2 / sides;
      vertices.push(...point(u, angle));
      surface.push(u, Math.cos(angle), Math.sin(angle), tip(u));
      colors.push(...back.clone().lerp(belly, tint(angle)));
      if (row === length) continue;
      const a = row * sides + col;
      const b = row * sides + (col + 1) % sides;
      if (flip) indices.push(a, a + sides, b, b, a + sides, b + sides);
      else indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("whaleSurface", new THREE.Float32BufferAttribute(surface, 4));
  geometry.computeVertexNormals();
  return geometry;
}

function appendage(stations, side, vertical = false) {
  const outline = new THREE.CatmullRomCurve3(stations.map(([span, leading, trailing]) =>
    new THREE.Vector3(span, leading, trailing)));
  const sections = new THREE.SplineCurve(stations.map(([, , , rise, thickness]) =>
    new THREE.Vector2(rise, thickness)));
  // The caudal fin is one connected loft, sampled symmetrically around the notch.
  return loft(side === 0 ? 52 : 28, 20, (u, angle) => {
    const section = side === 0 ? Math.abs(2 * u - 1) : u;
    const direction = side || Math.sign(u - .5);
    const { x: span, y: leading, z: trailing } = outline.getPoint(section);
    const { x: rise, y: thickness } = sections.getPoint(section);
    const x = (leading + trailing) / 2 + (trailing - leading) / 2 * Math.cos(angle);
    const cross = rise + Math.sin(angle) * thickness;
    return vertical ? [x, span, cross] : [x, cross, direction * span];
  }, angle => .31 - Math.sin(angle) * .25, vertical || side < 0,
  u => vertical ? 0 : THREE.MathUtils.smoothstep(side === 0 ? Math.abs(2 * u - 1) : u, .33, .99));
}

const pectoral = [
  [.02, -.81, .56, -.08, .39], [.72, -.78, .66, -.28, .32],
  [1.65, -.50, .84, -.59, .22], [2.55, -.12, 1.12, -1.05, .14],
  [3.46, .42, 1.49, -1.63, .086], [4.18, 1.03, 1.79, -1.96, .050],
  [4.52, 1.62, 1.98, -2.02, .024], [4.62, 1.94, 1.95, -2.02, .002],
];
const fluke = [
  [0, 6.33, 7.52, -.71, .275], [.36, 6.34, 7.59, -.71, .252],
  [.9, 6.21, 7.79, -.69, .19], [1.68, 6.09, 7.87, -.59, .137],
  [2.64, 6.24, 7.94, -.45, .099], [3.63, 6.73, 8.06, -.36, .063],
  [4.23, 7.34, 8.17, -.39, .034], [4.42, 7.89, 8.15, -.48, .015],
  [4.46, 8.09, 8.10, -.54, .002],
];

export function createWhale(random, { underside = false } = {}) {
  const group = new THREE.Group();
  group.scale.x = 1.1;
  const skin = createSkin();
  skin.underside.value = Number(underside);
  const detail = new THREE.MeshStandardMaterial({ color: 0x657a8d, roughness: .94 });
  detail.onBeforeCompile = shader => applyWhaleReveal(shader, skin.reveal);
  const flexible = [];
  function mesh(geometry, parent = group, bend = null) {
    const part = new THREE.Mesh(geometry, skin.material);
    parent.add(part);
    if (bend) {
      flexible.push([geometry, geometry.attributes.position.array.slice(), bend]);
      part.frustumCulled = false;
    }
  }
  mesh(loft(88, 48, bodyPoint, angle => THREE.MathUtils.smoothstep(-Math.cos(angle), -.07, .92)), group, bodyBend);
  mesh(appendage([
    [1.08, 1.7, 4.02, 0, .29], [1.39, 2.2, 3.72, 0, .20],
    [1.58, 2.66, 3.48, 0, .10], [1.64, 3.26, 3.30, 0, .006],
  ], 1, true), group, bodyBend);
  mesh(appendage(fluke, 0), group, tailBend);
  const fins = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(-3.18, -.66, side * .71);
    group.add(pivot);
    mesh(appendage(pectoral, side), pivot, (_, t, z) =>
      .17 * Math.sin(.84 * t - .55 * Math.abs(z) + .32 * side) * (z / 4.62) ** 2);

    const lip = new THREE.CatmullRomCurve3(Array.from({ length: 17 }, (_, i) => {
      const t = i / 16;
      return bodyPoint(.017 + .226 * t, side * (1.85 + .24 * Math.sin(Math.PI * t) - .13 * t), .007);
    }));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(lip, 24, .017, 5, false), detail));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.069, 10, 6), detail);
    eye.position.copy(bodyPoint(.266, side * 1.56, .016));
    eye.scale.set(1.14, .72, .70);
    group.add(eye);
    return pivot;
  });

  const glowPositions = [], scales = [], glints = [], colors = [];
  for (let i = 0; i < 146; i++) {
    const side = i % 2 ? -1 : 1;
    const u = i < 72 ? .21 + random() * .69 : .29 + (random() + random()) * .22;
    const spread = (random() + random() - 1) * .58;
    const angle = i % 6 ? galaxyAngle(u, side) + spread : spread * .64;
    glowPositions.push(...bodyPoint(u, angle, .048));
    const icy = new THREE.Color(i % 13 === 0 ? 0xe7dbff : i % 4 === 0 ? 0xb5dcff : 0xfaffff);
    glints.push({ phase: random() * Math.PI * 2, intensity: .42 + random() * .55 });
    scales.push(.52 + random() ** 2 * 1.38);
    colors.push(icy.r, icy.g, icy.b, 0);
  }
  const starGeometry = new THREE.BufferGeometry();
  const starsPosition = new THREE.Float32BufferAttribute(glowPositions, 3).setUsage(THREE.DynamicDrawUsage);
  const starsColor = new THREE.Float32BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage);
  starGeometry.setAttribute("position", starsPosition);
  starGeometry.setAttribute("color", starsColor);
  starGeometry.setAttribute("pointScale", new THREE.Float32BufferAttribute(scales, 1));
  const starMaterial = new THREE.PointsMaterial({
    size: .188, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
  });
  varyPointSize(starMaterial);
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  group.add(stars);

  function bodyBend(x, t) {
    const weight = THREE.MathUtils.smoothstep(x, -4.7, 8);
    return .79 * weight * Math.sin(t * 1.15 - x * .53);
  }

  function tailBend(x, t, z) {
    const softness = (z / 4.46) ** 2;
    return bodyBend(x, t) + softness * .31 * Math.sin(t * 1.15 - x * .53 - .64);
  }

  return {
    group,
    reveal(amount) {
      skin.reveal.value = amount;
      starMaterial.opacity = amount;
    },
    tailPoint(target, t, z) {
      const width = Math.abs(z) / 4.46;
      const x = 7.47 + .58 * width ** 2;
      return target.set(x, -.70 + .32 * width + tailBend(x, t, z), z);
    },
    light(night, pointTexture) {
      skin.night.value = Number(night);
      skin.material.color.setHex(night ? 0xf1f5ff : 0xffffff);
      if (starMaterial.map !== pointTexture) {
        starMaterial.map = pointTexture;
        starMaterial.needsUpdate = true;
      }
    },
    swim(t) {
      skin.breath.value = 1 + .09 * Math.sin(t * 2 * Math.PI / 10);
      fins.forEach((fin, i) => {
        const side = i * 2 - 1;
        fin.position.y = -.66 + bodyBend(-3.18, t);
        fin.rotation.x = side * (.053 + .081 * Math.sin(t * .84 + i * .55));
        fin.rotation.y = side * .055 * Math.sin(t * .71 + i * .4);
      });
      for (const [geometry, rest, bend] of flexible) {
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const k = 3 * i;
          positions.array[k + 1] = rest[k + 1] + bend(rest[k], t, rest[k + 2]);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
      }
      const night = skin.night.value;
      glints.forEach(({ phase, intensity }, i) => {
        const k = i * 3;
        starsPosition.array[k + 1] = glowPositions[k + 1] + bodyBend(glowPositions[k], t);
        const twinkle = .73 + .27 * Math.sin(t * 1.27 + phase);
        starsColor.setW(i, Math.min(1, intensity * twinkle * (night ? 1.08 : i % 3 === 0 ? .23 : 0)));
      });
      starsPosition.needsUpdate = starsColor.needsUpdate = true;
    },
  };
}
