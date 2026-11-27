import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ALTAR_FLOOR, ALTAR_SCULPTURE, altarEdge } from "./energy-altar-layout.js";

const gold = new THREE.Color(0xffce89);
const pearl = new THREE.Color(0xeaf5ff);
const blue = new THREE.Color(0xa4d5ff);
const featherLayers = [
  { rim: 19, inner: 10, depth: -.12, feathers: [
    [1.44, 3.44, 6.62, 5.91, .78], [1.66, 3.04, 6.81, 5.14, .75], [1.76, 2.68, 6.68, 4.41, .73],
    [1.76, 2.35, 6.35, 3.74, .72], [1.68, 2.09, 5.86, 3.14, .68], [1.55, 1.86, 5.23, 2.67, .64],
  ] },
  { rim: 16, inner: 11, depth: .04, feathers: [
    [.92, 3.38, 4.87, 5.12, .69], [1.06, 3.01, 5.09, 4.46, .65],
    [1.16, 2.62, 4.91, 3.79, .63], [1.23, 2.23, 4.48, 3.21, .62],
  ] },
  { rim: 12, inner: 8, depth: .18, feathers: [
    [.64, 3.18, 3.44, 4.49, .58], [.75, 2.76, 3.60, 3.81, .57], [.87, 2.35, 3.48, 3.19, .55],
  ] },
];

function featherCurves([x, y, endX, endY, width], side, depth) {
  const dx = endX * 1.10 - x, dy = endY - y - .12;
  const length = Math.hypot(dx, dy);
  const point = (along, across, z = 0) => new THREE.Vector3(
    side * (x + dx * along - dy / length * across * width * 1.17
      - (side > 0 ? .43 : .18) * (1 - along) ** 3),
    ALTAR_FLOOR + y + dy * along + dx / length * across * width * 1.17,
    ALTAR_SCULPTURE.localZ - .94 + depth + z,
  );
  const upper = new THREE.CubicBezierCurve3(point(0, .12), point(.28, .84, .13),
    point(.66, .63, .03), point(.94, .58, -.03));
  const lower = new THREE.CubicBezierCurve3(point(.03, -.13), point(.30, -.51, .10),
    point(.79, -.40, .04), point(.96, .16, -.025));
  const outline = new THREE.CurvePath();
  outline.add(upper);
  outline.add(new THREE.CubicBezierCurve3(upper.v3, point(1.05, .38, -.04), point(1.05, .17, -.04), lower.v3));
  outline.add(new THREE.CubicBezierCurve3(lower.v3, lower.v2, lower.v1, lower.v0));
  outline.add(new THREE.QuadraticBezierCurve3(lower.v0, point(-.035, -.04), upper.v0));
  return { upper, lower, outline };
}

export function createAltarLights(parent, shape, hollow) {
  const moonContour = shape.getPoints(12).slice(0, -1);
  const moonBase = ALTAR_FLOOR - .02;
  const moonDepth = ALTAR_SCULPTURE.localZ;
  const tubes = [], nightTubes = [];
  const strands = [], strandColors = [];
  const bulbs = [], bulbColors = [], details = [];

  function strand(points, opacity, tint = gold) {
    for (let i = 1; i < points.length; i++) {
      for (const point of [points[i - 1], points[i]]) {
        strands.push(point.x, point.y, point.z);
        strandColors.push(tint.r, tint.g, tint.b, opacity);
      }
    }
  }

  function bulb(point, tint, size, phase, shine = 1) {
    bulbs.push(point.x, point.y, point.z);
    bulbColors.push(tint.r, tint.g, tint.b, shine);
    details.push(size, phase);
  }

  function wire(curve, segments, radius, closed = false, nightOnly = false) {
    (nightOnly ? nightTubes : tubes).push(new THREE.TubeGeometry(curve, segments, radius, 4, closed));
  }

  if (hollow) {
    const outer = new THREE.CurvePath();
    const inner = new THREE.CurvePath();
    shape.curves.slice(0, 3).forEach((curve) => outer.add(curve));
    shape.curves.slice(4, 6).forEach((curve) => inner.add(curve));
    const acrossMoon = (length, width, depth) => {
      const point = outer.getPoint(length).lerp(inner.getPoint(1 - length), width);
      return new THREE.Vector3(point.x, moonBase + point.y, moonDepth + depth);
    };
    const orientation = Math.sign(THREE.ShapeUtils.area(moonContour));
    for (const depth of [-.39, 0, .405]) {
      const path = new THREE.CatmullRomCurve3(moonContour.map(({ x, y }, index) => {
        const before = moonContour[(index - 1 + moonContour.length) % moonContour.length];
        const after = moonContour[(index + 1) % moonContour.length];
        const dx = after.x - before.x, dy = after.y - before.y;
        const flare = depth === 0 ? .11 * orientation / Math.hypot(dx, dy) : 0;
        return new THREE.Vector3(x + dy * flare, moonBase + y - dx * flare, moonDepth + depth);
      }), true);
      wire(path, 100, depth === .405 ? .025 : .016, true, depth !== .405);
      const count = depth === 0 ? 30 : 66;
      for (let i = 0; i < count; i++) {
        const phase = i * 1.49 + depth * 5;
        bulb(path.getPointAt((i + .45) / count), i % 7 ? gold : pearl, .92 + .2 * Math.sin(phase), phase);
      }
    }

    for (const face of [-1, 1]) {
      for (let lane = 1; lane <= 5; lane++) {
        const sweep = (t) => {
          const envelope = Math.sin(Math.PI * t);
          const width = lane / 6 + .066 * envelope * Math.sin(t * Math.PI * 3 + lane * .89);
          return acrossMoon(t, width, face * (.39 + .16 * Math.sin(Math.PI * width) * envelope));
        };
        const path = new THREE.CatmullRomCurve3(Array.from({ length: 25 }, (_, i) => sweep(.014 + .972 * i / 24)));
        strand(path.getSpacedPoints(36), lane === 3 ? .20 : .13);
        for (let i = 0; i < 26; i++) {
          const phase = face + lane * 2.83 + i * 1.91;
          const point = path.getPointAt((i + .54 + .23 * Math.sin(phase)) / 26);
          bulb(point, (i + lane) % 4 ? blue : pearl, .75 + .27 * Math.cos(phase), phase, .92);
        }
      }
    }

    for (let rib = 1; rib <= 15; rib++) {
      const t = rib / 16;
      const ribPath = new THREE.CatmullRomCurve3(Array.from({ length: 16 }, (_, i) => {
        const angle = i / 16 * Math.PI * 2;
        const width = (.5 - .5 * Math.cos(angle));
        const depth = (.39 + .15 * Math.sin(width * Math.PI) * Math.sin(t * Math.PI)) * Math.sin(angle);
        return acrossMoon(t + .029 * Math.sin(Math.PI * width), width, depth);
      }), true);
      strand(ribPath.getSpacedPoints(25), .13);
      for (let i = 0; i < 9; i++) {
        const phase = rib * 2.41 + i * 1.44;
        bulb(ribPath.getPointAt((i + .47) / 9), i % 4 === 0 ? gold : i % 3 === 0 ? pearl : blue,
          .68 + .25 * Math.sin(phase), phase, .94);
      }
    }
    for (let i = 0; i < 112; i++) {
      const t = .055 + .89 * (i + .5) / 112;
      const w = .09 + .82 * ((i * .618034) % 1);
      const face = i % 2 ? 1 : -1;
      const phase = i * 2.39996;
      bulb(acrossMoon(t, w, face * (.31 + .23 * Math.sin(phase) ** 2)), i % 5 < 2 ? pearl : blue,
        .77 + .26 * Math.sin(phase), phase, .93);
    }
  }
  const moonLineCount = strands.length / 3;
  const moonBulbCount = bulbs.length / 3;

  const commonTubeCount = tubes.length;
  const wingScale = .8;
  const wingRootY = ALTAR_FLOOR + 2.50;
  const wingRootZ = moonDepth - .82;

  function wingOffsets(side) {
    const root = new THREE.Vector3(side * .70, wingRootY, wingRootZ);
    const shift = new THREE.Vector3(-side * .24, 0, .08);
    const anchor = root.clone().add(shift);
    const tubeStart = tubes.length, lineStart = strands.length, bulbStart = bulbs.length;
    return () => {
      for (let i = tubeStart; i < tubes.length; i++) {
        tubes[i].translate(-root.x, -root.y, -root.z).scale(wingScale, wingScale, wingScale)
          .translate(anchor.x, anchor.y, anchor.z);
      }
      for (const [positions, start] of [[strands, lineStart], [bulbs, bulbStart]]) {
        for (let i = start; i < positions.length; i += 3) {
          positions[i] = (positions[i] - root.x) * wingScale + anchor.x;
          positions[i + 1] = (positions[i + 1] - root.y) * wingScale + anchor.y;
          positions[i + 2] = (positions[i + 2] - root.z) * wingScale + anchor.z;
        }
      }
    };
  }

  for (const side of [-1, 1]) {
    const scaleWing = wingOffsets(side);
    for (const [layerIndex, layer] of featherLayers.entries()) {
      const { rim, inner, depth, feathers } = layer;
      for (const [index, feather] of feathers.entries()) {
        const { upper, lower, outline } = featherCurves(feather, side, depth);
        const phase = side * 1.8 + layerIndex * 2.19 + index * 1.37;
        wire(outline, 36, .019 - layerIndex * .002, true);
        for (let i = 0; i < rim; i++) {
          const lightPhase = phase + i * 1.49;
          const t = (i + .45 + .20 * Math.sin(lightPhase)) / rim;
          bulb(outline.getPoint(t), gold, .79 + .21 * Math.sin(lightPhase), lightPhase, .92);
        }
        for (let i = 0; i < inner + 2; i++) {
          const lightPhase = phase + i * 2.39;
          const t = .12 + .74 * (i + .43 + .22 * Math.cos(lightPhase)) / (inner + 2);
          const point = upper.getPoint(t).lerp(lower.getPoint(t), .49 + .36 * Math.sin(lightPhase));
          point.z += .09 * Math.cos(lightPhase);
          bulb(point, i % 3 === 0 ? pearl : blue, .68 + .21 * Math.cos(lightPhase), lightPhase, .94);
        }
      }
    }
    const drop = (t, layer) => {
      const sag = Math.sin(Math.PI * t) ** 1.12;
      return new THREE.Vector3(side * (.95 + 6.49 * t), ALTAR_FLOOR + 2.12 + 1.38 * t - sag * (.60 + .78 * layer),
        moonDepth - .72 - .73 * sag - .30 * t - .10 * layer);
    };
    for (const layer of [0, .56, 1]) {
      const path = new THREE.CatmullRomCurve3(Array.from({ length: 21 }, (_, i) => drop(i / 20, layer)));
      if (layer === 0) wire(path, 45, .018);
      else strand(path.getSpacedPoints(37), .24, layer < 1 ? pearl : blue);
      const count = layer === 0 ? 26 : 24;
      for (let i = 0; i < count; i++) {
        const phase = i * 1.69 + side * 1.2 + layer * 3.1;
        const t = (i + .46 + .17 * Math.sin(phase)) / count;
        bulb(path.getPointAt(t), layer === 0 ? gold : i % 4 ? blue : pearl, .78 + .18 * Math.sin(phase), phase, .98);
      }
    }
    for (let i = 1; i < 17; i++) {
      const t = i / 17;
      const phase = i * 2.2 + side * 3;
      const point = drop(t, .29 + .65 * (.5 + .5 * Math.cos(phase)));
      bulb(point, i % 3 ? blue : pearl, .76, phase);
    }
    const root = (x, y, z) => new THREE.Vector3(x, ALTAR_FLOOR + y, moonDepth + z);
    for (const rise of [0, .27]) {
      const path = new THREE.CubicBezierCurve3(root(-.78, 1.42 + rise, -.34),
        root(-.34, 1.58 + rise, -.54), root(side * .49, 1.55 + rise, -.78), root(side * 1.32, 2.36 + rise, -.94));
      wire(path, 25, .015);
      for (let i = 0; i < 9; i++) {
        const phase = i * 1.91 + side * 1.6;
        bulb(path.getPointAt((i + .55) / 9), i % 3 ? gold : pearl, .74, phase);
      }
    }
    scaleWing();
  }

  const wingTubes = tubes.splice(commonTubeCount);
  const wingPositions = bulbs.splice(moonBulbCount * 3);
  const wingColors = bulbColors.splice(moonBulbCount * 4);
  const wingDetails = details.splice(moonBulbCount * 2);
  const wingStrands = strands.splice(moonLineCount * 3);
  const wingStrandColors = strandColors.splice(moonLineCount * 4);

  for (const start of [-.75, 2.30]) {
    for (let section = 0; section < 3; section++) {
      const angle = start + section * .47;
      const length = [.37, .41, .38][section];
      const sag = [.29, .36, .32][section];
      function drape(t, layer) {
        const a = angle + length * t;
        const sweep = Math.sin(Math.PI * t);
        const radius = altarEdge(a) + .17 + .24 * sweep;
        const y = ALTAR_FLOOR - .057 - sweep * (.12 + layer * sag);
        return new THREE.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
      }
      strand(Array.from({ length: 20 }, (_, i) => drape(i / 19, 1)), .66);
      for (let i = 0; i < 10; i++) {
        const t = (i + .42) / 10;
        const phase = i * 1.71 + section * 2 + start;
        bulb(drape(t, 1), gold, .72 + .16 * Math.sin(phase), phase, .90);
        bulb(drape(t, .28 + .43 * Math.sin(i * 2.2) ** 2), i % 3 ? blue : pearl, .75, phase + 1, .92);
      }
    }
  }

  for (let i = 2; i < moonContour.length; i += 5) {
    const { x, y } = moonContour[i];
    bulb(new THREE.Vector3(x, moonBase + y, moonDepth + .438),
      i % 3 ? gold : pearl, .66, i * 1.39, .72);
  }

  const lineGeometry = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(strands, 3))
    .setAttribute("color", new THREE.Float32BufferAttribute(strandColors, 4));
  const lineMaterial = new THREE.LineBasicMaterial({
    transparent: true, depthWrite: false, toneMapped: false, vertexColors: true,
  });
  const moonLineMaterial = lineMaterial.clone();
  if (moonLineCount) lineGeometry.addGroup(0, moonLineCount, 0);
  lineGeometry.addGroup(moonLineCount, strands.length / 3 - moonLineCount, 1);
  const lines = new THREE.LineSegments(lineGeometry, [moonLineMaterial, lineMaterial]);
  const bulbCount = bulbs.length / 3;
  const moonMask = new Float32Array(bulbCount).fill(1, 0, moonBulbCount);
  const geometry = new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(bulbs, 3))
    .setAttribute("color", new THREE.Float32BufferAttribute(bulbColors, 4))
    .setAttribute("bulbDetail", new THREE.Float32BufferAttribute(details, 2))
    .setAttribute("moonMask", new THREE.BufferAttribute(moonMask, 1));
  const material = new THREE.PointsMaterial({
    size: .36, transparent: true, depthWrite: false, vertexColors: true, toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const clock = { value: 0 }, darkness = { value: 0 }, form = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.altarClock = clock;
    shader.uniforms.altarDarkness = darkness;
    shader.uniforms.altarForm = form;
    shader.vertexShader = `
      attribute vec2 bulbDetail;
      attribute float moonMask;
      uniform float altarClock;
      uniform float altarForm;
      varying float bulbBreath;
      ${shader.vertexShader}`.replace("gl_PointSize = size;", `
        gl_PointSize = size * bulbDetail.x;
        bulbBreath = (.88 + .12 * sin(altarClock * .35 + bulbDetail.y)) * mix(1., altarForm, moonMask);`)
      .replace("#include <logdepthbuf_vertex>", `gl_PointSize = max(2.6, gl_PointSize);
#include <logdepthbuf_vertex>`);
    shader.fragmentShader = `
      uniform float altarDarkness;
      varying float bulbBreath;
      ${shader.fragmentShader}`.replace("#include <color_fragment>", `
        #include <color_fragment>
        float radius = length(gl_PointCoord - .5) * 2.;
        float core = 1. - smoothstep(.06, .30, radius);
        float halo = pow(max(0., 1. - radius), 2.2);
        float dayPresence = mix(.38, 1., smoothstep(.40, .70, diffuseColor.r));
        diffuseColor.a *= bulbBreath * mix(dayPresence, 1., altarDarkness) * (.65 * core + .35 * halo);
        diffuseColor.rgb = mix(mix(vec3(1., .86, .69), diffuseColor.rgb, .52), diffuseColor.rgb, altarDarkness);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.), core * .25);`);
  };
  const points = new THREE.Points(geometry, material);
  // Keep the pearl shell composited above the bulbs throughout the dissolve.
  points.renderOrder = 1;
  lines.raycast = points.raycast = () => {};
  const frameworkMaterial = new THREE.MeshStandardMaterial({
    color: 0xc2a16c, metalness: .24, roughness: .49, emissive: 0xffce89, emissiveIntensity: .21,
  });
  function makeFramework(parts, material, name) {
    const framework = new THREE.Mesh(mergeGeometries(parts), material);
    framework.name = name;
    framework.raycast = () => {};
    framework.userData.ignoreTouchOcclusion = true;
    for (const part of parts) part.dispose();
    parent.add(framework);
    return framework;
  }
  makeFramework(tubes, frameworkMaterial, "altar-light-framework");
  const nightFrame = hollow ? makeFramework(nightTubes,
    new THREE.MeshBasicMaterial({ color: 0xe6bf8b, transparent: true, depthWrite: false }),
    "altar-hollow-night-rims") : undefined;
  if (nightFrame) nightFrame.visible = false;
  const wings = new THREE.Group();
  wings.name = "altar-night-wings";
  wings.visible = false;
  // The frame, strands and lights share a visibility gate and the same dissolve amount.
  const wingFrameMaterial = frameworkMaterial.clone();
  wingFrameMaterial.transparent = true;
  wingFrameMaterial.depthWrite = false;
  const wingFrame = makeFramework(wingTubes, wingFrameMaterial, "altar-wing-framework");
  const wingLineMaterial = lineMaterial.clone();
  const wingLines = new THREE.LineSegments(new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(wingStrands, 3))
    .setAttribute("color", new THREE.Float32BufferAttribute(wingStrandColors, 4)), wingLineMaterial);
  wingLines.raycast = () => {};

  const fallingCount = 20;
  const fallingStart = wingPositions.length / 3;
  const falling = Array.from({ length: fallingCount }, (_, i) => {
    const phase = i * 2.39996;
    wingPositions.push(0, 0, 0);
    wingColors.push(gold.r, gold.g, gold.b, 0);
    wingDetails.push(.90 + .36 * Math.sin(phase) ** 2, phase);
    return {
      phase, offset: i / fallingCount,
      x: (i * .618034 % 1 - .5) * 10.6,
      z: moonDepth + 1.45 + Math.sin(phase * 1.71) * 2.24,
      height: 4.25 + 2.50 * Math.sin(phase * .79) ** 2,
      duration: 10 + 7 * Math.cos(phase * .62) ** 2,
    };
  });
  const fallPositions = new THREE.Float32BufferAttribute(wingPositions, 3).setUsage(THREE.DynamicDrawUsage);
  const fallColors = new THREE.Float32BufferAttribute(wingColors, 4).setUsage(THREE.DynamicDrawUsage);
  const wingGeometry = new THREE.BufferGeometry()
    .setAttribute("position", fallPositions)
    .setAttribute("color", fallColors)
    .setAttribute("bulbDetail", new THREE.Float32BufferAttribute(wingDetails, 2))
    .setAttribute("moonMask", new THREE.BufferAttribute(new Float32Array(fallingStart + fallingCount), 1));
  wingGeometry.computeBoundingBox();
  wingGeometry.boundingBox.expandByPoint(new THREE.Vector3(-6, .55, moonDepth - 1.2));
  wingGeometry.boundingBox.expandByPoint(new THREE.Vector3(6, 6.75, moonDepth + 4));
  wingGeometry.boundingSphere = wingGeometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  const wingPointMaterial = material.clone();
  wingPointMaterial.onBeforeCompile = material.onBeforeCompile;
  const wingPoints = new THREE.Points(wingGeometry, wingPointMaterial);
  wingPoints.renderOrder = points.renderOrder;
  wingPoints.raycast = () => {};
  wings.add(wingFrame, wingLines, wingPoints);
  parent.add(wings);
  parent.add(lines, points);
  return (time, night, moonForm, wingForm) => {
    clock.value = time;
    darkness.value = night;
    form.value = moonForm;
    const visible = moonForm > .003;
    geometry.setDrawRange(visible ? 0 : moonBulbCount, visible ? bulbCount : bulbCount - moonBulbCount);
    lineGeometry.setDrawRange(visible ? 0 : moonLineCount, Infinity);
    frameworkMaterial.emissiveIntensity = .23 + night * .09;
    moonLineMaterial.opacity = .26 * moonForm;
    lineMaterial.opacity = .25 + night * .17;
    if (nightFrame) {
      nightFrame.visible = visible;
      nightFrame.material.opacity = moonForm * .40;
    }
    material.opacity = .40 + night * .54;
    material.size = .294 + night * .232;
    wings.visible = wingForm > .003;
    if (!wings.visible) return;
    wingFrameMaterial.emissiveIntensity = frameworkMaterial.emissiveIntensity;
    wingFrameMaterial.opacity = wingForm;
    wingLineMaterial.opacity = lineMaterial.opacity * wingForm;
    wingPointMaterial.opacity = material.opacity * wingForm;
    wingPointMaterial.size = material.size;
    for (const [index, drop] of falling.entries()) {
      const progress = (time / drop.duration + drop.offset) % 1;
      const sway = time * .78 + drop.phase;
      fallPositions.setXYZ(fallingStart + index, drop.x + .41 * Math.sin(sway),
        THREE.MathUtils.lerp(drop.height, ALTAR_FLOOR + .05, progress), drop.z + .24 * Math.cos(sway * .81));
      const fade = THREE.MathUtils.smoothstep(progress, 0, .16) * (1 - THREE.MathUtils.smoothstep(progress, .73, 1));
      fallColors.setW(fallingStart + index, fade * (.7 + .27 * Math.sin(drop.phase) ** 2));
    }
    for (const attribute of [fallPositions, fallColors]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(fallingStart * attribute.itemSize, fallingCount * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  };
}
