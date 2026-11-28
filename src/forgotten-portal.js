import * as THREE from "three";
import { WINTER,winterHeight } from "./winter-layout.js";
import { getGrowthAssets } from "../previews/forgotten-space/plantings.js";
import { finishRoseMesh } from "../previews/forgotten-space/final-art.js";

export const ICE_PORTAL = {x:-87,z:-41};
export const ICE_LANDING = {x:-81.1,z:-40.2,layer:WINTER};
export const REALM_EXIT = {x:-10.8,y:0,z:18.25};

function portalRose(position, ivory) {
  const {r4,r4Ivory}=getGrowthAssets();
  const root=new THREE.Group();
  root.position.set(position.x,position.y,position.z);
  const art=new THREE.Group();
  root.add(art);
  art.add(...(ivory?r4Ivory:r4).map(({geometry,material})=>new THREE.Mesh(geometry,material)));
  art.scale.set(1.24,1.28,1.24);
  art.children.forEach(finishRoseMesh);
  return {root,art};
}

function portalMark(radius, darkIce) {
  const uniforms={near:{value:0},spread:{value:1}};
  const material=new THREE.ShaderMaterial({
    uniforms,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-5,
    vertexShader:`
      varying vec2 mark;
      void main(){mark=(uv-.5)*2.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
    `,
    fragmentShader:`
      uniform float near,spread;
      varying vec2 mark;
      float cut(vec2 q,vec2 a,vec2 b){
        vec2 e=b-a;
        return length(q-a-e*clamp(dot(q-a,e)/dot(e,e),0.,1.));
      }
      void main(){
        vec2 p=mark;
        float a=atan(p.y,p.x);
        float extent=length(vec2(p.x,p.y*1.10));
        float edge=(.65+.04*sin(a*5.+.83)+.036*sin(a*9.3)+.019*sin(a*17.+.7))*spread;
        float cover=(1.-smoothstep(edge-.052,edge+.052,extent))*${darkIce?"1.":"0."};
        float split=min(cut(p,vec2(-.8,.39),vec2(-.52,.21)),cut(p,vec2(-.52,.21),vec2(-.31,.23)));
        split=min(split,min(cut(p,vec2(-.31,.23),vec2(0.)),cut(p,vec2(0.),vec2(.29,-.05))));
        split=min(split,min(cut(p,vec2(.29,-.05),vec2(.54,-.47)),cut(p,vec2(.54,-.47),vec2(.82,-.58))));
        split=min(split,min(cut(p,vec2(0.),vec2(.05,.30)),cut(p,vec2(.05,.30),vec2(.24,.61))));
        split=min(split,cut(p,vec2(-.31,.23),vec2(-.54,.51)));
        float aa=max(.0025,fwidth(split));
        float gold=(1.-smoothstep(.002,.005+aa,split))*(1.-smoothstep(.53,.95,extent));
        vec3 ink=vec3(.002,.0022,.003)*(1.+.37*smoothstep(edge-.19,edge,extent));
        vec3 seam=vec3(.265,.173,.068)*(.44+.31*near);
        gl_FragColor=vec4(mix(ink,seam,gold*(.27+.30*near)),max(cover,gold*(.32+.39*near)));
        #include <colorspace_fragment>
      }`,
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2),material);
  mesh.rotation.x=-Math.PI/2;
  mesh.position.y=.013;
  mesh.renderOrder=1;
  return {mesh,uniforms};
}

export function createForgottenPortal(ice) {
  const position=ice ? {...ICE_PORTAL,y:winterHeight(ICE_PORTAL.x,ICE_PORTAL.z)} : REALM_EXIT;
  const {root,art}=portalRose(position,!ice);
  const {mesh,uniforms}=portalMark(ice?4.9:1.65,ice);
  root.add(mesh);
  const hit=new THREE.Mesh(new THREE.SphereGeometry(1.22,10,8),new THREE.MeshBasicMaterial());
  hit.position.set(0,1.28,0);
  hit.visible=false;
  root.add(hit);
  const anchor=new THREE.Vector3(position.x,position.y+2.68,position.z);
  const petals=art.children[1];
  const base=petals.material.color.clone();
  const accent=ice?new THREE.Color(0xaebbdb):new THREE.Color(0xd7e8ff);
  let glow=0;
  return {
    root,anchor,hit,
    near(player){return player.grounded && Math.abs(player.y-position.y)<2.4 && Math.hypot(player.x-position.x,player.z-position.z)<5.8;},
    update(distanceCue,dt,expansion=0){
      glow=THREE.MathUtils.damp(glow,distanceCue?1:0,4.5,dt);
      uniforms.near.value=glow;
      uniforms.spread.value=1+expansion*.22;
      petals.material.color.copy(base).lerp(accent,ice?glow*.13:.14+glow*.12).multiplyScalar(1+glow*.14);
    },
  };
}
