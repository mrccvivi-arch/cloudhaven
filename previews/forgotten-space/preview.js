import * as THREE from "three";
import { createControls } from "../../src/controls.js";
import { createCottonCandy } from "../../src/cotton-candy.js";
import { jump, MOVE_SPEED } from "../../src/motion.js";
import { createCompanionBubble } from "../../src/companion-ui.js";
import { s1 } from "./layout.js";
import { s2 } from "./loop-layout.js";
import { getGrowthAssets } from "./plantings.js";
import { createForgottenWorld, forgottenView } from "./world-content.js";
import { createDepartedLife } from "./departed-life.js";
import { createPlantLife } from "./plant-life.js";
import { createHumanDialogue, humanLines, humanTiming } from "./human-dialogue.js";
import { bindHumanMusic, humanTrackUrl } from "./human-music.js";
import { createFinalArt, finalLight } from "./final-art.js";

const canvas = document.querySelector("#preview");
const status = document.querySelector("#status");
const versions = [
  { layout: s1, name: "立体空间初稿", orbit: { yaw: .21, pitch: .30, distance: 9.8 },
    wide: { yaw: -.32, pitch: .44, distance: 145, target: [1,7,-7] } },
  { layout: s2, name: "破碎与循环", orbit: { yaw: .54, pitch: .26, distance: 11.3 },
    wide: { yaw: -.40, pitch: .36, distance: 179, target: [7,7.5,1] } },
  { layout: s2, name: "破碎的时间", timeStudy: true, orbit: { yaw: -.57, pitch: .15, distance: 12.5 },
    wide: { yaw: -.50, pitch: .34, distance: 185, target: [9,10,1] } },
  { layout: s2, name: "无法抵达的地方", timeStudy: true, ambient: true,
    ...forgottenView },
];
versions.push({ ...versions[3], name: "已经离去的生命", life: true });
versions.push({ ...versions[4], name: "枯荣", growth: true });
versions.push({ ...versions[5], name: "人间", dialogue: true });
versions.push({ ...versions[6], name: "最终美术调整", finalArt: true });

try {
  run();
} catch (error) {
  status.textContent = "预览未能启动，请使用支持 WebGL 2 的浏览器重新打开。";
  status.hidden = false;
  console.error(error);
}

function run() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.4));
  renderer.setClearColor(0x0b0a09, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a09);
  scene.fog = new THREE.FogExp2(0x0b0a09, .0040);
  const camera = new THREE.PerspectiveCamera(46, 1, .09, 390);
  const worlds = new Map();
  const clockEpoch = performance.now();
  function worldAt(index) {
    // Later versions share geography, movement and the existing scenery clock.
    if (versions[index].life) index = 3;
    if (!worlds.has(index)) {
      const { layout, timeStudy, ambient } = versions[index];
      const entry = createForgottenWorld(layout,timeStudy ?? false,ambient ?? false);
      scene.add(entry.world);
      worlds.set(index,entry);
    }
    return worlds.get(index);
  }
  let version = versions.length-1;
  let current = worldAt(version);
  let player = current.walker.player;

  const sky = new THREE.HemisphereLight(0xdbe0e3, 0x817468, 1.46);
  const key = new THREE.DirectionalLight(0xffecd8, 2.42);
  key.position.set(-67,54,42);
  key.target.position.set(-3,5,-6);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left:-79,right:79,top:71,bottom:-75,near:1,far:197 });
  key.shadow.mapSize.set(1536,1536);
  key.shadow.bias = -.00043;
  key.shadow.normalBias = .12;
  const fill = new THREE.DirectionalLight(0xc5cddd, .60);
  fill.position.set(35,22,-56);
  scene.add(sky, key, key.target, fill);

  const avatar = createCottonCandy();
  avatar.update(0,false,true,0);
  const moonHeight = new THREE.Box3().setFromObject(avatar.root).getSize(new THREE.Vector3()).y;
  const life = createDepartedLife(current.world,moonHeight);
  const canopy = current.plantGroup.children[0].children.find(mesh=>mesh.isInstancedMesh);
  const plants = createPlantLife(current.world,s2,getGrowthAssets(),canopy);
  const setFinish = createFinalArt(current.world,current.plantGroup,plants.root);
  scene.add(avatar.root);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { amount: { value: .27 } },
    vertexShader: "varying vec2 point; void main(){point=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying vec2 point; uniform float amount; void main(){gl_FragColor=vec4(.10,.073,.052,amount*(1.-smoothstep(.03,.50,length(point))));}",
  }));
  contact.rotation.x = -Math.PI/2;
  scene.add(contact);
  renderer.shadowMap.needsUpdate = true;

  const explore = document.querySelector("#explore");
  const overview = document.querySelector("#overview");
  const joystick = document.querySelector("#joystick");
  const jumpButton = document.querySelector("#jump");
  const region = document.querySelector("#region");
  const guide = document.querySelector("#guide");
  const sceneName = document.querySelector("#scene-name");
  const versionSelect = document.querySelector("#version");
  const depth = document.querySelector("#depth");
  const testDepth = document.querySelector("#test-depth");
  const lifeTools = document.querySelector("#life-tools");
  const lifeFeedback = document.querySelector("#life-feedback");
  const plantTools = document.querySelector("#plant-tools");
  const plantFeedback = document.querySelector("#plant-feedback");
  const artTools = document.querySelector("#art-tools");
  const artChoice = document.querySelector("#art-choice");
  const dialogueTools = document.querySelector("#dialogue-tools");
  const dialogueFeedback = document.querySelector("#dialogue-feedback");
  const dialogueId = document.querySelector("#dialogue-id");
  const speechElement = document.querySelector("#human-bubble");
  const bubble = createCompanionBubble(speechElement);
  const remaining = document.querySelector("#dialogue-count");
  const words = createHumanDialogue({
    show: (line,time,duration) => bubble.show(line,time,duration,"human"),
    hide: () => {
      bubble.dismiss("human");
      speechElement.hidden = true;
    },
    updateCount: count => { remaining.value = String(count); },
  });
  const music = bindHumanMusic(document.querySelector("#human-music"));
  document.querySelector("#music-placeholder").hidden = Boolean(humanTrackUrl);
  for (const id of Object.keys(humanLines)) dialogueId.add(new Option(id,id));
  function testSpeech(say) {
    dialogueFeedback.textContent = panorama ? "请在自由探索中预览" : say() ? "" : "请等当前对白结束";
    needsRender = true;
  }
  document.querySelector("#dialogue-next").addEventListener("click",()=>testSpeech(words.next));
  document.querySelector("#dialogue-preview").addEventListener("click",()=>testSpeech(()=>words.preview(dialogueId.value)));
  document.querySelector("#dialogue-reset").addEventListener("click",()=>{
    words.reset();
    dialogueFeedback.textContent = "";
  });
  const dialoguePause = document.querySelector("#dialogue-pause");
  dialoguePause.addEventListener("change",()=>words.setPaused(dialoguePause.checked));
  let depthEnabled = true, optimized = false;
  function applyDepth() {
    depth.hidden = !current.motion || versions[version].life;
    depth.setAttribute("aria-pressed", String(depthEnabled));
    testDepth.checked = depthEnabled;
    scene.fog.density = current.motion ? (depthEnabled ? (optimized ? finalLight.depth : .0048) : 0) : .004;
    needsRender = true;
  }
  function applyArt(value) {
    optimized = value;
    setFinish(value);
    canvas.closest(".stage").classList.toggle("final-art",value);
    artChoice.value = value ? "final" : "original";
    const { timeStudy } = versions[version];
    sky.intensity = value ? finalLight.ambient : current.motion ? .75 : timeStudy ? .78 : version ? .91 : 1.46;
    sky.color.setHex(value ? finalLight.sky : version ? 0xd9dce1 : 0xdbe0e3);
    sky.groundColor.setHex(value ? finalLight.ground : version ? 0x6f6761 : 0x817468);
    key.intensity = value ? finalLight.key : 2.42;
    key.color.setHex(value ? finalLight.keyColor : timeStudy ? 0xfff0e2 : version ? 0xfff1e5 : 0xffecd8);
    key.position.set(...(value ? finalLight.keyPosition : timeStudy ? [-110,57,61] : version ? [-108,67,53] : [-67,54,42]));
    key.shadow.intensity = value ? finalLight.shadow : 1;
    key.shadow.radius = value ? finalLight.shadowRadius : 1;
    fill.color.setHex(value ? finalLight.fillColor : version ? 0xcad2e4 : 0xc5cddd);
    fill.intensity = value ? finalLight.fill : current.motion ? .76 : timeStudy ? .73 : version ? .69 : .60;
    renderer.shadowMap.needsUpdate = true;
    applyDepth();
  }
  artChoice.addEventListener("change",()=>applyArt(artChoice.value==="final"));
  depth.addEventListener("click", () => {
    depthEnabled = !depthEnabled;
    applyDepth();
  });
  testDepth.addEventListener("change", () => {
    depthEnabled = testDepth.checked;
    applyDepth();
  });
  for (const kind of ["birds","jellies"]) {
    const input = document.querySelector("#test-"+kind);
    input.addEventListener("change", () => {
      life.setVisible(kind,input.checked);
      needsRender = true;
    });
  }
  lifeTools.querySelectorAll("[data-passage]").forEach(button => button.addEventListener("click", () => {
    lifeFeedback.textContent = life.trigger(button.dataset.passage) ? "已开始这一段轨迹" : "同类景观正在经过";
    needsRender = true;
  }));
  plantTools.querySelectorAll("[data-growth]").forEach(button=>button.addEventListener("click",()=>{
    plantFeedback.textContent=plants.trigger(button.dataset.growth)?"已启动":"当前没有适合的植株或枝叶";
    needsRender=true;
  }));
  const plantPause=document.querySelector("#plant-pause");
  plantPause.addEventListener("change",()=>plants.setPaused(plantPause.checked));
  const plantSpeed=document.querySelector("#plant-speed");
  plantSpeed.addEventListener("change",()=>plants.setSpeed(Number(plantSpeed.value)));
  const touch = matchMedia("(pointer: coarse)").matches;
  let panorama = false;
  const orbit = { ...versions[version].orbit };
  const flyover = { ...versions[version].wide };
  let shift = false, touchingStick = false;
  let needsRender = true, settling = 0;
  let nowApproach = new THREE.Vector3().set(player.x,player.y+1.05,player.z);
  let anchor = player.y;
  let orbitClear = orbit.distance;

  const controls = createControls({
    canvas, joystick, jumpButton,
    onJump: () => { if (!panorama) jump(player); },
    onLook: (dx,dz) => {
      const active = panorama ? flyover : orbit;
      active.yaw -= dx * .0054;
      active.pitch = THREE.MathUtils.clamp(active.pitch + dz *.0043, version ? -.64 : -.37, 1.30);
      needsRender = true;
      if (!panorama) settling = .22;
    },
    onZoom: delta => {
      const active = panorama ? flyover : orbit;
      const maximum = panorama ? (version ? 290 : 208) : (version ? 34 : 24);
      active.distance = THREE.MathUtils.clamp(active.distance * Math.exp(delta), panorama ? 69 : 3.2, maximum);
      needsRender = true;
      if (!panorama) settling = .48;
    },
    isPaused: () => false,
    onInteract: () => {}, onTap: tapMoon, onSettle: () => {},
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Shift") shift = true;
  });
  window.addEventListener("keyup", event => {
    if (event.key === "Shift") shift = false;
  });
  window.addEventListener("blur", () => { shift = touchingStick = false; });
  joystick.addEventListener("pointerdown", event => { if (event.pointerType === "touch") touchingStick = true; });
  for (const type of ["pointerup","pointercancel","lostpointercapture"]) {
    joystick.addEventListener(type, () => { touchingStick = false; });
  }

  function selectMode(wide) {
    panorama = wide;
    needsRender = true;
    controls.clear({ freshMovement: true });
    explore.setAttribute("aria-pressed",String(!wide));
    overview.setAttribute("aria-pressed",String(wide));
    joystick.hidden = jumpButton.hidden = wide;
    if (wide) speechElement.hidden = true;
    guide.textContent = wide ? "拖动全景，双指或滚轮缩放。切回自由探索可继续从原地移动。"
      : touch ? "左下摇杆移动，推满奔跑。右侧拖动视角，双指缩放。"
        : "WASD／方向键移动，Shift 奔跑，空格跳跃。拖动旋转，滚轮缩放。";
  }
  explore.addEventListener("click", () => selectMode(false));
  overview.addEventListener("click", () => selectMode(true));
  function resetCamera() {
    needsRender = true;
    if (panorama) Object.assign(flyover,versions[version].wide);
    else {
      Object.assign(orbit,versions[version].orbit);
      orbitClear = orbit.distance;
    }
  }
  document.querySelector("#reset").addEventListener("click", resetCamera);

  function selectVersion(index) {
    if (index!==version && versions[index].dialogue && versions[version].dialogue) {
      version = index;
      sceneName.textContent = versions[index].name;
      applyArt(Boolean(versions[index].finalArt));
      return;
    }
    const world = worldAt(index);
    if (world !== current) current.motion?.deactivate();
    for (const candidate of worlds.values()) candidate.world.visible = candidate === world;
    version = index;
    current = world;
    current.motion?.activate();
    if (versions[index].life) life.activate();
    else {
      life.deactivate();
      lifeTools.open = false;
      lifeFeedback.textContent = "";
    }
    lifeTools.hidden = !versions[index].life;
    artTools.hidden = !versions[index].dialogue;
    dialogueTools.hidden = !versions[index].dialogue;
    if (versions[index].dialogue) {
      dialoguePause.checked = false;
      words.enter();
      music.enter();
    } else {
      words.leave();
      music.leave();
      dialogueFeedback.textContent = "";
    }
    plantTools.hidden = !versions[index].growth;
    if (versions[index].growth) plants.activate();
    else {
      plants.deactivate();
      plantFeedback.textContent="";
    }
    player = world.walker.player;
    nowApproach.set(player.x,player.y+1.12,player.z);
    anchor = player.y;
    versionSelect.value = index;
    sceneName.textContent = versions[index].name;
    Object.assign(orbit,versions[index].orbit);
    Object.assign(flyover,versions[index].wide);
    orbitClear = orbit.distance;
    key.target.position.set(...(index ? [7,8,1] : [-3,5,-6]));
    const shadow = index ? { left:-113,right:113,top:109,bottom:-105,near:1,far:300 }
      : { left:-79,right:79,top:71,bottom:-75,near:1,far:197 };
    Object.assign(key.shadow.camera,shadow);
    key.shadow.camera.updateProjectionMatrix();
    renderer.toneMappingExposure = index ? 1.00 : 1.08;
    applyArt(Boolean(versions[index].finalArt));
    selectMode(panorama);
  }
  versionSelect.addEventListener("change", () => {
    const index = Number(versionSelect.value);
    if (index !== version) selectVersion(index);
  });
  selectMode(false);
  selectVersion(version);

  const target = new THREE.Vector3(), direction = new THREE.Vector3(), scratch = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const hits = [];
  const pointer = new THREE.Vector2();
  function tapMoon(x,y) {
    if (panorama || !versions[version].dialogue) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(2*(x-rect.left)/rect.width-1,1-2*(y-rect.top)/rect.height);
    ray.setFromCamera(pointer,camera);
    ray.near = 0;
    ray.far = Infinity;
    const hit = ray.intersectObjects(avatar.touchMeshes,false)[0];
    if (!hit) return;
    ray.far = hit.distance;
    if (!ray.intersectObjects(current.rocks,false).length && words.touch()) needsRender = true;
  }
  function follow(dt) {
    const settings = panorama ? flyover : orbit;
    const { yaw, pitch, distance } = settings;
    direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    if (panorama) {
      target.fromArray(flyover.target);
      const fit = Math.max(1,.98 / camera.aspect);
      camera.position.copy(target).addScaledVector(direction,distance*fit);
    } else {
      scratch.set(player.x,player.y+1.12,player.z);
      nowApproach.lerp(scratch,1-Math.exp(-dt*13));
      target.copy(nowApproach);
      ray.set(target,direction);
      ray.near = .02; ray.far = distance + .22;
      hits.length = 0;
      ray.intersectObjects(current.rocks,false,hits);
      let clear = hits.length ? Math.max(.48,hits[0].distance-.36) : distance;
      for (let t=.55;t<clear;t+=.34) {
        scratch.copy(target).addScaledVector(direction,t);
        if (current.plantVolumes.some(v => scratch.y>v.bottom && scratch.y<v.top &&
          Math.hypot(scratch.x-v.x,scratch.z-v.z)<v.radius+.18)) {
          clear = Math.max(.48,t-.22);
          break;
        }
      }
      orbitClear = clear < orbitClear ? clear : THREE.MathUtils.damp(orbitClear,clear,8,dt);
      camera.position.copy(target).addScaledVector(direction,orbitClear);
    }
    camera.lookAt(target);
  }

  function resize() {
    const { width,height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width,height,false);
    camera.aspect = width/height;
    camera.updateProjectionMatrix();
    needsRender = true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  scene.updateMatrixWorld(true);

  let previous, lastClockRender = -Infinity;
  document.addEventListener("visibilitychange", () => {
    previous = undefined;
    if (document.hidden) {
      controls.clear({ freshMovement: true });
      music.pause();
    }
    else needsRender = true;
  });
  window.addEventListener("pagehide",music.leave);
  window.addEventListener("pageshow",event=>{
    if(event.persisted && versions[version].dialogue) music.enter();
  });
  renderer.setAnimationLoop(time => {
    if (document.hidden) return;
    const elapsed = (time-(previous ?? time))/1000;
    const dt = Math.min(.048,elapsed);
    previous = time;
    const living = versions[version].life;
    if (current.motion) {
      const ambientDelta = Math.min(.12,elapsed);
      current.motion.update(ambientDelta);
      current.clockSeconds += ambientDelta;
      if (living) life.advance(ambientDelta);
      if (versions[version].growth) plants.advance(ambientDelta,camera,player);
    }
    const [horizontal,vertical] = panorama ? [0,0] : controls.movement();
    const strength = Math.hypot(horizontal,vertical);
    const moving = strength > .025 || !player.grounded;
    if (versions[version].dialogue) words.advance(elapsed*1000,moving,panorama);
    if (moving) settling = .26;
    else settling = Math.max(0,settling-dt);
    const clockDue = current.clock && time - lastClockRender >= (living ? (panorama ? 58 : 42) : (panorama ? 145 : 86));
    if (!moving && settling <= 0 && !needsRender && !clockDue) return;
    needsRender = false;
    const running = shift || touchingStick && strength > .74;
    const speed = running ? MOVE_SPEED : MOVE_SPEED * .57;
    const vx = (Math.cos(orbit.yaw)*horizontal+Math.sin(orbit.yaw)*vertical)*speed;
    const vz = (-Math.sin(orbit.yaw)*horizontal+Math.cos(orbit.yaw)*vertical)*speed;
    const x = player.x, z = player.z;
    const steps = Math.max(1,Math.ceil(dt/.010));
    for (let i=0;i<steps;i++) current.walker.step(vx*dt/steps,vz*dt/steps,dt/steps);
    if (player.grounded) anchor = player.y;
    const moved = Math.hypot(player.x-x,player.z-z) > .001;
    if (moved) {
      const desired = Math.atan2(x-player.x,z-player.z);
      const angle = desired-avatar.root.rotation.y;
      avatar.root.rotation.y += Math.atan2(Math.sin(angle),Math.cos(angle))*Math.min(1,dt*13);
    }
    avatar.root.position.set(player.x,player.y,player.z);
    avatar.update(dt,moved,player.grounded,player.vy,0,0,running && moved ? 1 : 0);
    contact.position.set(player.x,anchor+.10,player.z);
    contact.material.uniforms.amount.value = .34/(1+Math.max(0,player.y-anchor)*.65);
    const label = panorama ? "立体空间全景"
      : version && anchor > 2.9 && anchor < 3.5 && player.x > 28 ? "玫瑰园"
        : anchor > (version ? 15 : 7.7) ? "高处断台" : anchor < (version ? -15 : -7.2) ? "低处残园"
          : Math.abs(anchor) > .3 ? "悬阶与折台" : "中央断地";
    if (label !== region.textContent) region.textContent = label;
    if (current.clock) {
      current.clock.update(current.motion ? current.clockSeconds : Math.max(0,(time-clockEpoch)/1000));
      lastClockRender = time;
    }
    follow(dt);
    if (versions[version].dialogue) {
      bubble.update(avatar.root,camera,words.time,panorama);
      const line = words.current;
      if (line && !speechElement.hidden) {
        const age = words.time-line.start;
        speechElement.style.opacity = Math.min(1,age/humanTiming.fade,(line.duration-age)/humanTiming.fade).toFixed(3);
      }
    }
    if (living) life.draw(camera,optimized && depthEnabled ? finalLight.distantLife : 1);
    renderer.render(scene,camera);
  });
}
