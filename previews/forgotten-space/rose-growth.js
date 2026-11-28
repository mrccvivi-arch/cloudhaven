import * as THREE from "three";

const crown = new THREE.Vector3(.06,1.52,-.02);
const stems = 18*8, leafCluster = 4*6+11*9;
const wiltCrown = new THREE.Vector3(.50,1.17,.24);

// The studies merge their petal grids in tier order. These masks match the
// existing bud and wilt omissions so surviving petals can share exact targets.
const tierCounts = [4,5,6,8];
function petalMap(keep) {
  let next = 0;
  return tierCounts.flatMap((count,tier) => Array.from({length:count},(_,i) =>
    keep(tier,i) ? next++ : -1));
}
const budMap = petalMap((tier,i) => tier !== 3 || i%2 === 0);
const wiltMap = petalMap((tier,i) => tier === 3 ? [2,3,5].includes(i) : tier !== 2 || ![0,4].includes(i));

function target(source, sample) {
  const position = new THREE.BufferAttribute(new Float32Array(source.count*3),3);
  const point = new THREE.Vector3();
  for (let i=0;i<source.count;i++) {
    sample(i,point.fromBufferAttribute(source,i));
    position.setXYZ(i,point.x,point.y,point.z);
  }
  return position;
}

function morphGeometry(geometry, ...positions) {
  const copy = new THREE.BufferGeometry();
  copy.setIndex(geometry.index);
  for (const [name,attribute] of Object.entries(geometry.attributes)) copy.setAttribute(name,attribute);
  copy.morphAttributes.position = positions;
  copy.morphAttributes.normal = positions.map(position => {
    const posed = new THREE.BufferGeometry();
    posed.setIndex(geometry.index).setAttribute("position",position);
    posed.computeVertexNormals();
    return posed.attributes.normal;
  });
  return copy;
}

export function prepareRoseGrowth(assets, layered=false) {
  const open = assets.r4[1].geometry.attributes.position;
  const bud = assets.r4Bud[1].geometry.attributes.position;
  const wilt = assets.r4Wilt[1].geometry.attributes.position;
  const grid = (assets.petalSegments+1)**2;
  const closed = target(open,(i,p)=>{
    const petal = budMap[Math.floor(i/grid)];
    if (petal < 0) p.copy(crown);
    else p.fromBufferAttribute(bud,petal*grid+i%grid);
  });
  const openingWeight = [.91,.73,.38,.13];
  const closedPosition = new THREE.Vector3();
  const halfway = layered ? target(open,(i,p)=>{
    const petal=Math.floor(i/grid);
    const tier=petal<4?0:petal<9?1:petal<15?2:3;
    p.lerp(closedPosition.fromBufferAttribute(closed,i),1-openingWeight[tier]);
  }) : null;
  const spent = target(open,(i,p)=>{
    const petal = wiltMap[Math.floor(i/grid)];
    if (petal < 0) p.copy(wiltCrown);
    else p.fromBufferAttribute(wilt,petal*grid+i%grid);
  });

  const green = assets.r4[0].geometry;
  const dry = assets.r4Wilt[0].geometry.attributes.position;
  const youngStem = target(green.attributes.position,(i,p)=>{
    if(i<stems || i>=stems+3*leafCluster)return;
    const anchor = stems+Math.floor((i-stems)/leafCluster)*leafCluster;
    const x=green.attributes.position.getX(anchor), z=green.attributes.position.getZ(anchor);
    p.x=x+.14*(p.x-x);
    p.z=z+.14*(p.z-z);
    p.y-=.13;
  });
  const dryStem = target(green.attributes.position,(i,p)=>{
    if(i>=stems+2*leafCluster && i<stems+3*leafCluster)
      p.set(dry.getX(stems+leafCluster),dry.getY(stems+leafCluster)+.23,dry.getZ(stems+leafCluster));
    else p.fromBufferAttribute(dry,i>=stems+3*leafCluster?i-leafCluster:i);
  });

  const foil = assets.r4[2].geometry;
  const foilPoint = new THREE.Vector3();
  const matches = Array.from({length:foil.attributes.position.count},(_,i)=>{
    foilPoint.fromBufferAttribute(foil.attributes.position,i);
    let nearest=0,distance=Infinity;
    const p=new THREE.Vector3();
    for(let j=0;j<open.count;j++){
      const gap=p.fromBufferAttribute(open,j).distanceToSquared(foilPoint);
      if(gap<distance){nearest=j;distance=gap;}
    }
    return nearest;
  });
  const foldedFoil=target(foil.attributes.position,(i,p)=>{
    const j=matches[i];
    if(budMap[Math.floor(j/grid)]<0)p.copy(crown);
    else p.add(foilPoint.fromBufferAttribute(closed,j)).sub(foilPoint.fromBufferAttribute(open,j));
  });
  const halfFoil=layered ? target(foil.attributes.position,(i,p)=>{
    const j=matches[i];
    p.add(foilPoint.fromBufferAttribute(halfway,j)).sub(foilPoint.fromBufferAttribute(open,j));
  }) : null;
  const petalTargets=layered?[closed,spent,halfway]:[closed,spent];
  return {
    layered,
    stem:morphGeometry(green,youngStem,dryStem),
    blue:morphGeometry(assets.r4[1].geometry,...petalTargets),
    ivory:morphGeometry(assets.r4Ivory[1].geometry,...petalTargets),
    foil:morphGeometry(foil,...(layered?[foldedFoil,halfFoil]:[foldedFoil])),
  };
}

export function createRoseGrowth(assets, geometries, ivory) {
  const root = new THREE.Group();
  const stem = new THREE.Mesh(geometries.stem,assets.r4[0].material.clone());
  const petals = new THREE.Mesh(ivory?geometries.ivory:geometries.blue,(ivory?assets.r4Ivory:assets.r4)[1].material.clone());
  const foil = new THREE.Mesh(geometries.foil,assets.r4[2].material.clone());
  const shade={value:0};
  const attachWiltTint = material => {
    material.customProgramCacheKey = () => "rose-wilt-tint";
    material.onBeforeCompile = shader => {
      shader.uniforms.wiltShade=shade;
      shader.fragmentShader="uniform float wiltShade;\n"+shader.fragmentShader.replace("#include <color_fragment>",`
        #include <color_fragment>
        float value = dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(value)*vec3(1.18,.99,.83)*.64,wiltShade);
      `);
    };
  };
  attachWiltTint(stem.material);
  attachWiltTint(petals.material);
  foil.material.transparent=true;
  foil.material.depthWrite=false;
  foil.material.forceSinglePass=true;
  root.add(stem,petals,foil);

  function pose(growth, closed, wilt) {
    const height = .06+.94*growth;
    root.scale.set(root.userData.width*(.36+.64*growth),root.userData.height*height,root.userData.width*(.36+.64*growth));
    stem.morphTargetInfluences[0]=(1-growth)*(1-wilt);
    stem.morphTargetInfluences[1]=wilt;
    const bud = geometries.layered ? Math.max(0,2*closed-1) : closed;
    petals.morphTargetInfluences[0]=bud*(1-wilt);
    petals.morphTargetInfluences[1]=wilt;
    foil.morphTargetInfluences[0]=bud;
    if(geometries.layered){
      const partial=1-Math.abs(2*closed-1);
      petals.morphTargetInfluences[2]=partial*(1-wilt);
      foil.morphTargetInfluences[1]=partial;
    }
    foil.material.opacity=(1-THREE.MathUtils.smoothstep(wilt,0,.29))*THREE.MathUtils.smoothstep(growth,.48,.95);
    foil.visible=!ivory && foil.material.opacity>.015;
    const head = .06+.94*THREE.MathUtils.smoothstep(growth,.18,.89);
    petals.visible=growth>.18;
    petals.scale.setScalar(head);
    petals.position.copy(crown).multiplyScalar(1-head);
    foil.position.copy(petals.position);
    foil.scale.copy(petals.scale);
    shade.value=wilt*.90;
  }
  return {root,pose};
}
