import * as THREE from "three";
import { makePoints, snowTexture } from "../previews/snow-whale/snow.js";
import { createIceBlossoms } from "./winter-flowers.js";

const { smoothstep, euclideanModulo } = THREE.MathUtils;
export const WINTER_GLOBE_TYPES = Object.freeze(["snow", "flower", "star"]);
const placement = ["flower", "snow", "star", "snow", "flower", "star", "star", "flower", "snow", "star", "snow"];
const TAU = Math.PI * 2;

function globeGlass(night) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xb8dfff, roughness: .25, transparent: true, opacity: .83, depthWrite: false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.globeNight = night;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      varying vec3 globeNormal;
    `).replace("#include <begin_vertex>", `
      #include <begin_vertex>
      globeNormal = normalize(position);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      uniform float globeNight;
      varying vec3 globeNormal;
    `).replace("#include <opaque_fragment>", `
      float facing = clamp(dot(normal, normalize(vViewPosition)), 0., 1.);
      float rim = pow(1. - facing, 2.5);
      float reflection = pow(max(0., dot(normalize(globeNormal), vec3(-.51,.68,.53))), 31.);
      float returnEdge = pow(max(0., dot(normalize(globeNormal), vec3(.80,-.54,-.26))), 13.);
      diffuseColor.a *= .029 + rim * .74 + reflection * .42 + returnEdge * .086;
      outgoingLight += vec3(.60,.83,1.) * (.11 + .91 * rim + .56 * reflection + .29 * returnEdge)
        * (.88 + .12 * globeNight);
      #include <opaque_fragment>
    `);
  };
  return material;
}

function spinParticles(material, clock) {
  const size = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    size(shader);
    shader.uniforms.globeClock = clock;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `
      #include <common>
      uniform float globeClock;
      varying float vGlobeSpin;
    `).replace("#include <begin_vertex>", `
      #include <begin_vertex>
      float scatter = fract(float(gl_VertexID) * .61803399);
      vGlobeSpin = scatter * 6.283 + globeClock * (.14 + scatter * .33);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying float vGlobeSpin;
    `).replace("#include <map_particle_fragment>", `
      vec2 centered = gl_PointCoord - .5;
      float c = cos(vGlobeSpin), s = sin(vGlobeSpin);
      vec2 uv = mat2(c,s,-s,c) * centered + .5;
      diffuseColor *= texture2D(map, uv);
    `);
  };
}

function snowDrift() {
  const profile = new THREE.LatheGeometry([
    new THREE.Vector2(0, -.89), new THREE.Vector2(.33, -.85),
    new THREE.Vector2(.48, -.76), new THREE.Vector2(.56, -.67),
    new THREE.Vector2(.49, -.57), new THREE.Vector2(.29, -.52),
    new THREE.Vector2(0, -.48),
  ], 17);
  const position = profile.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const r = Math.hypot(x, z);
    const angle = Math.atan2(z, x);
    const swell = r * (.08 * Math.sin(angle * 2 + .9) + .045 * Math.sin(angle * 3 - .5));
    position.setY(i, y + swell * smoothstep(y, -.86, -.55));
  }
  profile.computeVertexNormals();
  return profile;
}

export function globeParticle(type, index, time, phase, output) {
  const initial = phase + index * 2.39996;
  if (type === "star") {
    const pulse = .5 + .5 * Math.sin(time * (.47 + index * .032) + initial);
    const angle = initial + time * (.11 + index * .009);
    const radius = index === 0 ? .10 : .27 + .33 * ((index * .618) % 1);
    output.set(Math.cos(angle) * radius, Math.sin(.67 * time + initial) * (index === 0 ? .10 : .43),
      Math.sin(angle) * radius);
    return .41 + .54 * pulse;
  }
  const life = euclideanModulo(index * .381 + phase / TAU + time * (.122 + (index % 6) * .022), 1);
  const y = (type === "flower" ? .62 : .75) - life * (type === "flower" ? 1.30 : 1.28);
  const angle = initial + time * (.31 + index * .016);
  const radius = Math.sqrt(1 - y * y) * (.29 + .48 * ((index * .618) % 1));
  output.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  return smoothstep(life, 0, .14) * (1 - smoothstep(life, .81, 1));
}

export function createWinterGlobes(root, hangers, night, clock, reduced) {
  const glass = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 19, 13), globeGlass(night), hangers.length);
  glass.renderOrder = 4;
  const stringMaterial = new THREE.MeshStandardMaterial({
    color: 0xffe9c7, roughness: .74, emissive: 0xffe3b2, emissiveIntensity: .35,
  });
  const strings = new THREE.InstancedMesh(new THREE.CylinderGeometry(.015, .020, 1, 5), stringMaterial, hangers.length);
  const supported = hangers.map((hanger, index) => ({
    ...hanger, type: placement[index % placement.length], center: new THREE.Vector3(),
  }));
  glass.userData.globeTypes = supported.map(({ type }) => type);
  const snowCount = supported.filter(({ type }) => type === "snow").length;
  const flowerCount = supported.filter(({ type }) => type === "flower").length;
  const starCount = supported.length - snowCount - flowerCount;
  const bedMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9e1f6, emissive: 0xd2e6ff, emissiveIntensity: .07, roughness: .91,
  });
  const beds = new THREE.InstancedMesh(snowDrift(), bedMaterial, snowCount);
  const flowers = createIceBlossoms(root, flowerCount, night, clock);
  flowers.renderOrder = 2;
  const quota = { snow: reduced ? 15 : 19, flower: reduced ? 5 : 7, star: reduced ? 8 : 11 };
  const flakes = makePoints(root, snowTexture("crystal"), snowCount * quota.snow + flowerCount * quota.flower, .139, 3);
  const stars = makePoints(root, snowTexture("star"), starCount * quota.star, .18, 3);
  spinParticles(flakes.material, clock);
  spinParticles(stars.material, clock);
  const pearl = new THREE.Color(0xf4faff);
  const blue = new THREE.Color(0xadceff);
  const gold = new THREE.Color(0xffd59b);
  const amber = new THREE.Color(0xf9ae5c);
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  const down = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const point = new THREE.Vector3();
  const cameraLocal = new THREE.Vector3();
  for (const mesh of [glass, beds, strings, flowers]) {
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  root.add(glass, beds, strings);

  return (time, darkness, camera) => {
    stringMaterial.emissiveIntensity = .14 + darkness * .24;
    bedMaterial.emissiveIntensity = .045 + darkness * .14;
    if (camera) cameraLocal.copy(camera.position).sub(root.position);
    let bed = 0, flower = 0, snowSlot = 0, starSlot = 0;
    supported.forEach(({ base, length, size, phase, type, center }, index) => {
      const sway = .085 * Math.sin(time * .51 + phase);
      center.set(base.x + sway * length, base.y - length, base.z + .078 * length * Math.cos(time * .41 + phase));
      dummy.quaternion.identity();
      dummy.position.copy(center);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      glass.setMatrixAt(index, dummy.matrix);
      if (type === "snow") {
        dummy.rotation.y = phase;
        dummy.updateMatrix();
        beds.setMatrixAt(bed++, dummy.matrix);
      } else if (type === "flower") {
        dummy.position.y -= size * (.19 + .027 * Math.sin(time * .69 + phase));
        dummy.rotation.set(.14 + sway, phase, -.13);
        dummy.scale.setScalar(size * .61);
        dummy.updateMatrix();
        flowers.setMatrixAt(flower++, dummy.matrix);
      }
      dummy.position.copy(base).lerp(center, .5);
      dummy.position.y += size * .48;
      axis.subVectors(base, center).normalize();
      dummy.quaternion.setFromUnitVectors(down, axis);
      dummy.scale.set(1, Math.max(.1, length - size * .91), 1);
      dummy.updateMatrix();
      strings.setMatrixAt(index, dummy.matrix);
      const far = camera && center.distanceToSquared(cameraLocal) > 32 ** 2;
      const stellar = type === "star";
      const pool = stellar ? stars : flakes;
      const count = quota[type];
      for (let j = 0; j < count; j++) {
        const slot = stellar ? starSlot++ : snowSlot++;
        if (far && j >= Math.ceil(count * .44)) {
          pool.colors.setW(slot, 0);
          continue;
        }
        const pulse = globeParticle(type, j, time, phase, point);
        pool.positions.setXYZ(slot, center.x + point.x * size, center.y + point.y * size, center.z + point.z * size);
        if (stellar) color.copy(j % 5 === 0 ? pearl : gold).lerp(amber, j === 0 ? .12 : .29);
        else color.copy(pearl).lerp(blue, type === "flower" ? .31 : .14);
        const opacity = pulse * (stellar ? .57 + .40 * darkness : .44 + .44 * darkness);
        pool.colors.setXYZW(slot, color.r, color.g, color.b, opacity);
        pool.scales.setX(slot, size * (stellar && j === 0 ? 2.65 : .66 + .81 * ((j * .369) % 1)));
      }
    });
    for (const mesh of [glass, beds, strings, flowers]) mesh.instanceMatrix.needsUpdate = true;
    for (const pool of [flakes, stars]) pool.positions.needsUpdate = pool.colors.needsUpdate = pool.scales.needsUpdate = true;
  };
}
