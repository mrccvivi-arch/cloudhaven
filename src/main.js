import { createPiano } from "./piano.js";
import { completePianoLevel } from "./piano-rules.js";
import * as THREE from "three";
import { createCameraRig } from "./camera.js";
import { createPracticeWorld, practiceHalfWidth } from "./fallback.js";
import { createControls } from "./controls.js";
import { HOME, POIS, SKY_GATE, availableSpot, hasMoonlight, regionFor } from "./map.js";
import { createBaseAnimations } from "./interactions.js";
import { createCottonCandy } from "./cotton-candy.js";
import { createMinimap } from "./minimap.js";
import { MOVE_SPEED, floorAt, jump, movePlayer, spawnPlayer } from "./motion.js";
import { ITEMS, loadGame, readSave, saveGame, transferItem } from "./save.js";
import { DAY_LENGTH, advanceCycle, clockText, isNight, nightBlend } from "./day-night.js";
import { createMoonlight } from "./moonlight.js";

const canvas = document.querySelector("#view");
const failure = document.querySelector("#failure");
const chest = document.querySelector("#chest");
const bowlSpot = POIS.find(({ id }) => id === "bowl");
const pianoDialog = document.querySelector("#piano");
const game = document.querySelector("#game");
const bag = document.querySelector("#bag");
const interactButton = document.querySelector("#interact");
const feedback = document.querySelector("#feedback");
const regionName = document.querySelector("#region-name");
const destination = document.querySelector("#destination");
const worldTime = document.querySelector("#world-time");
const worldPhaseIcon = document.querySelector("#world-phase-icon");
const moonlightHud = document.querySelector("#moonlight-hud");
const worldClock = document.querySelector("#world-clock");
const worldPhase = document.querySelector("#world-phase");
const energyBar = document.querySelector("#moonlight-energy");
const energyPercent = document.querySelector("#moonlight-percent");

export async function start() {
  const context = canvas.getContext("webgl2", { alpha: false, antialias: false });
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
  const moonlight = createMoonlight(scene);
  let updateCharge;
  let world;
  const avatar = createCottonCandy();
  let animations;
  let lid = 0;
  let lidPhase = "closed";
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let practice = false;
  const updateMinimap = createMinimap(document.querySelector("#minimap"), practiceHalfWidth);
  const camera = new THREE.PerspectiveCamera(49, 1, .35, 100);
  const rig = createCameraRig(camera, state.cameraYaw);
  let player = spawnPlayer(state.pose);
  let spot;
  let shownRegion;
  let frame;
  let previousTime;
  let lastSave = performance.now();
  let dirty = false;
  let notice;
  let failed = false;
  const initialFeedback = feedback.textContent;

  const regions = {
    home: ["棉花糖基地", "沿浅色小路和路灯去森林。基地里也可以喂食、洗澡和整理背包。"],
    forest: ["森林探索区", "沿小路寻找材料，岔路旁可以演奏水晶琴。过木桥后，紫色拱门通往天空群岛。"],
    sky: ["天空群岛", "过桥后跳过岛间空隙，去点亮观景台。"],
  };

  function tell(text) {
    clearTimeout(notice);
    feedback.textContent = text;
    notice = setTimeout(() => { feedback.textContent = ""; }, 4500);
  }

  function save() {
    if (practice) return;
    state.cameraYaw = rig.getYaw();
    state.region = regionFor(state.pose);
    lastSave = performance.now();
    try {
      saveGame(localStorage, state);
      storageReady = true;
      dirty = false;
    } catch {
      dirty = false;
      if (storageReady) tell("浏览器无法保存，本次进度只在当前页面保留。");
      storageReady = false;
    }
  }

  function setPose() {
    if (practice || !player.grounded) return;
    const { x, y, z, layer } = player;
    state.pose = { x, y, z, layer };
  }

  function paused() {
    return failed || pianoDialog.open || bag.open || lidPhase !== "closed" || animations?.active;
  }

  function openBag() {
    if (paused()) return;
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

  const chestRows = Object.entries(ITEMS).map(([id, name]) => {
    const row = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = name;
    const counts = document.createElement("div");
    counts.className = "chest-counts";
    const inBag = document.createElement("span");
    const inChest = document.createElement("span");
    counts.append(inBag, inChest);
    const buttons = document.createElement("div");
    buttons.className = "chest-actions";
    const deposit = document.createElement("button");
    const withdraw = document.createElement("button");
    deposit.type = withdraw.type = "button";
    deposit.textContent = "存入 1 个";
    withdraw.textContent = "取回 1 个";
    deposit.setAttribute("aria-label", "存入 1 个" + name);
    withdraw.setAttribute("aria-label", "取回 1 个" + name);
    for (const [button, storing] of [[deposit, true], [withdraw, false]]) {
      button.addEventListener("click", () => {
        if (!chest.open || failed || !transferItem(state, id, storing)) return;
        refreshChest();
        save();
      });
    }
    buttons.append(deposit, withdraw);
    row.append(title, counts, buttons);
    document.querySelector("#chest-items").append(row);
    return { id, inBag, inChest, deposit, withdraw };
  });

  function refreshChest() {
    for (const { id, inBag, inChest, deposit, withdraw } of chestRows) {
      const bagCount = state.inventory[id];
      const chestCount = state.chest[id];
      inBag.textContent = "背包 × " + bagCount;
      inChest.textContent = "储物箱 × " + chestCount;
      deposit.disabled = bagCount === 0 || chestCount === Number.MAX_SAFE_INTEGER;
      withdraw.disabled = chestCount === 0 || bagCount === Number.MAX_SAFE_INTEGER;
    }
  }

  function updateLid(dt) {
    if (lidPhase !== "opening" && lidPhase !== "closing") return;
    const opening = lidPhase === "opening";
    lid = THREE.MathUtils.clamp(lid + (opening ? dt : -dt) / .42, 0, 1);
    world.props.hinge.rotation.x = -1.78 * THREE.MathUtils.smoothstep(lid, 0, 1);
    if (opening && lid === 1) {
      lidPhase = "open";
      refreshChest();
      chest.showModal();
    } else if (!opening && lid === 0) {
      lidPhase = "closed";
    }
  }

  function animate(id) {
    if (animations.start(id, player, rig.getYaw())) controls.clear();
  }

  const piano = createPiano(pianoDialog, {
    progress: state.piano,
    onNote(index) { world?.piano.flash(index); },
    onClear() { world?.piano.clear(); },
    onComplete(level, fullRun) {
      const reward = completePianoLevel(state, level, fullRun);
      save();
      return reward;
    },
    onClose() {
      game.classList.remove("piano-active");
      controls.clear();
      rig.update(player, 0, true);
    },
  });

  const actions = {
    piano() {
      controls.clear();
      piano.open();
      game.classList.add("piano-active");
    },
    bowl() { animate("bowl"); },
    bath() { animate("bath"); },
    chest() { controls.clear(); lidPhase = "opening"; },
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
    activate(availableSpot(player, state.collected));
  }

  function tapBowl(x, y) {
    if (practice || paused() || player.layer !== bowlSpot.layer || !player.grounded ||
      Math.hypot(player.x - bowlSpot.x, player.z - bowlSpot.z) >= (bowlSpot.range ?? 2.6)) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(2 * (x - rect.left) / rect.width - 1, 1 - 2 * (y - rect.top) / rect.height);
    ray.setFromCamera(pointer, camera);
    if (ray.intersectObject(world.props.bowl, true).length) activate(bowlSpot);
  }

  function activate(target) {
    if (practice || !player.grounded || paused()) return;
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
    avatar.root.position.set(player.x, player.y, player.z);
    avatar.update(dt, moving, player.grounded, player.vy);
    const floor = practice ? 0 : floorAt(player.layer, player.x, player.z, player.y + .1).y;
    avatar.shadow.visible = Number.isFinite(floor);
    if (avatar.shadow.visible) avatar.shadow.position.set(player.x, floor + .035, player.z);
  }

  function teleport(pose, yaw) {
    player = spawnPlayer(pose);
    controls.clear();
    world?.showLayer(player.layer);
    avatar.root.rotation.y = yaw;
    rig.align(yaw);
    rig.update(player, 0, true);
    avatar.reset();
    updateAvatar(false, 0);
    setPose();
  }

  function refreshInterface() {
    if (practice) return;
    const clock = clockText(state.worldTime);
    const night = isNight(state.worldTime);
    const phase = night ? "夜晚" : "白天";
    const energy = Math.round(state.moonlightEnergy);
    if (worldClock.textContent !== clock) worldClock.textContent = clock;
    if (worldPhase.textContent !== phase) {
      worldPhase.textContent = phase;
      worldPhaseIcon.textContent = night ? "☾" : "☀";
      worldTime.dataset.phase = night ? "night" : "day";
    }
    if (energyBar.value !== energy) {
      energyBar.value = energy;
      energyPercent.textContent = energy + "%";
    }
    const location = regionFor(player);
    if (shownRegion !== location) {
      shownRegion = location;
      [regionName.textContent, destination.textContent] = regions[location];
    }
    const target = player.grounded && !paused() ? availableSpot(player, state.collected) : undefined;
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
    isPaused: paused,
    onTap: tapBowl,
    onInteract: interact,
    onJump() { jump(player); },
    onLook(dx, dy) { rig.look(dx, dy); dirty = true; },
    onSettle() { setPose(); if (dirty) save(); },
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    camera.aspect = width / height;
    camera.fov = camera.aspect < 1 ? 60 : 51;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const practiceArea = { x: HOME.x, z: HOME.z, halfWidth: practiceHalfWidth };

  function tick(time) {
    if (document.hidden || failed) return;
    const runningTime = Math.max(0, (time - (previousTime ?? time)) / 1000);
    const elapsed = Math.min(.08, runningTime);
    previousTime = time;
    const [horizontal, vertical] = controls.movement();
    const moving = !paused() && Math.hypot(horizontal, vertical) > .08;
    const angle = rig.getYaw();
    const vx = moving ? (Math.cos(angle) * horizontal + Math.sin(angle) * vertical) * MOVE_SPEED : 0;
    const vz = moving ? (-Math.sin(angle) * horizontal + Math.cos(angle) * vertical) * MOVE_SPEED : 0;
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 100)));
    const dt = elapsed / steps;
    let exposed = false;

    if (!paused() && elapsed > 0) {
      const { x, z, grounded } = player;
      for (let step = 0; step < steps; step++) {
        const { checkpoint, fell } = movePlayer(player, vx * dt, vz * dt, dt, practice ? practiceArea : undefined);
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
      if (!practice) {
        const active = player.x !== x || player.z !== z || !grounded || !player.grounded;
        const reachesNight = state.worldTime + runningTime >= DAY_LENGTH;
        exposed = reachesNight && hasMoonlight(player);
        advanceCycle(state, runningTime, active, exposed);
        dirty = true;
      }
      if (moving) {
        const heading = Math.atan2(-vx, -vz);
        const turn = heading - avatar.root.rotation.y;
        avatar.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, elapsed * 13);
      }
      setPose();
      if (dirty && time - lastSave > 2400) save();
    }

    updateAvatar(moving, elapsed);
    updateLid(elapsed);
    const completed = animations?.update(elapsed, player);
    if (completed) {
      const fed = completed === "bowl";
      state[fed ? "fed" : "bathed"] = Date.now();
      tell(fed ? "棉花糖吃了一小口提摩西草。" : "棉花糖舒舒服服地洗了个澡。");
      setPose();
      save();
    }
    const viewTarget = animations?.active ? animations.cameraTarget :
      lidPhase !== "closed" ? world.props.chest.position : player;
    avatar.root.visible = !pianoDialog.open;
    if (pianoDialog.open) {
      avatar.shadow.visible = false;
      world.piano.frame(camera);
    } else {
      rig.update(viewTarget, elapsed, false, animations?.cameraYaw);
    }

    if (!practice) {
      const charging = exposed && isNight(state.worldTime) && state.moonlightEnergy < 100;
      updateCharge(charging, elapsed);
      moonlight.update(state.worldTime, player.layer, camera);
      if (player.layer === "ground") world.piano.update(nightBlend(state.worldTime), time);
    }
    refreshInterface();
    updateMinimap(avatar.root.position, avatar.root.rotation.y, practice ? "practice" : player.layer);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }

  resize();

  try {
    const { createWorld } = await import("./world.js");
    world = createWorld(scene);
    scene.add(avatar.root, avatar.shadow);
    animations = createBaseAnimations(avatar, world.props);
    world.sync(state);
    updateCharge = moonlight.attachCharge(avatar.root);
    teleport(state.pose, state.cameraYaw);
    moonlight.update(state.worldTime, player.layer, camera);
    world.piano.update(nightBlend(state.worldTime), performance.now());
    refreshInterface();
    worldTime.hidden = moonlightHud.hidden = false;
    renderer.render(scene, camera);
  } catch (error) {
    if (context.isContextLost()) throw error;
    console.warn("Cloudhaven loaded the practice world after scene startup failed:", error);
    scene.clear();
    scene.add(...moonlight.objects);
    world = undefined;
    animations = undefined;
    practice = true;
    createPracticeWorld(scene);
    scene.add(avatar.root, avatar.shadow);
    teleport(HOME, -.62);
    worldTime.hidden = moonlightHud.hidden = true;
    moonlight.update(DAY_LENGTH / 4, "ground", camera);
    renderer.render(scene, camera);
    regionName.textContent = "练习草地";
    destination.textContent = "主场景暂时无法加载。你仍可移动、转动镜头和跳跃。";
    interactButton.hidden = true;
  }
  canvas.dataset.scene = practice ? "practice" : "world";

  document.querySelector("#bag-toggle").addEventListener("click", openBag);
  document.querySelector("#bag-close").addEventListener("click", () => bag.close());
  document.querySelector("#chest-close").addEventListener("click", () => chest.close());
  chest.addEventListener("close", () => { lidPhase = "closing"; });
  interactButton.addEventListener("click", interact);
  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener("pagehide", () => { if (!failed) save(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      piano.interrupt();
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
    piano.close();
    cancelAnimationFrame(frame);
    document.querySelector("#failure-title").textContent = "3D 画面暂时中断";
    document.querySelector("#failure-text").textContent = "请重新加载页面，进度会从上次保存的位置恢复。";
    failure.hidden = false;
  });
  if (initialFeedback && !practice) tell(initialFeedback);
  frame = requestAnimationFrame(tick);
}
