import * as THREE from "three";
import { createMoonModel } from "./moon-model.js";

function makeBackdrop() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(375, 302, 20, 390, 320, 540);
  gradient.addColorStop(0, "#f2f0ee");
  gradient.addColorStop(0.52, "#dedde0");
  gradient.addColorStop(1, "#babac3");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeShadowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(48, 48, 2, 48, 48, 47);
  gradient.addColorStop(0, "#ffffffd0");
  gradient.addColorStop(0.35, "#ffffff7d");
  gradient.addColorStop(1, "#ffffff00");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

function createScene(parameters, shadowTexture) {
  const scene = new THREE.Scene();
  const model = createMoonModel(parameters);
  scene.add(model.root);
  const sky = new THREE.HemisphereLight(0xfaf8ff, 0x9e91a5, 2.05);
  const key = new THREE.DirectionalLight(0xffeedf, 1.8);
  key.position.set(-3.7, 5, 4.3);
  const rim = new THREE.DirectionalLight(0xe3e8ff, 1.74);
  rim.position.set(2.4, 3.1, -4.4);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.025;
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(2.65, 96),
    new THREE.MeshBasicMaterial({ color: 0xf6f3f0, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.04;
  base.renderOrder = -1;
  shadow.renderOrder = -1;
  scene.add(sky, key, rim, base, shadow);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 45);
  return { scene, model, camera, base, shadow };
}

const defaultYaw = 0;
const defaultPitch = 0.14;

export function createPreview(canvas, parameters, onOrbit) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const shadowTexture = makeShadowTexture();
  const editing = createScene(parameters, shadowTexture);
  const backdrop = makeBackdrop();
  const pointers = new Map();
  let comparison = [];
  let ground = true;
  let background = true;
  let auto = false;
  let yaw = defaultYaw;
  let pitch = defaultPitch;
  let zoom = 1;
  let last = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 0;
  let needsSize = true;

  function visualSettings(view) {
    view.scene.background = background ? backdrop : null;
    view.base.visible = ground;
    view.shadow.visible = ground;
    view.shadow.material.color.set(0x585463);
  }

  visualSettings(editing);
  const resize = new ResizeObserver(() => { needsSize = true; });
  resize.observe(canvas);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  function draw(dt) {
    if (needsSize) {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      pixelRatio = Math.min(devicePixelRatio || 1, 1.65, Math.sqrt(1800000 / (width * height)));
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      needsSize = false;
    }
    if (auto) yaw += dt * 0.52;
    const views = comparison.length ? comparison : [editing];
    const bounds = views.map((view) => view.model.getBounds());
    const center = bounds.map((box) => box.getCenter(new THREE.Vector3()));
    const radius = Math.max(...bounds.map((box) => {
      const size = box.getSize(new THREE.Vector3());
      return Math.max(size.x, size.z, size.y * 1.16) * 0.65;
    }));
    renderer.setScissorTest(views.length > 1);
    views.forEach((view, index) => {
      const left = Math.floor(index * width / views.length);
      const right = Math.floor((index + 1) * width / views.length);
      const aspect = (right - left) / height;
      const fov = THREE.MathUtils.degToRad(view.camera.fov / 2);
      const distance = Math.max(1.08, radius * 1.07) / (Math.tan(fov) * Math.min(aspect, 1)) / zoom;
      const target = center[index];
      view.camera.aspect = aspect;
      view.camera.position.set(
        target.x + distance * Math.sin(yaw) * Math.cos(pitch),
        target.y + distance * Math.sin(pitch),
        target.z + distance * Math.cos(yaw) * Math.cos(pitch),
      );
      view.camera.lookAt(target);
      view.camera.updateProjectionMatrix();
      view.model.update(reducedMotion.matches && !view.playing ? 0 : dt);
      const size = bounds[index].getSize(new THREE.Vector3());
      view.shadow.scale.set(size.x * 1.26, size.z * 1.5, 1);
      view.shadow.material.opacity = 0.42;
      renderer.setViewport(left, 0, right - left, height);
      renderer.setScissor(left, 0, right - left, height);
      renderer.render(view.scene, view.camera);
    });
  }

  renderer.setAnimationLoop((now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (!document.hidden) draw(dt);
  });

  function rotate(dx, dy) {
    yaw -= dx * 0.008;
    pitch = THREE.MathUtils.clamp(pitch + dy * 0.008, -1.12, 1.24);
    auto = false;
    onOrbit();
  }

  function magnify(factor) {
    zoom = THREE.MathUtils.clamp(zoom * factor, 0.57, 1.75);
  }

  const pinchDistance = () => {
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const pinch = pointers.size === 2 ? pinchDistance() : 0;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch > 0) magnify(pinchDistance() / pinch);
    if (pointers.size === 1) rotate(event.clientX - previous.x, event.clientY - previous.y);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, (event) => pointers.delete(event.pointerId));
  }
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    magnify(Math.exp(-event.deltaY * 0.0012));
  }, { passive: false });
  canvas.addEventListener("keydown", (event) => {
    const moves = { ArrowLeft: [-18, 0], ArrowRight: [18, 0], ArrowUp: [0, 18], ArrowDown: [0, -18] };
    if (Object.prototype.hasOwnProperty.call(moves, event.key)) rotate(...moves[event.key]);
    else if (event.key === "+" || event.key === "=") magnify(1.12);
    else if (event.key === "-") magnify(1 / 1.12);
    else return;
    event.preventDefault();
  });

  return {
    setParameters: editing.model.setParameters,
    setGround(value) {
      ground = value;
      [editing, ...comparison].forEach(visualSettings);
    },
    setBackground(value) {
      background = value;
      [editing, ...comparison].forEach(visualSettings);
    },
    setAuto(value) { auto = value; },
    setAngle(value) {
      yaw = { front: defaultYaw, side: Math.PI / 2, rear: Math.PI, reset: defaultYaw }[value];
      pitch = defaultPitch;
      auto = false;
      if (value === "reset") zoom = 1;
    },
    play(mode) {
      for (const view of [editing, ...comparison]) {
        view.playing = true;
        view.model.play(mode);
      }
    },
    compare(entries) {
      for (const view of comparison) {
        view.model.dispose();
        for (const mesh of [view.shadow, view.base]) {
          mesh.geometry.dispose();
          mesh.material.dispose();
        }
      }
      comparison = entries.map((entry) => createScene(entry, shadowTexture));
      comparison.forEach(visualSettings);
    },
    snapshot(callback) {
      draw(0);
      canvas.toBlob(callback, "image/png");
    },
  };
}
