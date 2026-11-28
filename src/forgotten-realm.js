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
import { createForgottenPortal } from "./forgotten-portal.js";

export function createForgottenRealm({canvas,renderer,avatar,bubble,speech,hud,portalHint,panoramaButton,leave}) {
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0b0a09);
  scene.fog=new THREE.FogExp2(0x0b0a09,finalLight.depth);
  const camera=new THREE.PerspectiveCamera(46,1,.09,390);
  const {world,rocks,plantGroup,plantVolumes,clock,motion}=createForgottenWorld();
  scene.add(world);
  const sky=new THREE.HemisphereLight(finalLight.sky,finalLight.ground,finalLight.ambient);
  const key=new THREE.DirectionalLight(finalLight.keyColor,finalLight.key);
  key.position.set(...finalLight.keyPosition);
  key.target.position.set(7,8,1);
  key.castShadow=true;
  Object.assign(key.shadow.camera,{left:-113,right:113,top:109,bottom:-105,near:1,far:300});
  key.shadow.mapSize.set(1536,1536);
  key.shadow.bias=-.00043;
  key.shadow.normalBias=.12;
  key.shadow.radius=finalLight.shadowRadius;
  key.shadow.intensity=finalLight.shadow;
  const fill=new THREE.DirectionalLight(finalLight.fillColor,finalLight.fill);
  fill.position.set(35,22,-56);
  scene.add(sky,key,key.target,fill);

  const life=createDepartedLife(world,1.825);
  const canopy=plantGroup.children[0].children.find(mesh=>mesh.isInstancedMesh);
  const plants=createPlantLife(world,s2,getGrowthAssets(),canopy);
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
  const hitExit=createObjectTap(camera,occludes,touch?27:12);
  const showExit=createObjectTutorial(portalHint,camera,occludes);
  let active=false, panorama=false, walker, anchor, orbitClear, clockTime=0, lastRender=-Infinity;
  let oldExposure,oldShadows,oldAuto,oldShadowType, movingFrame=false;
  let orbit,wide;
  const target=new THREE.Vector3(), direction=new THREE.Vector3(), approach=new THREE.Vector3(), probe=new THREE.Vector3();

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
    camera.lookAt(target);
  }

  function setPanorama(value){
    panorama=value;
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
    walker=createWalker(s2.spawn,s2);
    const p=walker.player;
    anchor=p.y;
    approach.set(p.x,p.y+1.12,p.z);
    orbit={...forgottenView.orbit};
    wide={...forgottenView.wide};
    orbitClear=orbit.distance;
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
    music.leave();
    words.leave();
    speech.style.removeProperty("opacity");
    motion.deactivate();
    life.deactivate();
    plants.deactivate();
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
    if(exit.near(walker.player) && hitExit(rect,pointer,ray,moon,exit.hit,"forgotten")){
      leave();
    }else if(moon && !occludes(ray,"forgotten",moon.distance))words.touch();
  }

  function step(time,elapsed,runningTime,movement,running,blocked){
    clockTime+=elapsed;
    motion.update(elapsed);
    life.advance(elapsed);
    const p=walker.player;
    plants.advance(elapsed,camera,p);
    const [x,z]=blocked||panorama?[0,0]:movement;
    const strength=Math.hypot(x,z);
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
    const allowed=!blocked&&!panorama&&exit.near(p);
    exit.update(allowed,dt);
    const visible=showExit(allowed,exit.anchor,exit.hit,"forgotten",time);
    portalHint.disabled=!visible;
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
    releaseMusic:music.leave, restoreMusic:music.enter,
    jump(){if(!panorama)jump(walker.player);},
    togglePanorama(){setPanorama(!panorama);},
    look(dx,dy){
      const view=panorama?wide:orbit;
      view.yaw-=dx*.0054;
      view.pitch=THREE.MathUtils.clamp(view.pitch+dy*.0043,-.64,1.30);
      lastRender=-Infinity;
    },
    zoom(delta){
      const view=panorama?wide:orbit;
      view.distance=THREE.MathUtils.clamp(view.distance*Math.exp(delta),panorama?69:3.2,panorama?290:34);
      lastRender=-Infinity;
    },
    nearExit(){return !panorama&&exit.near(walker.player);},
  };
}
