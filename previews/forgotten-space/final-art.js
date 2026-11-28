
export const finalLight = {
  ambient: .56, sky: 0xdde1e8, ground: 0x746b65,
  key: 2.14, keyColor: 0xfff2e4, keyPosition: [-108,48,65],
  fill: .94, fillColor: 0xc3d0e4,
  shadow: .78, shadowRadius: 1.55,
  depth: .00495,
  distantLife: .83,
};

const finish = {
  marble: [0xd9cbb9, .84, 0],
  fracture: [0x9a8877, .96, 0],
  fissure: [0x5d5044, .96, 0],
  goldSeam: [0x98794a, .89, .07],
  gold: [0x9c8056, .87, .09],
  midnight: [0xffffff, 1, 0],
  ivory: [0xffffff, 1, 0],
  dry: [0xffffff, .91, 0],
  stem: [0xffffff, .96, 0],
  bark: [0xffffff, .91, 0],
  leaves: [0xffffff, .95, 0],
};

const marbleFunctions = `
varying vec3 artStone;
float artHash(vec2 v) {
  vec3 p=fract(vec3(v.xyx)*.1031);
  p+=dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}
float artNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(artHash(i),artHash(i+vec2(1,0)),u.x),
             mix(artHash(i+vec2(0,1)),artHash(i+vec2(1,1)),u.x),u.y);
}
vec3 artNormal(vec3 normal, vec3 view, float height) {
  vec3 dx=dFdx(view), dy=dFdy(view);
  vec3 a=cross(dy,normal), b=cross(normal,dx);
  float determinant=dot(dx,a);
  vec3 gradient=sign(determinant)*(dFdx(height)*a+dFdy(height)*b);
  return normalize(normal-clamp(gradient/max(abs(determinant),.0001),vec3(-.18),vec3(.18)));
}
`;

const grayBlue = "vec3(.73,.88,1.12)";
const luma = "dot(diffuseColor.rgb, vec3(.2126,.7152,.0722))";
const grading = {
  midnight: `diffuseColor.rgb=mix(diffuseColor.rgb, ${grayBlue}*${luma},.34)*1.22 + vec3(.004,.006,.011);`,
  ivory: `diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.08,1.0,.89)*${luma},.24)*.89;`,
  dry: `diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.16,.98,.85)*${luma},.36)*.87;`,
  stem: `diffuseColor.rgb=mix(diffuseColor.rgb,vec3(1.,1.03,1.07)*${luma},.48)*.88;`,
  leaves: `diffuseColor.rgb=mix(diffuseColor.rgb,${grayBlue}*${luma},.22)*1.24 + vec3(.003,.005,.009);`,
};

function finishMaterial(source, surface) {
  const material=source.clone();
  const [color,roughness,metalness]=finish[surface];
  if (color!==0xffffff && !(surface==="gold" && source.vertexColors)) material.color.setHex(color);
  material.roughness=roughness;
  material.metalness=metalness;
  material.customProgramCacheKey=()=>`final-colour-${surface}-${source.customProgramCacheKey()}`;
  material.onBeforeCompile=(shader,renderer)=>{
    if (!["marble","fracture"].includes(surface)) source.onBeforeCompile(shader,renderer);
    if (surface==="marble" || surface==="fracture" || surface==="bark") {
      const edge=surface==="fracture";
      const bark=surface==="bark";
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 artStone;")
        .replace("#include <begin_vertex>",`#include <begin_vertex>
          artStone = ${bark?"position":"(modelMatrix*vec4(position,1.)).xyz"};`);
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\n"+marbleFunctions)
        .replace("#include <color_fragment>",`
          #include <color_fragment>
          vec2 stoneUV=vec2(artStone.x+.67*artStone.y,artStone.z-.43*artStone.y);
          float mottled=artNoise(stoneUV*${bark?".38":".19"});
          float chalk=artNoise(stoneUV*.61+vec2(12.3,-4.9));
          float phase=.54*stoneUV.x+.30*stoneUV.y+9.4*mottled+2.2*chalk;
          float lineAA=clamp(fwidth(phase)*.82,.008,.42);
          float thread=1.-smoothstep(.030,.12+lineAA,abs(sin(phase)));
          float seamVein=(1.-smoothstep(.065,.29+lineAA,abs(sin(phase*.55+2.4*chalk))))
            *smoothstep(.27,.73,chalk+.13*mottled);
          float fine=artNoise(stoneUV*3.8+vec2(2.6,9.1));
          float relief=(fine-.5)*${edge?".043":".015"}-.008*thread;
          float polish=smoothstep(.28,.77,mottled+.24*chalk);
          diffuseColor.rgb *= .91+.15*mottled+.083*chalk+(fine-.5)*${edge?".16":".073"};
          diffuseColor.rgb *= vec3(1.0)-(${edge?".14":bark?".046":".074"}*thread+.077*seamVein)*
            vec3(.90,1.02,1.12)*mix(1.,.47,polish);
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),
            .14*smoothstep(42.,160.,vViewPosition.z));
        `)
        .replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
          roughnessFactor=mix(roughnessFactor,${edge?".91":".64"},polish*${edge?".28":".52"});`)
        .replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
          normal=artNormal(normal,-vViewPosition,relief*(1.-smoothstep(14.,38.,vViewPosition.z)));`);
    } else if(surface==="fissure" || surface==="goldSeam") {
      shader.vertexShader=shader.vertexShader.replace("#include <common>","#include <common>\nvarying vec2 fissureUV;")
        .replace("#include <begin_vertex>","#include <begin_vertex>\nfissureUV=uv;");
      shader.fragmentShader=shader.fragmentShader.replace("#include <common>","#include <common>\nvarying vec2 fissureUV;")
        .replace("#include <color_fragment>",`
          #include <color_fragment>
          float span=2.*fissureUV.x-1.;
          float bank=abs(span+.065*sin(13.5*fissureUV.y))+.035*sin(57.*fissureUV.y);
          float lip=smoothstep(.42,.98,bank);
          diffuseColor.rgb=mix(diffuseColor.rgb*(.85+.22*span),vec3(.44,.371,.293),lip);
          diffuseColor.a *= 1.-smoothstep(.84,1.03,bank);
        `);
    } else if(grading[surface]) {
      const insert = surface==="midnight"
        ? `#include <normal_fragment_maps>
          float rim=pow(1.-clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.),2.3);
          diffuseColor.rgb+=vec3(.013,.019,.029)*rim;` : "#include <normal_fragment_maps>";
      shader.fragmentShader=shader.fragmentShader.replace("#include <color_fragment>",
        "#include <color_fragment>\n"+grading[surface])
        .replace("#include <normal_fragment_maps>",insert);
    }
  };
  if (surface==="fissure"||surface==="goldSeam") {
    material.transparent=true;
    material.depthWrite=false;
    material.forceSinglePass=true;
  }
  return material;
}

export function finishRoseMesh(mesh) {
  const surface=mesh.material.userData.artSurface;
  if(surface)mesh.material=finishMaterial(mesh.material,surface);
}

export function createFinalArt(world, planting, growth) {
  const matches=[];
  const cached=new Map();
  const geology=new Set(["marble","fracture","fissure","gold","goldSeam"]);
  function add(mesh, tag, filter = () => true) {
    if(!mesh.isMesh)return;
    const original=mesh.material;
    const materials=Array.isArray(original)?original:[original];
    const polished=materials.map(source=>{
      let kind=tag ?? source.userData.artSurface;
      if(!kind || !filter(kind))return source;
      if(kind==="goldSeam" && !mesh.geometry.attributes.uv)kind="gold";
      if(!cached.has(source))cached.set(source,new Map());
      const alternatives=cached.get(source);
      if(!alternatives.has(kind))alternatives.set(kind,finishMaterial(source,kind));
      return alternatives.get(kind);
    });
    if(polished.some((entry,index)=>entry!==materials[index])){
      matches.push({mesh,original,polished:Array.isArray(original)?polished:polished[0]});
    }
  }
  world.traverse(mesh=>add(mesh,undefined,kind=>geology.has(kind)));
  for(const tree of planting.children.slice(0,2)){
    add(tree.children[0],"bark");
    add(tree.children[1],"leaves");
    add(tree.children[2],"gold");
  }
  for(const mesh of planting.children.slice(2)) add(mesh,undefined,kind=>!geology.has(kind));
  for(const rose of growth.children.filter(child=>child.isGroup)){
    rose.traverse(mesh=>add(mesh,undefined,kind=>!geology.has(kind)));
  }
  let enabled=false;
  return value=>{
    if(enabled===value)return;
    enabled=value;
    for(const {mesh,original,polished} of matches){
      const before=mesh.material;
      const next=value?polished:original;
      if(!Array.isArray(next))next.opacity=before.opacity;
      mesh.material=next;
    }
  };
}
