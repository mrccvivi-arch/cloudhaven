import * as THREE from "three";

const ivory = new THREE.Color(0xe0d2be);
const weathered = new THREE.Color(0xac967a);
const midnight = new THREE.Color(0x19243c);
const blueSlate = new THREE.Color(0x354665);
const crackGold = new THREE.Color(0x927347);
const crackBrown = new THREE.Color(0x5d4734);
const { smoothstep } = THREE.MathUtils;

function marble(source, tubes) {
  const geometry = source.clone();
  const position = geometry.attributes.position;
  const color = geometry.attributes.color;
  const grain = geometry.attributes.grain;
  const tint = new THREE.Color();

  // Keep the root bases and arc directions. Bury the distal rings of the original root tubes.
  tubes.slice(1, 10).forEach(({ vertex, sides, rings }, root) => {
    for (let ring = 0; ring < rings; ring++) {
      const t = ring / (rings - 1);
      const sink = smoothstep(t, .38 + (root % 3) * .07, 1);
      for (let side = 0; side < sides; side++) {
        const i = vertex + ring * sides + side;
        position.setXYZ(i, position.getX(i) * (1 - .12 * sink),
          position.getY(i) - sink * (1.34 + .19 * (root % 4)),
          position.getZ(i) * (1 - .12 * sink));
      }
    }
  });

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const stain = .5 + .5 * Math.sin(x * .68 + z * .81 + .44 * Math.sin(y * 1.15));
    const patina = .08 + stain ** 2 * .26 + Math.min(.28, grain.getX(i) * .32);
    const groundStain = (1 - smoothstep(y, .08, 3.9)) * .16;
    tint.copy(ivory).lerp(weathered, patina + groundStain);
    color.setXYZ(i, tint.r, tint.g, tint.b);
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ roughness: .89, vertexColors: true });
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 stonePoint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nstonePoint = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 stonePoint;")
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec3 p = stonePoint;
        float curl = sin(p.x * 2.1 + p.z * 1.8) + .29 * sin(p.y * 3.3 - p.z * 3.8);
        float vein = abs(sin(p.x * 1.95 + p.z * 2.9 + p.y * .37 + curl * .80));
        float mottling = sin(p.x * 8.2 + p.y * 8.6) * sin(p.z * 7.3 - p.y * 6.1);
        diffuseColor.rgb *= 1. - .065 * (1. - smoothstep(.02,.38,vein)) + .018 * mottling;
      `);
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function crown(source, growth, count) {
  const candidates = [];
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  for (let i = 0; i < source.count; i++) {
    source.getMatrixAt(i, matrix);
    point.setFromMatrixPosition(matrix);
    const side = growth(point);
    if (side <= .45) continue;
    const seed = i * .61803398875 % 1;
    const priority = seed - smoothstep(side, -2.4, 2.8) * .97;
    candidates.push({ matrix: matrix.clone(), point: point.clone(), side, seed, priority });
  }
  candidates.sort((a, b) => a.priority - b.priority);
  const natural = candidates.slice(0, count);
  const centers = natural.filter(({ side }) => side > 3.1);
  const leaves = new THREE.InstancedMesh(source.geometry.clone(),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .94 }), count);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const secondary = i >= natural.length;
    const entry = secondary ? centers[(i - natural.length) % centers.length] : natural[i];
    const { point: origin, side, seed } = entry;
    const scale = secondary ? .62 + .14 * seed : .84 + .16 * smoothstep(side, .4, 5);
    matrix.copy(entry.matrix).scale(point.setScalar(scale));
    if (secondary) {
      const phase = i * 2.399963;
      point.copy(origin).add(new THREE.Vector3(.10 * Math.cos(phase), -.06 - .20 * seed, .19 * Math.sin(phase)));
      matrix.setPosition(point);
    }
    leaves.setMatrixAt(i, matrix);
    const tintWave = .5 + .5 * Math.sin(origin.x * .71 + origin.y * .57 + origin.z * .43);
    tint.copy(midnight).lerp(blueSlate, .18 + .61 * tintWave ** 1.7 + .15 * seed);
    leaves.setColorAt(i, tint);
  }
  leaves.castShadow = leaves.receiveShadow = true;
  return leaves;
}

function centerOfRing(geometry, tube, ring) {
  const { vertex, sides } = tube;
  const position = geometry.attributes.position;
  const center = new THREE.Vector3();
  const sample = new THREE.Vector3();
  for (let i = 0; i < sides; i++) {
    sample.fromBufferAttribute(position, vertex + ring * sides + i);
    center.addScaledVector(sample, 1 / sides);
  }
  return center;
}

function surfaceCracks(wood, tubes) {
  const branch = tubes.filter(tube => tube.sides === 12).find(tube => {
    const center = centerOfRing(wood, tube, 11);
    return center.x < -4 && center.z > 0 && center.y > 5;
  }) ?? tubes.find(tube => tube.sides === 12);
  const sites = [
    { tube: tubes[0], from: .09, length: .224, angle: -.19, width: .065 },
    { tube: tubes[0], from: .37, length: .16, angle: .74, width: .050 },
    { tube: branch, from: .18, length: .29, angle: -.17, width: .067 },
  ];
  const triangles = [], colors = [], indices = [];
  const carrier = wood.clone();
  const probe = new THREE.Mesh(carrier, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  probe.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const face = new THREE.Vector3(.24, .13, 1).normalize();
  const tint = new THREE.Color();

  for (const [site, { tube, from, length, angle, width }] of sites.entries()) {
    carrier.setDrawRange(tube.start, tube.end - tube.start);
    const guide = new THREE.CatmullRomCurve3(Array.from({ length: tube.rings },
      (_, ring) => centerOfRing(wood, tube, ring)));
    const crooked = t => angle + .20 * t + .13 * Math.sin(t * 11 + site) + .05 * Math.sin(t * 31);
    for (const fork of [false, true]) {
      let last = -1;
      const count = fork ? 16 : 36;
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const along = fork ? .39 + .48 * t : t;
        const point = guide.getPoint(from + along * length);
        const tangent = guide.getTangent(from + along * length);
        const outward = face.clone().addScaledVector(tangent, -face.dot(tangent)).normalize();
        const turn = crooked(along) + (fork ? -.46 * t ** .83 + .06 * Math.sin(t * 13) * t : 0);
        const taper = (.08 + .92 * Math.sin(Math.PI * t) ** .77) * (.77 + .23 * Math.sin(t * 26 + site));
        const edges = [-1, 1].map(side => {
          const normal = outward.clone().applyAxisAngle(tangent, turn + side * width * taper * (fork ? .65 : 1));
          ray.set(point.clone().addScaledVector(normal, 4), normal.clone().negate());
          return ray.intersectObject(probe, false)[0]?.point.addScaledVector(normal, .013);
        });
        if (edges.some(edge => !edge)) {
          last = -1;
          continue;
        }
        const index = triangles.length / 3;
        for (const edge of edges) {
          triangles.push(...edge);
          tint.copy(crackBrown).lerp(crackGold, .33 + .67 * (.5 + .5 * Math.sin(t * 39 + site)));
          colors.push(tint.r, tint.g, tint.b);
        }
        if (last >= 0) indices.push(last, index, last + 1, index, index + 1, last + 1);
        last = index;
      }
    }
  }
  carrier.dispose();
  probe.material.dispose();
  const cracks = new THREE.BufferGeometry();
  cracks.setAttribute("position", new THREE.Float32BufferAttribute(triangles, 3));
  cracks.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  cracks.setIndex(indices);
  cracks.computeVertexNormals();
  const surface = new THREE.Mesh(cracks, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: .88, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }));
  surface.receiveShadow = true;
  return surface;
}

export function createClassicalTree(wood, leaves, tubes, growth, referenceCount) {
  const group = new THREE.Group();
  const trunk = marble(wood, tubes);
  group.add(trunk, crown(leaves, growth, Math.round(referenceCount * 1.30)), surfaceCracks(trunk.geometry, tubes));
  return group;
}
