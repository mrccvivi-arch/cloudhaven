import * as THREE from "three";
import { seeded } from "./map.js";
import { islandHeight, POND, pondDistance, SUMMER_WATER, summerSurface } from "./summer-layout.js";

const TAU = Math.PI * 2;
const { smoothstep, lerp, euclideanModulo } = THREE.MathUtils;

function rainbows(parent) {
  const positions = [], uvs = [], faces = [];
  const steps = 80;
  for (let i = 0; i <= steps; i++) {
    const angle = i / steps * Math.PI;
    for (let side = 0; side <= 1; side++) {
      const x = Math.cos(angle) * (51 + 5 * side);
      positions.push(110 + x * .77, Math.sin(angle) * (43 + 4 * side) - 1.1, 133 - x * .64);
      uvs.push(i / steps, side);
    }
    if (i < steps) faces.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(faces);
  const arc = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false,
    uniforms: { strength: { value: 0 } },
    vertexShader: `
      varying vec2 ribbon;
      void main() { ribbon = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      varying vec2 ribbon;
      uniform float strength;
      void main() {
        float hue = .76 * (1. - ribbon.y);
        vec3 spectrum = clamp(abs(fract(hue + vec3(0., .667, .333)) * 6. - 3.) - 1., 0., 1.);
        vec3 color = mix(vec3(.88, .93, 1.), spectrum, .63);
        float edge = smoothstep(0., .20, ribbon.y) * (1. - smoothstep(.80, 1., ribbon.y));
        float feet = smoothstep(0., .075, ribbon.x) * (1. - smoothstep(.925, 1., ribbon.x));
        gl_FragColor = vec4(color, edge * feet * strength * .74);
        #include <colorspace_fragment>
      }`,
  }));
  arc.name = "summer-weather-rainbow";
  arc.visible = false;
  arc.renderOrder = 2;
  parent.add(arc);
  return (strength) => {
    arc.visible = strength > .004;
    arc.material.uniforms.strength.value = strength;
  };
}

function rain(parent, random) {
  const count = 168;
  const positions = new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry().setAttribute("position", positions);
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0xe2f7ff, transparent: true, depthWrite: false, toneMapped: false,
  }));
  lines.name = "summer-shower";
  lines.visible = false;
  lines.frustumCulled = false;
  lines.renderOrder = 7;
  parent.add(lines);
  const drops = Array.from({ length: count }, () => ({
    x: random() * 25, z: random() * 25, seed: random() * 12, speed: 8 + random() * 7, length: .53 + random() * .65,
  }));
  const rings = Array.from({ length: 15 }, () => ({ epoch: -Infinity, phase: random(), x: 0, z: 0, y: 0 }));
  const ringPoints = new THREE.BufferAttribute(new Float32Array(rings.length * 12 * 6), 3).setUsage(THREE.DynamicDrawUsage);
  const ringAlpha = new THREE.BufferAttribute(new Float32Array(rings.length * 24), 1).setUsage(THREE.DynamicDrawUsage);
  const ringGeometry = new THREE.BufferGeometry().setAttribute("position", ringPoints).setAttribute("ringAlpha", ringAlpha);
  const surface = new THREE.LineSegments(ringGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `
      attribute float ringAlpha;
      varying float alpha;
      void main() { alpha = ringAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      varying float alpha;
      void main() {
        gl_FragColor = vec4(.63, .83, .91, alpha);
        #include <colorspace_fragment>
      }`,
  }));
  surface.frustumCulled = false;
  surface.renderOrder = 3;
  surface.name = "summer-shower-ripples";
  surface.visible = false;
  parent.add(surface);
  return (weather, player, camera) => {
    lines.visible = surface.visible = !!player && !!camera && weather.rain > .008;
    if (!lines.visible) {
      for (const ring of rings) ring.epoch = -Infinity;
      return;
    }
    const { time, x: wx, z: wz } = weather;
    const cx = lerp(player.x, camera.position.x, .31), cz = lerp(player.z, camera.position.z, .31);
    const bottom = Math.max(player.y, camera.position.y) - 5;
    drops.forEach((drop, i) => {
      const x = cx - 12.5 + euclideanModulo(drop.x + weather.driftX * 1.35 - cx, 25);
      const z = cz - 12.5 + euclideanModulo(drop.z + weather.driftZ * 1.35 - cz, 25);
      const y = bottom + euclideanModulo(drop.seed - time * drop.speed, 12);
      positions.setXYZ(i * 2, x, y, z);
      positions.setXYZ(i * 2 + 1, x - wx * .22, y + drop.length, z - wz * .22);
    });
    positions.needsUpdate = true;
    geometry.setDrawRange(0, Math.ceil(count * (.40 + weather.rain * .60)) * 2);
    lines.material.opacity = weather.rain * .44;
    let index = 0;
    for (const ring of rings) {
      const phase = time * 1.15 + ring.phase, epoch = Math.floor(phase), age = phase - epoch;
      if (epoch !== ring.epoch) {
        ring.epoch = epoch;
        ring.x = player.x + (random() - .5) * 20;
        ring.z = player.z + (random() - .5) * 20;
        const basin = pondDistance(ring.x, ring.z) < .96;
        const floor = islandHeight(ring.x, ring.z);
        ring.y = basin && floor < POND.y ? POND.y + .035 :
          summerSurface(ring.x, ring.z, 0, floor) === "water" ? SUMMER_WATER + .048 : undefined;
      }
      if (ring.y === undefined) continue;
      const radius = .08 + age * .58;
      const alpha = weather.rain * .46 * (1 - age) * smoothstep(age, 0, .09);
      for (let i = 0; i < 12; i++) {
        for (const point of [i, i + 1]) {
          const angle = point * TAU / 12;
          ringPoints.setXYZ(index, ring.x + Math.cos(angle) * radius, ring.y, ring.z + Math.sin(angle) * radius);
          ringAlpha.setX(index++, alpha);
        }
      }
    }
    ringGeometry.setDrawRange(0, index);
    ringPoints.needsUpdate = ringAlpha.needsUpdate = true;
  };
}

function petals(parent, random) {
  const count = 13;
  const shape = new THREE.CircleGeometry(1, 5);
  const mesh = new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial({
    color: 0xffddb4, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
  }), count);
  mesh.frustumCulled = false;
  mesh.name = "summer-wind-petals";
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  const pose = new THREE.Object3D();
  const seeds = Array.from({ length: count }, () => [random() * 17, random() * 17, random() * TAU, .08 + random() * .065]);
  return (weather, player) => {
    mesh.visible = !!player && weather.wind > .09;
    if (!mesh.visible) return;
    mesh.material.opacity = smoothstep(weather.wind, .09, .90) * .77;
    seeds.forEach(([sx, sz, phase, size], i) => {
      const t = weather.time;
      const x = player.x + euclideanModulo(sx + weather.driftX * .79 - player.x, 17) - 8.5;
      const z = player.z + euclideanModulo(sz + weather.driftZ * .79 - player.z, 17) - 8.5;
      pose.position.set(x, islandHeight(x, z) + 1.35 + Math.sin(t * 1.4 + phase) * .67, z);
      pose.scale.set(size, size * .62, size);
      pose.rotation.set(t + phase, t * 1.6 + phase, phase);
      pose.updateMatrix();
      mesh.setMatrixAt(i, pose.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
}

function meteors(parent, random) {
  const items = Array.from({ length: 2 }, () => {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
      blending: THREE.AdditiveBlending, toneMapped: false,
      uniforms: { strength: { value: 0 } },
      vertexShader: `
        varying vec2 trail;
        void main() { trail = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `
        varying vec2 trail;
        uniform float strength;
        void main() {
          float r = abs(trail.y - .5);
          float tail = pow(trail.x, 1.7) * (1. - smoothstep(.967, 1., trail.x));
          float core = 1. - smoothstep(.018, .126, r);
          float glow = exp(-r * 9.);
          gl_FragColor = vec4(mix(vec3(.27, .61, 1.), vec3(.94, .97, 1.), core), strength * tail * (glow * .42 + core * .73));
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.name = "summer-meteor";
    parent.add(mesh);
    return { mesh, start: new THREE.Vector3(), travel: new THREE.Vector3(), endAt: -Infinity, startAt: Infinity, spoke: false };
  });
  const forward = new THREE.Vector3(), head = new THREE.Vector3(), projected = new THREE.Vector3();
  const tangent = new THREE.Vector3(), cross = new THREE.Vector3(), normal = new THREE.Vector3(), orient = new THREE.Matrix4();
  const inView = (point, camera) => {
    projected.copy(point).project(camera);
    return Math.abs(projected.x) < .92 && Math.abs(projected.y) < .93 && Math.abs(projected.z) < 1;
  };
  function launch(item, time, delay, camera) {
    const heading = Math.atan2(forward.z, forward.x);
    const side = random() < .5 ? -1 : 1;
    let height;
    for (let i = 0; i < 12; i++) {
      const a = heading + side * (.16 + random() * .38);
      height = 3 + random() * (i < 5 ? 26 : 10);
      item.start.set(camera.position.x + Math.cos(a) * 98, Math.max(5, camera.position.y) + height,
        camera.position.z + Math.sin(a) * 98);
      if (inView(item.start, camera)) break;
    }
    item.travel.set(forward.z * side * 25, -Math.min(height * .77, 10 + random() * 6), forward.x * -side * 25);
    item.startAt = time + delay;
    item.endAt = item.startAt + 1.55 + random() * .9;
    item.spoke = false;
  }
  return (weather, camera, emit) => {
    if (!camera) {
      for (const item of items) {
        item.mesh.visible = false;
        item.endAt = -Infinity;
      }
      return;
    }
    camera.updateMatrixWorld();
    const time = weather.time;
    if (weather.meteors) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      for (let i = 0; i < weather.meteors; i++) launch(items[i], time, i * 1.05, camera);
    }
    for (const item of items) {
      const { mesh, startAt, endAt } = item;
      mesh.visible = time >= startAt && time < endAt;
      if (!mesh.visible) continue;
      const life = (time - startAt) / (endAt - startAt);
      head.copy(item.start).addScaledVector(item.travel, life);
      tangent.copy(item.travel).normalize();
      cross.copy(camera.position).sub(head).cross(tangent).normalize();
      normal.copy(tangent).cross(cross);
      const length = (2 + smoothstep(life, 0, .28) * 13) * (1 - smoothstep(life, .60, 1) * .86);
      mesh.position.copy(head).addScaledVector(tangent, -length / 2);
      mesh.quaternion.setFromRotationMatrix(orient.makeBasis(tangent, cross, normal));
      mesh.scale.set(length, .94, 1);
      mesh.material.uniforms.strength.value = smoothstep(life, 0, .13) * (1 - smoothstep(life, .67, 1));
      if (!item.spoke && life > .12 && life < .70 && inView(head, camera) && emit) {
        item.spoke = true;
        emit("summer-meteor-sighted");
      }
    }
  };
}

export function createSummerWeatherEffects(parent) {
  const root = new THREE.Group();
  root.name = "summer-weather";
  parent.add(root);
  const random = seeded(4721);
  const updateRainbow = rainbows(root);
  const updateRain = rain(root, random);
  const updatePetals = petals(root, random);
  const updateMeteors = meteors(root, random);
  const clear = { rain: 0, wind: 0, time: 0 };
  return {
    update(weather, player, camera, emit) {
      updateRainbow(weather.rainbow ?? 0);
      updateRain(weather, player, camera);
      updatePetals(weather, player);
      updateMeteors(weather, camera, emit);
    },
    pause() {
      updateRainbow(0);
      updateRain(clear);
      updatePetals(clear);
      updateMeteors(clear);
    },
  };
}
