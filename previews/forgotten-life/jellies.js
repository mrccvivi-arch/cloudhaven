import * as THREE from "three";

const { smoothstep, lerp } = THREE.MathUtils;
const tau=Math.PI*2;
export const bellDiameter=1.58;
const shellRadius=bellDiameter/2;

const styles = {
  J1: { shell:0xe9e3d9, core:0xbfb4a2, tentacles:5, length:.98, bellHeight:.46, waves:.025, gold:0 },
  J2: { shell:0xd7d6ce, core:0xa6a8a5, tentacles:8, length:3.17, bellHeight:.53, waves:.058, gold:0 },
  J3: { shell:0xe0d2be, core:0xb9a788, tentacles:9, length:3.22, bellHeight:.56, waves:.042, gold:1 },
  J5: { shell:0xdcd5c9, core:0xa8a095, tentacles:9, length:3.18, bellHeight:.52, waves:.038, gold:.62, soft:true },
};
const shellPaint = new Map();
const neutralLight={value:0};
export function setJellyLighting(neutral) {
  neutralLight.value=neutral?1:0;
}
function membrane(style, inner=false) {
  const key=style+(inner?"-inner":"");
  if(shellPaint.has(key)) return shellPaint.get(key);
  const model=styles[style];
  const material=new THREE.ShaderMaterial({
    uniforms:{
      tint:{value:new THREE.Color(inner?model.core:model.shell)},
      gold:{value:new THREE.Color(model.soft?0xa78d65:0x927347)},
      layer:{value:inner?0:1}, antique:{value:inner?0:model.gold},
      woven:{value:model.soft?.36:style==="J1"?.28:.84},
      soft:{value:model.soft?1:0},
      neutralLight,
    },
    side:THREE.DoubleSide,transparent:true,depthWrite:false,forceSinglePass:true,
    vertexShader:`
      varying vec2 membraneUv;
      varying vec3 norm,eye;
      void main(){
        membraneUv=uv;
        vec4 p=modelViewMatrix*vec4(position,1.);
        norm=normalize(normalMatrix*normal);eye=-p.xyz;
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader:`
      uniform vec3 tint,gold;
      uniform float layer,antique,woven,soft,neutralLight;
      varying vec2 membraneUv;
      varying vec3 norm,eye;
      void main(){
        vec3 n=normalize(norm)*(gl_FrontFacing?1.:-1.);
        float facing=abs(dot(n,normalize(eye)));
        float edge=pow(1.-facing,2.05);
        float side=.55+.34*max(0.,dot(n,normalize(vec3(-.64,.70,.40))));
        float ribs=pow(.5+.5*cos(membraneUv.x*100.531+membraneUv.y*.79),12.)
          *smoothstep(.18,.57,membraneUv.y)*(1.-smoothstep(.91,1.,membraneUv.y))*woven;
        float lip=smoothstep(.86,1.,membraneUv.y);
        float mask=smoothstep(.66,.91,.5+.5*sin(membraneUv.x*18.85+.46));
        float stain=(1.-smoothstep(.017,.060,abs(membraneUv.y-(.88+.033*sin(membraneUv.x*37.7)))))
          *mask*antique;
        vec3 color=tint*(side+.16*edge+.15*ribs);
        float opacity=mix(.15+.064*edge,.21+.26*edge+.076*lip+.10*ribs,layer);
        float milk=.5+.24*sin(membraneUv.x*18.85+membraneUv.y*7.)
          +.16*sin(membraneUv.x*31.416-membraneUv.y*9.);
        color=mix(color,tint*(.52+.44*mix(side,.77,neutralLight)+.19*milk+.04*ribs),soft);
        opacity=mix(opacity,mix(.16,.36+.12*milk+.055*edge,layer)*(1.-.64*lip),soft);
        stain*=mix(1.,smoothstep(.65,.95,sin(membraneUv.x*43.982+.9)),soft);
        color=mix(color,gold*.83,stain*.64);
        gl_FragColor=vec4(color,opacity+stain*.073);
        #include <colorspace_fragment>
      }`,
  });
  shellPaint.set(key,material);
  return material;
}

const shellTemplate=new Map();
const radians=Math.PI/2;
function bellPoint(angle, u, time, pump, style, inner) {
  const rim=u**4;
  const ripple=style.soft ? rim*(.016*Math.sin(angle*13+time*.73)+.018*Math.sin(angle*5-time*.34)) : 0;
  const radius=shellRadius*Math.sin(Math.max(.002,u)*radians)*
    (1-.172*pump*(.19+.81*rim)+style.waves*rim*Math.sin(angle*9-time*.81)+.022*rim*Math.cos(angle*5+time*.6));
  const y=style.bellHeight*Math.cos(u*radians)*(1+.27*pump)
    -.077*rim+.10*pump*rim+.034*rim*Math.cos(angle*9+time*.61)+ripple;
  return [Math.cos(angle)*radius*(inner?.65:1),y*(inner?.72:1)-(inner?.056:0),Math.sin(angle)*radius*(inner?.65:1)];
}
function bellGeometry(inner) {
  if(shellTemplate.has(inner)) return shellTemplate.get(inner).clone();
  const spokes=36, rings=inner?7:12;
  const index=[], uv=[];
  for(let i=0;i<=rings;i++)for(let j=0;j<=spokes;j++){
    uv.push(j/spokes,i/rings);
    if(i<rings&&j<spokes){
      const a=i*(spokes+1)+j,b=a+spokes+1;
      index.push(a,b,a+1,b,b+1,a+1);
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(3*uv.length/2),3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(index);
  shellTemplate.set(inner,g);
  return g.clone();
}
const lobe = new THREE.TorusGeometry(.108,.024,6,20).rotateX(Math.PI/2);
const lobePaint = new THREE.MeshStandardMaterial({color:0xc9bbae,roughness:.80,transparent:true,opacity:.56,depthWrite:false});

function trailsGeometry(count, variant) {
  const segments=18, sides=5, positions=[], index=[], colors=[];
  const hue = new THREE.Color(variant==="J5"?0xf1ede5:variant==="J3"?0xd3c4ae:0xc9c7bf);
  for(let n=0;n<count;n++){
    const base=positions.length/3;
    for(let i=0;i<=segments;i++)for(let j=0;j<sides;j++){
      positions.push(0,0,0);
      const drop=1-.42*(i/segments)**1.75;
      const light=drop*(.52+.22*Math.sin(j*tau/sides+1.6)**2);
      colors.push(hue.r*light,hue.g*light,hue.b*light);
      if(i<segments){
        const a=base+i*sides+j,b=base+i*sides+(j+1)%sides;
        index.push(a,b,a+sides,b,b+sides,a+sides);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(index);
  return {geometry,segments,sides};
}
const fiber=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.67,depthWrite:false});
const softFiber=fiber.clone();
softFiber.opacity=.85;
softFiber.forceSinglePass=true;

const armPaint=new THREE.ShaderMaterial({
  uniforms:{tint:{value:new THREE.Color(0xf1ede5)}},
  side:THREE.DoubleSide, transparent:true, depthWrite:false, forceSinglePass:true,
  vertexShader:`
    varying vec2 armUv;
    void main(){
      armUv=uv;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
    }`,
  fragmentShader:`
    uniform vec3 tint;
    varying vec2 armUv;
    void main(){
      float edge=sin(3.14159*armUv.x);
      float fold=.62+.38*sin(armUv.y*24.+armUv.x*5.);
      float alpha=edge*(.19+.23*fold)*(1.-smoothstep(.77,1.,armUv.y));
      gl_FragColor=vec4(tint*(.66+.25*fold),alpha);
      #include <colorspace_fragment>
    }`,
});

function makeOralArms() {
  const count=3, segments=22, across=4;
  const uv=[], index=[];
  for(let n=0;n<count;n++)for(let i=0;i<=segments;i++)for(let j=0;j<=across;j++){
    const a=uv.length/2, b=a+across+1;
    uv.push(j/across,i/segments);
    if(i<segments&&j<across)index.push(a,b,a+1,b,b+1,a+1);
  }
  const geometry=new THREE.BufferGeometry();
  const position=new THREE.BufferAttribute(new Float32Array(3*uv.length/2),3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position",position);
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(index);
  const mesh=new THREE.Mesh(geometry,armPaint);
  mesh.frustumCulled=false;
  mesh.renderOrder=2;
  return {
    mesh,
    update(time,round,pulse,delay){
      let index=0;
      for(let n=0;n<count;n++)for(let i=0;i<=segments;i++){
        const u=i/segments, phase=n*tau/count;
        const lag=round-u*delay;
        const curl=phase+time*.44-u*5.4;
        const reach=.098+u*.16;
        const width=(.097+n*.013)*Math.sin(Math.PI*(.13+.87*u))**.66*(.82+.18*Math.cos(curl*2));
        const x=reach*Math.cos(phase)+u*(.17*Math.sin(curl)+.12*Math.sin(lag+n));
        const z=reach*Math.sin(phase)+u*.15*Math.cos(curl+.7);
        const y=.10-.06*pulse-u*(1.53+n*.30+.065*Math.sin(lag));
        for(let j=0;j<=across;j++){
          const v=2*j/across-1;
          position.setXYZ(index++,x+v*width*Math.cos(curl),y+.025*v*Math.sin(curl),z+v*width*Math.sin(curl));
        }
      }
      position.needsUpdate=true;
    },
  };
}

export function makeJelly(variant="J2", phase=0) {
  const giant=variant==="J6";
  const paint=giant?"J5":variant;
  const style=styles[paint];
  const root=new THREE.Group();
  const shell=[false,true].map(inner=>{
    const mesh=new THREE.Mesh(bellGeometry(inner),membrane(paint,inner));
    mesh.renderOrder=inner?2:4;
    mesh.frustumCulled=false;
    root.add(mesh);
    return {geometry:mesh.geometry,inner};
  });
  const center=new THREE.Group();
  for(let i=0;i<4;i++){
    const angle=(i+.5)*tau/4;
    const mesh=new THREE.Mesh(lobe,lobePaint);
    mesh.scale.set(.85,1,1.17);
    mesh.position.set(.161*Math.cos(angle),.169,.161*Math.sin(angle));
    mesh.rotation.y=-angle;
    if(style.soft){
      mesh.scale.multiplyScalar(.73+i*.09);
      mesh.position.y+=.020*Math.sin(2*i);
      mesh.rotation.z=.14*Math.sin(3*i);
    }
    mesh.renderOrder=3;
    center.add(mesh);
  }
  root.add(center);
  const count=style.tentacles;
  const trail=trailsGeometry(count,paint);
  const mesh=new THREE.Mesh(trail.geometry,style.soft?softFiber:fiber);
  mesh.renderOrder=1;
  mesh.frustumCulled=false;
  root.add(mesh);
  const arms=style.soft?makeOralArms():null;
  if(arms)root.add(arms.mesh);
  const sides=trail.sides, segments=trail.segments;
  const pipe=trail.geometry.attributes.position;

  function update(seconds) {
    const time=seconds*(giant?.45:1)+phase*2.16;
    const beat=3.9+phase*.55;
    const round=time*tau/beat;
    const pulse=(.5-.5*Math.cos(round))**1.7;
    for(const {geometry,inner} of shell){
      const vertices=geometry.attributes.position;
      const texture=geometry.attributes.uv;
      for(let i=0;i<vertices.count;i++){
        vertices.setXYZ(i,...bellPoint(texture.getX(i)*tau,texture.getY(i),time,pulse,style,inner));
      }
      vertices.needsUpdate=true;
      geometry.computeVertexNormals();
    }
    center.scale.set(1-.09*pulse,1+.16*pulse,1-.09*pulse);
    for(let n=0;n<count;n++) {
      const angle=n*tau/count+.17*Math.sin(n*4.3);
      const central=!style.soft && (n===count-1 || n===count-3);
      const [x,y,z]=bellPoint(angle,.96,time,pulse,style,false);
      const start=central?.32:.88;
      const length=style.length*(.76+.30*Math.sin(2.21*n+.58)**2)*(central?.80:1.06);
      for(let i=0;i<=segments;i++){
        const u=i/segments;
        const lag=round-u*(giant?3.6:2.75);
        const motion=u**1.22;
        const wave=.18*Math.sin(time*.64-u*6.1+n*1.73)+.08*Math.sin(lag+n*1.14);
        const sway=motion*(.20+.105*Math.sin(n*2.02));
        const w=(central?.031:style.soft?.019:.015)*(1-.89*u);
        const rx=x*start*(1+.19*u)+motion*(wave+.16*Math.sin(time*.33+phase));
        const rz=z*start*(1+.10*u)+sway*Math.cos(time*.55-u*6.41+n*.92);
        const ry=y-.025-length*u*(.98+.050*Math.sin(lag-n*.54));
        for(let j=0;j<sides;j++){
          const theta=j*tau/sides;
          const base=(n*(segments+1)+i)*sides+j;
          pipe.setXYZ(base,rx+w*Math.cos(theta)*(central?1+.27*Math.sin(lag*2):1),ry,rz+w*Math.sin(theta));
        }
      }
    }
    pipe.needsUpdate=true;
    if(arms)arms.update(time,round,pulse,giant?3.9:3.1);
    const tilt=giant?.39:1;
    root.rotation.set(tilt*.091*Math.sin(time*.61),tilt*.11*Math.sin(time*.33+.8),tilt*.075*Math.sin(time*.43+1.7));
    return [.23*Math.sin(time*.39),.26*Math.sin(time*.49)+.14*pulse,.19*Math.cos(time*.45)];
  }
  update(0);
  return {root,update,sort(order){root.renderOrder=center.renderOrder=order;}};
}

export function makeJellyField(moonHeight, drift=false, joint=false) {
  const root=new THREE.Group();
  const layout=[
    ["J3", -3.82, 10.55, -1.46, 2.88, .27],
    ["J2", 3.36, 6.95, 1.26, 1.25, 1.8],
    ["J1", .12, 4.21, -1.13, .61, 1.02],
    ["J1", -5.28, 3.87, 1.58, .52, .65],
    ["J3", 5.78, 9.44, -2.24, .99, 2.8],
    ["J2", 1.25, 9.4, -4.75, .67, 1.32],
  ];
  const drifters=[
    ["J6", -6.1, 26.2, -5.7, 7, .34],
    ["J5", 8.1, 15.0, -.9, 2.70, 1.24],
    ["J5", 3.3, 8.6, 3.3, 1.33, .74],
    ["J5", 14.2, 10.1, -4.7, 1.24, 1.8],
    ["J5", -13.4, 13.3, 2.0, .52, 1.92],
    ["J5", -2.0, 5.3, 5.5, .65, .93],
    ["J5", 9.5, 8.7, -5.5, .61, 2.65],
  ];
  const individuals=(drift?drifters:layout).map(([variant,x,y,z,ratio,phase])=>{
    const jelly=makeJelly(variant,phase);
    const scale=ratio*moonHeight/bellDiameter;
    jelly.root.scale.setScalar(scale);
    root.add(jelly.root);
    return {jelly,origin:new THREE.Vector3(x,y-(joint&&variant==="J6"?1.6:0),z),phase,giant:variant==="J6",depth:0};
  });
  function update(seconds){
    for(const {jelly,origin,phase,giant} of individuals){
      const [dx,dy,dz]=jelly.update(seconds);
      jelly.root.position.set(origin.x+dx*(giant?3.2:1.11+phase*.24),origin.y+dy*(giant?4.5:.95),origin.z+dz);
    }
  }
  update(0);
  function sort(camera){
    for(const item of individuals){
      const p=item.jelly.root.position, matrix=camera.matrixWorldInverse.elements;
      item.depth=matrix[2]*p.x+matrix[6]*(p.y-.60*item.jelly.root.scale.y)+matrix[10]*p.z;
    }
    [...individuals].sort((a,b)=>a.depth-b.depth).forEach(({jelly},i)=>jelly.sort(i+1));
  }
  return {root,update,focus:individuals[drift?1:0].jelly.root,sort:drift?sort:undefined};
}
