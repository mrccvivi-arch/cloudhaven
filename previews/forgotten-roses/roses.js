import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded } from "../../src/map.js";
import { createOilPaintStudies } from "./oil-paint.js";

const TAU = Math.PI * 2;
const { lerp, smoothstep } = THREE.MathUtils;
const petalSegments = 14;
const color = hex => new THREE.Color(hex);
const porcelain = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .68 });
const plant = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .88 });
const gold = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .66, metalness: .23 });
const darkBlue = color(0x19243c), slate = color(0x405681), indigo = color(0x101b34);
const ivory = color(0xe0d2be), paleIvory = color(0xf1e8d9), clay = color(0xac967a);
const ash = color(0x747b8a), goldDark = color(0x655034), goldLight = color(0xa78653);
const r4Shadow = color(0x101624), r4Slate = color(0x354665), r4Gold = color(0x927347);
const r4Porcelain = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .61 });
plant.userData.artSurface="stem";
r4Porcelain.userData.artSurface="dry";

const tiers = [
  { count: 4, base: .029, reach: .15, rise: .365, splay: 1.06, curl: .066 },
  { count: 5, base: .047, reach: .248, rise: .364, splay: .92, curl: .043 },
  { count: 6, base: .070, reach: .376, rise: .305, splay: .82, curl: -.033 },
  { count: 8, base: .090, reach: .532, rise: .229, splay: .72, curl: -.063 },
];
const tighterTiers = [
  tiers[0],
  { ...tiers[1], reach: .233, rise: .400, splay: .96, curl: .058 },
  { ...tiers[2], reach: .334, rise: .369, splay: .73, curl: -.022 },
  { ...tiers[3], reach: .468, rise: .322, splay: .60, curl: -.041 },
];

function grid(rows, columns, sample) {
  const positions = [], colors = [], index = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const { point, tone } = sample(j / rows, i / columns * 2 - 1);
      positions.push(...point);
      colors.push(tone.r, tone.g, tone.b);
      if (j < rows && i < columns) {
        const a = j * (columns + 1) + i;
        index.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

function bloomGeometry(kind, artifacts) {
  const random = seeded(30421);
  const petals = [], inlays = [];
  const r4 = kind.startsWith("r4");
  const wilt = kind === "wilt" || kind === "r4Wilt";
  const bud = kind === "bud" || kind === "ivoryBud" || kind === "r4Bud";
  const porcelainWhite = kind === "ivory" || kind === "ivoryBud" || kind === "r4Ivory";
  const tint = new THREE.Color();

  for (const [layer, tier] of (r4 ? tighterTiers : tiers).entries()) {
    for (let j = 0; j < tier.count; j++) {
      const phi = (j + layer * .63) * TAU / tier.count + (random() - .5) * .26;
      const size = .88 + random() * .24;
      const wave = random() * TAU;
      const asym = (random() - .5) * .19;
      const height = .87 + random() * .25;
      if (wilt && (layer === 3 && (r4 ? [0, 1, 4, 6, 7] : [1, 4, 6]).includes(j) ||
          layer === 2 && (j === 4 || r4 && j === 0))) continue;
      if (bud && layer === 3 && j % 2) continue;
      const fade = .27 + (j % 3) * .18 + .08 * layer;
      const wiltDrop = wilt ? (r4 ? [.012, .028, .057, .105] : [.015, .048, .22, .54])[layer] * size : 0;
      function sample(t, edge, offset = 0) {
        const mouth = smoothstep(t, .57, 1);
        const waveTip = Math.sin(edge * (3.5 + layer * .43) + wave) * .012
          + Math.sin(edge * 10.3 + wave * 1.2) * (.003 + (wilt ? .006 : 0));
        const rounded = edge ** 2 * Math.pow(t, 1.7);
        let radial = tier.base + (tier.reach * size - tier.base) * t ** (.85 + layer * .10)
          - tier.curl * mouth ** 2 - .037 * rounded + waveTip * mouth;
        let angle = phi + edge * tier.splay * (.20 + .80 * Math.sin(t * Math.PI * .57) ** .72)
          + (.22 + asym) * (1 - t) + asym * edge * t;
        const flatten = layer > 1 ? (.047 + (layer - 2) * .020) * mouth ** 2 : 0;
        let y = tier.rise * height * Math.sin(t * 1.46) - flatten - .067 * rounded
          + waveTip * mouth * (1.1 + layer * .35) - wiltDrop * t ** 2.6;
        if (r4 && layer > 0) {
          radial -= rounded * (.038 + .021 * size);
          angle += asym * (t + .25 * edge) * .92;
          y += .095 * rounded + (.057 * Math.sin(wave) + .056 * asym * edge) * t ** 2;
          if (wilt) {
            radial *= 1 - t * (.15 + .16 * size);
            radial -= mouth ** 2 * (.036 + .016 * layer);
            y += mouth * (.047 + .045 * edge * Math.sin(wave));
          }
        }
        const radius = bud ? radial * (.88 - .42 * smoothstep(layer, 1, 3)) * (1 - .39 * mouth) : radial;
        return new THREE.Vector3(
          Math.cos(angle) * (radius + offset),
          y * (bud ? 1.33 : 1) + offset,
          Math.sin(angle) * (radius + offset)
        );
      }
      const petal = grid(petalSegments, petalSegments, (t, edge) => {
        const stripe = .5 + .5 * Math.sin(edge * 15 + t * 7 + wave);
        const body = .12 + .56 * t ** .82 + layer * .065 + .066 * stripe;
        if (porcelainWhite) tint.copy(clay).lerp(ivory, .56 + .44 * body).lerp(paleIvory, t ** 2 * .4);
        else if (r4) {
          const light = .20 + .48 * t ** 1.28 + .11 * stripe + .09 * Math.abs(edge);
          tint.copy(r4Shadow).lerp(darkBlue, .45 + .55 * t).lerp(r4Slate, light);
          if (wilt) tint.lerp(ash, fade * (.23 + .54 * stripe * t))
            .lerp(j % 3 === 0 ? ivory : clay, .53 * (layer / 3) * t ** 2 * (.30 + .70 * stripe));
          else tint.lerp(clay, .034 * stripe ** 5 * t ** 3);
        } else {
          tint.copy(indigo).lerp(darkBlue, .40 + .45 * t).lerp(slate, body * .82);
          if (kind === "classical") tint.lerp(clay, .085 * stripe ** 3 * t ** 2);
          if (wilt) tint.lerp(ash, fade * (.51 + .49 * t))
            .lerp(j % 3 === 0 ? ivory : clay, (.18 + .40 * t ** 3) * (layer / 3) * (.7 + stripe * .3));
        }
        return { point: sample(t, edge), tone: tint };
      });
      petals.push(petal);
      if (artifacts && wilt && layer === 3 && j === 3) {
        const fallen = petal.clone().rotateX(-Math.PI / 2).scale(.83, .30, .83);
        fallen.computeBoundingBox();
        const center = fallen.boundingBox.getCenter(new THREE.Vector3());
        artifacts.fallen = fallen.translate(-center.x, .008 - fallen.boundingBox.min.y, -center.z);
      }

      const oldInlay = kind === "classical" && ((layer === 1 && j === 4) ||
        (layer === 2 && [1, 4].includes(j)) || (layer === 3 && [0, 3, 5].includes(j)));
      const newInlay = kind === "r4" && (layer === 2 && [1, 4].includes(j) || layer === 3 && [0, 3, 6].includes(j));
      if (oldInlay || newInlay) {
        const start = -.67 + (.5 + .5 * Math.sin(wave)) * .53;
        const length = newInlay ? .22 + (.5 + .5 * Math.cos(wave)) * .29 : .23 + (.5 + .5 * Math.cos(wave)) * .53;
        inlays.push(grid(2, 17, (v, u) => {
          const edge = start + (u + 1) * .5 * length;
          const taper = Math.sin(Math.PI * (u + 1) / 2) ** .54;
          const width = (newInlay ? .023 : .028) * taper * (.45 + .55 * Math.sin(edge * 14 + wave) ** 2);
          tint.copy(goldDark).lerp(newInlay ? r4Gold : goldLight, .27 + .73 * Math.sin(5.2 * u + wave) ** 2);
          return { point: sample(.993 - v * width, edge, .0022), tone: tint };
        }));
      }
    }
  }
  return { petals: mergeAndDispose(petals), inlays: inlays.length ? mergeAndDispose(inlays) : null };
}

function mergeAndDispose(geometry) {
  const result = mergeGeometries(geometry);
  geometry.forEach(part => part.dispose());
  return result;
}

function pipe(curve, segments, sides, radius, from, to) {
  const frames = curve.computeFrenetFrames(segments, false);
  const tone = new THREE.Color();
  return grid(segments, sides, (t, u) => {
    const row = Math.round(t * segments);
    const theta = (u + 1) * Math.PI;
    const width = radius * (1 - .55 * t);
    const point = curve.getPointAt(t)
      .addScaledVector(frames.normals[row], Math.cos(theta) * width)
      .addScaledVector(frames.binormals[row], Math.sin(theta) * width);
    tone.copy(from).lerp(to, (.32 + .45 * t + .13 * Math.sin(theta * 3 + t * 2)));
    return { point, tone };
  });
}

function blade(base, heading, length, width, dry, calyx = false) {
  const facing = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
  const tangential = new THREE.Vector3(-facing.z, 0, facing.x);
  const stemDark = color(dry ? 0x39312b : 0x293337);
  const stemLight = color(dry ? 0xa18a70 : 0x53646b);
  const tone = new THREE.Color();
  return grid(10, 8, (t, u) => {
    const taper = .009 + Math.sin(Math.PI * t ** .88) ** .76;
    const serration = 1 - .10 * Math.abs(u) * Math.sin(t * Math.PI * 14) ** 2;
    const distance = length * t;
    const point = base.clone().addScaledVector(facing, distance * (calyx ? .72 : 1))
      .addScaledVector(tangential, u * width * taper * serration);
    point.y += calyx ? -.18 * t + .14 * t ** 3
      : (dry ? -.21 * t ** 2 : .13 * t - .18 * t ** 3) - .05 * u * u * taper;
    const vein = (1 - Math.abs(u)) ** 8;
    tone.copy(stemDark).lerp(stemLight, .29 + .33 * t + .24 * vein);
    return { point, tone };
  });
}

function rosePrototype(kind, artifacts) {
  const fallenHead = kind === "r4Wilt";
  const spent = kind === "spent" || kind === "r4Spent";
  const bare = kind === "r4Spent";
  const dry = kind === "wilt" || fallenHead || spent;
  const crown = new THREE.Vector3(dry ? .34 : .06, spent ? 1.17 : dry ? 1.30 : 1.52, dry ? .13 : -.02);
  if (fallenHead) crown.set(.50, 1.17, .24);
  if (bare) crown.set(.39, .99, .21);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -.03, 0), new THREE.Vector3(-.08, .49, .065),
    new THREE.Vector3(fallenHead || bare ? .21 : dry ? .14 : -.12, fallenHead || bare ? 1.10 : .96, fallenHead || bare ? .03 : -.05), crown,
  ]);
  const from = color(dry ? 0x42382d : 0x293638), to = color(dry ? 0x9b846a : 0x606b5d);
  const stems = [pipe(curve, 17, 7, .041, from, to)];
  const orientations = [-.67, 2.55, 1.24];
  orientations.slice(0, bare ? 1 : dry ? 2 : 3).forEach((heading, index) => {
    const start = curve.getPointAt(.30 + index * .19);
    const end = start.clone().add(new THREE.Vector3(Math.cos(heading) * .16, .086, Math.sin(heading) * .16));
    const petiole = new THREE.CatmullRomCurve3([start, start.clone().lerp(end, .49), end]);
    stems.push(pipe(petiole, 3, 5, .014, from, to),
      blade(end, heading, dry ? .31 : .42 + index * .026, dry ? .105 : .145, dry));
  });
  for (let i = 0; i < (bare ? 2 : 5); i++) stems.push(blade(crown, i * TAU / 5 + .36, spent ? .17 : .26, .041, dry, true));
  const parts = [{ geometry: mergeAndDispose(stems), material: plant }];
  if (!spent) {
    const { petals, inlays } = bloomGeometry(kind, artifacts);
    const pose = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      fallenHead ? 1.53 : dry ? .70 : .24, 0, fallenHead ? -.67 : dry ? -.45 : .06));
    pose.setPosition(crown);
    parts.push({ geometry: petals.applyMatrix4(pose), material: kind.startsWith("r4") ? r4Porcelain : porcelain });
    if (inlays) parts.push({ geometry: inlays.applyMatrix4(pose), material: gold });
  }
  return parts;
}

const gardenLayout = [
  ["midnight", -2.05, .80, 1.08], ["ivory", -1.12, .42, .99], ["wilt", -.27, .74, .91],
  ["classical", .94, .90, 1.13], ["bud", 1.69, .28, .89], ["spent", 2.34, .75, .91],
  ["bud", -2.60, -.29, .97], ["classical", -1.74, -.40, 1.42], ["midnight", -.80, -.61, 1.12],
  ["ivoryBud", .12, -.39, 1.19], ["midnight", .69, -.77, 1.63], ["wilt", 1.45, -.48, .96],
  ["ivory", 2.16, -.58, 1.20], ["spent", -.62, -1.33, .98], ["classical", .27, -1.58, 1.35],
  ["bud", 1.68, -1.20, 1.11], ["midnight", -1.57, -1.28, 1.85], ["wilt", -2.22, .12, .80],
];
const r4Layout = [
  ["r4", -1.76, -1.75, 5.40], ["r4", 2.18, -1.36, 2.20], ["r4Ivory", -.44, -2.0, 2.04],
  ["r4Ivory", .87, .43, 1.00], ["r4Ivory", -2.66, .78, .92], ["r4", -1.68, .77, 1.28],
  ["r4", .15, -.39, 1.16], ["r4", 2.70, .16, 1.12], ["r4", -3.29, -.19, 1.12],
  ["r4Bud", .26, 1.45, 1.02], ["r4Bud", -2.82, -.97, 1.15], ["r4Bud", 3.07, -.85, 1.19],
  ["r4Wilt", -1.23, 1.35, .98], ["r4Wilt", 1.49, .92, 1.18], ["r4Wilt", 1.24, -1.15, .97],
  ["r4Spent", -2.88, 1.29, 1.21], ["r4Spent", -.54, .83, 1.08], ["r4Spent", 2.57, 1.04, 1.23],
];

function instance(parts, transforms) {
  return parts.map(({ geometry, material }) => {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  });
}

function plantBed(layout, prototypes, fallen, modern = false) {
  const garden = new THREE.Group();
  const pose = new THREE.Object3D();
  const random = seeded(90531);
  const transforms = new Map();
  for (const [kind, x, z, height] of layout) {
    const breadth = (.87 + random() * .19) * (modern && height > 2 ? height : 1);
    pose.position.set(x, 0, z);
    pose.rotation.set((random() - .5) * .22, (random() - .5) * 1.24, (random() - .5) * .24);
    pose.scale.set(breadth, height, breadth);
    pose.updateMatrix();
    if (!transforms.has(kind)) transforms.set(kind, []);
    transforms.get(kind).push(pose.matrix.clone());
  }
  for (const [kind, matrices] of transforms) garden.add(...instance(prototypes[kind], matrices));

  const litter = Array.from({ length: 11 }, () => {
    pose.position.set(modern ? -2.70 + random() * 5.23 : -1.94 + random() * 4.23,
      .004, modern ? .55 + random() * 1.13 : .13 + random() * .98);
    pose.rotation.set(0, random() * TAU, 0);
    pose.scale.setScalar(.51 + .48 * random());
    pose.updateMatrix();
    return pose.matrix.clone();
  });
  garden.add(...instance([{ geometry: fallen, material: modern ? r4Porcelain : porcelain }], litter));
  return garden;
}

export function createRoseStudies(lifecycle) {
  const artifacts = {};
  const prototypes = Object.fromEntries(["midnight", "classical", "wilt", "ivory", "bud", "ivoryBud", "spent",
    "r4", "r4Wilt", "r4Ivory", "r4Bud", "r4Spent"].map(kind => [kind, rosePrototype(kind, kind === "r4Wilt" ? artifacts : undefined)]));
  function specimen(kind) {
    const model = new THREE.Group();
    model.add(...instance(prototypes[kind], [new THREE.Matrix4()]));
    return model;
  }
  const fallenTone = new THREE.Color();
  const fallen = grid(9, 9, (t, u) => {
    const width = Math.sin(Math.PI * t) ** .60 * .14;
    const point = new THREE.Vector3(u * width, .012 + .072 * t ** 2 + .036 * u * u * (1 - t), (t - .5) * .39);
    return { point, tone: fallenTone.copy(darkBlue).lerp(clay, .15 + .40 * t ** 2) };
  });
  const r4 = specimen("r4");
  const r4Garden = plantBed(r4Layout, prototypes, artifacts.fallen, true);
  const r5 = createOilPaintStudies({
    open: r4, garden: r4Garden, segments: petalSegments,
    bluePetals: [prototypes.r4[1].geometry, prototypes.r4Bud[1].geometry],
    mutedPetals: [prototypes.r4Wilt[1].geometry, prototypes.r4Ivory[1].geometry, artifacts.fallen],
    inlay: prototypes.r4[2].geometry,
    lifecycle, prototypes,
  });
  return [specimen("midnight"), specimen("classical"), specimen("wilt"), plantBed(gardenLayout, prototypes, fallen),
    r4, specimen("r4Wilt"), r4Garden, ...r5];
}
