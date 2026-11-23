import * as THREE from "three";
import { seeded } from "./map.js";
import { nightBlend } from "./day-night.js";

function makeTexture(draw) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  draw(canvas.getContext("2d"));
  return new THREE.CanvasTexture(canvas);
}

function drawGlow(context) {
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(.26, "rgba(255,255,255,.56)");
  glow.addColorStop(.62, "rgba(255,255,255,.12)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 64, 64);
}

function drawMoon(context) {
  context.fillStyle = "white";
  context.beginPath();
  context.arc(32, 32, 25, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "destination-out";
  context.beginPath();
  context.arc(43, 23, 23, 0, Math.PI * 2);
  context.fill();
}

function sprite(parent, map, color, size) {
  const material = new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const object = new THREE.Sprite(material);
  object.scale.set(size, size, 1);
  parent.add(object);
  return object;
}

export function createMoonlight(scene) {
  const hemisphere = new THREE.HemisphereLight();
  const key = new THREE.DirectionalLight();
  const sky = new THREE.Group();
  scene.add(hemisphere, key, sky);

  const glowMap = makeTexture(drawGlow);
  const moonMap = makeTexture(drawMoon);
  const moon = sprite(sky, moonMap, 0xe3edff, 7.2);
  const moonGlow = sprite(sky, glowMap, 0x91b9ff, 16);
  moon.position.set(58, 4, -58);
  moonGlow.position.copy(moon.position);

  const random = seeded(312);
  const starPositions = [];
  for (let i = 0; i < 144; i++) {
    const angle = random() * Math.PI * 2;
    const y = random() ** 1.6 * .65 + .005;
    const radius = 81 * Math.sqrt(1 - y * y);
    starPositions.push(radius * Math.cos(angle), y * 81, radius * Math.sin(angle));
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
    map: glowMap, color: 0xdbeaff, size: .38, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }));
  sky.add(stars);

  const day = {
    ground: new THREE.Color(0xc5dfe4), sky: new THREE.Color(0xd4e2f5),
    ambient: new THREE.Color(0xfff0d5), bounce: new THREE.Color(0x92b5a5), key: new THREE.Color(0xffebc5),
    direction: new THREE.Vector3(-11, 21, 12),
  };
  const night = {
    ground: new THREE.Color(0x142545), sky: new THREE.Color(0x1c2d53),
    ambient: new THREE.Color(0xaac8ff), bounce: new THREE.Color(0x8a9bbf), key: new THREE.Color(0xb6d3ff),
    direction: new THREE.Vector3(12, 20, -18),
  };

  return {
    objects: [hemisphere, key, sky],
    update(time, layer, camera) {
      const blend = nightBlend(time);
      scene.background.copy(day[layer]).lerp(night[layer], blend);
      scene.fog.color.copy(scene.background);
      hemisphere.color.copy(day.ambient).lerp(night.ambient, blend);
      hemisphere.groundColor.copy(day.bounce).lerp(night.bounce, blend);
      hemisphere.intensity = THREE.MathUtils.lerp(1.85, 1.03, blend);
      key.color.copy(day.key).lerp(night.key, blend);
      key.intensity = THREE.MathUtils.lerp(2.15, .58, blend);
      key.position.copy(day.direction).lerp(night.direction, blend);
      sky.position.copy(camera.position);
      sky.visible = blend > 0;
      moon.material.opacity = blend;
      moonGlow.material.opacity = blend * .48;
      stars.material.opacity = blend * .9;
    },
    attachCharge(root) {
      const group = new THREE.Group();
      group.visible = false;
      root.add(group);
      const halo = sprite(group, glowMap, 0x9ecaff, 2.65);
      halo.position.y = .8;
      const marker = sprite(group, moonMap, 0xcdeaff, .34);
      marker.position.y = 1.94;
      const positions = new Float32Array(8 * 3);
      const geometry = new THREE.BufferGeometry();
      const vertices = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute("position", vertices);
      const sparks = new THREE.Points(geometry, new THREE.PointsMaterial({
        map: glowMap, color: 0xe0f3ff, size: .17, opacity: .9, transparent: true,
        depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
      }));
      sparks.frustumCulled = false;
      group.add(sparks);

      let strength = 0;
      let phase = 0;
      return (charging, elapsed) => {
        strength = THREE.MathUtils.clamp(strength + (charging ? 1 : -1) * elapsed * 3, 0, 1);
        group.visible = strength > 0;
        if (!group.visible) return;
        phase += elapsed;
        halo.material.opacity = strength * .36;
        marker.material.opacity = strength * .95;
        sparks.material.opacity = strength * .9;
        for (let i = 0; i < vertices.count; i++) {
          const rise = (phase * .48 + i / vertices.count) % 1;
          const angle = i * 2.399 + phase * .65;
          const orbit = .74 + .22 * Math.sin(i * 2.1);
          vertices.setXYZ(i, Math.cos(angle) * orbit, .24 + rise * 1.5, Math.sin(angle) * orbit);
        }
        vertices.needsUpdate = true;
      };
    },
  };
}
