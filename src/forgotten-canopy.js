import * as THREE from "three";
import { growth } from "../previews/forgotten-tree/variants.js";

export function expandForgottenCanopy(tree) {
  const source=tree.children.find(mesh=>mesh.isInstancedMesh);
  const matrix=new THREE.Matrix4(), color=new THREE.Color(), p=new THREE.Vector3();
  const living=[];
  for(let i=0;i<source.count;i++){
    source.getMatrixAt(i,matrix);
    if(growth(p.setFromMatrixPosition(matrix))>.45)living.push(i);
  }

  // Reuse the compact V4 petal vertices with two longitudinal spans. This keeps
  // the outline and avoids doubling the triangle count with the extra foliage.
  const geometry=source.geometry.clone();
  const index=[];
  for(let base=0;base<72;base+=12){
    for(const [row,next] of [[0,1],[1,3]]){
      for(let col=0;col<2;col++){
        const a=base+row*3+col,b=base+next*3+col;
        index.push(a,a+1,b,b,a+1,b+1);
      }
    }
  }
  geometry.setIndex(index);
  const count=living.length+Math.round(living.length*1.16);
  const light=new THREE.InstancedBufferAttribute(new Float32Array(count*2),2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("livingLight",light);

  const material=source.material.clone();
  material.customProgramCacheKey=()=>"forgotten-living-canopy";
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace("#include <common>",`#include <common>
      attribute vec2 livingLight;
      attribute float petalEdge;
      varying vec3 vLivingLight;`)
      .replace("#include <begin_vertex>",`#include <begin_vertex>
      vLivingLight=vec3(livingLight,petalEdge);`);
    shader.fragmentShader=shader.fragmentShader.replace("#include <common>",`#include <common>
      varying vec3 vLivingLight;`)
      .replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
      float frondRim=smoothstep(.44,1.,vLivingLight.z);
      float localLight=vLivingLight.x;
      diffuseColor.rgb*=1.+.30*localLight;
      totalEmissiveRadiance+=vec3(.019,.013,.007)*(localLight*(.42+.46*frondRim));
      totalEmissiveRadiance+=vec3(.046,.032,.015)*vLivingLight.y*frondRim;`);
  };
  const canopy=new THREE.InstancedMesh(geometry,material,count);
  canopy.castShadow=source.castShadow;canopy.receiveShadow=source.receiveShadow;
  canopy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const original=new THREE.Vector3(), step=new THREE.Vector3();
  const variation=new THREE.Matrix4();
  const pockets=[
    new THREE.Vector3(8,9,5),new THREE.Vector3(11,17,-4),new THREE.Vector3(5,23,-2),
    new THREE.Vector3(10,19,8),new THREE.Vector3(4,11,-12),
  ];
  for(let i=0;i<count;i++){
    const extra=i>=living.length;
    const slot=living[extra?((i-living.length)*151)%living.length:i];
    source.getMatrixAt(slot,matrix);
    source.getColorAt(slot,color);
    p.setFromMatrixPosition(matrix);
    if(extra){
      original.copy(p);
      const phase=i*2.39996;
      step.set(.38*Math.cos(phase),.24*Math.sin(phase*1.4),.41*Math.sin(phase));
      p.add(step);
      if(growth(p)<.7)p.copy(original).add(step.multiplyScalar(-.24));
      if(growth(p)<.45)p.copy(original);
      matrix.multiply(variation.makeRotationY(phase));
      matrix.scale(step.setScalar(.78+.15*Math.sin(phase)**2));
      matrix.setPosition(p);
    }
    canopy.setMatrixAt(i,matrix);
    const nearest=Math.min(...pockets.map(pocket=>p.distanceToSquared(pocket)));
    const warm=(1-THREE.MathUtils.smoothstep(nearest,.34,32))*(.49+.51*Math.sin(i*1.37)**2);
    canopy.setColorAt(i,color.multiplyScalar(.93+.11*Math.cos(i*.63)+.30*warm));
    light.setXY(i,warm,0);
  }
  const position=tree.children.indexOf(source);
  tree.remove(source);
  tree.add(canopy);
  tree.children.pop();
  tree.children.splice(position,0,canopy);
  return canopy;
}
