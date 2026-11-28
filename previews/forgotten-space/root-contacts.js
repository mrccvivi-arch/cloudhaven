import * as THREE from "three";

export function rootContacts(layout,patches){
  const group=new THREE.Group();
  const shadows=[],uv=[],ribbons=[],colors=[];
  const pushShadow=(x,y,z,width,depth)=>{
    for(const [u,v] of [[0,0],[0,1],[1,1],[0,0],[1,1],[1,0]]){
      shadows.push(x+(u-.5)*width,y,z+(v-.5)*depth);
      uv.push(u,v);
    }
  };

  const rootColor=new THREE.Color(0x4f4b44), seamColor=new THREE.Color(0x615549);
  const tree=layout.treePosition;
  pushShadow(tree[0],.023,tree[1],9.2,6.5);
  pushShadow(tree[0]+.51,.025,tree[1]-.85,4.5,4.2);
  function trace(x,y,z,angle,length,width,color){
    const a=new THREE.Vector3(x,y,z),b=new THREE.Vector3(),offset=new THREE.Vector3();
    for(let step=1;step<=4;step++){
      const fraction=step/4;
      const curl=angle+Math.sin(step*.96+angle)*.32;
      b.set(x+length*fraction*Math.cos(curl),y+Math.sin(Math.PI*fraction)*.011,z+length*fraction*Math.sin(curl));
      offset.set(Math.sin(curl),0,-Math.cos(curl));
      const near=width*(1-(step-1)/4),far=width*(1-fraction);
      for(const [point,spread] of [[a,-near],[a,near],[b,far],[a,-near],[b,far],[b,-far]]){
        ribbons.push(point.x+offset.x*spread,point.y,point.z+offset.z*spread);
        colors.push(color.r,color.g,color.b);
      }
      a.copy(b);
    }
  }

  // Only the planted seams get a fine branch at the surface. They are separate
  // from the walkable meshes and share one contact and one root draw call.
  for(const site of patches){
    for(const [index,[x,z]] of site.sockets.entries()){
      if(!site.seed || index>0)continue;
      const y=site.y+.022;
      pushShadow(x,y,z,1.35,1.06);
      const angle=x*.63+z*1.75;
      trace(x,y+.013,z,angle,.47,.021,rootColor);
      trace(x,y+.012,z,angle+2.22,.36,.017,rootColor);
      trace(x,y+.011,z,angle+4.27,.54,.018,rootColor);
      trace(x+.15*Math.cos(angle),y+.005,z+.15*Math.sin(angle),angle+.58,.85,.010,seamColor);
      trace(x,y+.004,z,angle+3.5,.63,.013,seamColor);
    }
  }

  const shadowGeometry=new THREE.BufferGeometry();
  shadowGeometry.setAttribute("position",new THREE.Float32BufferAttribute(shadows,3));
  shadowGeometry.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));
  const contact=new THREE.Mesh(shadowGeometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:`varying vec2 contactUV;
      void main(){contactUV=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 contactUV;
      void main(){float d=length(contactUV);
      gl_FragColor=vec4(.098,.077,.062,.34*pow(1.-smoothstep(.02,.50,d),1.55));}`,
  }));
  const roots=new THREE.BufferGeometry();
  roots.setAttribute("position",new THREE.Float32BufferAttribute(ribbons,3));
  roots.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  group.add(contact,new THREE.Mesh(roots,new THREE.MeshBasicMaterial({
    vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.76,depthWrite:false,
  })));
  return group;
}
