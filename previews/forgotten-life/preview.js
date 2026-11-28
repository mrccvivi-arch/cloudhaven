import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createCottonCandy } from "../../src/cotton-candy.js";
import { makeBird, makeFlock } from "./birds.js";
import { bellDiameter, makeJelly, makeJellyField, setJellyLighting } from "./jellies.js";

const canvas=document.querySelector("#preview");
const status=document.querySelector("#status");
try {
  start();
} catch (error) {
  status.hidden=false;
  status.textContent="三维预览未能启动，请在支持 WebGL 2 的浏览器中打开。";
  console.error(error);
}

function start() {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.45));
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.11;
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0b0a09);
  const camera=new THREE.PerspectiveCamera(39,1,.04,160);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;
  controls.minPolarAngle=.18;
  controls.maxPolarAngle=Math.PI*.85;
  controls.minDistance=.90;
  controls.maxDistance=100;

  const sky=new THREE.HemisphereLight(0xe1d9d0,0x726c63,1.22);
  const key=new THREE.DirectionalLight(0xffeddd,2.35);
  key.position.set(-5.7,5.2,5.9);
  const rim=new THREE.DirectionalLight(0xd6dbe3,.82);
  rim.position.set(2.0,5.7,-5.3);
  scene.add(sky,key,rim);

  const moon=createCottonCandy();
  moon.update(0,false,true,0);
  moon.root.rotation.y=2.70;
  const moonHeight=new THREE.Box3().setFromObject(moon.root).getSize(new THREE.Vector3()).y;
  scene.add(moon.root);

  const stand=new THREE.Mesh(new THREE.CylinderGeometry(1.17,1.23,.10,34),
    new THREE.MeshStandardMaterial({color:0x2c2721,roughness:.98}));
  scene.add(stand);

  const models=new Map();
  const states=[...document.querySelectorAll("[data-model]")];
  const views=[...document.querySelectorAll("[data-view]")];
  const lights=[...document.querySelectorAll("[data-light]")];
  const pause=document.querySelector("#pause");
  let model, mode="B5", view="wide", paused=false, redraw=true, fit=1;
  const previousFocus=new THREE.Vector3(), shift=new THREE.Vector3();

  function create(id) {
    if(id==="B4") return makeFlock();
    if(id==="B5-flock") return makeFlock("B5");
    if(id==="J4") return makeJellyField(moonHeight);
    if(id==="J5-field") return makeJellyField(moonHeight,true);
    if(id==="joint"){
      const root=new THREE.Group();
      const birds=makeFlock("B5",true), jellies=makeJellyField(moonHeight,true,true);
      root.add(jellies.root,birds.root);
      return {
        root,focus:jellies.focus,sort:jellies.sort,
        update(time){birds.update(time);jellies.update(time);},
      };
    }
    if(id.startsWith("B")){
      const bird=makeBird(id,.22);
      bird.root.rotation.y=-.69;
      return {
        root:bird.root,
        update(time){
          const rise=bird.update(time,.083*Math.sin(time*.77+.70));
          bird.root.position.set(.38+.15*Math.sin(time*.42),2.54+rise,.0);
          bird.root.rotation.y=-.67+.16*Math.sin(time*.48);
        },
      };
    }
    const jelly=makeJelly(id,.27);
    const giant=id==="J6";
    const high=giant?23.8:id==="J1"?2.82:4.27;
    if(giant)jelly.root.scale.setScalar(7*moonHeight/bellDiameter);
    return {
      root:jelly.root,
      update(time){
        const [x,y,z]=jelly.update(time);
          jelly.root.position.set(.38+x*(giant?3.2:1),high+y*(giant?4.5:1),z);
      },
    };
  }
  function cameraView(next){
    view=next;
    for(const button of views) button.setAttribute("aria-pressed",String(button.dataset.view===next));
    const isBird=mode.startsWith("B"), near=next==="near";
    const group=Boolean(model.focus);
    let target, offset;
    if(mode==="J6"){
      target=near?[.38,22.0,0]:[-1.6,12.8,0];
      offset=near?[5.8,3.2,23.3]:[6.6,4.8,49.0];
    } else if(group && near){
      previousFocus.copy(model.focus.position);
      target=previousFocus.toArray();
      if(!isBird)target[1]-=2.25;
      offset=isBird?[2.7,1.65,4.3]:[3.75,1.85,mode==="J4"?8.5:13.0];
    } else if(mode==="J5-field" || mode==="joint"){
      target=mode==="joint"?[1.0,13.3,-.8]:[.2,13.5,-.5];
      offset=[4.7,5.2,53.0];
    } else if(group){
      target=isBird?[mode==="B5-flock"?-1.9:-2.4,2.75,0]:[0,5.8,-.4];
      offset=isBird?[2.4,3.3,17.4]:[3.2,4.05,22.6];
    } else if(isBird){
      target=near?[.35,2.54,0]:[-.34,1.58,0];
      offset=near?[2.4,2.9,4.5]:[2.1,1.35,7.35];
    } else {
      const long=mode!=="J1";
      target=near?[.34,long?3.29:2.62,0]:[-.20,long?2.50:1.74,0];
      offset=near?[1.56,1.35,long?6.75:4.05]:[2.02,1.31,long?9.85:7.20];
    }
    controls.enableDamping=false;
    controls.update();
    controls.target.set(...target);
    camera.position.set(...offset).multiplyScalar(fit).add(controls.target);
    controls.enableDamping=true;
    controls.update();
    const showMoon=!near;
    moon.root.visible=stand.visible=showMoon;
    redraw=true;
  }

  function select(id){
    if(model)model.root.visible=false;
    mode=id;
    if(!models.has(id)){
      const study=create(id);
      scene.add(study.root);
      models.set(id,{...study,time:0});
    }
    model=models.get(id);
    model.root.visible=true;
    model.update(model.time);
    const x=id==="B4"||id==="B5-flock"?-3.2:id==="J4"?-.46:id==="J6"?-5.0:-1.92;
    moon.root.position.set(x,.045,id==="J4"||id==="J5-field"||id==="joint"?2.8:1.42);
    stand.position.set(moon.root.position.x,-.024,moon.root.position.z);
    for(const button of states)button.setAttribute("aria-pressed",String(button.dataset.model===id));
    cameraView("wide");
  }
  states.forEach(button=>button.addEventListener("click",()=>select(button.dataset.model)));
  views.forEach(button=>button.addEventListener("click",()=>cameraView(button.dataset.view)));
  lights.forEach(button=>button.addEventListener("click",()=>{
    const direct=button.dataset.light==="classical";
    setJellyLighting(!direct);
    sky.color.setHex(direct?0xe1d9d0:0xe3e7ed);
    sky.intensity=direct?1.22:1.66;
    key.intensity=direct?2.35:1.84;
    key.color.setHex(direct?0xffeddd:0xf2f4f6);
    key.position.set(...(direct?[-5.7,5.2,5.9]:[-4.2,5.6,4.1]));
    rim.intensity=direct?.82:.93;
    lights.forEach(candidate=>candidate.setAttribute("aria-pressed",String(candidate===button)));
    redraw=true;
  }));
  document.querySelector("#reset").addEventListener("click",()=>cameraView("wide"));
  pause.addEventListener("click",()=>{
    paused=!paused;
    pause.setAttribute("aria-pressed",String(paused));
    pause.textContent=paused?"继续动画":"暂停动画";
    redraw=true;
  });
  controls.addEventListener("change",()=>{redraw=true;});
  function resize(){
    const {width,height}=canvas.getBoundingClientRect();
    if(!width||!height)return;
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    const nextFit=Math.max(1,1.10/camera.aspect);
    if(model)camera.position.sub(controls.target).multiplyScalar(nextFit/fit).add(controls.target);
    fit=nextFit;
    camera.updateProjectionMatrix();
    redraw=true;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  select(mode);

  let previous;
  document.addEventListener("visibilitychange",()=>{previous=undefined;redraw=true;});
  renderer.setAnimationLoop(now=>{
    if(document.hidden)return;
    const dt=Math.min(.06,(now-(previous??now))/1000);
    previous=now;
    if(!paused){
      model.time+=dt;
      model.update(model.time);
      if(view==="near"&&model.focus&&model.focus.visible){
        shift.copy(model.focus.position).sub(previousFocus);
        if(shift.lengthSq()<2.5){
          camera.position.add(shift);
          controls.target.add(shift);
        } else {
          cameraView("near");
        }
        previousFocus.copy(model.focus.position);
      }
      redraw=true;
    }
    controls.update();
    if(!redraw)return;
    redraw=false;
    if(model.sort){
      camera.updateMatrixWorld();
      model.sort(camera);
    }
    renderer.render(scene,camera);
  });
}
