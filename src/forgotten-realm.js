import * as THREE from "three";
import { createObjectTap, createObjectTutorial } from "./object-touch.js";
import { jump, MOVE_SPEED } from "./motion.js";
import { createWalker } from "../previews/forgotten-space/layout.js";
import { s2 } from "../previews/forgotten-space/loop-layout.js";
import { createForgottenWorld, forgottenView } from "../previews/forgotten-space/world-content.js";
import { createFinalArt, finalLight } from "../previews/forgotten-space/final-art.js";
import { createDepartedLife } from "../previews/forgotten-space/departed-life.js";
import { createPlantLife } from "../previews/forgotten-space/plant-life.js";
import { getGrowthAssets } from "../previews/forgotten-space/plantings.js";
import { createHumanDialogue, humanTiming } from "../previews/forgotten-space/human-dialogue.js";
import { bindHumanMusic } from "../previews/forgotten-space/human-music.js";
import { expandForgottenCanopy } from "./forgotten-canopy.js";
import { returnHeading } from "./forgotten-wayfinding.js";
import { createForgottenPortal } from "./forgotten-portal.js";

const realmLighting={
  sky:0xd4deeb, ground:0x79747b, ambient:.47,
  key:2.23,keyColor:0xffdfb5,keyPosition:[62,83,102],keyTarget:[-13,9,-4],
  fill:.79,fillColor:0x9db7e4,fillPosition:[-64,30,18],
  crown:110,crownColor:0xffca8b,crownPosition:[-15.7,13.5,8.2],crownRange:11.3,
  shadow:.61,shadowRadius:3.1,
};

export function createForgottenRealm({canvas,renderer,avatar,bubble,speech,hud,portalHint,panoramaButton,leave}) {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0b0a09);
  scene.fog=new THREE.FogExp2(0x0b0a09,finalLight.depth);
  const camera=new THREE.PerspectiveCamera(46,1,.09,390);
  const {world,rocks,plantGroup,plantVolumes,clock,motion,scenerySteps}=createForgottenWorld(s2,true,true,true);
  scene.add(world);
  const sky=new THREE.HemisphereLight(realmLighting.sky,realmLighting.ground,realmLighting.ambient);
  const key=new THREE.DirectionalLight(realmLighting.keyColor,realmLighting.key);
  key.position.set(...realmLighting.keyPosition);
  key.target.position.set(...realmLighting.keyTarget);
  key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-113,right:113,top:109,bottom:-105,near:1,far:300});
  key.shadow.mapSize.set(1536,1536);
  key.shadow.bias=-.00037;
  key.shadow.normalBias=.17;
  key.shadow.radius=realmLighting.shadowRadius;
  key.shadow.intensity=realmLighting.shadow;
  const fill=new THREE.DirectionalLight(realmLighting.fillColor,realmLighting.fill);
  fill.position.set(...realmLighting.fillPosition);
  // Soft local bounce for the living canopy and adjacent branches. It casts no shadow.
  const crown=new THREE.PointLight(realmLighting.crownColor,realmLighting.crown,realmLighting.crownRange);
  crown.position.set(...realmLighting.crownPosition);
  scene.add(sky,key,key.target,fill,crown);

  const life=createDepartedLife(world,1.825,Math.random,true);
  const canopy=expandForgottenCanopy(plantGroup.children[0]);
  const plants=createPlantLife(world,s2,getGrowthAssets(),canopy,Math.random,true);
  createFinalArt(world,plantGroup,plants.root)(true);
  const exit=createForgottenPortal(false);
  world.add(exit.root);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{amount:{value:.27}},
    vertexShader:"varying vec2 point;void main(){point=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:"varying vec2 point;uniform float amount;void main(){gl_FragColor=vec4(.10,.073,.052,amount*(1.-smoothstep(.03,.50,length(point))));}",
  }));
  contact.rotation.x=-Math.PI/2;
  scene.add(contact);

  const music=bindHumanMusic(hud.querySelector("#forgotten-music"));
  const words=createHumanDialogue({
    show:(line,time,duration)=>bubble.show(line,time,duration,"human"),
    hide:()=>{bubble.dismiss("human");speech.hidden=true;},
    updateCount:()=>{},
  });
  const ray=new THREE.Raycaster(), pointer=new THREE.Vector2(), hits=[];
  const occludes=(sight,_layer,distance)=>sight.intersectObjects(rocks,false).some(hit=>hit.distance<distance-.03);
  const touch=matchMedia("(pointer: coarse)").matches;
  const hitExit=createObjectTap(camera,occludes,touch?36:16);
  const showExit=createObjectTutorial(portalHint,camera,occludes);
  const gazeButton=hud.closest("#game").querySelector("#forgotten-gaze");
  const guide=hud.querySelector("#forgotten-wayfinder");
  const arrow=guide.querySelector("span");
  const stairNote=hud.querySelector("#forgotten-stair-note");
  const showGaze=createObjectTutorial(gazeButton,camera,occludes);
  const treeBase=new THREE.Vector3(s2.treePosition[0],2.7,s2.treePosition[1]);
  const lookAtTree=new THREE.Vector3(-23.5,11.4,4);
  const treeView=new THREE.Vector3();
  const endpointA=new THREE.Vector3(), endpointB=new THREE.Vector3(), closest=new THREE.Vector3();
  const stride=new THREE.Line3(endpointA,endpointB), playerPoint=new THREE.Vector3();
  let gazing=false,gazeBlend=0,seenStair=false,noteUntil=0,nextStairCheck=0,guideAngle;
  let active=false, panorama=false, walker, anchor, orbitClear, clockTime=0, lastRender=-Infinity;
  let oldExposure,oldShadows,oldAuto,oldShadowType, movingFrame=false, revealed=false;
  let orbit,wide;
  const target=new THREE.Vector3(), direction=new THREE.Vector3(), approach=new THREE.Vector3(), probe=new THREE.Vector3();

  function nearTree() {
    const p=walker.player;
    return Math.abs(p.y)<2.3 && Math.hypot(p.x-treeBase.x,p.z-treeBase.z)<9.5;
  }

  function setGaze(value){
    if(value&&!gazing)plants.observeTree();
    gazing=value;
    gazeButton.textContent=value?"继续探索":"仰望";
    gazeButton.setAttribute("aria-pressed",String(value));
    lastRender=-Infinity;
  }

  gazeButton.addEventListener("click",()=>{
    if(!active || panorama || gazeButton.disabled)return;
    if(gazing||nearTree())setGaze(!gazing);
  });

  function checkStairs(p,time,eligible){
    if(!seenStair && eligible && time>=nextStairCheck){
      nextStairCheck=time+280;
      playerPoint.set(p.x,p.y+1,p.z);
      for(const stairs of scenerySteps){
        const [from,to]=stairs.userData.stairEnds;
        stairs.localToWorld(endpointA.copy(from));
        stairs.localToWorld(endpointB.copy(to));
        stride.closestPointToPoint(playerPoint,true,closest);
        if(Math.abs(closest.y-playerPoint.y)<3.05 && closest.distanceTo(playerPoint)<7.1){
          seenStair=true;
          noteUntil=time+4400;
          break;
        }
      }
    }
    stairNote.hidden=!eligible||time>=noteUntil;
  }

  function aim(dt){
    const {yaw,pitch,distance}=panorama?wide:orbit;
    direction.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    const player=walker.player;
    if(panorama){
      target.fromArray(wide.target);
      camera.position.copy(target).addScaledVector(direction,distance*Math.max(1,.98/camera.aspect));
    }else{
      approach.lerp(probe.set(player.x,player.y+1.12,player.z),1-Math.exp(-dt*13));
      target.copy(approach);
      ray.set(target,direction);
      ray.near=.02;ray.far=distance+.22;
      hits.length=0;
      ray.intersectObjects(rocks,false,hits);
      let clear=hits.length?Math.max(.48,hits[0].distance-.36):distance;
      for(let t=.55;t<clear;t+=.34){
        probe.copy(target).addScaledVector(direction,t);
        if(plantVolumes.some(v=>probe.y>v.bottom&&probe.y<v.top&&Math.hypot(probe.x-v.x,probe.z-v.z)<v.radius+.18)){
          clear=Math.max(.48,t-.22);
          break;
        }
      }
      orbitClear=clear<orbitClear?clear:THREE.MathUtils.damp(orbitClear,clear,8,dt);
      camera.position.copy(target).addScaledVector(direction,orbitClear);
    }
    if(!panorama){
      gazeBlend=THREE.MathUtils.damp(gazeBlend,gazing?1:0,3.8,dt);
      if(gazeBlend>.001){
        const fit=Math.max(1,1.25/camera.aspect);
        treeView.set(-33,7.9,4+46*fit);
        camera.position.lerp(treeView,gazeBlend);
        target.lerp(lookAtTree,gazeBlend);
      }
    }
    camera.lookAt(target);
  }

  function setPanorama(value){
    panorama=value;
    if(value){setGaze(false);gazeBlend=0;}
    showGaze(false);
    gazeButton.classList.remove("gaze-docked");
    gazeButton.disabled=true;
    panoramaButton.textContent=value?"返回探索":"全景观察";
    panoramaButton.setAttribute("aria-pressed",String(value));
    hud.closest("#game").classList.toggle("forgotten-wide",value);
    showExit(false);
    lastRender=-Infinity;
  }
  function resize(){
    const {width,height}=canvas.getBoundingClientRect();
    if(width&&height){camera.aspect=width/height;camera.updateProjectionMatrix();}
    lastRender=-Infinity;
  }
  function enter(){
    if(active)return;
    active=true;
    revealed=false;
    walker=createWalker(s2.spawn,s2);
    const p=walker.player;
    anchor=p.y;
    approach.set(p.x,p.y+1.12,p.z);
    orbit={...forgottenView.orbit};
    wide={...forgottenView.wide};
    orbitClear=orbit.distance;
    gazeBlend=0;
    setGaze(false);
    noteUntil=nextStairCheck=0;
    avatar.root.position.set(p.x,p.y,p.z);
    avatar.root.rotation.y=orbit.yaw;
    avatar.reset();
    scene.add(avatar.root);
    oldExposure=renderer.toneMappingExposure;
    oldShadows=renderer.shadowMap.enabled;
    oldAuto=renderer.shadowMap.autoUpdate;
    oldShadowType=renderer.shadowMap.type;
    renderer.toneMappingExposure=1;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.shadowMap.needsUpdate=true;
    setPanorama(false);
    resize();
    motion.activate();
    life.activate();
    plants.activate();
    words.enter();
    music.enter();
    hud.hidden=false;
  }

  function stop(){
    if(!active)return;
    active=false;
    music.fadeOut();
    words.leave();
    speech.style.removeProperty("opacity");
    motion.deactivate();
    life.deactivate();
    plants.deactivate();
    setGaze(false);
    setPanorama(false);
    hud.hidden=true;
    renderer.shadowMap.enabled=oldShadows;
    renderer.shadowMap.autoUpdate=oldAuto;
    renderer.shadowMap.type=oldShadowType;
    renderer.toneMappingExposure=oldExposure;
  }
  function tap(x,y){
    if(panorama)return;
    const rect=canvas.getBoundingClientRect();
    pointer.set(2*(x-rect.left)/rect.width-1,1-2*(y-rect.top)/rect.height);
    ray.setFromCamera(pointer,camera);
    ray.near=0;ray.far=Infinity;
    const moon=ray.intersectObjects(avatar.touchMeshes,false)[0];
    if(!gazing && exit.near(walker.player) && hitExit(rect,pointer,ray,moon,exit.hit,"forgotten")){
      leave();
    }else if(moon && !occludes(ray,"forgotten",moon.distance))words.touch();
  }

  function step(time,elapsed,runningTime,movement,running,blocked){
    const ambientDelta=Math.min(.25,runningTime);
    clockTime+=ambientDelta;
    motion.update(runningTime,ambientDelta);
    life.advance(ambientDelta);
    const p=walker.player;
    // The first buds wait for the entrance fade, including on slow devices.
    if(!blocked)revealed=true;
    if(revealed)plants.advance(runningTime,camera,p);
    const [x,z]=blocked||panorama?[0,0]:movement;
    const strength=Math.hypot(x,z);
    if(gazing&&strength>.075)setGaze(false);
    const moving=strength>.025 || !p.grounded;
    words.advance(blocked?0:runningTime*1000,moving,panorama);
    if(!moving && !movingFrame && time-lastRender<(panorama?58:42) && !blocked)return;
    movingFrame=moving;
    const speed=(running||touch&&strength>.74)?MOVE_SPEED:MOVE_SPEED*.57;
    const dt=Math.min(.048,elapsed);
    const vx=(Math.cos(orbit.yaw)*x+Math.sin(orbit.yaw)*z)*speed;
    const vz=(-Math.sin(orbit.yaw)*x+Math.cos(orbit.yaw)*z)*speed;
    const steps=Math.max(1,Math.ceil(dt/.010));
    const beforeX=p.x,beforeZ=p.z;
    for(let i=0;i<steps;i++)walker.step(vx*dt/steps,vz*dt/steps,dt/steps);
    if(p.grounded)anchor=p.y;
    const moved=Math.hypot(p.x-beforeX,p.z-beforeZ)>.001;
    if(moved){
      const turn=Math.atan2(beforeX-p.x,beforeZ-p.z)-avatar.root.rotation.y;
      avatar.root.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*Math.min(1,13*dt);
    }
    avatar.root.position.set(p.x,p.y,p.z);
    avatar.update(dt,moved,p.grounded,p.vy,0,0,(running||touch&&strength>.74)&&moved?1:0);
    contact.position.set(p.x,anchor+.1,p.z);
    contact.material.uniforms.amount.value=.34/(1+Math.max(0,p.y-anchor)*.65);
    clock.update(clockTime);
    aim(dt);
    const exploring=!blocked&&!panorama;
    const allowed=exploring&&!gazing&&exit.near(p);
    exit.update(allowed,dt);
    const visible=showExit(allowed,exit.anchor,exit.hit,"forgotten",time);
    portalHint.disabled=!visible;
    const canGaze=exploring&&(gazing||nearTree());
    const anchored=!gazing&&showGaze(canGaze,treeBase,null,"forgotten",time);
    gazeButton.classList.toggle("gaze-docked",canGaze&&!anchored);
    gazeButton.classList.toggle("visible",canGaze);
    gazeButton.disabled=!canGaze;
    guide.hidden=!exploring||gazing||visible;
    if(!guide.hidden){
      const heading=Math.round(returnHeading(p,orbit.yaw));
      if(heading!==guideAngle){
        guideAngle=heading;
        arrow.style.transform=`rotate(${heading}deg)`;
      }
    }
    checkStairs(p,time,exploring&&!gazing);

    bubble.update(avatar.root,camera,words.time,blocked||panorama);
    if(words.current&&!speech.hidden){
      const age=words.time-words.current.start;
      speech.style.opacity=Math.min(1,age/humanTiming.fade,(words.current.duration-age)/humanTiming.fade).toFixed(3);
    }
    life.draw(camera,finalLight.distantLife);
    renderer.render(scene,camera);
    lastRender=time;
  }

  return {
    enter, stop, step, tap, resize, pauseMusic:music.pause,
    fadeMusic:music.fadeOut, releaseMusic:music.leave, restoreMusic:music.enter,
    jump(){if(!panorama){if(gazing)setGaze(false);jump(walker.player);}},
    togglePanorama(){setPanorama(!panorama);},
    look(dx,dy){
      if(gazing)return;
      const view=panorama?wide:orbit;
      view.yaw-=dx*.0054;
      view.pitch=THREE.MathUtils.clamp(view.pitch+dy*.0043,-.64,1.30);
      lastRender=-Infinity;
    },
    zoom(delta){
      if(gazing)return;
      const view=panorama?wide:orbit;
      view.distance=THREE.MathUtils.clamp(view.distance*Math.exp(delta),panorama?69:3.2,panorama?290:34);
      lastRender=-Infinity;
    },
    nearExit(){return !panorama&&!gazing&&exit.near(walker.player);},
  };
}
