import * as THREE from "three";
import { HABITAT, MOON_STORAGE, cloudFloor, cloudRadius, cloudRimHeight } from "./cloud-house-layout.js";

function cloudGeometry() {
  const geometry = new THREE.BufferGeometry();
  const turns = 48;
  const rings = [[0, 1.49], [.36, 1.49], [.57, 1.49], [.72, cloudRimHeight(.72)],
    [.83, cloudRimHeight(.83)], [.91, cloudRimHeight(.91)], [.965, 1.57], [1, 1.39],
    [.98, 1.14], [.88, .92], [.66, .72], [.36, .64], [0, .63]];
  const positions = [];
  const shades = [];
  const faces = [];
  const top = new THREE.Color(0xfff9eb);
  const under = new THREE.Color(0xd9d9d4);
  const color = new THREE.Color();
  for (const [index, [radius, y]] of rings.entries()) {
    for (let segment = 0; segment < turns; segment++) {
      const angle = segment / turns * Math.PI * 2;
      const edge = radius * cloudRadius(angle);
      const ripple = index > 5 && index < 11 ? Math.sin(angle * 3 + .8) * .06 * radius : 0;
      positions.push(Math.cos(angle) * edge * HABITAT.rx, y + ripple, Math.sin(angle) * edge * HABITAT.rz);
      color.copy(under).lerp(top, THREE.MathUtils.smoothstep(y, .55, 1.65));
      shades.push(color.r, color.g, color.b);
      if (index === rings.length - 1) continue;
      const a = index * turns + segment, b = index * turns + (segment + 1) % turns;
      faces.push(a, b + turns, a + turns, a, b, b + turns);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(shades, 3));
  geometry.setIndex(faces);
  geometry.computeVertexNormals();
  return geometry;
}

function softOval(width, depth, tint) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 }, tint: { value: new THREE.Color(tint) } },
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 surface;
      void main() { surface = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `varying vec2 surface;
      uniform float opacity;
      uniform vec3 tint;
      void main() {
        float fade = 1. - smoothstep(.12,.5,length(surface-.5));
        gl_FragColor = vec4(tint, fade * fade * opacity);
        #include <colorspace_fragment>
      }`,
  }));
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

export function createCloudHabitat(parent) {
  const cloud = new THREE.Mesh(cloudGeometry(), new THREE.MeshLambertMaterial({
    vertexColors: true, emissive: 0xe9dcb9, emissiveIntensity: .085,
  }));
  cloud.position.set(HABITAT.x, 0, HABITAT.z);
  parent.add(cloud);
  const shadow = softOval(14, 9, 0x45575e);
  shadow.position.set(HABITAT.x + .18, .012, HABITAT.z + .06);
  parent.add(shadow);
  const glow = softOval(7, 4, 0xfff5d8);
  glow.position.set(HABITAT.x, 1.515, HABITAT.z);
  parent.add(glow);

  const chest = new THREE.Group();
  parent.add(chest);
  const crescent = new THREE.Shape();
  crescent.absarc(0, 0, .49, Math.PI / 3, Math.PI * 5 / 3, false);
  crescent.quadraticCurveTo(-.49, 0, .245, .49 * Math.sin(Math.PI / 3));
  const moon = new THREE.Mesh(new THREE.ExtrudeGeometry(crescent, {
    depth: .24, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .036, bevelThickness: .045, curveSegments: 18,
  }), new THREE.MeshLambertMaterial({ color: 0xffe7ab, emissive: 0xffd27e, emissiveIntensity: 0 }));
  moon.rotation.z = -.35;
  moon.position.set(.10, .46, -.12);
  chest.add(moon);
  let open = 0;

  return {
    chest,
    setOpen(progress) { open = THREE.MathUtils.smoothstep(progress, 0, 1); },
    update(night, offset) {
      cloud.position.y = offset;
      cloud.material.emissiveIntensity = .085 + night * .19;
      shadow.material.uniforms.opacity.value = .27 - offset * .5;
      glow.position.y = 1.515 + offset;
      glow.visible = night > .01;
      glow.material.uniforms.opacity.value = night * .145;
      chest.position.set(MOON_STORAGE.x, cloudFloor(MOON_STORAGE.x, MOON_STORAGE.z, offset), MOON_STORAGE.z);
      moon.position.y = .46 + open * .11;
      moon.rotation.y = -.17 - open * .48;
      moon.rotation.z = -.35 + open * .18;
      moon.material.emissiveIntensity = night * .36 + open * .23;
    },
  };
}
