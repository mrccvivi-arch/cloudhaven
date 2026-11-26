import * as THREE from "three";
import { seeded } from "./map.js";

// Tall banks flank the view of the tower, with clear sky above the horizon.
const masses = [
  [-154, 28, -91, 39, 15, 8], [-92, 41, -159, 63, 29, 16],
  [-39, 75, -138, 26, 8, 5], [33, 61, -175, 27, 9, 6],
  [112, 33, -157, 53, 25, 14], [150, 26, -62, 36, 13, 8],
  [137, 42, 33, 34, 14, 8], [65, 26, 128, 42, 19, 10],
  [-41, 39, 142, 39, 15, 8], [-121, 30, 69, 39, 15, 9],
  [-162, 23, -12, 30, 13, 7], [68, 82, -111, 22, 7, 5],
];

export function createSummerClouds(parent) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const normals = geometry.attributes.normal;
  const colors = [];
  const bottom = new THREE.Color(0xa6c6e5), middle = new THREE.Color(0xe2eefb), top = new THREE.Color(0xfffdf8);
  const tint = new THREE.Color();
  const { smoothstep } = THREE.MathUtils;
  for (let i = 0; i < normals.count; i++) {
    const lit = normals.getY(i) * .76 - normals.getX(i) * .34 + normals.getZ(i) * .25;
    tint.copy(bottom).lerp(middle, smoothstep(lit, -.98, .19)).lerp(top, smoothstep(lit, -.28, .77));
    colors.push(tint.r, tint.g, tint.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
  const lighting = {
    cloudMix: { value: 0 },
    warmSide: { value: new THREE.Color() },
    coolSide: { value: new THREE.Color() },
    cloudSun: { value: new THREE.Vector3() },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, lighting);
    shader.vertexShader = `uniform vec3 cloudSun;
      varying float sunlight;
      ${shader.vertexShader}`.replace("#include <begin_vertex>", `#include <begin_vertex>
      sunlight = dot(normalize(mat3(instanceMatrix) * position), cloudSun);`);
    shader.fragmentShader = `uniform float cloudMix;
      uniform vec3 warmSide, coolSide;
      varying float sunlight;
      ${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
      vec3 tint = mix(coolSide, warmSide, smoothstep(-.65, .84, sunlight));
      diffuseColor.rgb *= mix(vec3(1.), tint, cloudMix);`);
  };
  const geometryCount = masses.reduce((sum, mass) => sum + mass[5], 0);
  const clouds = new THREE.InstancedMesh(geometry, material, geometryCount);
  const pose = new THREE.Object3D();
  const random = seeded(3836);
  const white = new THREE.Color(0xffffff), distant = new THREE.Color(0xd6eaff), night = new THREE.Color(0x799aca);
  const peach = new THREE.Color(0xffceba), silver = new THREE.Color(0xa9c6ef), violet = new THREE.Color(0x6670af);
  const rainCloud = new THREE.Color(0x9aafc8);
  let instance = 0;
  for (const [x, y, z, width, height, count] of masses) {
    const thin = height / width < .36;
    const foundation = thin ? count : Math.ceil(count * .64);
    const upperCount = count - foundation;
    const summit = random() * .20 - .10;
    for (let i = 0; i < count; i++) {
      const low = i < foundation;
      const offset = low
        ? (i / (foundation - 1) - .5) * .72 + (random() - .5) * .08
        : summit + ((i - foundation + .5) / upperCount - .5) * .48 + (random() - .5) * .08;
      const center = Math.max(0, 1 - Math.abs(offset - summit) * 2.25);
      const widthRatio = low ? .145 + .10 * random() : .135 + .12 * random() ** 1.5;
      const rise = low ? .075 * random() : .15 + center * (.29 + .15 * random());
      pose.position.set(x + width * offset, y + height * rise, z + width * (random() - .5) * .15);
      pose.scale.set(width * widthRatio, height * (low ? .22 + .15 * random() : .24 + .21 * random()),
        width * widthRatio * (.69 + random() * .26));
      pose.rotation.y = random() * Math.PI;
      pose.updateMatrix();
      clouds.setMatrixAt(instance, pose.matrix);
      tint.copy(white).lerp(distant, .04 + Math.max(0, (Math.hypot(x, z) - 110) / 290) + .10 * random());
      clouds.setColorAt(instance++, tint);
    }
  }
  clouds.instanceMatrix.needsUpdate = clouds.instanceColor.needsUpdate = true;
  clouds.computeBoundingSphere();
  parent.add(clouds);
  return (time, darkness, look, overcast = 0) => {
    material.color.copy(white).lerp(night, look ? 0 : darkness).lerp(rainCloud, overcast * .50);
    lighting.cloudMix.value = look?.cloudMix ?? 0;
    if (look) {
      lighting.warmSide.value.copy(look.cloudLight).lerp(peach, look.sunGlow * .28).lerp(silver, look.moon * .68);
      lighting.coolSide.value.copy(look.cloudShade).lerp(violet, look.moon * .60);
      lighting.cloudSun.value.copy(look.sunDirection).lerp(look.moonDirection, look.moon).normalize();
    }
    clouds.position.x = 3.8 * Math.sin(time * .026);
    clouds.position.z = 2.5 * Math.sin(time * .019 + .4);
  };
}
