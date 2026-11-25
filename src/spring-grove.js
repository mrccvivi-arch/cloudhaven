import { addTutorialGlow } from "./object-touch.js";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createFallingFoliage } from "./falling-foliage.js";
import { seeded, terrainHeight } from "./map.js";
import { CHERRY_FORK_HEIGHT, CHERRY_TRUNK_RADIUS, SPRING_BOULDERS, SPRING_FALLS, SPRING_POOL, SPRING_REST_ROCK, SPRING_TREES, springPoint, springWaterDepth } from "./spring-layout.js";

const blossomColors = [0xeb9fba, 0xf4aec6, 0xf9bfd2, 0xfbd1df, 0xffe2e9, 0xffefe9];
const stoneColors = [0x859a9a, 0x91a4a1, 0xa0aeaa, 0x94a6a5, 0x849896];
const greenColors = [0x71965d, 0x87a86b, 0x96ad70, 0xa5bc78];
const up = new THREE.Vector3(0, 1, 0);
const pose = new THREE.Object3D();
const instanceColor = new THREE.Color();

function batch(root, geometry, material, colors, parts) {
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
  parts.forEach(({ at, scale, rotation, direction, tint }, i) => {
    pose.position.fromArray(at);
    pose.scale.fromArray(scale);
    if (direction) pose.quaternion.setFromUnitVectors(up, direction);
    else pose.rotation.set(...rotation);
    pose.updateMatrix();
    mesh.setMatrixAt(i, pose.matrix);
    mesh.setColorAt(i, instanceColor.setHex(colors[tint % colors.length]));
  });
  root.add(mesh);
  return mesh;
}

function groveTrees(root, random, reduced) {
  const branches = [], blossoms = [], accents = [];
  const barkColors = [0x8b796e, 0x938077, 0x9b897e];
  const curvedBranch = (from, bend, to, width, tipWidth, tint, segments = 4) => {
    const curve = new THREE.QuadraticBezierCurve3(from, bend, to);
    const sides = 6;
    const tube = new THREE.TubeGeometry(curve, segments, 1, sides);
    const vertices = tube.attributes.position;
    const colors = new Float32Array(vertices.count * 3);
    const color = instanceColor.setHex(barkColors[tint % barkColors.length]);
    for (let row = 0; row <= segments; row++) {
      const progress = row / segments;
      const center = curve.getPointAt(progress);
      const radius = THREE.MathUtils.lerp(width, tipWidth, progress ** .85);
      for (let side = 0; side <= sides; side++) {
        const index = row * (sides + 1) + side;
        vertices.setXYZ(index, center.x + (vertices.getX(index) - center.x) * radius,
          center.y + (vertices.getY(index) - center.y) * radius,
          center.z + (vertices.getZ(index) - center.z) * radius);
        color.toArray(colors, index * 3);
      }
    }
    tube.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    branches.push(tube);
    return curve;
  };
  const crown = (at, width, tint, spread = 1) => {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = i * 2.4 + random() * .8;
      const radius = i === 0 ? 0 : width * (.28 + random() * .56);
      const size = width * (i === 0 ? .72 : .36 + random() * .23);
      const center = [at.x + Math.cos(angle) * radius * spread,
        at.y + width * (random() * .62 - .28), at.z + Math.sin(angle) * radius];
      blossoms.push({ at: center, scale: [size * (i % 3 === 0 ? 1.34 : 1.12), size * (.61 + random() * .23), size * (i % 2 === 0 ? .98 : .83)],
        rotation: [random() * .24, angle, random() * .4], tint: (tint + i) % blossomColors.length });
      const fleck = size * .42;
      const cluster = { at: [center[0] + Math.cos(angle) * size * .6, center[1] - size * .32,
        center[2] + Math.sin(angle) * size * .62], scale: [fleck, fleck * .74, fleck],
        rotation: [.12, angle, .24], tint: 2 + i % 4 };
      if (!reduced || i % 2 === 0) accents.push(cluster);
    }
  };
  for (const [i, { x, z, size, overhang }] of SPRING_TREES.entries()) {
    const y = terrainHeight(x, z);
    const angle = overhang ?? random() * 6.28;
    const heading = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const base = new THREE.Vector3(x, y - .18, z);
    const kink = base.clone().addScaledVector(heading, .29);
    kink.y += size * (2.7 + random() * .5);
    const fork = kink.clone().addScaledVector(heading, .53);
    fork.y = y + size * CHERRY_FORK_HEIGHT;
    if (overhang !== undefined) {
      fork.addScaledVector(heading, .65);
      kink.addScaledVector(heading, -.58);
      fork.y -= .55;
    }
    const trunk = curvedBranch(base, kink, fork, size * CHERRY_TRUNK_RADIUS, size * .115, i, 7);
    for (let j = 0; j < 5; j++) {
      const reaching = overhang !== undefined && j === 0;
      const azimuth = angle + j * 1.24 + (random() - .5) * .85;
      const span = reaching ? 3.45 + random() * .4 : size * (1.73 + random() * 2.08);
      const rise = reaching ? .77 : size * (.85 + random() * 2.2);
      const origin = trunk.getPoint(.71 + random() * .28);
      const tip = origin.clone().add(new THREE.Vector3(Math.cos(azimuth) * span, rise, Math.sin(azimuth) * span));
      const elbow = origin.clone().lerp(tip, .56);
      elbow.y += size * (.2 + random() * .85);
      elbow.x += Math.sin(azimuth) * (random() - .35) * size;
      elbow.z -= Math.cos(azimuth) * (random() - .35) * size;
      const limb = curvedBranch(origin, elbow, tip, size * .145, size * .027, i, 5);
      crown(tip, reaching ? 1.58 : size * (.9 + random() * .55), i + j + 1, reaching ? 1.37 : 1.12);
      const twig = limb.getPoint(.56);
      const shoot = twig.clone().add(new THREE.Vector3(Math.cos(azimuth + .9) * size * 1.18,
        size * (1.0 + random()), Math.sin(azimuth + .9) * size * 1.18));
      if (j % 2 === 0) {
        const bend = twig.clone().lerp(shoot, .55).addScaledVector(heading, .19);
        curvedBranch(twig, bend, shoot, size * .058, size * .012, i + 2, 3);
        crown(shoot, size * .74, i + j + 2);
      }
    }
    const leader = fork.clone().add(new THREE.Vector3(-heading.x * .36, size * (3.3 + random() * .9), -heading.z * .36));
    curvedBranch(fork, fork.clone().lerp(leader, .47).addScaledVector(heading, .4), leader, size * .116, size * .021, i + 1, 5);
    crown(leader, size * 1.27, i + 3);
  }
  const bark = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff });
  const branchGeometry = mergeGeometries(branches);
  for (const branch of branches) branch.dispose();
  root.add(new THREE.Mesh(branchGeometry, bark));
  const petals = new THREE.MeshLambertMaterial({ emissive: 0xffcee2, emissiveIntensity: .055 });
  const blossomGeometry = reduced ? new THREE.SphereGeometry(1, 7, 4) : new THREE.IcosahedronGeometry(1, 1);
  for (const [parts, geometry] of [[blossoms, blossomGeometry], [accents, new THREE.IcosahedronGeometry(1)]]) {
    const mesh = batch(root, geometry, petals, blossomColors, parts);
    mesh.userData.ignoreTouchOcclusion = true;
  }
  return { bark, canopy: petals };
}

function rockGeometry(ridge = false) {
  const vertices = [], indices = [];
  const outline = [[-.88, -.38], [-.45, -.88], [.44, -.92], [.93, -.43],
    [.82, .51], [.34, .87], [-.53, .83], [-.97, .3]];
  const strata = ridge
    ? [[-.06, .91, 0], [.17, 1.05, .1], [.37, .93, .12], [.53, 1.02, .09],
      [.72, .85, .12], [.86, .91, .10], [1, .61, .045]]
    : [[0, .69, 0], [.21, 1, .1], [.78, .91, .15], [1, .69, .025]];
  for (const [y, scale, slope] of strata) {
    outline.forEach(([x, z], i) => {
      const shift = ridge ? Math.sin(y * 7) * .13 : 0;
      vertices.push(x * scale + shift, y + Math.sin(i * 2.3) * slope, z * scale);
    });
  }
  for (let layer = 0; layer < strata.length - 1; layer++) {
    for (let i = 0; i < 8; i++) {
      const a = layer * 8 + i, b = layer * 8 + (i + 1) % 8;
      indices.push(a, a + 8, b, b, a + 8, b + 8);
    }
  }
  const cap = (strata.length - 1) * 8;
  for (let i = cap + 1; i < cap + 7; i++) indices.push(cap, i + 1, i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function viewingStoneGeometry() {
  const outline = [1, .91, 1.05, .96, 1.01, .91, .98, 1.04, .92, 1.02, .95, .92];
  const rings = [[0, .7], [.23, .93], [.56, 1], [.82, .88], [1, .67]];
  const vertices = [], indices = [];
  for (const [y, width] of rings) {
    for (const [i, edge] of outline.entries()) {
      const angle = i * Math.PI * 2 / outline.length;
      const radius = width * edge;
      vertices.push(Math.cos(angle) * radius + y * .025,
        y + Math.sin(i * 1.71) * (y === 1 ? .023 : .04), Math.sin(angle) * radius);
    }
  }
  const sides = outline.length;
  for (let ring = 1; ring < rings.length; ring++) {
    for (let i = 0; i < sides; i++) {
      const a = (ring - 1) * sides + i, b = (ring - 1) * sides + (i + 1) % sides;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  const cap = (rings.length - 1) * sides;
  const center = vertices.length / 3;
  vertices.push(.02, 1.005, 0);
  for (let i = 0; i < sides; i++) indices.push(center, cap + (i + 1) % sides, cap + i);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function shoreline(root, random) {
  const boulders = [], ridges = [], moss = [], flowers = [], blades = [], litter = [], vines = [], leaves = [], mossVertices = [], mossColors = [];
  const lowRock = rockGeometry(), highRock = rockGeometry(true);
  const probe = new THREE.Mesh(highRock);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const normalMatrix = new THREE.Matrix3();

  function mossPatch(hit, width, tint) {
    const n = hit.face.normal.clone().applyNormalMatrix(normalMatrix);
    const axis = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.x) > .8) axis.set(0, 0, 1);
    const u = axis.cross(n).normalize(), v = n.clone().cross(u);
    const center = hit.point.clone().addScaledVector(n, .024);
    const rim = Array.from({ length: 8 }, (_, i) => {
      const angle = i * Math.PI / 4;
      const radius = width * (.56 + random() * .44);
      const point = hit.point.clone().addScaledVector(u, Math.cos(angle) * radius)
        .addScaledVector(v, Math.sin(angle) * radius * .62);
      ray.set(point.addScaledVector(n, .25), n.clone().negate());
      const edge = ray.intersectObject(probe, false)[0];
      return edge?.distance < .47 ? edge.point.addScaledVector(n, .024) : undefined;
    });
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i], b = rim[(i + 1) % rim.length];
      if (!a || !b) continue;
      instanceColor.setHex(greenColors[(tint + i % 3) % greenColors.length]);
      for (const p of [center, a, b]) {
        mossVertices.push(p.x, p.y, p.z);
        mossColors.push(instanceColor.r, instanceColor.g, instanceColor.b);
      }
    }
  }

  function dressRock(x, y, z, sx, height, sz, yaw, tint) {
    probe.geometry = height > 3 ? highRock : lowRock;
    probe.position.set(x, y, z);
    probe.scale.set(sx, height, sz);
    probe.rotation.y = yaw;
    probe.updateMatrixWorld();
    normalMatrix.getNormalMatrix(probe.matrixWorld);

    for (let k = 0; k < (height > 3 ? 12 : 4); k++) {
      const angle = k * 2.4, distance = .12 + Math.sqrt(random()) * .53;
      const point = new THREE.Vector3(Math.cos(angle) * distance, 1.2, Math.sin(angle) * distance);
      ray.set(probe.localToWorld(point), down);
      const hit = ray.intersectObject(probe, false)[0];
      if (hit) mossPatch(hit, .22 + random() * sx * .33, tint + k);
    }
    if (height <= 3) return;

    const facing = Math.atan2(SPRING_POOL.z - z, SPRING_POOL.x - x);
    for (let k = 0; k < 3; k++) {
      const angle = facing + (k - 1) * .53;
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      let above;
      const length = (tint + k) % 3 === 0 ? 5 : 1;
      for (let step = 0; step < length; step++) {
        const level = y + height * (.79 - k * .14) - step * .29;
        const origin = new THREE.Vector3(x, level, z).addScaledVector(outward, Math.max(sx, sz) * 1.6);
        origin.addScaledVector(new THREE.Vector3(-outward.z, 0, outward.x), Math.sin(step * .8 + tint) * .16);
        ray.set(origin, outward.clone().negate());
        const hit = ray.intersectObject(probe, false)[0];
        if (!hit) continue;
        if (step === 0) mossPatch(hit, .36 + random() * .4, tint + k);
        const end = hit.point.clone().addScaledVector(outward, .045);
        if (length > 1) {
          const side = step % 2 === 0 ? 1 : -1;
          const leaf = end.clone().addScaledVector(new THREE.Vector3(-outward.z, 0, outward.x), side * .075);
          leaves.push({ at: leaf.toArray(), scale: [.09, .026, .14],
            direction: outward.clone().addScaledVector(up, .26 * side).normalize(), tint: tint + step });
        }
        if (above) {
          const axis = above.clone().sub(end);
          vines.push({ at: above.clone().lerp(end, .5).toArray(), scale: [.014, axis.length() + .025, .014],
            direction: axis.normalize(), tint: tint + k });
        }
        above = end;
      }
      const footX = x + outward.x * sx * .91, footZ = z + outward.z * sz * .91;
      if (springWaterDepth(footX, terrainHeight(footX, footZ), footZ) === 0) {
        moss.push({ at: [footX, terrainHeight(footX, footZ) + .06, footZ], scale: [.46, .21, .38],
          rotation: [0, angle, 0], tint: tint + k });
      }
    }
  }
  for (const [i, { x, z, sx, sz, height, yaw }] of [...SPRING_BOULDERS, SPRING_REST_ROCK].entries()) {
    const y = terrainHeight(x, z) - .16;
    (height > 3 ? ridges : boulders).push({ at: [x, y, z], scale: [sx, height, sz], rotation: [0, yaw, 0], tint: i });
    if (i >= SPRING_BOULDERS.length) continue;
    dressRock(x, y, z, sx, height, sz, yaw, i);
  }
  probe.material.dispose();
  for (let i = 0; i < 106; i++) {
    const theta = i * 2.39996, radius = .96 + random() * .25;
    const tree = SPRING_TREES[i % SPRING_TREES.length];
    const center = i < 66 ? SPRING_POOL : tree;
    const reach = i < 66 ? radius : .85 + random() * 2.6;
    const x = center.x + Math.cos(theta) * reach * (i < 66 ? SPRING_POOL.radiusX : 1);
    const z = center.z + Math.sin(theta) * reach * (i < 66 ? SPRING_POOL.radiusZ : 1);
    const y = terrainHeight(x, z);
    if (springWaterDepth(x, y, z) > 0 || (i < 66 && z < SPRING_FALLS.z - .05)) continue;
    for (let j = 0; j < 3; j++) {
      const height = .2 + random() * .33;
      blades.push({ at: [x + (j - 1) * .17, y + height * .34, z + random() * .15],
        scale: [.075, height, .066], rotation: [.18, theta, (j - 1) * .36], tint: i + j });
    }
    if (i % 2 === 0) {
      litter.push({ at: [x, y + .022, z], scale: [.085, .05, 1],
        rotation: [-Math.PI / 2, 0, theta], tint: i % 6 });
    }
    if (i % 3 === 0 || Math.hypot(x - SPRING_REST_ROCK.x, z - SPRING_REST_ROCK.z) < 2.5) {
      for (let j = 0; j < 3; j++) {
        const fx = x + .19 * Math.cos(theta + j * 2.4), fz = z + .19 * Math.sin(theta + j * 2.4);
        const fy = terrainHeight(fx, fz);
        flowers.push({ at: [fx, fy + .12 + .04 * j, fz], scale: [.086, .047, .085],
          rotation: [0, theta, 0], tint: j });
        blades.push({ at: [fx, fy + .055, fz], scale: [.027, .16 + .04 * j, .037],
          rotation: [.04, theta, .08], tint: 2 });
      }
    }
  }
  for (const [i, tree] of SPRING_TREES.entries()) {
    for (let j = 0; j < 22; j++) {
      const angle = i * 1.64 + (random() - .5) * 3.8;
      const distance = .63 + random() ** 1.35 * 2.45;
      const x = tree.x + Math.cos(angle) * distance;
      const z = tree.z + Math.sin(angle) * distance;
      const y = terrainHeight(x, z);
      if (springWaterDepth(x, y, z) > 0) continue;
      const size = .043 + random() * .075;
      litter.push({ at: [x, y + .025, z], scale: [size * 1.6, size, 1],
        rotation: [-Math.PI / 2, 0, angle], tint: 1 + j % 5 });
    }
  }
  const mossGeometry = new THREE.BufferGeometry();
  mossGeometry.setAttribute("position", new THREE.Float32BufferAttribute(mossVertices, 3));
  mossGeometry.setAttribute("color", new THREE.Float32BufferAttribute(mossColors, 3));
  mossGeometry.computeVertexNormals();
  const attachedMoss = new THREE.Mesh(mossGeometry, new THREE.MeshLambertMaterial({
    vertexColors: true, side: THREE.DoubleSide,
  }));
  attachedMoss.userData.ignoreTouchOcclusion = true;
  root.add(attachedMoss);
  const groundMaterial = new THREE.MeshLambertMaterial({ flatShading: true });
  const seatPart = boulders.pop();
  if (boulders.length) batch(root, lowRock, groundMaterial, stoneColors, boulders);
  const stoneMaterial = new THREE.MeshLambertMaterial({ color: 0xb9b7b6 });
  const restRock = new THREE.Mesh(viewingStoneGeometry(), stoneMaterial);
  restRock.position.fromArray(seatPart.at);
  restRock.scale.fromArray(seatPart.scale);
  restRock.rotation.set(...seatPart.rotation);
  root.add(restRock);
  restRock.name = "Spring viewing stone";
  batch(root, highRock, groundMaterial, stoneColors, ridges);
  batch(root, new THREE.CircleGeometry(1, 5), groundMaterial, blossomColors, litter).userData.ignoreTouchOcclusion = true;
  batch(root, new THREE.IcosahedronGeometry(1, 1), groundMaterial, greenColors, moss);
  batch(root, new THREE.CylinderGeometry(.65, 1, 1, 5), groundMaterial, [0x64814c, 0x789859, 0x668750], vines)
    .userData.ignoreTouchOcclusion = true;
  batch(root, new THREE.IcosahedronGeometry(1), groundMaterial, greenColors, leaves).userData.ignoreTouchOcclusion = true;
  batch(root, new THREE.ConeGeometry(1, 1, 4), groundMaterial, greenColors, blades);
  batch(root, new THREE.IcosahedronGeometry(1), groundMaterial, [0xfff8e4, 0xffedf1, 0xf7dce7], flowers);
  return restRock;
}

const waterVertex = `
  varying vec2 point;
  #include <fog_pars_vertex>
  void main() {
    point = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #ifdef USE_INSTANCING
      mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    #endif
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// Dither the distant grove into forest fog without changing global visibility or the rock-screen reveal.
const distanceFade = `
  uniform float groveVisibility;
  void applyGroveVisibility() {
    if (groveVisibility >= 1.0) return;
    float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (grain >= groveVisibility) discard;
  }
`;

function waterMaterial(fragment, transparent = false, helpers = "") {
  return new THREE.ShaderMaterial({
    vertexShader: waterVertex,
    fragmentShader: `
      varying vec2 point;
      uniform float time;
      uniform float night;
      #include <fog_pars_fragment>
      ${helpers}
      ${distanceFade}
      void main() {
        applyGroveVisibility();
        ${fragment}
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), time: { value: 0 }, night: { value: 0 } },
    fog: true,
    transparent, side: THREE.DoubleSide, depthWrite: !transparent,
  });
}

function groveWater(root) {
  const rippleLifetime = 1;
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, rippleLifetime));
  let nextRipple = 0, nextStep = 0;
  let lastX, lastZ, lastTime;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 64), waterMaterial(`
    vec2 p = point * 2.0 - 1.0;
    float warpedEdge = length(p) + 0.033 * sin(p.x * 11.0 + p.y * 6.0) + .016 * cos(p.y * 17.0);
    float depth = 1.0 - smoothstep(0.21, 0.94, warpedEdge);
    float crossing = sin(p.x * 31.0 + sin(p.y * 11.0 - time * 0.68) + time * 0.95)
                   * cos(p.y * 27.0 + sin(p.x * 13.0 + time * 0.63) - time * 0.77);
    float threads = pow(max(0.0, crossing), 10.0) * 0.09;
    float impact = length((p - vec2(0.0, ${((SPRING_POOL.z - SPRING_FALLS.z - .43) / SPRING_POOL.radiusZ).toFixed(4)})) * vec2(0.85, 1.28));
    float rings = pow(0.5 + 0.5 * cos(impact * 32.0 - time * 3.8), 13.0)
                * (1.0 - smoothstep(0.025, 0.73, impact)) * 0.185;
    float foam = (1.0 - smoothstep(0.04, 0.26, impact)) *
                 (0.30 + 0.14 * cos(p.x * 65.0 + sin(p.y * 45.0) + time * 4.0));
    float glint = pow(max(0.0, sin(p.y * 65.0 + time + sin(p.x * 13.0))), 14.0)
                * exp(-8.0 * abs(p.x - p.y * 0.27)) * 0.15;
    float shallows = smoothstep(.53, .94, warpedEdge);
    vec3 day = mix(vec3(0.22, 0.55, 0.47), vec3(0.048, 0.30, 0.34), depth);
    day = mix(day, vec3(0.43, 0.65, 0.49), shallows * .72);
    vec3 dusk = mix(vec3(0.06, 0.17, 0.20), vec3(0.03, 0.11, 0.18), depth);
    vec3 light = mix(vec3(0.62, 0.85, 0.74), vec3(0.35, 0.56, 0.85), night);
    vec2 waterPosition = p * vec2(${SPRING_POOL.radiusX}, -${SPRING_POOL.radiusZ});
    float footsteps = 0.0;
    for (int i = 0; i < ${ripples.length}; i++) {
      float age = walkRipples[i].z;
      if (age >= 1.0) continue;
      float wave = length(waterPosition - walkRipples[i].xy) - (.20 + age * .82);
      float crest = 1.0 - smoothstep(.016, .07, abs(wave));
      float wake = 1.0 - smoothstep(.01, .05, abs(wave + .14));
      footsteps += (crest + wake * .36) * (1.0 - age) * smoothstep(0.0, .13, age);
    }
    gl_FragColor = vec4(mix(day, dusk, night) + light * (threads + rings + glint + foam + footsteps * .16), 1.0);
  `, false, `uniform vec3 walkRipples[${ripples.length}];`));
  pool.name = "Spring pool";
  pool.material.uniforms.walkRipples = { value: ripples };
  pool.scale.set(SPRING_POOL.radiusX, SPRING_POOL.radiusZ, 1);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(SPRING_POOL.x, SPRING_POOL.y, SPRING_POOL.z);
  root.add(pool);

  const curtain = new THREE.PlaneGeometry(1, 1, 10, 14);
  const points = curtain.attributes.position;
  const uv = curtain.attributes.uv;
  for (let i = 0; i < points.count; i++) {
    const u = uv.getX(i) - .5, v = uv.getY(i);
    const width = (2.16 - .83 * v + .5 * Math.exp(-v * 13)) * 1.3;
    points.setXYZ(i, u * width, SPRING_POOL.y + v * (SPRING_FALLS.lip - SPRING_POOL.y),
      .35 + .18 * Math.cos(u * 4.2) - .36 * v ** 7 + .04 * Math.sin(u * 17));
  }
  curtain.computeBoundingSphere();
  const falls = new THREE.Mesh(curtain, waterMaterial(`
    float v = point.y;
    float x = point.x + 0.014 * sin(v * 9.0 + time * 1.3);
    float rim = (noise(vec2(x * 7.0, v * 25.0 + time * 4.2)) - .5) * .06;
    float feather = smoothstep(0.015, 0.22, x + rim) * (1.0 - smoothstep(0.78, 0.985, x + rim));
    float bend = (noise(vec2(x * 5.0, v * 6.0 + time * .37)) - .5) * .055;
    float churn = noise(vec2((x + bend) * 22.0, v * 16.0 + time * 5.7));
    float swell = noise(vec2(x * 8.0 - v * 1.3, v * 6.4 + time * 2.1));
    float whitewater = smoothstep(.17, .9, .62 * churn + .42 * swell
      + .28 * (1.0 - smoothstep(0.0, 0.21, v)));
    vec3 clearWater = mix(vec3(.27, .54, .58), vec3(.11, .23, .37), night);
    vec3 aeratedWater = mix(vec3(.92, .98, .94), vec3(.45, .58, .74), night);
    gl_FragColor = vec4(mix(clearWater, aeratedWater, .24 + .69 * whitewater), feather * (.78 + .21 * whitewater));
  `, true, `
    float hash(vec2 grid) {
      vec3 p = fract(vec3(grid.xyx) * .1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }
    float noise(vec2 point) {
      vec2 cell = floor(point), f = fract(point);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
                 mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y);
    }
  `));
  falls.name = "Spring waterfall";
  falls.position.set(SPRING_FALLS.x, -.025, SPRING_FALLS.z);
  root.add(falls);

  const mistGeometry = new THREE.PlaneGeometry(1, 1);
  const puffOpacity = new THREE.InstancedBufferAttribute(new Float32Array(8), 1);
  mistGeometry.setAttribute("puffOpacity", puffOpacity.setUsage(THREE.DynamicDrawUsage));
  const mistMaterial = waterMaterial(`
    vec2 p = (point - 0.5) * 2.0;
    float puff = 1.0 - smoothstep(0.0, .99, length(p));
    vec3 tint = mix(vec3(.94, .98, .96), vec3(.44, .52, .64), night);
    gl_FragColor = vec4(tint, puff * puff * opacity);
  `, true, "varying float opacity;");
  mistMaterial.vertexShader = mistMaterial.vertexShader
    .replace("varying vec2 point;", "varying vec2 point; attribute float puffOpacity; varying float opacity;")
    .replace("point = uv;", "point = uv; opacity = puffOpacity;");
  const mist = new THREE.InstancedMesh(mistGeometry, mistMaterial, puffOpacity.count);
  mist.name = "Waterfall spray";
  mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mist.frustumCulled = false;
  mist.userData.ignoreTouchOcclusion = true;
  root.add(mist);
  const surfaces = [pool, falls, mist];
  return (player, camera, elapsed, night, time) => {
    const distance = Math.hypot(player.x - lastX, player.z - lastZ);
    const step = lastTime === undefined ? 0 : Math.max(0, time - lastTime);
    lastX = player.x;
    lastZ = player.z;
    lastTime = time;
    for (const ripple of ripples) ripple.z = Math.min(rippleLifetime, ripple.z + step);
    const wading = player.grounded && springWaterDepth(player.x, player.y, player.z) > .035;
    nextStep = Math.max(0, nextStep - step);
    if (elapsed > 0 && wading && distance > .001 && distance < 1 && nextStep === 0) {
      ripples[nextRipple].set(player.x - SPRING_POOL.x, player.z - SPRING_POOL.z, 0);
      nextRipple = (nextRipple + 1) % ripples.length;
      nextStep = .145;
    }
    for (let i = 0; i < mist.count; i++) {
      const age = (time / (3.6 + (i % 3) * .29) + i / mist.count) % 1;
      const side = i % 2 === 0 ? -1 : 1;
      const x = SPRING_FALLS.x + side * (.35 + age * (1.55 + i % 3 * .26));
      const z = SPRING_FALLS.z + .48 + age * .72 + (i % 4) * .13;
      pose.position.set(x, SPRING_POOL.y + .26 + age * .12, z);
      pose.rotation.set(0, Math.atan2(camera.position.x - x, camera.position.z - z), 0);
      pose.scale.set(1.32 + age * 2.08, .46 + age * .32, 1);
      pose.updateMatrix();
      mist.setMatrixAt(i, pose.matrix);
      puffOpacity.setX(i, .34 * Math.sin(Math.PI * age) ** 1.5);
    }
    mist.instanceMatrix.needsUpdate = puffOpacity.needsUpdate = true;
    for (const mesh of surfaces) {
      mesh.material.uniforms.time.value = time;
      mesh.material.uniforms.night.value = night;
    }
  };
}

function petalGeometry(subdivisions) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -.48);
  shape.quadraticCurveTo(-.58, -.04, -.34, .39);
  shape.quadraticCurveTo(-.18, .65, 0, .45);
  shape.quadraticCurveTo(.24, .64, .38, .34);
  shape.quadraticCurveTo(.54, -.05, 0, -.48);
  return new THREE.ShapeGeometry(shape, subdivisions);
}

function grovePetals(parent, random, reduced) {
  const root = new THREE.Group();
  const center = springPoint(56, 3);
  root.position.set(center.x, terrainHeight(center.x, center.z), center.z);
  parent.add(root);
  const geometry = petalGeometry(reduced ? 2 : 3);
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: 0xdca1c0, emissiveIntensity: .16 });
  const falling = createFallingFoliage(root, geometry, material, {
    name: "Drifting cherry petals", colors: blossomColors, count: reduced ? 408 : 672, calmCount: reduced ? 51 : 84,
    interval: reduced ? .048 : .032, nearFade: .85, range: 36, restScale: 1.65,
    surface(x, z) {
      const y = terrainHeight(x, z);
      return y + springWaterDepth(x, y, z);
    },
    renew(petal, spread, burst) {
      const tree = SPRING_TREES[Math.floor(random() * SPRING_TREES.length)];
      petal.x = tree.x - root.position.x + (random() - .5) * 4.3;
      petal.z = tree.z - root.position.z + (random() - .5) * 4.3;
      if (tree.overhang !== undefined) {
        petal.x += Math.cos(tree.overhang) * 1.8;
        petal.z += Math.sin(tree.overhang) * 1.8;
      }
      petal.y = terrainHeight(tree.x, tree.z) - root.position.y + tree.size * (CHERRY_FORK_HEIGHT - 1.5 + random() * 2.5);
      petal.speed = .33 + random() * .41;
      petal.phase = random() * Math.PI * 2;
      petal.size = .095 + random() * .135;
      petal.age = spread ? random() * (burst ? 4 : 14) : -random() * 3.5;
      petal.drift = .045 + random() * .17;
      petal.rest = 0;
      petal.landed = false;
    },
  });
  const floaters = Array.from({ length: reduced ? 13 : 19 }, (_, i) => {
    const angle = i * 2.39996;
    const radius = .14 + Math.sqrt(random()) * .36;
    const x = SPRING_POOL.x + Math.cos(angle) * radius * SPRING_POOL.radiusX;
    const z = SPRING_POOL.z + Math.sin(angle) * radius * SPRING_POOL.radiusZ;
    const size = .10 + random() * .13;
    return { at: [x, SPRING_POOL.y + .018, z], scale: [size, size, 1], rotation: [-Math.PI / 2, 0, angle], tint: i + 2 };
  });
  const floating = batch(parent, geometry, material, blossomColors, floaters);
  floating.name = "Floating cherry petals";
  floating.userData.ignoreTouchOcclusion = true;
  floating.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  let nextDrift = 0, driftX = 0, driftZ = 0;
  return {
    update(player, camera, elapsed, night, time, wind) {
      falling.update(player, camera, elapsed, night, wind);
      const follow = 1 - Math.exp(-elapsed * .65);
      driftX += (wind.x * 1.05 - driftX) * follow;
      driftZ += (wind.z * 1.05 - driftZ) * follow;
      if (time < nextDrift) return;
      nextDrift = time + .08;
      for (const [i, { at: [x, y, z], scale }] of floaters.entries()) {
        const phase = time * .21 + i * 2.4;
        pose.position.set(x + Math.sin(phase) * .22 + driftX, y, z + Math.cos(phase * .78) * .20 + driftZ);
        pose.rotation.set(-Math.PI / 2, 0, phase * .38);
        pose.scale.fromArray(scale);
        pose.updateMatrix();
        floating.setMatrixAt(i, pose.matrix);
      }
      floating.instanceMatrix.needsUpdate = true;
    },
  };
}

export function createGroveBreeze(random = Math.random) {
  const wind = { strength: 0, x: 0, z: 0, event: 0, phase: "calm" };
  let clock = 0, next = 30 + random() * 30, start = -18, duration = 0, angle = 0;
  let sitAt, lastSeatWind = -Infinity;

  function begin() {
    start = clock;
    duration = 12 + random() * 6;
    angle = random() * Math.PI * 2;
    wind.event++;
    next = start + 30 + random() * 30;
  }

  return (elapsed, seated = false) => {
    clock += elapsed;
    if (clock >= next) begin();
    if (!seated) {
      sitAt = undefined;
    } else if (sitAt === undefined) {
      sitAt = clock + 2;
    } else if (clock >= sitAt) {
      sitAt = Infinity;
      if (clock >= start + duration && clock - lastSeatWind >= 60) {
        begin();
        lastSeatWind = clock;
      }
    }
    const age = clock - start;
    wind.phase = age >= duration ? "calm" : age < 2.7 ? "rising" : age < duration - 4 ? "peak" : "falling";
    wind.strength = THREE.MathUtils.smoothstep(age, 0, 2.7) *
      (1 - THREE.MathUtils.smoothstep(age, duration - 4, duration));
    wind.x = Math.cos(angle) * wind.strength * .98;
    wind.z = Math.sin(angle) * wind.strength * .98;
    return wind;
  };
}

export function createSpringGrove(parent, reduced, breezeRandom = Math.random) {
  const root = new THREE.Group();
  root.name = "Spring grove";
  parent.add(root);
  const random = seeded(24191);
  const { bark, canopy } = groveTrees(root, random, reduced);
  const breeze = createGroveBreeze(breezeRandom);
  const canopyWind = { value: new THREE.Vector3() };
  let lastBreezeTime;
  const restRock = shoreline(root, random);
  const { x, z } = SPRING_REST_ROCK;
  const rockRay = new THREE.Raycaster(new THREE.Vector3(x, terrainHeight(x, z) + 3, z), new THREE.Vector3(0, -1, 0));
  restRock.updateMatrixWorld(true);
  const perch = rockRay.intersectObject(restRock, false)[0].point;
  const accents = [];
  for (const [i, [dx, dz]] of [[-.57, -.33], [-.66, .16], [-.39, .45], [.22, .48], [.58, .34], [.65, -.14], [.25, -.46]].entries()) {
    rockRay.ray.origin.x = x + dx * SPRING_REST_ROCK.sx;
    rockRay.ray.origin.z = z + dz * SPRING_REST_ROCK.sz;
    const hit = rockRay.intersectObject(restRock, false)[0];
    const size = .10 + (i % 4) * .018;
    accents.push({ at: [hit.point.x, hit.point.y + .019, hit.point.z], scale: [size * 1.22, size, 1],
      rotation: [-Math.PI / 2, 0, i * 2.4], tint: i });
  }
  const petalsOnRock = batch(root, petalGeometry(2), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
    [0xffe9ed, 0xf5afca, 0xffddd9, 0xfff2ea], accents);
  petalsOnRock.name = "Spring stone petals";
  petalsOnRock.userData.ignoreTouchOcclusion = true;

  const teach = addTutorialGlow(restRock, 1.031);
  const water = groveWater(root);
  const petals = grovePetals(root, random, reduced);
  const visibility = { value: 1 };
  const materials = new Set();
  root.traverse((object) => {
    if (object.isMesh) materials.add(object.material);
  });
  for (const material of materials) {
    if (material.isShaderMaterial) {
      material.uniforms.groveVisibility = visibility;
    } else {
      const sways = material === canopy || material === bark;
      material.customProgramCacheKey = () => sways ? "spring-wind" : "spring";
      material.onBeforeCompile = (shader) => {
        shader.uniforms.groveVisibility = visibility;
        if (sways) {
          shader.uniforms.groveWind = canopyWind;
          shader.vertexShader = `uniform vec3 groveWind;
${shader.vertexShader}`.replace("#include <project_vertex>", `
            #include <project_vertex>
            if (dot(groveWind.xy, groveWind.xy) > 0.0) {
              vec4 tip = vec4(transformed, 1.0);
              #ifdef USE_INSTANCING
                tip = instanceMatrix * tip;
              #endif
              float shelter = clamp(tip.y - 4.3, 0.0, 6.0);
              float delay = .10 + .08 * sin(tip.x * .31 + tip.z * .26);
              float response = smoothstep(delay, .74 + delay, length(groveWind.xy));
              float sway = response * (.076 + .031 * sin(groveWind.z * 1.9 + tip.x * .44 + tip.z * .37));
              mvPosition += modelViewMatrix * vec4(groveWind.x * shelter * sway, 0.0,
                groveWind.y * shelter * sway, 0.0);
              gl_Position = projectionMatrix * mvPosition;
            }
          `);
        }
        shader.fragmentShader = shader.fragmentShader.replace("void main() {",
          `${distanceFade}
void main() {
applyGroveVisibility();`);
      };
    }
  }
  return {
    restRock, perch,
    wind: breeze(0),
    teach,
    update(player, camera, elapsed, night, time, seated = false) {
      const distance = Math.hypot(camera.position.x - SPRING_POOL.x, camera.position.z - SPRING_POOL.z);
      visibility.value = 1 - THREE.MathUtils.smoothstep(distance, 36, 50);
      root.visible = visibility.value > 0;
      const breezeStep = lastBreezeTime === undefined || elapsed === 0 ? 0 : Math.min(1, Math.max(0, time - lastBreezeTime));
      lastBreezeTime = root.visible ? time : undefined;
      if (!root.visible) return;
      const wind = breeze(breezeStep, seated);
      canopyWind.value.set(wind.x, wind.z, time);
      bark.color.setRGB(1 - night * .15, 1 - night * .12, 1 - night * .06);
      canopy.color.setRGB(1.0 - night * .12, 1.0 - night * .22, 1.0 - night * .04);
      canopy.emissiveIntensity = .10 + night * .10;
      water(player, camera, elapsed, night, time);
      petals.update(player, camera, elapsed, night, time, wind);
    },
  };
}
