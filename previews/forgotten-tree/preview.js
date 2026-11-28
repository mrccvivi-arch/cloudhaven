import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCottonCandy } from "../../src/cotton-candy.js";
import { createTreeVersions } from "./variants.js";

const descriptions = [
  "雪境原树定格，保留冰花与悬挂雪球。",
  "苍白的木质和深蓝花冠，保留完整树形。",
  "一侧露出枝条，另一侧保留疏落的蓝色花簇。",
  "黯金裂纹沿主干延伸，两截断枝静悬在枯枝附近。",
  "暖象牙色风化石质、午夜蓝花冠与哑光古金裂纹。",
];

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
  renderer.toneMappingExposure = 1.19;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111319);
  scene.fog = new THREE.FogExp2(0x111319, .008);
  const camera = new THREE.PerspectiveCamera(38, 1, .2, 270);
  const controls = new OrbitControls(camera, canvas);
  let needsRender = true;
  controls.enableDamping = true;
  controls.minDistance = 3;
  controls.maxDistance = 130;
  controls.maxPolarAngle = Math.PI * .51;
  const home = new THREE.Vector3(13, 11, 56);
  const target = new THREE.Vector3(0, 12, 0);
  function moveCamera(to, offset) {
    controls.enableDamping = false;
    controls.update();
    controls.target.copy(to);
    camera.position.copy(to).add(offset);
    controls.enableDamping = true;
    controls.update();
  }
  moveCamera(target, home);
  document.querySelector("#reset").addEventListener("click", () => moveCamera(target, home));
  document.querySelector("#detail").addEventListener("click", () => {
    moveCamera(new THREE.Vector3(-.5, 7.3, 0), new THREE.Vector3(3, 1.5, 24));
  });

  const ambient = new THREE.HemisphereLight(0xcbd7ef, 0x6d6662, 1.71);
  const side = new THREE.DirectionalLight(0xffecd5, 2.31);
  side.position.set(-35, 23, 25);
  side.castShadow = true;
  Object.assign(side.shadow.camera, { left: -31, right: 31, top: 35, bottom: -21, near: 1, far: 120 });
  side.shadow.mapSize.set(1024, 1024);
  side.shadow.bias = -.0006;
  side.shadow.normalBias = .06;
  const fill = new THREE.DirectionalLight(0x90b3ed, .60);
  fill.position.set(11, 19, -20);
  scene.add(ambient, side, fill);

  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x373a42, roughness: 1 });
  const distantGround = { value: new THREE.Vector3(.0056, .0065, .0097) };
  groundMaterial.onBeforeCompile = shader => {
    shader.uniforms.distantGround = distantGround;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 floorUV;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nfloorUV = position.xy;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 floorUV; uniform vec3 distantGround;")
      .replace("#include <opaque_fragment>", `
        float radius = length(floorUV * vec2(.78, .88));
        outgoingLight = mix(outgoingLight, distantGround, smoothstep(14., 64., radius));
        #include <opaque_fragment>
      `);
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const moon = createCottonCandy();
  moon.update(0, false, true, 0);
  moon.root.position.set(3.4, .02, 3.2);
  moon.root.rotation.y = Math.PI * .89;
  moon.root.traverse(object => { if (object.isMesh) object.castShadow = true; });
  scene.add(moon.root);

  const versions = createTreeVersions(camera);
  scene.add(...versions);
  const buttons = [...document.querySelectorAll("[data-version]")];
  const lightButtons = [...document.querySelectorAll("[data-light]")];
  const description = document.querySelector("#description");
  function showLight(mode) {
    const classic = mode === "classical";
    scene.background.setHex(classic ? 0x0b0a09 : 0x111319);
    scene.fog.color.copy(scene.background);
    ambient.color.setHex(classic ? 0xede4d6 : 0xcbd7ef);
    ambient.groundColor.setHex(classic ? 0x746451 : 0x6d6662);
    ambient.intensity = classic ? 1.40 : 1.71;
    side.color.setHex(classic ? 0xffe6c9 : 0xffecd5);
    side.intensity = classic ? 2.57 : 2.31;
    side.position.set(-35, classic ? 17 : 23, 25);
    fill.color.setHex(classic ? 0xc1c2cd : 0x90b3ed);
    fill.intensity = classic ? .72 : .60;
    groundMaterial.color.setHex(classic ? 0x423930 : 0x373a42);
    distantGround.value.set(...(classic ? [.0035, .003, .0025] : [.0056, .0065, .0097]));
    for (const button of lightButtons) button.setAttribute("aria-pressed", String(button.dataset.light === mode));
    renderer.shadowMap.needsUpdate = true;
    needsRender = true;
  }
  function show(id) {
    for (const [index, tree] of versions.entries()) {
      tree.visible = index === id;
      buttons[index].setAttribute("aria-pressed", String(index === id));
    }
    description.textContent = descriptions[id];
    renderer.shadowMap.needsUpdate = true;
    needsRender = true;
  }
  buttons.forEach((button, id) => button.addEventListener("click", () => show(id)));
  lightButtons.forEach(button => button.addEventListener("click", () => showLight(button.dataset.light)));
  show(4);
  showLight("classical");

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
