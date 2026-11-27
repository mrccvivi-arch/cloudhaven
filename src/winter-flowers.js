import * as THREE from "three";
import { makePoints, snowTexture } from "../previews/snow-whale/snow.js";
import { seeded } from "./map.js";
import { winterHeight } from "./winter-layout.js";

function blossomGeometry(compact) {
  const surface = [], indices = [], tint = [], heart = [], edges = [];
  const ice = new THREE.Color(0x83c4fb);
  const frost = new THREE.Color(0xe7f8ff);
  const pearl = new THREE.Color(0xf1f5fc);
  const color = new THREE.Color();
  const rows = compact ? 3 : 7;
  const columns = compact ? 2 : 5;
  for (let petal = 0; petal < 6; petal++) {
    const angle = petal * Math.PI / 3;
    const phase = Math.sin(angle * 2 + .8);
    const base = surface.length / 3;
    for (let row = 0; row <= rows; row++) {
      const along = row / rows;
      const width = .014 + .267 * Math.sin(Math.PI * along ** .86) ** .63;
      for (let column = 0; column <= columns; column++) {
        const across = column / columns * 2 - 1;
        const reach = .065 + along * (.89 + .08 * phase);
        const curve = .083 + .40 * along ** 1.67 + .085 * across * across * Math.sin(Math.PI * along);
        const lateral = across * width + phase * .049 * along * along;
        surface.push(Math.cos(angle) * reach - Math.sin(angle) * lateral, curve,
          Math.sin(angle) * reach + Math.cos(angle) * lateral);
        const rim = Math.max(Math.abs(across) * .79, along ** 4);
        color.copy(frost).lerp(ice, rim * .50).lerp(pearl, (1 - along) ** 3 * .84);
        tint.push(color.r, color.g, color.b);
        heart.push((1 - along) ** 4);
        edges.push(rim);
        if (row < rows && column < columns) {
          const at = base + row * (columns + 1) + column;
          const next = at + columns + 1;
          indices.push(at, at + 1, next, next, at + 1, next + 1);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(surface, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(tint, 3));
  geometry.setAttribute("heart", new THREE.Float32BufferAttribute(heart, 1));
  geometry.setAttribute("petalEdge", new THREE.Float32BufferAttribute(edges, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createIceBlossoms(parent, count, night, clock, compact = false) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .80,
    depthWrite: false, forceSinglePass: true, roughness: .65,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.blossomNight = night;
    shader.uniforms.blossomClock = clock;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      attribute float heart, petalEdge;
      varying vec3 vBlossom;
      uniform float blossomClock;
    `).replace("#include <begin_vertex>", `
      #include <begin_vertex>
      float seed = (float(gl_InstanceID) + 1.) * .75487766;
      float scatter = fract(seed);
      float pulse = .5 + .5 * sin(blossomClock * (.42 + scatter * .24) + seed * 4.1);
      vBlossom = vec3(heart, petalEdge, smoothstep(.27, .95, pulse));
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform float blossomNight;
      varying vec3 vBlossom;
    `).replace("#include <opaque_fragment>", `
      float facing = abs(dot(normal, normalize(vViewPosition)));
      float ice = (1. - facing) * (1. - facing);
      float edge = smoothstep(.35, .83, vBlossom.y);
      float facet = pow(max(0., dot(normalize(vViewPosition), reflect(vec3(.45,-.67,-.59), normal))), 15.);
      outgoingLight += vec3(.43,.71,1.) * (.087 + .13 * blossomNight) * (1. - vBlossom.x);
      outgoingLight += vec3(.78,.92,1.) * (ice * .13 + edge * (.10 + .15 * facet));
      outgoingLight += vec3(.86,.94,1.) * (.30 + blossomNight * (.34 + .12 * vBlossom.z)) * vBlossom.x;
      diffuseColor.a *= .57 + .18 * edge + .18 * ice + .32 * vBlossom.x;
      #include <opaque_fragment>
    `);
  };
  const mesh = new THREE.InstancedMesh(blossomGeometry(compact), material, count);
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

export function addGroundBlossoms(parent, night, clock) {
  const random = seeded(13747);
  const beds = [[-5,25], [6,20], [-13,31], [15,39], [-28,21], [47,13], [-44,-17],
    [-17,-46], [34,-44], [22,-11], [11,-13], [9,-23], [22,-25], [28,-18], [16,-28]];
  const blooms = beds.flatMap(([x, z]) => Array.from({ length: 3 + Math.floor(random() * 5) }, () => {
    const angle = random() * Math.PI * 2;
    const r = Math.sqrt(random()) * 1.48;
    return [x + Math.cos(angle) * r, z + Math.sin(angle) * r, .16 + random() ** 1.5 * .27];
  }));
  const mesh = createIceBlossoms(parent, blooms.length, night, clock);
  const flower = new THREE.Object3D();
  blooms.forEach(([x, z, size], index) => {
    flower.position.set(x, winterHeight(x, z) + .055, z);
    flower.rotation.set((random() - .5) * .64, random() * Math.PI * 2, (random() - .5) * .56);
    flower.scale.setScalar(size);
    flower.updateMatrix();
    mesh.setMatrixAt(index, flower.matrix);
  });
  const selected = blooms.filter((entry, index) => index % 6 === 0);
  const glints = makePoints(parent, snowTexture("star"), selected.length, .20, 2);
  selected.forEach(([x, z, size], index) => {
    glints.positions.setXYZ(index, x + size * .18, winterHeight(x, z) + size * .43 + .072, z);
    glints.colors.setXYZW(index, .64, .84, 1, 0);
    glints.scales.setX(index, .64 + size * 1.11);
  });
  return time => {
    selected.forEach((entry, index) => {
      const pulse = .5 + .5 * Math.sin(time * (.43 + index % 5 * .092) + index * 7.31);
      glints.colors.setW(index, THREE.MathUtils.smoothstep(pulse, .945, 1) * (.30 + .38 * night.value));
    });
    glints.colors.needsUpdate = true;
  };
}
