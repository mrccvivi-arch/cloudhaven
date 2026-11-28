import * as THREE from "three";
import { seeded } from "../../src/map.js";
import { inside } from "./layout.js";

const { lerp, smoothstep, smootherstep, degToRad } = THREE.MathUtils;
const tau = Math.PI * 2;

function pivotStair(root, stair, addedHeight) {
  stair.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(stair).getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.position.copy(center);
  pivot.position.y += addedHeight;
  stair.position.sub(center);
  stair.castShadow = false;
  pivot.add(stair);
  root.add(pivot);
  return pivot;
}

function pooledMaterial(material) {
  const copy = material.clone();
  copy.onBeforeCompile = material.onBeforeCompile;
  copy.customProgramCacheKey = material.customProgramCacheKey;
  copy.transparent = true;
  copy.depthWrite = false;
  return copy;
}

function onePetal(source, petal) {
  const vertexCount = 225;
  const first = petal * vertexCount;
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(
      attribute.array.slice(first*attribute.itemSize, (first+vertexCount)*attribute.itemSize),attribute.itemSize));
  }
  const indexCount = 14 * 14 * 6;
  geometry.setIndex(Array.from(source.index.array.subarray(petal*indexCount,(petal+1)*indexCount), i=>i-first));
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-center.y,-center.z);
  return geometry;
}

function visibleGround(layout, x, z, ceiling) {
  let top = -Infinity;
  for (const deck of layout.decks) {
    if (deck.y <= ceiling && deck.y > top && (deck.sections ?? [deck.outline]).some(outline => inside(outline,x,z))) {
      top = deck.y;
    }
  }
  return top;
}

function animateLitter(slot, seconds, layout) {
  const age = seconds-slot.start;
  const { mesh } = slot;
  if (slot.landed !== undefined) {
    const rest = seconds-slot.landed;
    const ease = smootherstep(rest,0,.70);
    mesh.rotation.x = lerp(slot.landingX,-Math.PI*.48,ease);
    mesh.rotation.z = lerp(slot.landingZ,.09,ease);
    mesh.material.opacity = lerp(slot.landingOpacity,1,ease)*(1-smoothstep(rest,slot.hold,slot.hold+3.6));
    if (rest >= slot.hold+3.6) mesh.visible = false;
    return;
  }
  if (age >= slot.duration) {
    mesh.visible = false;
    return;
  }
  const u = age/slot.duration;
  const flutter = Math.sin(age*.96+slot.seed)-Math.sin(slot.seed);
  const drift=slot.leaf?3.5:1;
  const x = slot.origin.x+slot.dx*u+.16*flutter*drift;
  const z = slot.origin.z+slot.dz*u+.09*flutter*drift;
  const y = slot.origin.y-slot.drop*(.81*u+.19*u*u)+.065*flutter*Math.sin(Math.PI*u);
  const floor = visibleGround(layout,x,z,mesh.position.y+.02);
  mesh.position.set(x,y,z);
  mesh.rotation.set(.47+.76*Math.sin(age*.71+slot.seed),slot.seed+.30*age,.38*Math.sin(age*.84-slot.seed));
  mesh.material.opacity = smoothstep(age,0,.7)*(Number.isFinite(floor) ? 1 : 1-smoothstep(u,.77,1));
  if (y <= floor+.060) {
    mesh.position.y = floor+.060;
    slot.landed = seconds;
    slot.landingX = mesh.rotation.x;
    slot.landingZ = mesh.rotation.z;
    slot.landingOpacity = mesh.material.opacity;
  }
}

export function createAmbientMotion(root, sources, layout, random = seeded(Math.random()*0x7fffffff), exploration=false) {
  const group = new THREE.Group();
  group.name = "S4 环境动态";
  root.add(group);
  const tilt = pivotStair(root,sources.stairs[0],6.5);
  const turn = pivotStair(root,sources.stairs[1],0);
  turn.position.z -= 4;
  const tiltOrigin=tilt.position.clone(),turnOrigin=turn.position.clone();
  const between = (a,b) => lerp(a,b,random());
  const pick = list => list[Math.floor(random()*list.length)];

  const shards = Array.from({length:3}, () => {
    const template = sources.shards[0];
    const mesh = new THREE.Mesh(template.geometry,template.material.map(pooledMaterial));
    mesh.visible = false;
    group.add(mesh);
    return { mesh, origin: new THREE.Vector3(), rotation: new THREE.Euler() };
  });
  const { geometry, material } = sources.bluePetal;
  const blue = onePetal(geometry,14), gold = onePetal(geometry,19);
  const petals = Array.from({length:8}, () => {
    const mesh = new THREE.Mesh(blue,pooledMaterial(material));
    mesh.visible = false;
    group.add(mesh);
    return { mesh, origin: new THREE.Vector3() };
  });

  let seconds = 0, stairTime=0, nextRock, nextPetal, secondRock, extraPetals = [];
  let active = false;

  function releaseRock() {
    const slot = shards.find(({mesh}) => !mesh.visible);
    if (!slot) return;
    const source = pick(sources.shards);
    const { mesh } = slot;
    mesh.geometry = source.geometry;
    mesh.scale.setScalar(between(.30,.53));
    // Copies emerge a short distance beyond the permanent fracture, over empty space.
    const side = Math.sign(source.position.x);
    slot.origin.copy(source.position).add(new THREE.Vector3(side*between(.65,1.8), -.36, between(-1.4,.8)));
    slot.rotation.copy(source.rotation);
    slot.dx = side*between(.65,2.1);
    slot.dz = between(-1.8,1.1);
    slot.spin = between(-.39,.37);
    slot.life = between(9,13.5);
    slot.start = seconds;
    mesh.position.copy(slot.origin);
    mesh.rotation.copy(slot.rotation);
    for (const material of mesh.material) material.opacity = 0;
    mesh.visible = true;
  }

  const giants = sources.blooms.filter(source => source.giant);
  function releasePetal(age = 0) {
    const slot = petals.find(({mesh}) => !mesh.visible);
    if (!slot) return;
    const source = pick(random()<.41 && giants.length ? giants : sources.blooms);
    const { mesh } = slot;
    const ivory = source.ivory && sources.ivoryMaterial;
    mesh.material.map = ivory ? sources.ivoryMaterial.map : material.map;
    mesh.material.color.setHex(ivory ? 0xe0d2be : 0xffffff);
    mesh.geometry = !ivory && random()<.11 ? gold : blue;
    mesh.scale.setScalar((source.giant ? 2.3 : 1.16)*between(.88,1.22));
    slot.start = seconds-age;
    slot.duration = between(7,13.6);
    slot.hold = between(3.3,5.9);
    slot.seed = between(0,tau);
    slot.dx = between(-1.31,1.31);
    slot.dz = between(-.97,.97);
    const spread = source.giant ? .73 : .16;
    slot.origin.copy(source.origin).add(new THREE.Vector3(Math.cos(slot.seed)*spread,-.04,Math.sin(slot.seed)*spread));
    const floor = visibleGround(layout,slot.origin.x,slot.origin.z,slot.origin.y-.16);
    slot.drop = Math.max(.8,Number.isFinite(floor) ? slot.origin.y-floor+.38 : between(4.5,9.1));
    slot.landed = undefined;
    mesh.position.copy(slot.origin);
    mesh.rotation.set(.4,slot.seed,.28);
    mesh.material.opacity = 0;
    mesh.visible = true;
  }

  function moveStairs() {
    if(exploration){
      const turning=tau*(stairTime/32-.034), banking=tau*(stairTime/27+.039);
      turn.rotation.set(.18*Math.sin(turning-.6),.94*Math.sin(turning),.22*Math.sin(turning+.48));
      turn.position.set(turnOrigin.x+1.4*Math.sin(turning+.5),turnOrigin.y+1.1*Math.sin(turning-.5),turnOrigin.z+.85*Math.sin(turning-1));
      tilt.rotation.set(.61*Math.sin(banking),-.40*Math.sin(banking+.6),.29*Math.cos(banking));
      tilt.position.set(tiltOrigin.x+.9*Math.sin(banking-.38),tiltOrigin.y+1.4*Math.sin(banking),tiltOrigin.z+1.2*Math.cos(banking));
      return;
    }
    // Preserve the slower studies in the independent previews.
    const yaw = .5+.5*Math.sin(tau*(seconds/68+.18));
    turn.rotation.y = degToRad(64)*(smootherstep(yaw,.065,.935)-.5);
    tilt.rotation.x = degToRad(21)*Math.sin(tau*(seconds/87+.51));
    tilt.rotation.z = degToRad(4)*Math.sin(tau*(seconds/87+.71));
  }

  function animateRock(slot) {
    const age = seconds-slot.start;
    const { mesh } = slot;
    if (age >= slot.life) {
      mesh.visible = false;
      return;
    }
    const elapsed = Math.max(0,age-1.45);
    const fall = elapsed/Math.max(1,slot.life-1.45);
    const detach = smootherstep(age,1.38,3.1);
    mesh.position.set(slot.origin.x+slot.dx*detach,slot.origin.y-.49*elapsed-.255*elapsed**2,slot.origin.z+slot.dz*detach);
    mesh.rotation.set(slot.rotation.x+slot.spin*fall,slot.rotation.y+.70*slot.spin*elapsed,slot.rotation.z+.24*fall);
    for (const material of mesh.material) material.opacity = smoothstep(age,0,1.40)*(1-smoothstep(fall,.49,1));
  }


  function deactivate() {
    active = false;
    for (const {mesh} of [...shards,...petals]) mesh.visible = false;
    extraPetals.length = 0;
    secondRock = undefined;
  }
  function activate() {
    if (active) return;
    active = true;
    nextRock = seconds + between(5.9,12.5);
    nextPetal = seconds + between(8,20);
    // One petal may already be descending on entry; nothing is tied to the character.
    releasePetal(between(1.1,2.8));
    moveStairs();
    for (const slot of petals) if (slot.mesh.visible) animateLitter(slot,seconds,layout);
  }
  function update(dt,eventDelta=dt) {
    if (!active) return;
    stairTime += dt;
    seconds += eventDelta;
    moveStairs();
    if (seconds >= nextRock) {
      releaseRock();
      nextRock = seconds+between(15,35);
      if (random()<.17) secondRock = seconds+between(1.7,3.1);
    }
    if (secondRock !== undefined && seconds >= secondRock) {
      releaseRock();
      secondRock = undefined;
    }
    if (seconds >= nextPetal) {
      releasePetal();
      const draw = random();
      if (draw<.54) extraPetals.push(seconds+between(.7,1.85));
      if (draw<.11) extraPetals.push(seconds+between(2.2,2.9));
      nextPetal = seconds+between(8,20);
    }
    while (extraPetals.length && extraPetals[0] <= seconds) {
      releasePetal();
      extraPetals.shift();
    }
    for (const slot of shards) if (slot.mesh.visible) animateRock(slot);
    for (const slot of petals) if (slot.mesh.visible) animateLitter(slot,seconds,layout);
  }
  return { group, tilt, turn, activate, deactivate, update };
}

export function createPlantLitter(root, layout, roses, leaves, random, exploration=false) {
  const between = (a,b) => lerp(a,b,random());
  const groups = {
    petal: [onePetal(roses.r4[1].geometry,14),roses.r4[1].material,4],
    leaf: [leaves.geometry,exploration?leaves.material.clone():leaves.material,3],
  };
  const pool = Object.fromEntries(Object.entries(groups).map(([kind,[geometry,material,count]]) =>
    [kind,Array.from({length:count},()=>{
      const mesh = new THREE.Mesh(geometry,pooledMaterial(material));
      mesh.visible = false;
      root.add(mesh);
      return {mesh,origin:new THREE.Vector3()};
    })]));

  function release(kind,origin,time,size,color,ivory=false) {
    const slot = pool[kind].find(({mesh})=>!mesh.visible);
    if(!slot)return false;
    const {mesh}=slot;
    if(kind==="petal"){
      const paint=(ivory?roses.r4Ivory:roses.r4)[1].material;
      mesh.material.map=paint.map;
      mesh.material.vertexColors=paint.vertexColors;
      mesh.material.needsUpdate=true;
    }
    mesh.material.color.copy(color);
    mesh.material.opacity=0;
    mesh.scale.setScalar(size);
    mesh.position.copy(origin);
    mesh.visible=true;
    slot.origin.copy(origin);
    slot.start=time;
    slot.leaf=exploration&&kind==="leaf";
    slot.duration=slot.leaf?between(8,12):between(7,12);
    slot.hold=between(3.5,7);
    slot.seed=between(0,tau);
    slot.dx=slot.leaf?between(-3.0,-1.8):between(-.85,.85);
    slot.dz=slot.leaf?between(.6,2.1):between(-.75,.75);
    slot.landed=undefined;
    const floor=visibleGround(layout,origin.x,origin.z,origin.y-.06);
    slot.drop=Number.isFinite(floor)?Math.max(.25,origin.y-floor+.38):between(4.5,8.1);
    return true;
  }

  const slots=[...pool.petal,...pool.leaf];
  return {
    release,
    update(time){for(const slot of slots)if(slot.mesh.visible)animateLitter(slot,time,layout);},
  };
}
