import * as THREE from "three";

const { lerp, smoothstep, euclideanModulo, degToRad } = THREE.MathUtils;
const tau = Math.PI*2;
const matte = hex => new THREE.MeshStandardMaterial({ color: hex, roughness: .87, side: THREE.DoubleSide });
const ivory = matte(0xe0d2be), pale = matte(0xe9e3d9), inner = matte(0xc8bfaf), beak = matte(0xb39e85);
const paleWingPaint = [0xf1ede5, 0xe3ddd2, 0xc8bfb0].map(color => new THREE.MeshStandardMaterial({
  color, roughness:.87, side:THREE.DoubleSide, emissive:color, emissiveIntensity:.065,
}));

function fadingMaterial(source, flock = false) {
  const result = source.clone();
  result.transparent = true;
  result.depthWrite = flock;
  result.side = THREE.DoubleSide;
  result.forceSinglePass = true;
  result.customProgramCacheKey = () => flock ? "passing-white-bird" : "pale-feather-tips";
  result.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying float featherFade;")
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        featherFade = ${flock ? "(modelMatrix * vec4(position,1.)).x" : "uv.x"};
      `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float featherFade;")
      .replace("#include <opaque_fragment>", `
        diffuseColor.a *= ${flock ? "1.-smoothstep(17.,27.,abs(featherFade))" : "1.-.33*smoothstep(.60,1.,featherFade)"};
        if(diffuseColor.a < .012) discard;
        #include <opaque_fragment>
      `);
  };
  return result;
}
const translucent = fadingMaterial(pale);
const flockPaint = [ivory,inner,beak].map(material => fadingMaterial(material,true));
const paleFlockPaint = paleWingPaint.map(material => fadingMaterial(material,true));

function loft(profile, sides = 20) {
  const position = [], indices = [];
  for (const [ring,[z,y,rx,ry]] of profile.entries()) {
    for (let j=0;j<sides;j++) {
      const a=j*tau/sides;
      position.push(Math.cos(a)*rx,y+Math.sin(a)*ry,z);
      if (ring < profile.length-1) {
        const v=ring*sides+j,w=ring*sides+(j+1)%sides;
        indices.push(v,w,v+sides,w,w+sides,v+sides);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(position,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const body=loft([
  [-.85,-.035,.009,.008],[-.69,-.024,.102,.072],[-.44,-.015,.174,.142],
  [-.15,-.005,.231,.207],[.14,.012,.246,.234],[.34,.062,.188,.182],
  [.45,.130,.110,.117],[.57,.172,.126,.134],[.69,.172,.115,.107],[.79,.154,.071,.062],[.84,.150,.012,.019],
]);
const bill=loft([[.746,.142,.068,.035],[.851,.144,.051,.029],[.949,.130,.012,.008],[.973,.128,.001,.001]],12);

function panel(rows,cols,sample) {
  const position=[],uv=[],indices=[];
  for(let i=0;i<=rows;i++) for(let j=0;j<=cols;j++) {
    position.push(...sample(i/rows,j/cols)); uv.push(i/rows,j/cols);
    if(i<rows&&j<cols) {
      const a=i*(cols+1)+j,b=a+cols+1;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// Chord stations trace a curved shoulder, a swept wrist and a tapered primary edge.
const stations = [
  [0,.28,-.34,.011],[.18,.35,-.54,.036],[.43,.37,-.66,.065],
  [.60,.29,-.72,.083],[.76,.12,-.72,.10],[.91,-.13,-.65,.14],[1,-.38,-.40,.14],
];
function chord(u, index) {
  const i = stations.findIndex(row=>row[0]>u);
  if(i<0)return stations.at(-1)[index];
  const a = stations[Math.max(0,i-1)], b = stations[i];
  return lerp(a[index],b[index],(u-a[0])/(b[0]-a[0]));
}
function wingPoint(u,v,coverts,paleWing=false) {
  const lip=.010+.034*smoothstep(u,.34,.59)+.011*smoothstep(u,.79,1);
  const section = coverts ? .12+v*.55 : v;
  // Five round primary-feather tips cut into the existing trailing edge.
  const primary = (u-.34)/.66;
  const scallop = Math.sin(Math.PI*5*primary)**2;
  const quill = paleWing
    ? scallop*lerp(.105,.163,smoothstep(u,.42,.83))*smoothstep(u,.34,.42)*(1-smoothstep(u,.93,1))*section**5
    : (Math.sin(u*18*Math.PI)**2)*.050*smoothstep(u,.48,.96)*section**6;
  const edge = chord(u,2)+quill;
  const height = chord(u,3)+Math.sin(Math.PI*section)*lip-.046*section*section*u;
  const feather = coverts ? .029*Math.sin(Math.PI*v)**.7*Math.sin(Math.PI*u)**.35 : 0;
  const camber = paleWing ? .035*Math.sin(Math.PI*section)*Math.sin(Math.PI*u) : 0;
  return [u*(coverts?1.43:1.75), height+feather+camber, lerp(chord(u,1),edge,section)];
}
const wingShape=panel(28,6,(u,v)=>wingPoint(u,v,false));
const wingLayer=panel(22,5,(u,v)=>wingPoint(u,v,true));
const paleWingShape=panel(44,6,(u,v)=>wingPoint(u,v,false,true));
const paleWingLayer=panel(22,5,(u,v)=>wingPoint(u,v,true,true));
const tailShape=panel(10,16,(t,u)=>{
  const s=u*2-1, feather=.033*(Math.cos(s*6.5*Math.PI)**2)*t**5;
  return [s*(.069+t*.207),-.016+.07*t**2-.055*s*s*t,-.60-t*(.51-.131*s*s)+feather];
});

function bend(panels, root, tip, side) {
  for(const { geometry, base } of panels) {
    const positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const x=base.getX(i), y=base.getY(i), z=base.getZ(i);
      const angle = root+(tip-root)*smoothstep(x,.50,1.72)*.70;
      const cos=Math.cos(angle),sin=Math.sin(angle);
      positions.setXYZ(i,(x*cos-y*sin)*side,x*sin+y*cos,z+.065*Math.sin(angle)*smoothstep(x,.5,1.65));
    }
    positions.needsUpdate=true;
    geometry.computeVertexNormals();
  }
}

export function makeBird(style="B2",phase=0,flock=false) {
  const root=new THREE.Group();
  const paleWing=style==="B5";
  const materials=paleWing
    ? (flock?paleFlockPaint:paleWingPaint)
    : (flock?flockPaint:[style==="B1"?pale:ivory,inner,beak]);
  root.add(new THREE.Mesh(body,materials[0]),new THREE.Mesh(bill,style==="B1"?pale:materials[2]));
  const tail=new THREE.Mesh(tailShape,style==="B3"?translucent:materials[0]);
  if(paleWing) tail.scale.x=1.32;
  tail.rotation.x=.09;
  root.add(tail);
  const wings=[-1,1].map(side=>{
    const mesh=new THREE.Group();
    mesh.position.set(side*.14,.054,.015);
    root.add(mesh);
    const shape=paleWing?paleWingShape:wingShape;
    const geometry=shape.clone();
    const surface=new THREE.Mesh(geometry,style==="B3"?translucent:materials[0]);
    surface.frustumCulled=false;
    mesh.add(surface);
    const panels=[{geometry,base:shape.attributes.position}];
    if(style!=="B1"){
      const layerShape=paleWing?paleWingLayer:wingLayer;
      const layer=layerShape.clone();
      const feathers=new THREE.Mesh(layer,materials[1]);
      feathers.frustumCulled=false;
      mesh.add(feathers);
      panels.push({geometry:layer,base:layerShape.attributes.position});
    }
    return {side,panels};
  });

  function update(seconds, bank = 0) {
    const beat = 1.54 + phase*.22;
    const working = beat*3;
    const glide = 3.15 + phase*.47;
    const time = euclideanModulo(seconds+phase*1.9+.38,working+glide);
    const power = smoothstep(time,0,.48)*(1-smoothstep(time,working-.68,working+.25));
    const freq = time*tau/beat;
    const stroke = .16+power*(.57*Math.sin(freq)+.073*Math.sin(2*freq));
    const tip = .09+power*(.65*Math.sin(freq-.79)-.046);
    for(const {side,panels} of wings) bend(panels,stroke+side*bank*.12,tip,side);
    root.rotation.z=bank+.055*power*Math.sin(freq+.40);
    root.rotation.x=.065*Math.sin(freq-.3)*power-.035;
    tail.rotation.x=.09+.13*power*Math.sin(freq-.75);
    return .10*power*Math.sin(freq-.62)+.055*Math.sin(seconds*.86+phase);
  }
  update(0);
  return {root,update};
}

export const flockOffsets=[
    [0,2.86,-.26,1],[-2.35,2.33,.73,.92],[-3.72,3.78,-1.01,1.06],
    [-1.02,3.24,-2.61,.83],[1.88,3.70,-.83,.83],[-5.45,2.26,-2.04,.80],[1.18,4.66,-1.95,.95],
  ];
export function makeFlock(style="B2", high=false) {
  const root=new THREE.Group();
  const birds=flockOffsets.map((offset,i)=>{
    const bird=makeBird(style,i*.27,true);
    bird.root.scale.setScalar(offset[3]*.74);
    root.add(bird.root);
    return bird;
  });
  function update(seconds){
    const path = style==="B5"
      ? euclideanModulo(seconds*1.62+(high?49.2:32.2),76)-35
      : euclideanModulo(seconds*1.62+29.2,66)-33;
    birds.forEach((bird,i)=>{
      const [ix,iy,iz]=flockOffsets[i];
      const speedVariation=style==="B5"?1.15*Math.sin(path*tau/72+i*.8):0;
      const x=path+ix+.31*Math.sin(seconds*.52+i)+speedVariation;
      const z=iz+.54*Math.sin(path*.093+i*.21)+.25*Math.cos(seconds*.47+i);
      const bank=.15*Math.sin(seconds*.52+i*.81);
      const y=bird.update(seconds,bank);
      bird.root.position.set(x,iy+y,z);
      bird.root.rotation.y=Math.PI/2-.14*Math.cos(path*.093+i*.21);
      bird.root.visible=Math.abs(x)<29.4;
    });
  }
  if(high) root.position.set(0,20,7.2);
  update(0);
  return {root,update,focus:birds[0].root};
}
