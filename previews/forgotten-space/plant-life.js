import * as THREE from "three";
import { inside } from "./layout.js";
import { createPlantLitter } from "./ambient-motion.js";
import { prepareRoseGrowth, createRoseGrowth } from "./rose-growth.js";
import { rootContacts } from "./root-contacts.js";

export const plantTiming = {
  birth:[15,30], opening:[12,25], open:[90,180], wilt:[20,45],
  remains:[180,360], renewal:[30,90],
};
export const explorationPlantTiming = {
  birth:[8,15], opening:[6,12], open:[30,60], wilt:[10,20],
  remains:[90,180], renewal:[5,17],
};
const stageNames = ["newborn","bud","opening","open","wilt","remains"];
const limits = { garden:[4,5], middle:[3,4], upper:[2,3], lower:[2,3], turn:[1,2] };
const sites = [
  // Each seam has more than one rooted socket; the old and new stems can coexist.
  { region:"middle", y:0, sockets:[[-18.9,8.5],[-18.05,9.78]], seed:["opening",.20] },
  { region:"middle", y:0, sockets:[[5.9,26.9],[5.06,24.1]], seed:["bud",.88] },
  { region:"middle", y:0, sockets:[[-29,3.3],[-27.15,4.12]], seed:null },
  { region:"garden", y:3.2, sockets:[[46.22,12.13],[45.60,12.52],[45.50,13.58]], seed:["remains",0] },
  { region:"garden", y:3.2, sockets:[[55.1,-10.13],[56.94,-11.03],[58.96,-7.96]], seed:["open",.92] },
  { region:"garden", y:3.2, sockets:[[48.76,8.10],[50.29,8.16],[48.9,13.80]], seed:["bud",.90] },
  { region:"upper", y:18, sockets:[[-19.04,-57],[-16.9,-50],[-14.7,-45.40]], seed:["open",.27] },
  { region:"lower", y:-18, sockets:[[-1.04,68.56],[4.16,69.15],[5.03,72]], seed:["wilt",.41] },
  { region:"turn", y:8, sockets:[[-33.65,-28.24],[-34.2,-29.12]], seed:null },
];

const gardenExploration = {
  0:{sockets:[[-7.46,12.96],[-6.02,13.61]],seed:["bud",.38],entry:true},
  1:{sockets:[[-10.49,12.06],[-9.71,12.89]],seed:["wilt",.035],entry:true},
  3:{seed:["remains",.12]},
  4:{seed:["open",.91]},
  5:{seed:["opening",.13]},
  9:{region:"garden",y:3.2,sockets:[[42.12,9.06],[43.31,11.45],[39.71,8.74]],seed:["open",.49]},
  10:{region:"garden",y:3.2,sockets:[[63.02,-6.02],[64.52,-3.05],[66.93,-1.64]],seed:["bud",.26]},
};
const white = new THREE.Color(0xffffff), fallingLeafTint = new THREE.Color(0x657b9a);
const {lerp,smoothstep,smootherstep} = THREE.MathUtils;

export function createPlantLife(parent, layout, assets, canopy, random = Math.random, exploration = false) {
  const root = new THREE.Group();
  root.name = "S6 枯荣";
  parent.add(root);
  const between = ([a,b]) => lerp(a,b,random());
  const timing=exploration?explorationPlantTiming:plantTiming;
  const growthGeometry = prepareRoseGrowth(assets,exploration);
  const pool = Array.from({length:12},(_,i)=>{
    const ivory=i===2 || i===6 || i===10;
    const model=createRoseGrowth(assets,growthGeometry,ivory);
    model.root.visible=false;
    root.add(model.root);
    return { ...model, ivory, site:null };
  });
  const patchSources=exploration
    ? [...sites,...[gardenExploration[9],gardenExploration[10]]].map((site,i)=>({...site,...gardenExploration[i]}))
    : sites;
  const patches = patchSources.map(site=>{
    const deck=layout.decks.find(({outline,y})=>y===site.y && inside(outline,...site.sockets[0]));
    const pieces=deck ? deck.sections ?? [deck.outline] : [];
    const sockets=site.sockets.filter(point=>pieces.some(outline=>inside(outline,...point)));
    return {...site,sockets,members:[],pending:Infinity};
  });
  if(exploration)root.add(rootContacts(layout,patches));
  const leafMatrix = new THREE.Matrix4(), leafTint = new THREE.Color(), leafPoint = new THREE.Vector3();
  const indices=exploration?canopy.userData.observableLeaves
    : Array.from({length:6},(_,i)=>Math.floor((.08+i*.151)*canopy.count));
  const leaves = indices.map(index=>{
    canopy.getMatrixAt(index,leafMatrix);
    canopy.getColorAt(index,leafTint);
    return {index,original:leafMatrix.clone(),color:leafTint.clone(),state:"full",at:0};
  });
  const gazeSprout=leaves.find(leaf=>leaf.index===canopy.userData.gazeSprout);
  const litter=createPlantLitter(root,layout,assets,canopy,random,exploration);
  const clip = new THREE.Vector3(), modelPoint = new THREE.Vector3();
  let time=0, active=false, started=false, paused=false, speed=1;
  let nextLeaf=between(exploration?[20,35]:[19,42]), nextShoot=between(exploration?[22,37]:[35,62]);
  let nextSeed=between(timing.renewal), gazeDrop=Infinity,gazeSecondDrop=Infinity,gazeShoot=Infinity;
  let watchedTree=false;

  function count(region) {
    return pool.filter(slot=>slot.site?.region===region);
  }
  function populate(site, state="newborn", progress=0, preferIvory=false) {
    if(!site)return false;
    const available=site.sockets.map((point,index)=>({point,index})).find(({index})=>
      !site.members.some(slot=>slot.socket===index));
    const slot=pool.find(item=>!item.site && item.ivory===preferIvory) ?? pool.find(item=>!item.site);
    const region=count(site.region);
    const [liveLimit,totalLimit]=exploration && site.region==="garden"?[5,8]:limits[site.region];
    if(!available || !slot || region.length>=totalLimit) return false;
    if(state!=="remains" && (region.filter(item=>item.state!=="remains").length>=liveLimit ||
      pool.filter(item=>item.site && item.state!=="remains").length>=10)) return false;
    slot.site=site;
    slot.socket=available.index;
    slot.lengths=Object.fromEntries(Object.entries(timing).map(([key,range])=>[key,between(range)]));
    slot.stageTime = 0;
    slot.lastPose = -Infinity;
    slot.fast = false;
    slot.retiringAt = undefined;
    slot.drops = 0;
    slot.root.position.set(available.point[0],site.y-.045,available.point[1]);
    slot.root.rotation.y=between([-.95,.95]);
    slot.root.userData.width=between(site.entry?[1.04,1.14]:[.65,1.06]);
    slot.root.userData.height=between(site.entry?[1.08,1.20]:state==="remains"?[.91,1.22]:[.72,1.14]);
    slot.root.visible=true;
    site.members.push(slot);
    enter(slot,state);
    slot.stageTime=progress*slot.duration;
    if(state==="wilt")slot.drops=Math.floor(progress>.55?2:progress>.28?1:0);
    pose(slot);
    return true;
  }

  function enter(slot,state) {
    slot.state=state;
    slot.root.name="S6 玫瑰 "+state;
    slot.stageTime=0;
    slot.lastPose=-Infinity;
    slot.duration=state==="newborn"?slot.lengths.birth*.65
      : state==="bud"?slot.lengths.birth*.35 : slot.lengths[state];
    if(state==="remains") {
      slot.fast=false;
      slot.site.pending=Math.min(slot.site.pending,time+between(timing.renewal));
    }
  }

  function pose(slot) {
    const u = Math.min(1,slot.stageTime/slot.duration);
    let growth=1, closed=0, wilt=0;
    if(slot.state==="newborn"){growth=lerp(.02,.76,smoothstep(u,0,1));closed=1;}
    if(slot.state==="bud"){growth=lerp(.76,1,smootherstep(u,0,1));closed=1;}
    if(slot.state==="opening")closed=1-(exploration?smoothstep(u,0,1):smootherstep(u,0,1));
    if(slot.state==="wilt")wilt=exploration?smoothstep(u,0,1):smootherstep(u,0,1);
    if(slot.state==="remains")wilt=1;
    slot.pose(growth,closed,wilt);
  }

  function shed(slot) {
    slot.drops++;
    const u=smootherstep(slot.stageTime/slot.duration,0,1);
    modelPoint.set(lerp(.06,.50,u),lerp(1.68,1.23,u),lerp(-.02,.24,u));
    slot.root.localToWorld(modelPoint);
    litter.release("petal",modelPoint,time,slot.root.userData.width,white,slot.ivory);
  }

  const leafLight=canopy.geometry.getAttribute("livingLight");
  function canopyPose(leaf,scale,light=0) {
    leafMatrix.copy(leaf.original).scale(leafPoint.setScalar(Math.max(.0001,scale)));
    canopy.setMatrixAt(leaf.index,leafMatrix);
    if(exploration)canopy.instanceMatrix.addUpdateRange(leaf.index*16,16);
    canopy.instanceMatrix.needsUpdate=true;
    if(leafLight){
      leafLight.setY(leaf.index,light);
      leafLight.addUpdateRange(leaf.index*2,2);
      leafLight.needsUpdate=true;
    }
  }
  function dropLeaf(foreground=false) {
    const options=leaves.filter(leaf=>leaf.state==="full");
    if(!options.length)return false;
    const leaf=foreground?options[0]:options[Math.floor(random()*options.length)];
    leafPoint.setFromMatrixPosition(leaf.original);
    canopy.localToWorld(leafPoint);
    const size=new THREE.Vector3().setFromMatrixScale(leaf.original).length()/Math.sqrt(3);
    const tint=exploration?leafTint.copy(leaf.color).lerp(fallingLeafTint,.58):leaf.color;
    if(!litter.release("leaf",leafPoint,time,size*(exploration?1.24:1),tint))return false;
    leaf.state="empty";
    leaf.at=time+between(timing.renewal);
    canopyPose(leaf,0);
    return true;
  }
  function growLeaf(manual=false,foreground=false) {
    const options=leaves.filter(leaf=>leaf.state==="empty" && (manual || time>=leaf.at));
    if(!options.length)return false;
    const leaf=foreground?(options.find(item=>item===gazeSprout)??options.at(-1)):options[Math.floor(random()*options.length)];
    leaf.state="growing";
    leaf.at=time;
    leaf.duration=between(exploration?[4.0,5.4]:[14,29]);
    canopyPose(leaf,.045);
    return true;
  }

  function release(slot) {
    slot.site.members.splice(slot.site.members.indexOf(slot),1);
    slot.site=null;
    slot.root.visible=false;
  }

  function reclaim(camera, player, site, needsSocket=false) {
    camera.updateMatrixWorld();
    const candidates=pool.filter(slot=>slot.state==="remains" && slot.site &&
      (!site || (needsSocket?slot.site===site:slot.site.region===site.region)) &&
      slot.stageTime>=slot.duration && slot.retiringAt===undefined)
      .sort((a,b)=>b.stageTime-a.stageTime);
    const hidden=candidates.find(({root:plant})=>{
      const {x,y,z}=plant.position;
      if(Math.hypot(x-player.x,y-player.y,z-player.z)<22)return false;
      clip.copy(plant.position).add(leafPoint.set(0,.85,0)).project(camera);
      return Math.abs(clip.x)>1.16 || Math.abs(clip.y)>1.16 || clip.z>1 || clip.z< -1;
    });
    if(hidden)release(hidden);
    else if(exploration && candidates.length && !pool.some(slot=>slot.site&&slot.retiringAt!==undefined)) {
      candidates[0].retiringAt=time;
      candidates[0].root.scale.y=candidates[0].root.userData.height;
    }
  }

  function advance(dt,camera,player) {
    if(!active || paused)return;
    const elapsed=(exploration?dt:Math.min(.12,dt))*speed;
    time+=elapsed;
    for(const slot of pool){
      if(!slot.site)continue;
      if(slot.retiringAt!==undefined){
        const fade=smootherstep(time-slot.retiringAt,0,12);
        slot.root.scale.y=slot.root.userData.height*lerp(1,.016,fade);
        if(fade>=1)release(slot);
        continue;
      }
      slot.stageTime+=elapsed*(slot.fast?5:1);
      const next=stageNames[stageNames.indexOf(slot.state)+1];
      if(slot.state==="wilt" && slot.drops<2 && slot.stageTime/slot.duration>(slot.drops===0?.30:.67))shed(slot);
      if(next && slot.stageTime>=slot.duration){
        enter(slot,next);
        if(next==="opening")slot.fast=false;
      }
      const changing=slot.state!=="open" && slot.state!=="remains";
      if(slot.lastPose===-Infinity ||
        (changing && time-slot.lastPose >= (camera.position.distanceToSquared(slot.root.position)>43**2?.30:.075))){
        pose(slot);
        slot.lastPose=time;
      }
    }
    if(time>=gazeDrop){dropLeaf(true);gazeDrop=Infinity;}
    if(time>=gazeSecondDrop){dropLeaf(true);gazeSecondDrop=Infinity;}
    if(time>=gazeShoot){growLeaf(true,true);gazeShoot=Infinity;}
    if(time>=nextLeaf){dropLeaf();nextLeaf=time+between(exploration?[25,55]:[38,77]);}
    if(time>=nextShoot){growLeaf();nextShoot=time+between(exploration?[20,37]:[19,42]);}
    for(const leaf of leaves)if(leaf.state==="growing"){
      const fraction=(time-leaf.at)/leaf.duration;
      const age=time-leaf.at;
      const scale=exploration?smoothstep(fraction,0,.23)*(.36+.64*smoothstep(fraction,0,1)):smootherstep(fraction,0,1);
      const light=smoothstep(age,.55,1.18)*(1-smoothstep(age,2.75,3.7));
      canopyPose(leaf,lerp(.045,1,scale),light);
      if(fraction>=1)leaf.state="full";
    }
    const due=patches.filter(site=>time>=site.pending);
    if(due.length || time>=nextSeed){
      for(const site of due){
        const needsSocket=site.members.length>=site.sockets.length;
        if(needsSocket || count(site.region).length>=(exploration&&site.region==="garden"?8:limits[site.region][1]))
          reclaim(camera,player,site,needsSocket);
        else if(pool.every(slot=>slot.site))reclaim(camera,player);
        const success=populate(site,"newborn",0,random()<.25);
        site.pending=success?Infinity:time+between(exploration?[5,11]:[9,22]);
      }
      if(time>=nextSeed){
        if(pool.every(slot=>slot.site))reclaim(camera,player);
        const candidates=patches.filter(site=>site.members.length<site.sockets.length);
        if(candidates.length)populate(candidates[Math.floor(random()*candidates.length)],"newborn",0,random()<.25);
        nextSeed=time+between(timing.renewal);
      }
    }
    litter.update(time);
  }

  function activate() {
    active=root.visible=true;
    if(!started){
      started=true;
      const prepared=gazeSprout??leaves[0];
      prepared.state="empty";
      prepared.at=between(timing.renewal);
      for(const site of patches){
        if(site.seed)populate(site,...site.seed,site.region==="garden"&&site.seed[0]==="bud");
      }
      // One paired seedling is already growing beside the dry stem on entry.
      populate(patches[3],"newborn",.48,true);
    }
    for(const leaf of leaves){
      const scale=leaf.state==="full"?1:leaf.state==="empty"?0:lerp(.045,1,smootherstep((time-leaf.at)/leaf.duration,0,1));
      canopyPose(leaf,scale);
    }
  }
  function deactivate() {
    active=root.visible=false;
    gazeDrop=gazeSecondDrop=gazeShoot=Infinity;
    watchedTree=false;
    for(const leaf of leaves)canopyPose(leaf,1);
  }

  function trigger(kind) {
    if(!active)return false;
    if(kind==="drop")return dropLeaf();
    if(kind==="shoot")return growLeaf(true);
    if(kind==="birth"){
      return [...patches].sort((a,b)=>Number(b.members.some(slot=>slot.state==="remains"))-
        Number(a.members.some(slot=>slot.state==="remains"))).some(site=>populate(site));
    }
    const candidates=pool.filter(slot=>slot.site&&(kind==="bloom"?["bud","newborn"].includes(slot.state):slot.state==="open"));
    candidates.sort((a,b)=>b.stageTime/b.duration-a.stageTime/a.duration);
    const slot=candidates[0];
    if(!slot)return false;
    if(kind==="bloom")slot.fast=true;
    else enter(slot,"wilt");
    return true;
  }

  function observeTree(){
    if(!active||watchedTree)return;
    watchedTree=true;
    gazeDrop=time+5.6;
    gazeSecondDrop=time+7.8;
    gazeShoot=time+8.9;
  }

  return {root,activate,deactivate,advance,observeTree,trigger,setSpeed(value){if([1,5,10].includes(value))speed=value;},
    setPaused(value){paused=value;}};
}
