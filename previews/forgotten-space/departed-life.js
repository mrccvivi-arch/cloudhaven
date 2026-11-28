import * as THREE from "three";
import { flockOffsets, makeBird } from "../forgotten-life/birds.js";
import { bellDiameter, makeJelly } from "../forgotten-life/jellies.js";

const { lerp, smootherstep } = THREE.MathUtils;

const curve = points => new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
// The clock routes stay on opposite sides of its dial. The northern route clears
// the ring from above; the low pass is over the gap south of the central terrace.
export const birdRoutes = [
  curve([[-108,41,39],[-48,34,33],[12,36,26],[56,38,31],[118,44,42]]),
  curve([[123,48,-39],[69,46,-33],[18,47,-26],[-38,43,-30],[-121,44,-43]]),
  curve([[-122,82,-103],[-62,79,-79],[-13,81,-62],[49,79,-67],[126,83,-98]]),
  curve([[-104,17,65],[-45,16,45],[-8,12,40],[35,14,38],[107,21,59]]),
];

// A low pass crosses the initial outlook in front of the clock and above the terrace.
const entrySolo = curve([[-10,10,1],[-2,9,4],[8,8.7,6],[23,13,9],[49,19,24]]);
const entryFlock = curve([[-17,22,-9],[-1,12,-1],[12,9.7,3],[29,14,9],[61,28,24]]);
const shorterBirdRoutes = birdRoutes.map(route => new THREE.CatmullRomCurve3(
  Array.from({length:7},(_,i)=>route.getPointAt(.23+i*.093)),
));
export const explorationLife = {
  solo:[15,30], flock:[45,90], giant:[90,180],
  entrySolo:[8,15], entryFlock:[30,47], entryGiant:[20,34],
};

const drifts = [
  { ratio: .56, phase: .68, start: .44, path: curve([[20,-17,8],[21,1,8],[21,6,5],[22,9,19],[21,18,32]]) },
  { ratio: .67, phase: 1.42, start: .42, path: curve([[17,7,-73],[18,8,-61],[15,6,-49],[15,4,-44],[14,-13,-29]]) },
  { ratio: .63, phase: 2.13, start: .54, path: curve([[-58,-7,9],[-55,-15,18],[-50,-20,28],[-48,-24,40],[-45,-36,66]]) },
  { ratio: 1.32, phase: .63, start: .32, path: curve([[67,14,43],[63,6,43],[61,-4,47],[57,-8,52],[61,-25,63]]) },
  { ratio: 2.7, phase: 1.49, start: .51, path: curve([[14,-34,91],[13,-22,91],[17,-16,95],[22,-19,103],[34,-28,112]]) },
];

// Wide corridors reserve room for the dome and the full sweep of the tentacles.
export const giantRoutes = [
  curve([[21,-37,34],[21,-17,35],[21,4,35],[21,24,36],[22,54,39]]),
  curve([[99,13,108],[57,15,100],[18,18,99],[-20,11,102],[-77,11,106]]),
  curve([[78,51,-63],[70,31,-57],[66,10,-58],[69,-14,-61],[73,-46,-69]]),
];

function instancePaint(group, bird) {
  const copies = new Map();
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const source = mesh.material;
    if (!copies.has(source)) {
      const paint = source.clone();
      paint.transparent = true;
      paint.forceSinglePass = true;
      if (paint.isShaderMaterial) {
        paint.uniforms.lifeOpacity = { value: 0 };
        paint.fragmentShader = "uniform float lifeOpacity;\n" + paint.fragmentShader.replace(
          "#include <colorspace_fragment>",
          "gl_FragColor.a *= lifeOpacity;\n#include <colorspace_fragment>",
        );
      }
      copies.set(source, paint);
    }
    mesh.material = copies.get(source);
  });
  const materials = [...copies];
  return alpha => {
    for (const [source, paint] of materials) {
      if (paint.isShaderMaterial) paint.uniforms.lifeOpacity.value = alpha;
      else {
        paint.opacity = alpha * source.opacity;
        if (bird && paint.transparent !== (alpha < .995)) {
          paint.transparent = alpha < .995;
          paint.needsUpdate = true;
        }
      }
    }
  };
}

export function createDepartedLife(parent, moonHeight, random = Math.random, exploration = false) {
  const root = new THREE.Group();
  root.name = "S5 白鸟与水母";
  root.visible = false;
  parent.add(root);
  const between = (a, b) => lerp(a, b, random());

  function flightSlot(count) {
    const group = new THREE.Group();
    const members = Array.from({length: count}, (_, i) => {
      const bird = makeBird("B5", .19 + i*.27);
      bird.root.scale.setScalar(count === 1 ? .67 : .62*flockOffsets[i][3]);
      group.add(bird.root);
      return bird;
    });
    group.visible = false;
    root.add(group);
    return {group, members, opacity: instancePaint(group, true), passage: null, poseAt: -Infinity};
  }
  function jellySlot(id, ratio, phase) {
    const jelly = makeJelly(id, phase);
    const group = jelly.root;
    group.scale.setScalar(ratio*moonHeight/bellDiameter);
    group.visible = false;
    root.add(group);
    return {group, jelly, opacity: instancePaint(group, false), poseAt: -Infinity};
  }

  const solo = flightSlot(1), flock = flightSlot(flockOffsets.length);
  const ordinary = drifts.map(({ratio,phase}) => jellySlot("J5",ratio,phase));
  ordinary.at(-1).hover = !exploration;
  const giant = jellySlot("J6",7,.65);
  const birdSlots = {solo, flock};
  const jellySlots = [...ordinary, giant];
  const sort = [];
  const point = new THREE.Vector3(), heading = new THREE.Vector3();
  let elapsed = 0, active = false, showBirds = true, showJellies = true;
  let nextSolo, nextFlock, nextGiant, manualGiant, manualFlock;
  const previousPaths = {solo: -1, flock: -1, giant: -1};
  const opening = {solo:false,flock:false,giant:false};
  const windowFor = kind => exploration ? explorationLife[kind] : {solo:[25,50],flock:[60,120],giant:[120,240]}[kind];
  const glideDuration = path => exploration ? path.getLength()/between(.72,1.05) : between(115,191);

  function pathIndex(kind, count) {
    const prev = previousPaths[kind];
    const choice = prev < 0 ? Math.floor(random()*count) : (prev+1+Math.floor(random()*(count-1)))%count;
    previousPaths[kind] = choice;
    return choice;
  }

  function trigger(kind, manual = true) {
    if (!active) return false;
    if (kind === "giant") {
      if (giant.passage) return false;
      const first=!manual && opening.giant;
      const path = manual ? giantRoutes[manualGiant++ % giantRoutes.length]
        : giantRoutes[first ? 0 : pathIndex(kind,giantRoutes.length)];
      giant.passage = {path, born: elapsed, duration: between(67,88),
        start: manual ? .43 : first ? .38 : 0, fade: manual ? 1.8 : first ? 5 : 9};
      giant.poseAt = -Infinity;
    } else {
      const slot = birdSlots[kind];
      if (!slot || slot.passage) return false;
      const route = manual ? (kind === "solo" ? 3 : manualFlock++ % birdRoutes.length)
        : pathIndex(kind,birdRoutes.length);
      const first=!manual && opening[kind];
      const path = first ? (kind==="solo"?entrySolo:entryFlock)
        : (exploration&&!manual?shorterBirdRoutes:birdRoutes)[route];
      const duration = exploration ? (kind==="flock"?between(21,27):between(12,15))
        : (kind === "flock" ? between(25,30) : between(21,29));
      slot.passage = {path, born:elapsed, duration, start:manual ? .40 : first ? .17 : 0, fade:manual || first ? 1.55 : 3.8};
      slot.poseAt = -Infinity;
    }
    if (!manual) opening[kind]=false;
    return true;
  }

  function activate() {
    if (active) return;
    root.visible = active = true;
    elapsed = 0;
    nextSolo = between(...(exploration?explorationLife.entrySolo:[25,50]));
    nextFlock = between(...(exploration?explorationLife.entryFlock:[60,120]));
    nextGiant = between(...(exploration?explorationLife.entryGiant:[30,60]));
    opening.solo=opening.flock=opening.giant=exploration;
    manualGiant = manualFlock = 0;
    if (!exploration && random() < .52) {
      trigger("solo",false);
      solo.passage.born = -between(5,12);
    }
    ordinary.forEach((slot,i) => {
      const {path,start} = drifts[i];
      const duration = glideDuration(path);
      slot.passage = {path, born: -start*duration, duration, start:0, fade:14};
      slot.poseAt = -Infinity;
    });
  }

  function deactivate() {
    root.visible = active = false;
    for (const slot of [solo,flock,...jellySlots]) {
      slot.group.visible = false;
      slot.passage = null;
    }
    sort.length = 0;
  }

  function advance(dt) {
    if (!active) return;
    elapsed += Math.min(exploration?.25:.12,Math.max(0,dt));
    for (const slot of [solo,flock,giant]) {
      const pass = slot.passage;
      if (pass && elapsed >= pass.born + pass.duration*(1-pass.start)) {
        slot.passage = null;
        slot.group.visible = false;
      }
    }
    if (elapsed >= nextSolo) {
      trigger("solo",false);
      nextSolo = elapsed+between(...windowFor("solo"));
    }
    if (elapsed >= nextFlock) {
      trigger("flock",false);
      nextFlock = elapsed+between(...windowFor("flock"));
    }
    if (elapsed >= nextGiant) {
      trigger("giant",false);
      nextGiant = elapsed+between(...windowFor("giant"));
    }
    ordinary.forEach((slot,i) => {
      const pass = slot.passage;
      if (elapsed >= pass.born+pass.duration) {
        slot.passage = {path:drifts[i].path, born:elapsed, duration:glideDuration(pass.path), start:0, fade:14};
        slot.group.visible = false;
      }
    });
  }

  function sample(slot, enabled, camera, distantLight) {
    const pass = slot.passage;
    if (!pass || !enabled) {
      slot.group.visible = false;
      return null;
    }
    const age = elapsed-pass.born;
    const fraction = pass.start+age/pass.duration;
    const progress = Math.min(1,fraction);
    pass.path.getPointAt(slot.hover ? progress+.12*Math.sin(progress*Math.PI*2) : progress,point);
    const distance = point.distanceTo(camera.position);
    const endFade = slot === giant ? 12 : pass.fade;
    const alpha = smootherstep(age,0,pass.fade) *
      (1-smootherstep(fraction,1-endFade/pass.duration,1));
    // These thresholds affect appearance and animation detail only. The passage
    // itself advances even when no camera is nearby.
    const attenuation = 1-(slot.jelly ? .9 : .85)*distantLight*smootherstep(distance,155,325);
    slot.group.visible = alpha*attenuation > .008;
    if (!slot.group.visible) return null;
    slot.opacity(alpha*attenuation);
    slot.group.position.copy(point);
    return {age,fraction,pass,interval:distance>110 ? .14 : distance>58 ? .084 : .041};
  }

  function draw(camera, distantLight = 1) {
    for (const slot of [solo,flock]) {
      const frame = sample(slot,showBirds,camera,distantLight);
      if (!frame) continue;
      const {fraction,pass,interval} = frame;
      pass.path.getTangentAt(Math.min(1,fraction),heading);
      slot.group.rotation.y = Math.atan2(heading.x,heading.z);
      const pose = elapsed-slot.poseAt >= interval;
      if (pose) slot.poseAt = elapsed;
      slot.members.forEach((bird,i) => {
        const [along,height,across] = slot === solo ? [0,0,0] : flockOffsets[i];
        const wave = .43*Math.sin(elapsed*.48+i*1.17);
        const bank = -.10 + .14*Math.sin(fraction*16+i*.63);
        if (pose) bird.rise = bird.update(elapsed,bank);
        bird.root.rotation.y = .12*Math.sin(fraction*16+i*.89);
        bird.root.position.set(across*1.28+wave*.32,(height ? (height-3)*1.16 : 0)+bird.rise,along*1.29+wave);
      });
    }
    sort.length = 0;
    camera.updateMatrixWorld();
    const matrix = camera.matrixWorldInverse.elements;
    for (const slot of jellySlots) {
      const frame = sample(slot,showJellies,camera,distantLight);
      if (!frame) continue;
      if (!slot.drift || elapsed-slot.poseAt >= frame.interval) {
        slot.poseAt = elapsed;
        slot.drift = slot.jelly.update(elapsed);
      }
      const scale = slot === giant ? 4.2 : 1.55;
      slot.group.position.addScaledVector(point.fromArray(slot.drift),scale);
      const {x,y,z} = slot.group.position;
      slot.depth = matrix[2]*x+matrix[6]*(y-.65*slot.group.scale.y)+matrix[10]*z;
      sort.push(slot);
    }
    sort.sort((a,b)=>a.depth-b.depth);
    sort.forEach(({jelly},i)=>jelly.sort(i+1));
  }

  function setVisible(kind, visible) {
    if (kind === "birds") showBirds = visible;
    else showJellies = visible;
  }
  return {activate, deactivate, advance, draw, trigger, setVisible};
}
