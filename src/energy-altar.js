import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { nightBlend } from "./day-night.js";
import { createAltarLights } from "./energy-altar-lights.js";
import { createObjectTutorial } from "./object-touch.js";
import { moonlightMask } from "./moonlight.js";
import { ALTAR_FLOOR, ALTAR_MOON_STYLE, ALTAR_PLINTH, ALTAR_SCULPTURE, ALTAR_STAIRS, ALTAR_STELE, ALTAR_YAW, ENERGY_ALTAR, altarEdge, altarTreadReach, nearAltar } from "./energy-altar-layout.js";

const entryLine = "这里以前住着一颗石头。";
const memorialLine = "谢谢你曾经给我的光。";
const chargeLine = "你看，不需要那颗石头，我也可以慢慢亮起来。";
const touchLines = [
  "我以前有一颗很喜欢的石头。",
  "那时候，我每天都有好多话想和它说。",
  "石头不会说话，但我还是很喜欢和它说话。",
  "我曾经以为，那就是我的能量来源。",
  "后来才发现，它原来是别人的能量石。",
  "喜欢一颗石头，和拥有一颗石头，是两回事。",
  "它没有做错什么，它只是不属于我。",
  "我把它放下了，但没有忘记它。",
  "那时候的我，也是真的很快乐。",
  "后来，我开始学习怎样从月亮那里获得力量。",
  "原来天空中一直都有月亮。",
  "你看，我现在也有自己的光了。",
  "偶尔还是会想起它。",
  "我喜欢现在的自己，也喜欢那时候的自己。",
  "这里不是告别的地方，是纪念的地方。",
  "谢谢你愿意陪我来这里。",
];
const nightLines = [
  ...touchLines,
  "今晚的月光很好呢。",
  "以前总是低头看石头，后来才学会抬头看天空。",
  "月亮不需要属于我，也可以照亮我。",
];

const idleLines = [
  "我还是会回来看看。",
  "这里已经没有能量石了，但我还是很喜欢这里。",
  "有些回忆，不需要被遗忘。",
  "我现在有自己的光，也有想念的自由。",
  "今天的我，也有好好生活。",
];

function sculptedStone(profile, material, outline, segments = 48) {
  const geometry = new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), segments);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i);
    const scale = outline(Math.atan2(z, x));
    vertices.setXYZ(i, x * scale, vertices.getY(i), z * scale);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function roundedSlab(shape, depth, bevel, material) {
  return new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
    depth, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12,
  }).translate(0, 0, -depth / 2), material);
}

function crownMoonFaces(geometry, outline) {
  const positions = [], normals = [];
  const vertices = geometry.attributes.position;
  const sourceNormals = geometry.attributes.normal;
  const relief = new THREE.Vector3();

  const edges = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const x = b.x - a.x, y = b.y - a.y;
    const length = Math.hypot(x, y);
    return { a, x, y, length };
  }).filter(({ length }) => length > 1e-5);

  function crownVertex(vertex) {
    const { x, y, z } = vertex;
    let sum = 0, slopeX = 0, slopeY = 0;
    // Blend distance contributions from the entire outline to keep the relief smooth across the cap.
    for (const edge of edges) {
      const dx = x - edge.a.x, dy = y - edge.a.y;
      const t = THREE.MathUtils.clamp((dx * edge.x + dy * edge.y) / (edge.length * edge.length), 0, 1);
      const ex = dx - t * edge.x, ey = dy - t * edge.y;
      const distance = ex * ex + ey * ey + .00003;
      const weight = edge.length / (distance * distance);
      sum += weight;
      slopeX += weight * ex / distance;
      slopeY += weight * ey / distance;
    }
    const distance = (Math.PI / (2 * sum)) ** (2 / 3);
    const remaining = Math.exp(-3 * distance);
    const depth = .225 * (1 - remaining);
    const slope = 1.8 * remaining * distance / sum;
    const face = Math.sign(z);
    positions.push(x, y, z + face * depth);
    relief.set(-slopeX * slope, -slopeY * slope, face).normalize();
    normals.push(relief.x, relief.y, relief.z);
  }

  const low = Math.min(...outline.map(({ y }) => y));
  const high = Math.max(...outline.map(({ y }) => y));
  const levels = [...outline.map(({ y }) => y), ...Array.from({ length: 39 }, (_, i) =>
    THREE.MathUtils.lerp(low, high, i / 38))].sort((a, b) => a - b);
  const xAt = (edge, y) => edge.a.x + (y - edge.a.y) * edge.x / edge.y;
  const columns = 12;
  for (let i = 1; i < levels.length; i++) {
    const bottom = levels[i - 1], top = levels[i];
    if (top - bottom < 1e-6) continue;
    const mid = (bottom + top) / 2;
    const crossings = edges.filter(({ a, y }) => (a.y > mid) !== (a.y + y > mid))
      .sort((a, b) => xAt(a, mid) - xAt(b, mid));
    for (let j = 0; j + 1 < crossings.length; j += 2) {
      const left = crossings[j], right = crossings[j + 1];
      for (const face of [-1, 1]) {
        const z = face * Math.abs(vertices.getZ(geometry.groups[0].start));
        const point = (y, column) => ({ x: THREE.MathUtils.lerp(xAt(left, y), xAt(right, y), column / columns), y, z });
        for (let col = 0; col < columns; col++) {
          const a = point(bottom, col), b = point(bottom, col + 1);
          const c = point(top, col), d = point(top, col + 1);
          for (const vertex of face > 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d]) crownVertex(vertex);
        }
      }
    }
  }

  const sides = geometry.groups[1];
  const capCount = positions.length / 3;
  for (let i = sides.start; i < sides.start + sides.count; i++) {
    positions.push(vertices.getX(i), vertices.getY(i), vertices.getZ(i));
    normals.push(sourceNormals.getX(i), sourceNormals.getY(i), sourceNormals.getZ(i));
  }
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  mesh.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  mesh.addGroup(0, capCount, 0);
  mesh.addGroup(capCount, positions.length / 3 - capCount, 1);
  return mergeVertices(mesh);
}

function etchedLines(paths, material) {
  const positions = [];
  for (const { points, width } of paths) {
    const sides = points.map(([x, y], i) => {
      const [px, py] = points[Math.max(0, i - 1)];
      const [nx, ny] = points[Math.min(points.length - 1, i + 1)];
      const scale = width / (2 * Math.hypot(nx - px, ny - py));
      const dx = (ny - py) * scale, dy = (px - nx) * scale;
      return [[x + dx, y + dy, 0], [x - dx, y - dy, 0]];
    });
    for (let i = 1; i < sides.length; i++) {
      const [a, b] = sides[i - 1], [c, d] = sides[i];
      positions.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  const geometry = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.raycast = () => {};
  mesh.userData.ignoreTouchOcclusion = true;
  return mesh;
}

function platformInlay(material) {
  const paths = [[.925, .49, 5.66], [.884, 1.16, 4.87]].map(([scale, start, end]) => ({
    width: scale > .9 ? .046 : .026,
    points: Array.from({ length: 90 }, (_, i) => {
      const angle = THREE.MathUtils.lerp(start, end, i / 89);
      const radius = altarEdge(-angle) * scale;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }),
  }));
  for (const [x, y, size] of [[-1.24, 1.24, .22], [.96, .43, .17], [-3.22, -.13, .15], [-2.44, .79, .1],
    [.61, 2.71, .13], [1.35, 2.55, .085], [-2.45, -1.73, .115], [3.42, .96, .12]]) {
    const points = [[0, 1], [.23, .23], [1, 0], [.23, -.23], [0, -1], [-.23, -.23], [-1, 0], [-.23, .23], [0, 1]]
      .map(([dx, dy]) => [x + dx * size * .76, y + dy * size]);
    paths.push({ points, width: .019 });
  }
  const mesh = etchedLines(paths, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = ALTAR_FLOOR + .004;
  return mesh;
}

function moonShape() {
  const shape = new THREE.Shape();
  shape.moveTo(2.24, 6.62);
  shape.bezierCurveTo(.28, 7.05, -1.36, 6.24, -2.18, 4.76);
  shape.bezierCurveTo(-3.20, 2.92, -2.42, .67, -.83, .14);
  shape.bezierCurveTo(.38, -.23, 1.73, .25, 2.47, 1.33);
  shape.bezierCurveTo(2.64, 1.57, 2.59, 1.76, 2.37, 1.64);
  shape.bezierCurveTo(.94, .83, -.42, 1.39, -.93, 2.67);
  shape.bezierCurveTo(-1.47, 4.07, -.60, 5.85, 2.22, 6.50);
  shape.quadraticCurveTo(2.39, 6.55, 2.24, 6.62);
  return shape;
}

function sculptedMoon(shape, face, rim, gold, glowMap) {
  const outline = shape.getPoints(12).slice(0, -1);
  const moon = roundedSlab(shape, .46, .17, [face, rim]);
  const slab = moon.geometry;
  moon.geometry = crownMoonFaces(slab, outline);
  slab.dispose();

  if (gold) {
    const bands = [-.405, .405].map((z) => {
      const curve = new THREE.CatmullRomCurve3(outline.map(({ x, y }) => new THREE.Vector3(x, y, z)), true);
      return new THREE.TubeGeometry(curve, 144, .021, 5, true);
    });
    const edging = new THREE.Mesh(mergeGeometries(bands), gold);
    for (const band of bands) band.dispose();
    edging.raycast = () => {};
    edging.userData.ignoreTouchOcclusion = true;
    moon.add(edging);
  }

  const glowGeometry = new THREE.BufferGeometry()
    .setFromPoints(outline.map(({ x, y }) => new THREE.Vector3(x, y, -.47)));
  const glow = new THREE.Points(glowGeometry, new THREE.PointsMaterial({
    map: glowMap, color: 0xe2edff, size: .69, opacity: 0, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  moon.add(glow);
  return { moon, glow };
}

function readingStone(stone, pageMaterial, gold) {
  const book = new THREE.Group();
  book.add(sculptedStone([
    [.68, 0], [.82, .06], [.81, .20], [.67, .36], [.39, .46], [0, .46],
  ], stone, (angle) => .84 + .1 * Math.cos(angle * 2 + .5), 32));

  const page = new THREE.Shape();
  page.moveTo(.005, -.42);
  page.bezierCurveTo(.23, -.24, .58, -.39, .79, -.45);
  page.quadraticCurveTo(.89, -.47, .88, -.35);
  page.lineTo(.83, .43);
  page.bezierCurveTo(.52, .56, .23, .57, .015, .39);
  page.closePath();
  for (const side of [-1, 1]) {
    const leaf = roundedSlab(page, .16, .044, pageMaterial);
    const marks = etchedLines([.22, .09, -.04, -.17].map((y, i) => ({
      width: .018,
      points: [[.15, y - .005], [.35, y + .027], [.56 + (i % 3) * .061, y]],
    })), gold);
    marks.position.z = .127;
    leaf.add(marks);
    leaf.position.set(side * .033, .53, 0);
    leaf.rotation.set(-1.16, 0, side * .055);
    leaf.scale.x = side;
    book.add(leaf);
  }
  const binding = new THREE.Mesh(new THREE.CylinderGeometry(.045, .065, .82, 8), stone);
  binding.rotation.x = -1.16;
  binding.position.set(0, .58, -.027);
  book.add(binding);
  return book;
}

function crescentStars(texture, z) {
  const positions = [
    [-.02, 3.07, .85], [.37, 3.85, .9], [.18, 4.74, .64], [.88, 4.41, 1.05],
    [1.29, 5.09, .79], [1.63, 3.69, .68], [.91, 2.76, .91], [1.74, 2.98, .63],
  ];
  const vertices = new THREE.BufferAttribute(new Float32Array(positions.length * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.BufferAttribute(new Float32Array(positions.length * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry()
    .setAttribute("position", vertices)
    .setAttribute("color", colors)
    .setAttribute("pointScale", new THREE.Float32BufferAttribute(positions.map((point) => point[2]), 1));
  const material = new THREE.PointsMaterial({
    map: texture, color: 0xffd38d, size: .43, transparent: true, depthWrite: false,
    toneMapped: false, vertexColors: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = "attribute float pointScale;\n" + shader.vertexShader
      .replace("gl_PointSize = size;", "gl_PointSize = size * pointScale;");
  };
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  return {
    mesh,
    update(time, night, nearby) {
      mesh.visible = nearby;
      if (!nearby) return;
      for (const [i, [x, y, scale]] of positions.entries()) {
        const phase = time * (.41 + i * .022) + i * 1.73;
        const fade = .26 + .74 * (.5 + .5 * Math.sin(time * .28 + i * 1.71)) ** 1.6;
        vertices.setXYZ(i, x + .15 * Math.cos(phase), y + .17 * Math.sin(phase), z + .24 * Math.sin(phase * .71));
        colors.setXYZW(i, 1, 1, 1, fade * (.57 + .43 * night) * (.62 + scale * .30));
      }
      vertices.needsUpdate = colors.needsUpdate = true;
    },
  };
}

function altarTread(level, material) {
  const { angle } = ALTAR_STAIRS;
  const { offset, y, halfWidth } = level;
  const profile = [[-.16, -.16], [offset - .07, -.16], [offset, -.03],
    [offset, y - .067], [offset - .035, y - .017], [offset - .10, y], [-.16, y]];
  const vertices = [], indices = [];
  const segments = 48;
  const count = profile.length;
  for (let i = 0; i <= segments; i++) {
    const local = halfWidth * (2 * i / segments - 1);
    const a = angle + local;
    const edge = altarEdge(a);
    const scale = altarTreadReach(level, local) / offset;
    profile.forEach(([r, height]) => {
      const radius = edge + (r > 0 ? r * scale : r);
      vertices.push(Math.cos(a) * radius, height, Math.sin(a) * radius);
    });
    if (i === 0) continue;
    for (let j = 1; j < count; j++) {
      const previous = (i - 1) * count + j - 1;
      const next = i * count + j - 1;
      indices.push(previous, previous + 1, next, previous + 1, next + 1, next);
    }
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(profile.map(([r, y]) => new THREE.Vector2(r, y)), [])) {
    const end = segments * count;
    indices.push(c, b, a, end + a, end + b, end + c);
  }
  const geometry = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)).setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function pedestalGlow() {
  const positions = [], colors = [], indices = [];
  const segments = 84;
  const tint = new THREE.Color(0xffb478);
  const bands = [[-.55, 0], [.06, .37], [.50, .23], [1.08, 0]];
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const edge = altarEdge(angle);
    for (const [offset, alpha] of bands) {
      positions.push(Math.cos(angle) * (edge + offset), .057, Math.sin(angle) * (edge + offset));
      colors.push(tint.r, tint.g, tint.b, alpha);
    }
    if (!i) continue;
    for (let ring = 0; ring < bands.length - 1; ring++) {
      const a = (i - 1) * bands.length + ring, b = i * bands.length + ring;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute("color", new THREE.Float32BufferAttribute(colors, 4)).setIndex(indices);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, vertexColors: true, toneMapped: false, blending: THREE.AdditiveBlending,
  }));
  mesh.raycast = () => {};
  return mesh;
}

export function createEnergyAltar(parent, moonStyle = ALTAR_MOON_STYLE) {
  const group = new THREE.Group();
  group.name = ENERGY_ALTAR.id;
  group.position.set(ENERGY_ALTAR.x, 0, ENERGY_ALTAR.z);
  group.rotation.y = ALTAR_YAW;
  parent.add(group);

  const texture = new THREE.DataTexture(moonlightMask("glow"), 64, 64);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const stone = new THREE.MeshStandardMaterial({ color: 0xe4d7bc, roughness: .9 });
  const plinthStone = stone.clone();
  const ivory = new THREE.MeshStandardMaterial({ color: 0xfff2df, roughness: .52, metalness: .02 });
  const pearlEdge = new THREE.MeshStandardMaterial({ color: 0xeee2cb, roughness: .53 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xebdaba, roughness: .76 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xb99a62, roughness: .72, side: THREE.DoubleSide });
  const pageMaterial = new THREE.MeshStandardMaterial({ color: 0xf9ebd1, roughness: .8 });
  const bookBase = new THREE.MeshStandardMaterial({ color: 0x9a8b71, roughness: .92 });
  const footing = sculptedStone([
    [.98, -.29], [.999, -.086], [1, .055], [.993, .121], [.981, .173],
    [.969, .224], [.958, .264], [.951, .31],
  ], rim, altarEdge, 84);
  const platform = sculptedStone([
    [.951, .31], [.954, .345], [.97, .402], [.988, .452], [.996, .512],
    [.991, .57], [.972, .611], [.952, ALTAR_FLOOR], [0, ALTAR_FLOOR],
  ], stone, altarEdge, 84);
  const waist = sculptedStone([
    [.959, .284], [.956, .298], [.956, .323], [.96, .339],
  ], gold, altarEdge, 84);
  const underglow = pedestalGlow();
  group.add(footing, platform, waist, platformInlay(gold), underglow);
  for (const level of ALTAR_STAIRS.levels) group.add(altarTread(level, stone));

  const shape = moonShape();
  const adaptive = moonStyle === "adaptive";
  const solidMoon = moonStyle === "hollow" ? undefined
    : sculptedMoon(shape, ivory, pearlEdge, adaptive ? undefined : gold, texture);
  if (adaptive) {
    for (const material of [ivory, pearlEdge]) {
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = .97;
    }
    solidMoon.moon.renderOrder = 2;
    solidMoon.moon.userData.ignoreTouchOcclusion = true;
  }
  if (solidMoon) {
    solidMoon.moon.position.set(0, ALTAR_FLOOR - .02, ALTAR_SCULPTURE.localZ);
    group.add(solidMoon.moon);
  }
  const stars = crescentStars(texture, ALTAR_SCULPTURE.localZ + .39);
  group.add(stars.mesh);
  const updateLights = createAltarLights(group, shape, moonStyle !== "solid");

  const seatOutline = (angle) => 1 + .065 * Math.cos(angle * 3 + .6) + .055 * Math.sin(angle * 2);
  const seat = sculptedStone([
    [.64, 0], [.80, .055], [.86, .165], [.84, .30], [.75, .43], [.64, .55],
    [.51, .618], [.43, .63], [.36, .61], [.32, .57], [.28, .48], [.20, .444], [0, .444],
  ], plinthStone, seatOutline);
  const lip = sculptedStone([[.402, .626], [.39, .624]], gold, seatOutline);
  lip.raycast = () => {};
  lip.userData.ignoreTouchOcclusion = true;
  seat.add(lip);
  const stoneVertices = seat.geometry.attributes.position;
  const stoneTints = [];
  for (let i = 0; i < stoneVertices.count; i++) {
    const radius = Math.hypot(stoneVertices.getX(i), stoneVertices.getZ(i));
    const recess = stoneVertices.getY(i) > .40 ? .32 * (1 - THREE.MathUtils.smoothstep(radius, .19, .39)) : 0;
    stoneTints.push(1 - recess, 1 - recess * 1.12, 1 - recess * 1.24);
  }
  seat.geometry.setAttribute("color", new THREE.Float32BufferAttribute(stoneTints, 3));
  plinthStone.vertexColors = true;
  seat.position.set(ALTAR_PLINTH.localX, ALTAR_FLOOR, ALTAR_PLINTH.localZ);
  group.add(seat);

  const plaque = readingStone(bookBase, pageMaterial, gold);
  plaque.position.set(ALTAR_STELE.localX, ALTAR_FLOOR, ALTAR_STELE.localZ);
  group.add(plaque);

  const haloMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(seat.position.x, ALTAR_FLOOR + .012, seat.position.z);
  halo.raycast = () => {};
  group.add(halo);
  const moonPool = new THREE.Mesh(new THREE.PlaneGeometry(13, 12), haloMaterial.clone());
  moonPool.rotation.x = -Math.PI / 2;
  moonPool.position.set(-.35, ALTAR_FLOOR + .009, -.6);
  moonPool.raycast = () => {};
  group.add(moonPool);
  const fill = new THREE.PointLight(0xe1ecff, 0, 10, 2);
  fill.position.set(-.55, ALTAR_FLOOR + 3.18, -.8);
  group.add(fill);
  const vertices = new THREE.BufferAttribute(new Float32Array(8 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new THREE.BufferAttribute(new Float32Array(8 * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const dustGeometry = new THREE.BufferGeometry().setAttribute("position", vertices).setAttribute("color", colors);
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    map: texture, size: .18, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
  }));
  dust.frustumCulled = false;
  group.add(dust);

  const warm = new THREE.Color(0xffdfae), silver = new THREE.Color(0xdceaff);
  const pearl = new THREE.Color(0xf2eddf), goldRim = rim.color.clone();
  const silverGold = new THREE.Color(0xefe2c9);
  group.updateWorldMatrix(true, true);
  const anchors = [
    seat.localToWorld(new THREE.Vector3(0, ALTAR_PLINTH.height + .14, 0)),
    plaque.localToWorld(new THREE.Vector3(0, .94, 0)),
  ];

  return {
    seat, plaque, anchors,
    update(time, night, memorial, nearby, form = night) {
      const phase = time * .001;
      const wingForm = THREE.MathUtils.smoothstep(form, .14, 1);
      const starForm = adaptive ? wingForm : 1;
      ivory.emissive.copy(warm).lerp(silver, night * .65);
      ivory.emissiveIntensity = .22 + night * .19;
      pearlEdge.emissive.copy(ivory.emissive);
      pearlEdge.emissiveIntensity = ivory.emissiveIntensity * .76;
      if (adaptive) {
        const opacity = .97 * (1 - THREE.MathUtils.smoothstep(form, 0, .91));
        solidMoon.moon.visible = opacity > .003;
        ivory.opacity = pearlEdge.opacity = opacity;
      }
      rim.color.copy(goldRim).lerp(pearl, night);
      rim.emissive.copy(ivory.emissive);
      rim.emissiveIntensity = .16 + night * .26;
      gold.emissive.copy(warm);
      gold.emissiveIntensity = .13 + night * .23;
      if (solidMoon) solidMoon.glow.material.opacity = .055 + night * .095;
      stars.update(phase, night, nearby);
      updateLights(phase, night, starForm, wingForm);
      underglow.visible = night > .015;
      underglow.material.opacity = night * .47;
      stone.emissive.copy(silver);
      stone.emissiveIntensity = .16 * night;
      pageMaterial.emissive.copy(silver);
      pageMaterial.emissiveIntensity = .18 * night;
      plinthStone.emissive.copy(warm).lerp(silverGold, night);
      plinthStone.emissiveIntensity = .04 + night * .23 + memorial * .40;
      fill.intensity = night * 22;
      moonPool.visible = night > .015;
      moonPool.material.color.copy(silver);
      moonPool.material.opacity = night * .40;
      moonPool.scale.setScalar(.98 + .035 * Math.sin(phase * .68));
      haloMaterial.color.copy(plinthStone.emissive);
      haloMaterial.opacity = .06 + night * .26 + memorial * .52;
      halo.scale.setScalar(.94 + .08 * Math.sin(phase * 1.04) + memorial * .12);
      dust.visible = nearby && (night > .04 || memorial > 0);
      if (!dust.visible) return;
      dust.material.color.copy(plinthStone.emissive);
      dust.material.opacity = Math.min(.88, night * .60 + memorial * .65);
      for (let i = 0; i < vertices.count; i++) {
        const rise = (phase * .23 + i / vertices.count) % 1;
        const angle = i * 2.399 + phase * .1;
        const orbit = .79 + rise * .37 + (i % 2 ? night * (1.1 + i * .26) : 0);
        vertices.setXYZ(i, seat.position.x + Math.cos(angle) * orbit, ALTAR_FLOOR + .17 + rise * 2.65,
          seat.position.z + Math.sin(angle) * orbit);
        colors.setXYZW(i, 1, 1, 1, Math.sin(Math.PI * rise) ** 2);
      }
      vertices.needsUpdate = colors.needsUpdate = true;
    },
  };
}

export function createAltarDialogue(bubble, random = Math.random) {
  let inside = false;
  let entryPending = false;
  let chargePending = false;
  let chargedThisNight = false;
  let lastTouch, lastIdle;
  let idleAt, nextIdleSpeech = 0;
  function pauseIdle() {
    idleAt = undefined;
    bubble.dismiss("altar-idle");
  }
  const show = (line, time) => bubble.show(line, time, Math.min(5100, 3600 + line.length * 55), "altar");

  return {
    update(player, { time, night, charging, ready, idle }) {
      const next = nearAltar(player, inside ? 8 : 6.35);
      if (!night) chargedThisNight = chargePending = false;
      if (!next) {
        if (inside) {
          bubble.dismiss("altar");
          pauseIdle();
          nextIdleSpeech = 0;
        }
        inside = entryPending = chargePending = false;
        return false;
      }
      if (!inside) entryPending = true;
      inside = true;
      if (night && charging && !chargedThisNight) chargePending = true;
      if (!idle || !ready) idleAt = undefined;
      else idleAt ??= time + 8000 + random() * 4000;
      if (ready && !bubble.isActive(time, "altar")) {
        if (entryPending) {
          show(entryLine, time);
          entryPending = false;
        } else if (chargePending) {
          show(chargeLine, time);
          chargedThisNight = true;
          chargePending = false;
        } else if (idleAt !== undefined && time >= Math.max(idleAt, nextIdleSpeech) && !bubble.isActive(time)) {
          const pool = idleLines.filter((line) => line !== lastIdle);
          lastIdle = pool[Math.floor(random() * pool.length)];
          bubble.show(lastIdle, time, 4400, "altar-idle");
          nextIdleSpeech = time + 25000 + random() * 20000;
        }
      }
      return true;
    },
    pauseIdle,
    touch(time, night) {
      pauseIdle();
      if (bubble.isActive(time, "altar")) return;
      const pool = (night ? nightLines : touchLines).filter((line) => line !== lastTouch);
      lastTouch = pool[Math.floor(random() * pool.length)];
      show(lastTouch, time);
    },
    memorial(time) {
      pauseIdle();
      show(memorialLine, time);
    },
  };
}

export function bindAltarInteraction({ camera, occludes, dialogue, getState, clearControls, setFacing }) {
  const reader = document.querySelector("#energy-altar-story");
  const prompts = ["#altar-memorial-prompt", "#altar-read-prompt"].map((selector) => {
    const button = document.querySelector(selector);
    return { button, position: createObjectTutorial(button, camera, occludes) };
  });
  let litAt = -Infinity;
  let facing = false;
  reader.querySelector("button").addEventListener("click", () => reader.close());
  reader.addEventListener("close", clearControls);

  function reachable(player, index) {
    return player.grounded && nearAltar(player, index ? 2.8 : 2.75, index ? ALTAR_STELE : ALTAR_PLINTH);
  }

  function activate(index, time) {
    const { player, paused } = getState();
    if (paused || !reachable(player, index)) return;
    if (index) {
      dialogue.pauseIdle();
      clearControls();
      reader.showModal();
    } else if (time - litAt >= 5500) {
      clearControls();
      litAt = time;
      facing = true;
      dialogue.memorial(time);
    }
  }

  prompts.forEach(({ button }, index) => button.addEventListener("click", () => activate(index, performance.now())));
  return {
    reader,
    commemorating: (time) => time - litAt < 5000,
    tap(player, time, altar, hitTarget) {
      for (const [index, target] of [altar.plaque, altar.seat].entries()) {
        const action = 1 - index;
        if (!reachable(player, action) || !hitTarget(target)) continue;
        activate(action, time);
        return true;
      }
      return false;
    },
    face(player, time, elapsed, moving) {
      if (!facing) return;
      if (moving || !player.grounded || !reachable(player, 0) || time - litAt >= 5000) {
        facing = false;
        return;
      }
      setFacing(Math.atan2(player.x - ALTAR_PLINTH.x, player.z - ALTAR_PLINTH.z), elapsed);
    },
    update(altar, player, time, worldTime, paused) {
      const targets = [altar.seat, altar.plaque];
      prompts.forEach(({ button, position }, index) => {
        const visible = position(!paused && reachable(player, index), altar.anchors[index], targets[index], "ground", time);
        button.disabled = !visible;
      });
      const progress = (time - litAt) / 5000;
      const light = progress < 1 ? Math.min(1, progress * 10) * (1 - progress) ** 1.35 : 0;
      if (player.layer === "ground") {
        altar.update(time, nightBlend(worldTime), light, nearAltar(player, 24), nightBlend(worldTime, 4));
      }
    },
  };
}
