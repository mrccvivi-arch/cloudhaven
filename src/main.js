import * as THREE from "three";
import { createCameraRig } from "./camera.js";
import { createControls } from "./controls.js";
import { HOME, SKY, SKY_GATE, availableSpot, regionFor } from "./map.js";
import { chinchilla } from "./models.js";
import { MOVE_SPEED, floorAt, jump, movePlayer, spawnPlayer } from "./motion.js";
import { ITEMS, loadGame, readSave, saveGame } from "./save.js";
import { createWorld } from "./world.js";

const canvas = document.querySelector("#view");
const failure = document.querySelector("#failure");
const bag = document.querySelector("#bag");
const interactButton = document.querySelector("#interact");
const feedback = document.querySelector("#feedback");
const regionName = document.querySelector("#region-name");
const destination = document.querySelector("#destination");

function start() {
  const context = canvas.getContext("webgl2", { alpha: false, antialias: true, powerPreference: "low-power" });
  if (!context) {
    failure.hidden = false;
    return;
  }

  let state;
  let storageReady = true;
  try {
    state = loadGame(localStorage);
  } catch {
    state = readSave(null);
    feedback.textContent = "存档暂时无法读取。";
  }

  const renderer = new THREE.WebGLRenderer({ canvas, context });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setClearColor(0xc5dfe4);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc5dfe4);
  scene.fog = new THREE.Fog(0xc5dfe4, 28, 86);
  scene.add(new THREE.HemisphereLight(0xfff0d5, 0x92b5a5, 1.85));
  const light = new THREE.DirectionalLight(0xffebc5, 2.15);
  light.position.set(-11, 21, 12);
  scene.add(light);
  const world = createWorld(scene);
  const avatar = chinchilla();
  scene.add(avatar.root, avatar.shadow);
  const camera = new THREE.PerspectiveCamera(49, 1, .18, 100);
  const rig = createCameraRig(camera, state.cameraYaw);
  let player = spawnPlayer(state.pose);
  let spot;
  let shownRegion;
  let frame;
  let previousTime;
  let lastSave = performance.now();
  let dirty = false;
  let stride = 0;
  let notice;
  let failed = false;
  let lastFeedback = feedback.textContent;

  const regions = {
    home: ["棉花糖基地", "沿浅色小路和路灯去森林。基地里也可以喂食、休息和整理背包。"],
    forest: ["森林探索区", "沿小路寻找材料，过木桥后，紫色拱门通往天空群岛。"],
    sky: ["天空群岛", "过桥后跳过岛间空隙，去点亮观景台。"],
  };

  function tell(text) {
    clearTimeout(notice);
    lastFeedback = feedback.textContent = text;
    notice = setTimeout(() => { feedback.textContent = ""; }, 4500);
  }

  function save() {
    state.cameraYaw = rig.getYaw();
    state.region = regionFor(state.pose);
    try {
      saveGame(localStorage, state);
      storageReady = true;
      dirty = false;
      lastSave = performance.now();
    } catch {
      dirty = false;
      if (storageReady) tell("浏览器无法保存，本次进度只在当前页面保留。");
      storageReady = false;
    }
  }

  function setPose() {
    if (!player.grounded) return;
    const { x, y, z, layer } = player;
    state.pose = { x, y, z, layer };
  }

  function openBag() {
    const inventory = document.querySelector("#inventory");
    inventory.replaceChildren();
    for (const [id, name] of Object.entries(ITEMS)) {
      const item = document.createElement("li");
      const title = document.createElement("span");
      const quantity = document.createElement("strong");
      title.textContent = name;
      quantity.textContent = "× " + state.inventory[id];
      item.append(title, quantity);
      inventory.append(item);
    }
    document.querySelector("#discovery").textContent = "发现物品 " + state.discovered.length + " / " + Object.keys(ITEMS).length;
    controls.clear();
    if (!bag.open) bag.showModal();
  }

  const actions = {
    bowl() { state.fed = Date.now(); tell("棉花糖吃了一小口提摩西草。"); },
    bath() { state.bathed = Date.now(); tell("棉花糖舒舒服服地洗了个澡。"); },
    bed() { state.rested = Date.now(); tell("棉花糖在小床上打了个盹。"); },
    chest: openBag,
    build() { tell("这是预留的建造区，未来可以在这里摆放自己搭建的物件。"); },
    gate() {
      teleport(state.checkpoint, 0);
      tell("欢迎来到天空群岛。每抵达一座岛，都会记录一个安全落脚点。");
    },
    return() { returnToForest(); },
    "return-end"() { returnToForest(); },
    end() {
      state.reachedLookout = true;
      tell("观景台点亮了。棉花糖望见了远处的云海。");
    },
  };

  function returnToForest() {
    teleport({ x: SKY_GATE.x, z: SKY_GATE.z + 3.5, layer: "ground" }, Math.PI);
    tell("回到了森林，沿小路可以走回基地。");
  }

  function interact() {
    if (!player.grounded || bag.open || failed) return;
    const target = availableSpot(player, state.collected);
    if (!target) return;
    if (target.item) {
      state.inventory[target.item]++;
      state.collected.push(target.id);
      if (!state.discovered.includes(target.item)) state.discovered.push(target.item);
      tell("捡到了「" + ITEMS[target.item] + "」。");
    } else {
      actions[target.id]();
    }
    world.sync(state);
    setPose();
    refreshInterface();
    save();
  }

  function updateAvatar(moving, dt) {
    stride += dt * 14;
    avatar.root.position.set(player.x, player.y, player.z);
    avatar.body.position.y = moving && player.grounded ? Math.abs(Math.sin(stride)) * .085 : 0;
    avatar.tail.rotation.x = .61 + (moving ? Math.sin(stride) * .12 : 0);
    const floor = floorAt(player.layer, player.x, player.z, player.y + .1).y;
    avatar.shadow.visible = Number.isFinite(floor);
    if (avatar.shadow.visible) avatar.shadow.position.set(player.x, floor + .035, player.z);
  }

  function teleport(pose, yaw) {
    player = spawnPlayer(pose);
    controls.clear();
    world.showLayer(player.layer);
    avatar.root.rotation.y = yaw;
    rig.align(yaw);
    rig.update(player, 0, true);
    updateAvatar(false, 0);
    setPose();
  }

  function refreshInterface() {
    const location = regionFor(player);
    if (shownRegion !== location) {
      shownRegion = location;
      [regionName.textContent, destination.textContent] = regions[location];
    }
    const target = player.grounded ? availableSpot(player, state.collected) : undefined;
    if (target !== spot) {
      spot = target;
      interactButton.hidden = !spot;
      interactButton.textContent = spot?.label ?? "";
    }
  }

  const controls = createControls({
    canvas,
    joystick: document.querySelector("#joystick"),
    jumpButton: document.querySelector("#jump"),
    isPaused: () => bag.open || failed,
    onInteract: interact,
    onJump() { jump(player); },
    onLook(dx, dy) { rig.look(dx, dy); dirty = true; },
    onSettle() { setPose(); if (dirty) save(); },
  });

  function resize() {
    camera.aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
    camera.fov = camera.aspect < 1 ? 60 : 51;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  }

  function tick(time) {
    const elapsed = Math.min(.08, (time - (previousTime ?? time - 16)) / 1000);
    previousTime = time;
    const [horizontal, vertical] = controls.movement();
    const moving = !bag.open && Math.hypot(horizontal, vertical) > .08;
    const angle = rig.getYaw();
    const vx = moving ? (Math.cos(angle) * horizontal + Math.sin(angle) * vertical) * MOVE_SPEED : 0;
    const vz = moving ? (-Math.sin(angle) * horizontal + Math.cos(angle) * vertical) * MOVE_SPEED : 0;
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 100)));
    const dt = elapsed / steps;

    if (!bag.open) {
      for (let step = 0; step < steps; step++) {
        const { checkpoint, fell } = movePlayer(player, vx * dt, vz * dt, dt);
        if (checkpoint && (state.checkpoint.x !== checkpoint.x || state.checkpoint.z !== checkpoint.z)) {
          state.checkpoint = checkpoint;
          setPose();
          save();
        }
        if (fell) {
          teleport(player.layer === "sky" ? state.checkpoint : HOME, angle);
          tell("棉花糖安全回到了最近的落脚点。");
          save();
          break;
        }
      }
      if (moving || !player.grounded) dirty = true;
      if (moving) {
        const heading = Math.atan2(-vx, -vz);
        const turn = heading - avatar.root.rotation.y;
        avatar.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, elapsed * 13);
      }
      setPose();
      if (dirty && time - lastSave > 2400) save();
    }

    updateAvatar(moving, elapsed);
    rig.update(player, elapsed);
    refreshInterface();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }

  document.querySelector("#bag-toggle").addEventListener("click", openBag);
  document.querySelector("#bag-close").addEventListener("click", () => bag.close());
  interactButton.addEventListener("click", interact);
  window.addEventListener("resize", resize);
  window.addEventListener("pagehide", () => { if (!failed) save(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      controls.clear();
      if (!failed && dirty) save();
      cancelAnimationFrame(frame);
      previousTime = undefined;
    } else if (!failed) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    }
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    save();
    failed = true;
    cancelAnimationFrame(frame);
    document.querySelector("#failure-title").textContent = "3D 画面暂时中断";
    document.querySelector("#failure-text").textContent = "请重新加载页面，进度会从上次保存的位置恢复。";
    failure.hidden = false;
  });
  teleport(state.pose, state.cameraYaw);
  world.sync(state);
  resize();
  if (lastFeedback) tell(lastFeedback);
  frame = requestAnimationFrame(tick);
}

document.querySelector("#retry").addEventListener("click", () => location.reload());
try {
  start();
} catch (error) {
  console.error(error);
  failure.hidden = false;
}
