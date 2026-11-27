import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { cloudTexture } from "../../src/atmosphere.js";
import { seeded } from "../../src/map.js";
import { createWhale } from "./whale.js";
import { poseWhale, routes } from "./routes.js";
import { createSnow } from "./snow.js";

const canvas = document.querySelector("#view");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
} catch {
  document.querySelector("#error").hidden = false;
}
if (renderer) {
  renderer.toneMapping = THREE.NeutralToneMapping;
  start();
}

function makeReference(scene) {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0x304c67, roughness: .95 });
  const head = new THREE.MeshStandardMaterial({ color: 0xe8dace, roughness: .95 });
  function piece(geometry, material, x, y, tilt = 0) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, 0);
    part.rotation.z = tilt;
    group.add(part);
  }
  piece(new THREE.CapsuleGeometry(.22, .51, 4, 10), coat, 0, .96);
  piece(new THREE.SphereGeometry(.177, 12, 8), head, 0, 1.52);
  for (const side of [-1, 1]) {
    piece(new THREE.CapsuleGeometry(.085, .51, 3, 8), coat, side * .117, .35);
    piece(new THREE.CapsuleGeometry(.069, .45, 3, 8), coat, side * .246, .99, side * .22);
  }
  const ledge = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.33, .38, 24),
    new THREE.MeshStandardMaterial({ color: 0xa0b7c8, roughness: 1 }));
  ledge.position.y = -.19;
  group.add(ledge);
  group.rotation.y = -.2;
  scene.add(group);
  return group;
}

function start() {
  const random = seeded(49012);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, .12, 260);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = .27;
  controls.maxPolarAngle = Math.PI - .25;

  const ambient = new THREE.HemisphereLight(0xe2efff, 0xa2b5cb, 1.65);
  const key = new THREE.DirectionalLight(0xffeadd, 2.05);
  const rim = new THREE.DirectionalLight(0xd2e9ff, .7);
  key.position.set(-6, 9, 5);
  rim.position.set(4, 2, -6);
  scene.add(ambient, key, rim);

  const whale = createWhale(random);
  scene.add(whale.group);
  const reference = makeReference(scene);

  const clouds = new THREE.Group();
  const cloudMaterials = Array.from({ length: 3 }, (_, i) => new THREE.SpriteMaterial({
    map: cloudTexture(18 + i * 8, true), transparent: true, depthWrite: false, opacity: .58, toneMapped: false,
  }));
  for (let i = 0; i < 30; i++) {
    const cloud = new THREE.Sprite(cloudMaterials[i % cloudMaterials.length]);
    cloud.position.set((random() - .5) * 180, -7 - random() * 10, 18 - random() * 120);
    const width = 16 + random() * 34;
    cloud.scale.set(width, width * (.28 + random() * .12), 1);
    clouds.add(cloud);
  }
  scene.add(clouds);

  const snow = createSnow(scene, random, whale);
  const routePicker = document.querySelector("#route");
  const lastPosition = new THREE.Vector3();
  const movement = new THREE.Vector3();
  const routeCache = { ...routes.cruise };
  let view = "close";
  let elapsed = 0;
  let weatherTime = 0;
  let night = false;

  function samplePose(group, time) {
    poseWhale(group, routeCache, time);
  }

  function resetCamera() {
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
    const fit = Math.max(1, 1.36 / camera.aspect);
    const anchor = whale.group.position;
    controls.minDistance = view === "close" ? 10 : view === "ground" ? 18 : 16;
    controls.maxDistance = view === "close" ? 86 : 155;
    camera.fov = view === "ground" ? 46 : 40;
    camera.updateProjectionMatrix();

    if (view === "ground") {
      const distance = 8.8 + 14 * (fit - 1);
      const rise = routePicker.value === "climb" ? 2 : 0;
      controls.target.set(-1.2, 10.2 + rise - 2.6 * (fit - 1), -16);
      camera.position.set(.5, 1.48, distance);
      reference.position.set(4.1, 0, distance - 25);
    } else if (view === "far") {
      const climb = routePicker.value === "climb";
      controls.target.set(climb ? 8 : 0, climb ? 12 : 9.9, -30);
      camera.position.set(climb ? 9.5 : 2.3, 7, (climb ? 39 : 26) + 32 * (fit - 1));
      reference.position.set(4.4, .05, camera.position.z - 23);
    } else {
      controls.target.copy(anchor).add(new THREE.Vector3(.4, -.45, .2));
      camera.position.copy(anchor).add(new THREE.Vector3(-4.8, 4.5, 27 * fit));
    }
    controls.update();
  }

  function setRoute() {
    Object.assign(routeCache, routes[routePicker.value]);
    const fit = Math.max(1, 1.36 / camera.aspect);
    if (view === "ground") {
      // A narrow screen needs additional room across the flyover while the camera stays at eye height.
      routeCache.centerZ -= 10 * (fit - 1);
    }
    elapsed = 0;
    snow.reset();
    samplePose(whale.group, elapsed);
    lastPosition.copy(whale.group.position);
    resetCamera();
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = canvas;
    const previousAspect = camera.aspect;
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    // Limit fill rate on high-DPI tablets; the whole wake uses three point batches.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5, Math.sqrt(2300000 / Math.max(1, width * height))));
    renderer.setSize(width, height, false);
    if (Math.abs(camera.aspect - previousAspect) > .12) setRoute();
  }
  window.addEventListener("resize", resize);
  resize();
  setRoute();

  function setLight() {
    document.querySelector("main").classList.toggle("night", night);
    whale.light(night, snow.starTexture);
    snow.light(night);
    ambient.color.setHex(night ? 0xd7e5ff : 0xf0f6ff);
    ambient.groundColor.setHex(night ? 0x8c9fbd : 0xd5e3f3);
    ambient.intensity = night ? 1 : 1.60;
    key.color.setHex(night ? 0xf2f6ff : 0xfff9f3);
    key.intensity = night ? 1.44 : 1.76;
    rim.intensity = night ? 1.65 : 1.12;
    for (const material of cloudMaterials) material.color.setHex(night ? 0x6987ad : 0xf4edf3);
  }

  function bindOptions(attribute, activate) {
    const buttons = [...document.querySelectorAll(`[data-${attribute}]`)];
    for (const button of buttons) {
      button.addEventListener("click", () => {
        for (const option of buttons) option.setAttribute("aria-pressed", String(option === button));
        activate(button.dataset[attribute]);
      });
    }
  }
  reference.visible = false;
  setLight();
  bindOptions("light", mode => {
    night = mode === "night";
    setLight();
  });
  bindOptions("view", mode => {
    if (view === mode) return;
    view = mode;
    reference.visible = view !== "close";
    routePicker.value = view === "ground" ? "pass" : "cruise";
    document.querySelector("#mode-note").textContent = view === "close"
      ? "拖动旋转 · 滚轮或双指缩放"
      : "人形参照约 1.7 米 · 拖动旋转 · 双指或滚轮缩放";
    setRoute();
  });
  routePicker.addEventListener("change", setRoute);
  document.querySelector("#reset").addEventListener("click", resetCamera);

  let last;
  renderer.setAnimationLoop(now => {
    const step = Math.min(.075, (now - (last ?? now)) / 1000);
    elapsed += step;
    weatherTime += step;
    last = now;
    samplePose(whale.group, elapsed);
    whale.swim(elapsed);
    if (view === "close") {
      movement.subVectors(whale.group.position, lastPosition);
      camera.position.add(movement);
      controls.target.add(movement);
    }
    lastPosition.copy(whale.group.position);
    snow.update(elapsed, weatherTime, samplePose, night);
    controls.update();
    if (view === "ground" && camera.position.y < 1.15) {
      camera.position.y = 1.15;
      camera.lookAt(controls.target);
    }
    renderer.render(scene, camera);
  });
}
