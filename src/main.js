import { createAudio } from "./audio.js";
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
const settings = document.querySelector("#settings");
const game = document.querySelector("#game");
const bag = document.querySelector("#bag");
const interactButton = document.querySelector("#interact");
const feedback = document.querySelector("#feedback");
const regionPanel = document.querySelector("#region-panel");
const regionStrip = regionPanel.querySelector(".region-strip");
const regionDetails = document.querySelector("#region-details");
const regionToggle = document.querySelector("#region-toggle");
const regionHide = document.querySelector("#region-hide");
const regionShow = document.querySelector("#region-show");
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

  const audio = createAudio(state.audio);
  const soundEnabled = document.querySelector("#sound-enabled");
  const soundVolume = document.querySelector("#sound-volume");
  soundEnabled.checked = state.audio.enabled;
  soundVolume.value = Math.round(state.audio.volume * 100);
  soundVolume.disabled = !state.audio.enabled;

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
  let updateCollisionDebug;
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
  let strideDistance = 0;
  let failed = false;
  const initialFeedback = feedback.textContent;

  const regions = {
    home: ["棉花糖基地", "沿浅色小路和路灯去森林。基地里也可以喂食、洗澡和整理背包。"],
    forest: ["森林探索区", "沿小路寻找材料，沿音符路牌可到月光演奏区。过木桥后，紫色拱门通往天空群岛。"],
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

  function updateInfoPanel() {
    const mode = practice ? "expanded" : state.infoPanel;
    const expanded = mode === "expanded";
    regionPanel.dataset.mode = mode;
    regionStrip.hidden = mode === "hidden" || practice;
    regionDetails.hidden = !expanded;
    regionShow.hidden = mode !== "hidden";
    regionHide.hidden = mode !== "compact";
    regionToggle.setAttribute("aria-expanded", String(expanded));
    regionToggle.setAttribute("aria-label", expanded ? "折叠游戏信息" : "展开游戏信息");
    regionToggle.firstElementChild.textContent = expanded ? "⌃" : "⌄";
  }

  function setInfoPanel(mode, focus) {
    state.infoPanel = mode;
    updateInfoPanel();
    focus?.focus({ preventScroll: true });
    save();
  }

  function setPose() {
    if (practice || !player.grounded) return;
    const { x, y, z, layer } = player;
    state.pose = { x, y, z, layer };
  }

  function paused() {
    return failed || settings.open || pianoDialog.open || bag.open || lidPhase !== "closed" || animations?.active;
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
    audio,
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
      const lit = world.lookout.toggle();
      if (lit === null) return false;
      state.reachedLookout = lit;
      if (lit) rig.face(0);
      void audio.activate().then((running) => {
        if (!running) return;
        if (lit) { audio.play("magic"); audio.play("rune", 0); audio.play("wind"); }
        else audio.play("extinguish");
      });
      tell(lit ? "符文亮起来了。" : "观景台的光正在散去。");
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
      if (actions[target.id]() === false) return;
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
    strideDistance = 0;
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
    const label = target?.id === "end" && state.reachedLookout ? "熄灭观景台" : target?.label ?? "";
    interactButton.disabled = target?.id === "end" && world.lookout.transitioning;
    if (target !== spot || interactButton.textContent !== label) {
      spot = target;
      interactButton.hidden = !spot;
      interactButton.textContent = label;
    }
  }

  const controls = createControls({
    canvas,
    joystick: document.querySelector("#joystick"),
    jumpButton: document.querySelector("#jump"),
    isPaused: paused,
    onTap: tapBowl,
    onInteract: interact,
    onJump() {
      if (jump(player)) void audio.activate().then((running) => { if (running) audio.play("jump"); });
    },
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
      let respawned = false;
      for (let step = 0; step < steps; step++) {
        const { checkpoint, fell } = movePlayer(player, vx * dt, vz * dt, dt, practice ? practiceArea : undefined);
        if (checkpoint && (state.checkpoint.x !== checkpoint.x || state.checkpoint.z !== checkpoint.z)) {
          state.checkpoint = checkpoint;
          setPose();
          save();
        }
        if (fell) {
          respawned = true;
          teleport(player.layer === "sky" ? state.checkpoint : HOME, angle);
          tell("棉花糖安全回到了最近的落脚点。");
          save();
          break;
        }
      }
      if (!respawned && player.grounded) {
        if (!grounded) {
          audio.play("land");
          strideDistance = 0;
        } else if (moving) {
          strideDistance += Math.hypot(player.x - x, player.z - z);
          if (strideDistance >= 2.55) {
            audio.play("step");
            strideDistance %= 2.55;
          }
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
    updateCollisionDebug?.(player, practice);
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
      const night = nightBlend(state.worldTime);
      if (player.layer === "ground") world.piano.update(night, time);
      if (player.layer === "sky" || world.lookout.transitioning) {
        const wasTransitioning = world.lookout.transitioning;
        world.lookout.update(runningTime, night,
          player.layer === "sky" ? (index) => audio.play("rune", index) : undefined);
        if (wasTransitioning && !world.lookout.transitioning && player.layer === "sky") {
          tell(state.reachedLookout ? "观景台点亮了。云海泛起了彩光。" : "观景台已熄灭。");
        }
      }
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
    if (new URLSearchParams(location.search).get("debug") === "collision") {
      const { createCollisionDebug } = await import("./collision-debug.js");
      updateCollisionDebug = createCollisionDebug(scene);
    }
    scene.add(avatar.root, avatar.shadow);
    animations = createBaseAnimations(avatar, world.props);
    world.sync(state);
    world.lookout.restore(state.reachedLookout);
    updateCharge = moonlight.attachCharge(avatar.root);
    teleport(state.pose, state.cameraYaw);
    updateCollisionDebug?.(player, practice);
    moonlight.update(state.worldTime, player.layer, camera);
    const night = nightBlend(state.worldTime);
    world.piano.update(night, performance.now());
    world.lookout.update(0, night);
    refreshInterface();
    worldTime.hidden = moonlightHud.hidden = false;
    renderer.render(scene, camera);
  } catch (error) {
    if (context.isContextLost()) throw error;
    console.warn("Cloudhaven loaded the practice world after scene startup failed:", error);
    scene.clear();
    scene.add(...moonlight.objects);
    world = undefined;
    updateCollisionDebug = undefined;
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
  updateInfoPanel();
  regionPanel.hidden = false;
  regionToggle.addEventListener("click", () => setInfoPanel(state.infoPanel === "expanded" ? "compact" : "expanded"));
  regionHide.addEventListener("click", () => setInfoPanel("hidden", regionShow));
  regionShow.addEventListener("click", () => setInfoPanel("compact", regionToggle));
  canvas.dataset.scene = practice ? "practice" : "world";

  for (const type of ["pointerdown", "pointerup"]) {
    game.addEventListener(type, () => { void audio.activate(); }, true);
  }
  window.addEventListener("keydown", (event) => {
    if (!event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey) void audio.activate();
  }, true);
  game.addEventListener("click", (event) => {
    if (event.target.closest("button") && !event.target.closest(".piano-note") && event.target.closest("#jump") === null) {
      void audio.activate().then((running) => { if (running) audio.play("click"); });
    }
  }, true);
  document.querySelector("#settings-toggle").addEventListener("click", () => {
    if (paused()) return;
    controls.clear();
    settings.showModal();
  });
  document.querySelector("#settings-close").addEventListener("click", () => settings.close());
  soundEnabled.addEventListener("change", () => {
    state.audio.enabled = soundEnabled.checked;
    soundVolume.disabled = !state.audio.enabled;
    audio.update();
    if (state.audio.enabled) void audio.activate().then((running) => { if (running) audio.play("click"); });
    save();
  });
  soundVolume.addEventListener("input", () => {
    state.audio.volume = Number(soundVolume.value) / 100;
    audio.update();
    dirty = true;
  });
  soundVolume.addEventListener("change", save);
  document.querySelector("#bag-toggle").addEventListener("click", openBag);
  document.querySelector("#bag-close").addEventListener("click", () => bag.close());
  document.querySelector("#chest-close").addEventListener("click", () => chest.close());
  chest.addEventListener("close", () => { lidPhase = "closing"; });
  interactButton.addEventListener("click", interact);
  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener("pagehide", () => { audio.suspend(); if (!failed) save(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      piano.interrupt();
      audio.suspend();
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
    if (settings.open) settings.close();
    audio.suspend();
    cancelAnimationFrame(frame);
    document.querySelector("#failure-title").textContent = "3D 画面暂时中断";
    document.querySelector("#failure-text").textContent = "请重新加载页面，进度会从上次保存的位置恢复。";
    failure.hidden = false;
  });
  if (initialFeedback && !practice) tell(initialFeedback);
  frame = requestAnimationFrame(tick);
}
