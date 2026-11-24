import { acquaintanceDays, beijingDialogueTime } from "./beijing-time.js";
import { MOON_STORAGE, canReachMoon, cloudFloat, cloudFloor } from "./cloud-house-layout.js";
import { AFFECTION_RULES, LEVELS, affectionLevel, createAffection } from "./affection.js";
import { createGinkgoInteraction } from "./ginkgo-interaction.js";
import { createCompanionBubble, renderAffection } from "./companion-ui.js";
import { createCompanionEffects } from "./companion-effects.js";
import { createFirstMeeting, FIRST_GREETING, FIRST_TOUCH, GREETING_DURATION } from "./first-meeting.js";
import { createLivingDialogue } from "./living-dialogue.js";
import { createDiary } from "./diary.js";
import { RUNE_INTERVAL } from "./lookout.js";
import { createAudio } from "./audio.js";
import { createPiano } from "./piano.js";
import { completePianoLevel } from "./piano-rules.js";
import * as THREE from "three";
import { createCameraRig } from "./camera.js";
import { createPracticeWorld, practiceHalfWidth } from "./fallback.js";
import { createControls } from "./controls.js";
import { DAILY_WORLD, HOME, SKY_GATE, availableSpot, canReadDailyWorld, hasMoonlight, regionFor, skyStartPoint } from "./map.js";
import { BODY_RADIUS, createCottonCandy } from "./cotton-candy.js";
import { createSkyGateTrigger } from "./sky-gate.js";
import { createMinimap } from "./minimap.js";
import { MOVE_SPEED, floorAt, jump, movePlayer, spawnPlayer } from "./motion.js";
import { loadGame, readSave, saveGame } from "./save.js";
import { GATHERING, MATERIALS, collectMaterial, materialCount, refreshGathering, transferMaterial } from "./materials.js";
import { CYCLE_LENGTH, DAY_LENGTH, advanceCycle, clockText, isNight, nightBlend } from "./day-night.js";
import { createMoonlight } from "./moonlight.js";

const canvas = document.querySelector("#view");
const forestGateLanding = { x: SKY_GATE.x, z: SKY_GATE.z + 3.5, layer: "ground" };
const gateGlow = document.querySelector("#gate-glow");
const failure = document.querySelector("#failure");
const chest = document.querySelector("#chest");
const pianoDialog = document.querySelector("#piano");
const settings = document.querySelector("#settings");
const newsDialog = document.querySelector("#daily-world");
const game = document.querySelector("#game");
const bag = document.querySelector("#bag");
const relationship = document.querySelector("#affection-info");
const relationshipToggle = document.querySelector("#affection-toggle");
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
  let ecology;
  const avatar = createCottonCandy();
  const affection = createAffection(state.affection);
  const companionEffects = createCompanionEffects(avatar.root);
  const ginkgoInteraction = createGinkgoInteraction();
  const companionBubble = createCompanionBubble(document.querySelector("#companion-bubble"));
  const firstMeeting = createFirstMeeting(state);
  const dailyWorld = createDiary(newsDialog, document.querySelector("#diary-preview"));
  avatar.registerAction("affection", .48, (pose, progress, weight) => {
    pose.rotation.z = Math.sin(progress * Math.PI * 2) * weight * .086;
    pose.scale.set(1 + weight * .018, 1 - weight * .045, 1 + weight * .018);
  });
  let lid = 0;
  let lidPhase = "closed";
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let practice = false;
  const updateMinimap = createMinimap(document.querySelector("#minimap"), practiceHalfWidth);
  const camera = new THREE.PerspectiveCamera(49, 1, .35, 100);
  const dialogueSight = new THREE.Vector3();
  function canSeeMoon() {
    if (!companionBubble.canSee(avatar.root, camera)) return false;
    dialogueSight.copy(avatar.root.position);
    dialogueSight.y += .9;
    dialogueSight.sub(camera.position);
    const distance = dialogueSight.length();
    ray.set(camera.position, dialogueSight.divideScalar(distance));
    return !world.occludes(ray, player.layer, distance);
  }
  const livingDialogue = createLivingDialogue({
    storage: () => localStorage,
    canSee: canSeeMoon,
    show: (line, time, source) => companionBubble.show(line, time, Math.min(5000, 3800 + line.length * 48), source),
  });
  const rig = createCameraRig(camera, state.cameraYaw, state.cameraDistance);
  let cloudTime = 0;
  let cloudOffset = 0;
  let player = spawnPlayer(state.pose);
  let spot;
  let shownRegion;
  let frame;
  let previousTime;
  let lastSave = performance.now();
  let dirty = false;
  let notice;
  let nextGatheringCheck = 0;
  let gatheredAtNight;
  let restarting = false;
  let lastPickupTap;
  let strideDistance = 0;
  let failed = false;
  let ginkgoTouchAt = -Infinity;
  let lastMovedAt = -Infinity;
  const skyGate = createSkyGateTrigger();
  let gateTransition;
  const initialFeedback = feedback.textContent;

  const regions = {
    home: ["悬浮栖息云", "跳上栖息云，点按云边的小月亮可打开储物舱。沿浅色小路可去森林。"],
    forest: ["森林探索区", "沿小路寻找材料，沿音符路牌可到月光演奏区。过木桥后，紫色拱门通往天空群岛。"],
    sky: ["天空群岛", "过桥后跳过岛间空隙，去点亮观景台。"],
  };

  function tell(text, duration = 4500) {
    clearTimeout(notice);
    feedback.textContent = text;
    notice = setTimeout(() => { feedback.textContent = ""; }, duration);
  }

  function save() {
    if (practice || restarting) return;
    state.cameraYaw = rig.getYaw();
    state.cameraDistance = rig.getDistance();
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
    return failed || gateTransition !== undefined || settings.open || newsDialog.open || pianoDialog.open || bag.open || !relationship.hidden || lidPhase !== "closed";
  }

  function showRelationship(open, restoreFocus = false) {
    if (open && paused()) return;
    relationship.hidden = !open;
    relationshipToggle.setAttribute("aria-expanded", String(open));
    if (open) {
      renderAffection(relationship, state.affection);
      controls.clear();
      livingDialogue.resetIdle();
      document.querySelector("#affection-close").focus();
    } else if (restoreFocus) {
      relationshipToggle.focus();
    }
  }

  function refreshRelationshipLevel() {
    const badge = `Lv.${affectionLevel(state.affection.affectionPoints)}`;
    relationshipToggle.querySelector("b").textContent = badge;
    relationshipToggle.setAttribute("aria-label", `我与月，${badge}`);
  }

  function relationshipContext() {
    return {
      level: affectionLevel(state.affection.affectionPoints),
      daysKnown: acquaintanceDays(state.affection.firstMetDate),
      met: state.hasMetMoon,
      lastTouchDate: state.affection.lastTouchDate,
      lastTouchAt: state.affection.lastTouchAt,
    };
  }

  function openBag() {
    showRelationship(false);
    if (paused()) return;
    const inventory = document.querySelector("#inventory");
    inventory.replaceChildren();
    for (const [id, { name, icon }] of Object.entries(MATERIALS)) {
      const item = document.createElement("li");
      const title = document.createElement("span");
      const quantity = document.createElement("strong");
      const symbol = document.createElement("span");
      symbol.setAttribute("aria-hidden", "true");
      symbol.textContent = icon + " ";
      title.append(symbol, name);
      quantity.textContent = "× " + materialCount(state, id);
      item.append(title, quantity);
      inventory.append(item);
    }
    controls.clear();
    if (!bag.open) bag.showModal();
  }

  const chestRows = Object.entries(MATERIALS).map(([id, { name }]) => {
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
        if (!chest.open || failed || !transferMaterial(state, id, storing)) return;
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
      const bagCount = materialCount(state, id);
      const chestCount = state.storedMaterials[id];
      inBag.textContent = "背包 × " + bagCount;
      inChest.textContent = "月牙储物舱 × " + chestCount;
      deposit.disabled = bagCount === 0 || chestCount === Number.MAX_SAFE_INTEGER;
      withdraw.disabled = chestCount === 0 || bagCount === Number.MAX_SAFE_INTEGER;
    }
  }

  function updateLid(dt) {
    if (lidPhase !== "opening" && lidPhase !== "closing") return;
    const opening = lidPhase === "opening";
    lid = THREE.MathUtils.clamp(lid + (opening ? dt : -dt) / .42, 0, 1);
    world.habitat.setOpen(lid);
    if (opening && lid === 1) {
      lidPhase = "open";
      refreshChest();
      chest.showModal();
    } else if (!opening && lid === 0) {
      lidPhase = "closed";
    }
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
      rig.update(player, 0, true, world?.habitat.cloud);
    },
  });

  const actions = {
    "daily-world"() {
      controls.clear();
      dailyWorld.open();
      world.diaryHeart.dismissHint(performance.now());
    },
    piano() {
      controls.clear();
      piano.open();
      game.classList.add("piano-active");
    },
    chest() { controls.clear(); lidPhase = "opening"; },
    end() {
      const lit = world.lookout.toggle();
      if (lit === null) return false;
      state.reachedLookout = lit;
      if (lit) rig.face(0);
      void audio.playLookout(lit, RUNE_INTERVAL);
      tell(lit ? "符文亮起来了。" : "观景台的光正在散去。");
    },
  };

  function enterGate() {
    const returning = player.layer === "sky";
    gateTransition = { elapsed: 0, arrived: false, returning };
    if (returning) audio.stopLookout();
    controls.clear({ freshMovement: true });
    clearTimeout(notice);
    feedback.textContent = "";
    audio.play("teleport");
  }

  function updateGateTransition(dt) {
    if (!gateTransition) return;
    gateTransition.elapsed += dt;
    const progress = Math.min(1, gateTransition.elapsed / .5);
    if (!gateTransition.arrived && progress >= .5) {
      gateTransition.arrived = true;
      if (gateTransition.returning) {
        teleport(forestGateLanding, Math.PI);
      } else {
        state.checkpoint = skyStartPoint;
        teleport(skyStartPoint, 0);
      }
      save();
    }
    gateGlow.style.opacity = Math.sin(progress * Math.PI);
    if (progress === 1) {
      gateGlow.style.opacity = 0;
      gateTransition = undefined;
    }
  }

  function interact() {
    activate(availableSpot(player));
  }

  function tapScene(x, y) {
    if (practice || paused()) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(2 * (x - rect.left) / rect.width - 1, 1 - 2 * (y - rect.top) / rect.height);
    ray.setFromCamera(pointer, camera);
    if (player.layer === "ground" && player.grounded) {
      const now = Date.now();
      const hit = world.materials.pick(ray, player, state, now);
      if (hit && !world.occludes(ray, "ground", hit.distance)) {
        if (collectMaterial(state, hit.slot.key, player, now)) {
          lastPickupTap = { x, y, at: performance.now() };
          world.materials.sync(state, now);
          setPose();
          save();
          if (storageReady) tell(MATERIALS[hit.slot.id].name + " +1", 1800);
          void audio.activate().then((running) => { if (running) audio.play("pickup"); });
        }
        return;
      }
    }
    if (lastPickupTap && performance.now() - lastPickupTap.at < GATHERING.repeatTapMs &&
        Math.hypot(x - lastPickupTap.x, y - lastPickupTap.y) < GATHERING.repeatTapRadius) return;
    const hit = ray.intersectObjects(avatar.touchMeshes, false)[0];
    const nearChest = player.grounded && canReachMoon(player);
    const chestHit = nearChest ? ray.intersectObject(world.habitat.chest, true)[0] : undefined;
    if (player.grounded && canReadDailyWorld(player)) {
      const heart = world.diaryHeart;
      const boardHit = heart.hit(ray);
      if (boardHit && boardHit.distance < (hit?.distance ?? Infinity) &&
          boardHit.distance < (chestHit?.distance ?? Infinity) &&
          !world.occludes(ray, player.layer, boardHit.distance, heart.board)) {
        heart.press(performance.now());
        return;
      }
    }
    if (chestHit && (!hit || chestHit.distance < hit.distance) &&
        !world.occludes(ray, player.layer, chestHit.distance, world.habitat.chest)) {
      activate(MOON_STORAGE);
      return;
    }
    if (!hit || world.occludes(ray, player.layer, hit.distance)) return;
    const now = performance.now();
    if (companionBubble.isActive(now, "first-touch")) return;
    ginkgoInteraction.update(player);
    if (ginkgoInteraction.inside) {
      if (now - ginkgoTouchAt >= AFFECTION_RULES.touchCooldown) {
        ginkgoTouchAt = now;
        hideIntroduction();
        livingDialogue.resetIdle();
        const text = ginkgoInteraction.touch(livingDialogue.ginkgoTouch);
        if (text) companionBubble.show(text, now, undefined, "ginkgo");
      }
      return;
    }
    const firstTouch = !state.hasMetMoon;
    const night = isNight(state.worldTime);
    const context = { ...relationshipContext(), scene: regionFor(player), night, moving: now - lastMovedAt < 2500 };
    const date = new Date(Date.now());
    const result = affection.touch({
      night, energy: state.moonlightEnergy, now: date, context,
      pick: livingDialogue.pickTouch, prioritize: livingDialogue.freshTouch, isLast: livingDialogue.isLast,
      pending: firstTouch ? undefined : livingDialogue.pendingTouch,
      extra: firstTouch ? undefined : (level) => livingDialogue.ordinaryTouch(level, {
        ...context, features: player.layer === "ground" ? ecology.features(player) : {},
      }),
    });
    if (!result) return;
    const metNow = firstTouch && !result.blocked && firstMeeting.meet();
    if (metNow) state.affection.firstMetDate ??= beijingDialogueTime(date).date;
    const text = metNow && !result.upgraded ? FIRST_TOUCH : result.text;
    if (text) {
      companionBubble.show(text, now, Math.min(5100, 3600 + text.length * 55), metNow ? "first-touch" : "touch");
      livingDialogue.rememberTouch(text);
    }
    if (!result.blocked) {
      avatar.playAction(metNow ? "first-touch" : "affection");
      if (metNow) companionEffects.playFirst(now);
      else companionEffects.play(result.level, now);
      void audio.activate().then((running) => { if (running) audio.play("affection"); });
    }
    if (result.upgraded) {
      refreshRelationshipLevel();
      tell(`Lv.${result.level} · ${LEVELS[result.level - 1].name}`);
    }
    setPose();
    save();
  }

  function activate(target) {
    if (practice || !player.grounded || paused()) return;
    if (!target) return;
    if (actions[target.id]() === false) return;
    setPose();
    refreshInterface();
    save();
  }

  function updateAvatar(moving, dt) {
    avatar.root.position.set(player.x, player.y, player.z);
    avatar.update(dt, moving, player.grounded, player.vy);
    const floor = practice ? 0 : floorAt(player.layer, player.x, player.z, player.y + .1, cloudOffset).y;
    avatar.shadow.visible = Number.isFinite(floor);
    if (avatar.shadow.visible) avatar.shadow.position.set(player.x, floor + .035, player.z);
  }

  function teleport(pose, yaw) {
    player = spawnPlayer(pose, cloudOffset);
    hideIntroduction();
    companionBubble.dismiss("ambient");
    companionBubble.dismiss("ginkgo");
    companionBubble.dismiss("touch");
    companionBubble.dismiss("first-touch");
    livingDialogue.resetIdle();
    if (!practice && player.layer === "sky") livingDialogue.recordSkyVisit();
    strideDistance = 0;
    controls.clear();
    world?.showLayer(player.layer);
    avatar.root.rotation.y = yaw;
    rig.face(yaw);
    rig.align(yaw);
    rig.update(player, 0, true, world?.habitat.cloud);
    avatar.reset();
    updateAvatar(false, 0);
    setPose();
  }

  function hideIntroduction() {
    firstMeeting.hide();
    companionBubble.dismiss("introduction");
    companionEffects.introduction();
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
    const target = player.grounded && !paused() ? availableSpot(player) : undefined;
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
    onTap: tapScene,
    onInteract: interact,
    onJump() {
      if (jump(player)) void audio.activate().then((running) => { if (running) audio.play("jump"); });
    },
    onZoom(amount) {
      livingDialogue.resetIdle();
      if (rig.zoom(amount)) {
        dirty = true;
        if (performance.now() - lastSave > 400) save();
      }
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

  function updateGathering(time) {
    const night = isNight(state.worldTime);
    const phaseChanged = night !== gatheredAtNight;
    if (!phaseChanged && time < nextGatheringCheck) return;
    nextGatheringCheck = time + GATHERING.checkMs;
    const now = Date.now();
    const expired = refreshGathering(state, now);
    if (phaseChanged || expired) world.materials.sync(state, now);
    if (expired) save();
    gatheredAtNight = night;
  }

  function tick(time) {
    if (document.hidden || failed) return;
    const runningTime = Math.max(0, (time - (previousTime ?? time)) / 1000);
    const elapsed = Math.min(.08, runningTime);
    previousTime = time;
    updateGateTransition(elapsed);
    if (!practice && player.layer === "ground") {
      const prior = cloudOffset;
      cloudTime += runningTime;
      cloudOffset = cloudFloat(cloudTime);
      if (paused() && player.grounded) {
        const surface = cloudFloor(player.x, player.z, prior);
        if (Math.abs(player.y - surface) < .025) player.y += cloudOffset - prior;
      }
    }
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
        const before = !practice
          ? { ...player, y: player.y + BODY_RADIUS }
          : undefined;
        const { checkpoint, fell } = movePlayer(player, vx * dt, vz * dt, dt, practice ? practiceArea : undefined, cloudOffset);
        if (before && skyGate.crossed(before, { ...player, y: player.y + BODY_RADIUS }, time)) {
          enterGate();
          break;
        }
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
      if (!gateTransition && !respawned && player.grounded) {
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
        state.gathering.cycle += Math.floor((state.worldTime + runningTime) / CYCLE_LENGTH);
        advanceCycle(state, runningTime, active, exposed);
        dirty = true;
      }
      if (moving && !gateTransition) {
        const heading = Math.atan2(-vx, -vz);
        const turn = heading - avatar.root.rotation.y;
        avatar.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, elapsed * 13);
      }
      setPose();
      if (dirty && time - lastSave > 2400) save();
    }

    updateAvatar(moving && !gateTransition, elapsed);
    updateCollisionDebug?.(player, practice);
    updateLid(elapsed);
    const closeUp = lidPhase !== "closed" ? world.habitat.chest.position : undefined;
    avatar.root.visible = !pianoDialog.open;
    if (pianoDialog.open) {
      avatar.shadow.visible = false;
      world.piano.frame(camera);
    } else {
      rig.update(player, elapsed, false, world?.habitat.cloud, closeUp);
    }

    if (!practice) {
      updateGathering(time);
      const charging = exposed && isNight(state.worldTime) && state.moonlightEnergy < 100;
      updateCharge(charging, elapsed);
      moonlight.update(state.worldTime, player.layer, camera, runningTime);
      const night = nightBlend(state.worldTime);
      world.updateGateMist(player.layer, time);
      const nearDiary = canReadDailyWorld(player);
      if (world.diaryHeart.update(time, elapsed, nearDiary, nearDiary && player.grounded && !paused())) {
        activate(DAILY_WORLD);
      }
      if (player.layer === "ground") {
        dailyWorld.poll(time);
        world.updateDiaryStar(dailyWorld.unread, time);
        world.updateForestPalette(night);
        world.materials.update(time);
        world.piano.update(night, time);
        world.habitat.update(night, cloudOffset);
        world.ginkgo.update(player, camera, elapsed, night);
      }
      if (player.layer === "sky" || world.lookout.transitioning) {
        const wasTransitioning = world.lookout.transitioning;
        world.lookout.update(runningTime, night);
        if (wasTransitioning && !world.lookout.transitioning && player.layer === "sky") {
          tell(state.reachedLookout ? "观景台点亮了。云海泛起了彩光。" : "观景台已熄灭。");
        }
      }
    }
    companionEffects.update(time);
    if (!practice) {
      const scenePaused = paused();
      ginkgoInteraction.update(player);
      const sceneInteraction = scenePaused || Boolean(feedback.textContent) || world.lookout.transitioning;
      if (ginkgoInteraction.inside) {
        companionBubble.dismiss("ambient");
        companionBubble.dismiss("touch");
        if (!sceneInteraction) livingDialogue.welcomeGinkgo(time,
          () => ginkgoInteraction.welcome(companionBubble.isActive(time) || !canSeeMoon()));
      } else {
        companionBubble.dismiss("ginkgo");
      }
      if (sceneInteraction) {
        companionBubble.dismiss("ambient");
        companionBubble.dismiss("ginkgo");
      }
      if (player.layer === "sky") livingDialogue.recordSkyVisit();
      if (moving) lastMovedAt = time;
      const interacting = sceneInteraction || (controls.interacting && !moving) || !player.grounded;
      // Returning near the starting area can show the invitation again until Moon is touched.
      const nearHome = !state.hasMetMoon && player.layer === "ground" &&
        Math.hypot(player.x - HOME.x, player.z - HOME.z) < 14;
      if (!state.hasMetMoon) {
        const showing = companionBubble.isActive(time, "introduction");
        const started = firstMeeting.update(time, {
          nearby: nearHome,
          idle: !controls.interacting && !moving && player.grounded,
          available: !sceneInteraction && !ginkgoInteraction.inside && (showing || !companionBubble.isActive(time)),
          canSee: canSeeMoon,
        });
        if (started) companionBubble.show(FIRST_GREETING, time, GREETING_DURATION, "introduction");
        const introduction = firstMeeting.elapsed(time);
        if (introduction === undefined) companionBubble.dismiss("introduction");
        companionEffects.introduction(introduction);
      }
      const sceneName = regionFor(player);
      const night = isNight(state.worldTime);
      ecology.update(player, elapsed, night, livingDialogue.forestDay);
      livingDialogue.update(time, {
        blocked: interacting || companionBubble.isActive(time) || firstMeeting.hasPriority(nearHome),
        idle: !interacting && !moving,
        interrupted: sceneInteraction,
        moving: moving || time - lastMovedAt < 2500, profile: () => ({ ...relationshipContext(), openSky: !moving && hasMoonlight(player) }),
        night, scene: sceneName, ginkgo: ginkgoInteraction.inside,
        features: () => player.layer === "ground" ? ecology.features(player) : {},
      });
    }
    companionBubble.update(avatar.root, camera, time, practice || paused());
    refreshInterface();
    updateMinimap(avatar.root.position, avatar.root.rotation.y, practice ? "practice" : player.layer);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }

  resize();

  try {
    const { createWorld } = await import("./world.js");
    world = createWorld(scene);
    const { createForestEcology } = await import("./forest-ecology.js");
    const reducedEcology = matchMedia("(pointer: coarse)").matches ||
      matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
    ecology = createForestEcology(world.ground, livingDialogue.seed, reducedEcology);
    if (new URLSearchParams(location.search).get("debug") === "collision") {
      const { createCollisionDebug } = await import("./collision-debug.js");
      updateCollisionDebug = createCollisionDebug(scene);
    }
    scene.add(avatar.root, avatar.shadow);
    updateGathering(performance.now());
    world.lookout.restore(state.reachedLookout);
    updateCharge = moonlight.attachCharge(avatar.root);
    teleport(state.pose, state.cameraYaw);
    updateCollisionDebug?.(player, practice);
    moonlight.update(state.worldTime, player.layer, camera);
    const night = nightBlend(state.worldTime);
    world.updateForestPalette(night);
    world.piano.update(night, performance.now());
    world.habitat.update(night, cloudOffset);
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
  refreshRelationshipLevel();

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
  relationshipToggle.addEventListener("click", () => showRelationship(relationship.hidden, !relationship.hidden));
  document.querySelector("#affection-close").addEventListener("click", () => showRelationship(false, true));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !relationship.hidden) showRelationship(false, true);
  });
  document.querySelector("#settings-toggle").addEventListener("click", () => {
    showRelationship(false);
    if (paused()) return;
    controls.clear();
    settings.showModal();
  });
  document.querySelector("#settings-close").addEventListener("click", () => settings.close());
  document.querySelector("#restart-game").addEventListener("click", () => {
    if (!window.confirm("重新开始会清除当前游戏进度，包括材料。确定继续？")) return;
    try {
      const fresh = readSave(null);
      fresh.audio = state.audio;
      fresh.music = state.music;
      saveGame(localStorage, fresh);
      restarting = true;
      location.reload();
    } catch {
      settings.close();
      tell("无法重置存档，请检查浏览器的存储设置。");
    }
  });
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
  window.addEventListener("pageshow", (event) => { if (event.persisted && !failed) audio.resume(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      world?.diaryHeart.cancel();
      companionBubble.dismiss("ambient");
      hideIntroduction();
      livingDialogue.resetIdle();
      piano.interrupt();
      audio.suspend();
      controls.clear();
      if (!failed && dirty) save();
      cancelAnimationFrame(frame);
      previousTime = undefined;
    } else if (!failed) {
      audio.resume();
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
