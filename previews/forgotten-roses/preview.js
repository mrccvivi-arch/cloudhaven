import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createCottonCandy } from "../../src/cotton-candy.js";
import { createRoseStudies } from "./roses.js";

const descriptions = [
  "四层午夜蓝花瓣，花心紧卷，外缘向外舒展。",
  "午夜蓝薄瓷花瓣带有轻微风化，少量古金留在花缘。",
  "花冠低垂，外层花瓣缺失或向下翻卷，枝叶已干枯。",
  "18 株玫瑰同处一块石板，盛放、含苞、凋零与枯萎并存。",
  "中外层花瓣收拢成杯形，午夜蓝薄瓷间留有断续古金。",
  "花茎弯垂，残存花瓣卷向内侧，局部褪为灰蓝与旧石色。",
  "18 株玫瑰包含开花、含苞、凋零与枯茎，同场比较普通、较大与巨型三个尺度。",
  "沿用 R4 花瓣曲面，以午夜蓝、群青和灰蓝颜料层表现笔触，少量古金落在花缘与瓣面。",
  "沿用 R4 的植株布局与三种尺度，观察油画材质在整组玫瑰中的表现。",
];
const framing = id => id === 6 || id === 8 ? "large" : id === 3 ? "garden" : "specimen";

const canvas = document.querySelector("#preview");
const status = document.querySelector("#status");
try {
  start();
} catch (error) {
  status.textContent = "三维预览未能启动，请使用支持 WebGL 2 的浏览器。";
  status.hidden = false;
  console.error(error);
}

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.45));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.17;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a09);
  const camera = new THREE.PerspectiveCamera(36, 1, .035, 85);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = .54;
  controls.maxDistance = 39;
  controls.maxPolarAngle = Math.PI * .51;

  const sky = new THREE.HemisphereLight(0xe4eaff, 0x63594d, 1.28);
  const key = new THREE.DirectionalLight(0xfff5e8, 3.0);
  key.position.set(-3.8, 5.7, 4.1);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -4.6, right: 4.6, top: 4.6, bottom: -4.6, near: .2, far: 18 });
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.normalBias = .017;
  key.shadow.bias = -.00035;
  const fill = new THREE.DirectionalLight(0xcad7ff, 1.4);
  fill.position.set(4, 3.5, -3.8);
  scene.add(sky, key, fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x191614, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.27;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.fog = new THREE.FogExp2(0x0b0a09, .049);

  const stone = new THREE.MeshStandardMaterial({ color: 0xc9bba8, roughness: .96 });
  stone.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 stonePoint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nstonePoint = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 stonePoint;")
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        float drift = sin(stonePoint.x * 4.1 + stonePoint.z * 2.8)
          + .36 * sin(stonePoint.z * 6.1 - stonePoint.x * 2.);
        float band = abs(sin(stonePoint.z * 2.8 + stonePoint.x * .97 + drift * .55));
        diffuseColor.rgb *= (1. - .046 * (1. - smoothstep(0.,.27,band)) + drift * .016);
      `);
  };
  function slab(x, z) {
    const block = new THREE.Mesh(new RoundedBoxGeometry(x, .25, z, 3, .075), stone);
    block.position.y = -.125;
    block.castShadow = block.receiveShadow = true;
    return block;
  }
  const singleBase = slab(2.88, 1.89);
  const gardenBase = slab(6.32, 3.48);
  const scaleBase = slab(8.20, 5.15);
  scene.add(singleBase, gardenBase, scaleBase);

  const moon = createCottonCandy();
  moon.update(0, false, true, 0);
  moon.root.rotation.y = Math.PI * .91;
  moon.root.traverse(object => { if (object.isMesh) object.castShadow = true; });
  scene.add(moon.root);

  const studies = createRoseStudies();
  scene.add(...studies);
  const buttons = [...document.querySelectorAll("[data-version]")];
  const description = document.querySelector("#description");
  let active = 7;
  let viewMode = "portrait";
  let needsRender = true;

  function cameraView(view) {
    viewMode = view;
    const giant = framing(active) === "large";
    const garden = active === 3 || giant;
    const low = active === 2 || active === 5;
    moon.root.visible = view === "portrait" || garden;
    renderer.shadowMap.needsUpdate = true;
    let target = garden ? [0, .81, -.14] : [.57, .93, 0];
    let offset = garden ? [2.55, 4.5, 9.3] : [1.47, 1.45, 4.05];
    if (view === "heart") {
      target = garden ? [-1.26, 2.78, -1.29] : [low ? .38 : .07, low ? 1.48 : 1.74, low ? .21 : 0];
      offset = garden ? [1.1, 2.15, 2.15] : [.55, 1.38, 1.39];
      if (active === 5) {
        target = [.58, 1.20, .36];
        offset = [1.49, .96, 1.54];
      }
    }
    if (view === "side") {
      target = garden ? [0, 1.05, -.22] : [low ? .32 : .07, low ? 1.32 : 1.63, 0];
      offset = garden ? [9.7, 2.28, 3.4] : [2.29, .48, 1.12];
      if (active === 5) target = [.57, 1.14, .27];
    }
    if (giant) {
      target = view === "heart" ? [-1.38, 9.0, -1.54] : [-.08, 4.65, -.28];
      offset = view === "heart" ? [2.2, 4.4, 5.0] : view === "side" ? [17.2, 3.6, 11.0] : [5.3, 6.2, 18.2];
    }
    // Clear residual inertia before moving the inspection camera.
    controls.enableDamping = false;
    controls.update();
    controls.target.set(...target);
    camera.position.set(...offset).add(controls.target);
    controls.enableDamping = true;
    controls.update();
    needsRender = true;
  }

  function show(id) {
    const differentFraming = framing(id) !== framing(active);
    const detailChanged = id !== active && viewMode !== "portrait" && [id, active].some(value => value === 2 || value === 5);
    active = id;
    for (const [index, model] of studies.entries()) {
      model.visible = index === id;
      buttons[index].setAttribute("aria-pressed", String(index === id));
    }
    const giant = framing(active) === "large";
    const garden = active === 3 || giant;
    singleBase.visible = !garden;
    gardenBase.visible = active === 3;
    scaleBase.visible = giant;
    moon.root.position.set(giant ? 3.10 : garden ? 2.12 : 1.24, .01, giant ? 1.96 : garden ? 1.69 : .52);
    scene.fog.density = giant ? .019 : .049;
    key.position.set(-3.8, 5.7, 4.1).multiplyScalar(giant ? 2.4 : 1);
    const extent = giant ? 8.2 : 4.6;
    Object.assign(key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: giant ? 32 : 18 });
    key.shadow.camera.updateProjectionMatrix();
    description.textContent = descriptions[id];
    if (differentFraming) cameraView("portrait");
    else if (detailChanged) cameraView(viewMode);
    renderer.shadowMap.needsUpdate = true;
    needsRender = true;
  }
  buttons.forEach((button, i) => button.addEventListener("click", () => show(i)));
  document.querySelector("#reset").addEventListener("click", () => cameraView("portrait"));
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => cameraView(button.dataset.view)));
  show(7);
  cameraView("portrait");

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  controls.addEventListener("change", () => { needsRender = true; });
  renderer.setAnimationLoop(() => {
    controls.update();
    if (!needsRender) return;
    needsRender = false;
    renderer.render(scene, camera);
  });
}
