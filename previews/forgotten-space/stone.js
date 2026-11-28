import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded } from "../../src/map.js";
import { s1, stairHeight } from "./layout.js";
import { spaceComposition } from "./composition.js";

const ivory = 0xd9cdb8, ocher = 0x8e7861;
const palette = {
  top: new THREE.MeshStandardMaterial({ color: ivory, roughness: .88 }),
  edge: new THREE.MeshStandardMaterial({ color: ocher, roughness: .98 }),
  fissure: new THREE.MeshStandardMaterial({ color: 0x332920, roughness: .97, side: THREE.DoubleSide }),
  gold: new THREE.MeshStandardMaterial({ color: 0x927347, roughness: .77, metalness: .12, side: THREE.DoubleSide }),
};
for (const [material, edge] of [[palette.top, 0], [palette.edge, 1]]) {
  material.customProgramCacheKey = () => `forgottenMarble${edge}`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 stonePoint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nstonePoint = (modelMatrix * vec4(position, 1.)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 stonePoint;")
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec3 p = stonePoint;
        float drift = sin(p.x*.42 + p.z*.29 + sin(p.z*.16)*1.8 + p.y*.82);
        float vein = abs(sin(p.x*.91 + p.z*.44 + p.y*1.15 + drift*1.4));
        float chipped = sin(p.x*13.8 + p.z*9.4) * sin(p.y*17.3 - p.z*10.8);
        float broad = sin(p.x*.17 - p.z*.21)*sin(p.y*1.31+p.z*.18);
        float age = (.5 + .5 * broad) * (.026 + .048 * drift * drift);
        diffuseColor.rgb *= 1. - age - (1. - smoothstep(.02,.29,vein)) * ${edge ? ".16" : ".076"}
          + chipped * ${edge ? ".081" : ".02"};
      `);
  };
}

const classical = {
  ...palette,
  top: new THREE.MeshStandardMaterial({ color: 0xd5c7b2, roughness: .91 }),
  edge: new THREE.MeshStandardMaterial({ color: 0xa49888, roughness: .98 }),
  fissure: new THREE.MeshStandardMaterial({ color: 0x5d5246, roughness: .98, side: THREE.DoubleSide }),
};
export const clockStone = [classical.top, classical.edge];
for (const [material,surface] of [[classical.top,"marble"],[classical.edge,"fracture"],
  [classical.fissure,"fissure"],[classical.gold,"goldSeam"]]) material.userData.artSurface=surface;
for (const [material, broken] of [[classical.top, false], [classical.edge, true]]) {
  material.customProgramCacheKey = () => `agedStone${broken}`;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 cliff;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ncliff = (modelMatrix * vec4(position, 1.)).xyz;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `
      #include <common>
      varying vec3 cliff;
      float stoneHash(vec3 p){
        p=fract(p*.1031);
        p+=dot(p,p.yzx+33.33);
        return fract((p.x+p.y)*p.z);
      }
      float stoneGrain(vec3 p){
        vec3 i=floor(p), f=fract(p);
        f=f*f*(3.-2.*f);
        return mix(mix(mix(stoneHash(i),stoneHash(i+vec3(1,0,0)),f.x),
                       mix(stoneHash(i+vec3(0,1,0)),stoneHash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(stoneHash(i+vec3(0,0,1)),stoneHash(i+vec3(1,0,1)),f.x),
                       mix(stoneHash(i+vec3(0,1,1)),stoneHash(i+vec3(1)),f.x),f.y),f.z);
      }
    `).replace("#include <color_fragment>", `
      #include <color_fragment>
      float field=stoneGrain(cliff*.16), pores=stoneGrain(cliff*2.9);
      float stratum=stoneGrain((cliff+field*.83)*vec3(.42,1.6,.44));
      float trace=1.-smoothstep(.012,.067,abs(stratum-.52));
      diffuseColor.rgb*=.88+.20*field+(pores-.5)*${broken ? ".14" : ".076"}-trace*${broken ? ".048" : ".027"};
    `);
  };
}

function mesh(geometry, material, root, receivers = true) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = object.receiveShadow = receivers;
  root.add(object);
  return object;
}

function slabGeometry(outline, level, depth, seed, aged = false) {
  const points = outline.map(([x,z]) => new THREE.Vector2(x,z));
  if (THREE.ShapeUtils.isClockWise(points)) points.reverse();
  const random = seeded(seed);
  const centroid = points.reduce((sum, p) => sum.add(p), new THREE.Vector2()).divideScalar(points.length);
  const position = [];
  const insert = (height, scale, chipped) => {
    for (const point of points) {
      const v = point.clone().lerp(centroid, 1 - scale);
      position.push(v.x + (chipped ? (random()-.5)*(aged ? .32 : .65) : 0),
        level - height * (chipped ? .82 + random() * (aged ? .57 : .43) : 1),
        v.y + (chipped ? (random()-.5)*(aged ? .32 : .65) : 0));
    }
  };
  insert(0, 1, false);
  insert(depth * .43, .988, true);
  insert(depth, .956, true);
  const size = points.length;
  const top = THREE.ShapeUtils.triangulateShape(points, []);
  const index = top.flatMap(([a,b,c]) => [a,c,b]);
  const faces = index.length;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < size; i++) {
      const a = row * size + i, b = row * size + (i + 1) % size;
      index.push(a,b,a+size,b,b+size,a+size);
    }
  }
  for (const [a,b,c] of top) index.push(a+2*size,b+2*size,c+2*size);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex(index);
  geometry.addGroup(0, faces, 0);
  geometry.addGroup(faces, index.length - faces, 1);
  const flat = geometry.toNonIndexed();
  flat.computeVertexNormals();
  geometry.dispose();
  return flat;
}

function drawFault(root, level, points, width, gild = false, materials = palette) {
  const position = [], index = [], uv = [];
  let travel = 0;
  points.forEach(([x,z], i) => {
    const prev = points[Math.max(0,i-1)], next = points[Math.min(points.length-1,i+1)];
    const dx = next[0]-prev[0], dz = next[1]-prev[1], length = Math.hypot(dx,dz);
    const w = width * (.14 + .86 * Math.sin(Math.PI * i / (points.length-1)) ** .64) * (.64 + .36 * Math.sin(i*2.7));
    position.push(x + dz/length*w, level, z-dx/length*w, x-dz/length*w,level,z+dx/length*w);
    travel += Math.hypot(x-prev[0],z-prev[1]);
    uv.push(0,travel,1,travel);
    if (i) {
      const a = 2*i;
      index.push(a-2,a-1,a,a-1,a+1,a);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position,3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  mesh(geometry, gild ? materials.gold : materials.fissure, root, false);
}

function stairMesh(root, stair, decorative = false, materials = palette) {
  const { a, b, width } = stair;
  const count = stair.treads ?? Math.max(5, Math.ceil(Math.abs(b[1] - a[1]) / .30));
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  const yaw = Math.atan2(dx, dz);
  const treads = [];
  const start = stair.start ?? 0, end = stair.end ?? 1;
  const cuts = Array.from({ length: count + 1 }, (_, i) => THREE.MathUtils.lerp(start, end, i / count));
  if (start > .001) cuts.unshift(0);
  if (end < .999) cuts.push(1);
  for (let i = 0; i < cuts.length-1; i++) {
    if (decorative && !stair.whole && (i % 10 === 4 || i === count - 2)) continue;
    const t = (cuts[i]+cuts[i+1])*.5, height = stair.thickness ?? (decorative ? .43 : .82);
    const tread = (cuts[i+1]-cuts[i])*length;
    const level = stairHeight(stair,t) - .095;
    const skew = decorative ? Math.sin(i * 2.18) : 0;
    treads.push(
      new THREE.BoxGeometry(width - Math.abs(skew) * .38, height, tread + .043)
        .rotateY(yaw + skew * .062)
        .translate(a[0] + dx*t + skew*.20, level-height/2, a[2] + dz*t - skew*.28)
    );
  }
  const body = mergeGeometries(treads);
  treads.forEach(g => g.dispose());
  return mesh(body, materials.top, root);
}

function mobius(root, settings = null, materials = palette) {
  const position = [], underside = [], index = [], chips = [];
  const across = 10, segments = 96;
  const start = settings?.start ?? .73, end = settings?.end ?? Math.PI * 2 + .18;
  const radius = settings?.radius ?? 12.6, half = settings?.half ?? 3.3;
  const thickness = settings?.thickness ?? .42;
  const location = new THREE.Vector3(...(settings?.center ?? [-27.5, 28, -46]));
  const orientation = new THREE.Euler(...(settings?.angles ?? [0,-.37,0]));
  function form(t, v) {
    const turn = t/2 + (settings?.twistPhase ?? 0);
    const r = radius + v * Math.cos(turn);
    return new THREE.Vector3(r * Math.cos(t), r * Math.sin(t), v * Math.sin(turn))
      .applyEuler(orientation).add(location);
  }
  for (let i=0; i<=segments; i++) {
    for (let j=0; j<=across; j++) {
      const a = 2*j/across - 1;
      const u = i/segments;
      const edge = Math.sin(j * 2.88) * .043 + Math.sin(j * .81) * .064;
      const t = THREE.MathUtils.lerp(start,end,u) + edge * (settings ? 1.38 : 1) * (Math.exp(-42*u)-Math.exp(-42*(1-u)));
      const v = a * half + (.10*Math.sin(t*11+j) + .078*Math.sin(t*17)) * Math.abs(a) ** 5;
      const point = form(t,v);
      const tangent = form(t+.002,v).sub(point);
      const span = form(t,v+.002).sub(point);
      const normal = tangent.cross(span).normalize();
      position.push(...point.clone().addScaledVector(normal,thickness));
      underside.push(...point.clone().addScaledVector(normal,-thickness));
      if (i<segments && j<across) {
        const a=i*(across+1)+j, b=a+across+1;
        index.push(a,b,a+1,b,b+1,a+1);
      }
    }
  }
  const size = position.length / 3;
  const reverse = [];
  for(let i=0;i<index.length;i+=3) reverse.push(index[i]+size,index[i+2]+size,index[i+1]+size);
  function seam(a,b) { chips.push(a,a+size,b,b,a+size,b+size); }
  for(let i=0;i<segments;i++){
    seam(i*(across+1),(i+1)*(across+1));
    seam((i+1)*(across+1)+across,i*(across+1)+across);
  }
  for(let j=0;j<across;j++){
    seam(j+1,j);
    seam(segments*(across+1)+j,segments*(across+1)+j+1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute([...position,...underside],3));
  geometry.setIndex([...index,...reverse,...chips]);
  geometry.addGroup(0,index.length+reverse.length,0);
  geometry.addGroup(index.length+reverse.length,chips.length,1);
  geometry.computeVertexNormals();
  const ring = mesh(geometry,[materials.top,materials.edge],root);
  // A short irregular metallic residue close to one exposed break.
  const trace = [], traceIndex = [];
  for(let i=0;i<=14;i++){
    const u=i/14, t=start+.19+u*.31;
    const v=1.30+.25*Math.sin(i*.83)+.10*Math.sin(i*2.71);
    const w=.023+.044*Math.sin(Math.PI*u);
    for(const side of [-1,1]){
      const p=form(t,v+w*side);
      const n=form(t+.002,v+w*side).sub(p).cross(form(t,v+w*side+.002).sub(p)).normalize();
      trace.push(...p.addScaledVector(n,thickness + .015));
    }
    if(i) traceIndex.push(i*2-2,i*2-1,i*2,i*2,i*2-1,i*2+1);
  }
  const glint = new THREE.BufferGeometry();
  glint.setAttribute("position",new THREE.Float32BufferAttribute(trace,3));
  glint.setIndex(traceIndex);
  glint.computeVertexNormals();
  mesh(glint,materials.gold,root,false);
  return ring;
}

export function createStoneSpace(root, layout = s1, timeStudy = false, motionSources) {
  if (layout !== s1) return createClassicalSpace(root, layout, timeStudy, motionSources);
  const { decks, stairs } = layout;
  const obstacles = decks.map(({outline,y,depth},i) =>
    mesh(slabGeometry(outline,y,depth,8083+i),[palette.top,palette.edge],root));
  const shards = [
    [-30,-1,7,6,3,-.12,.12],[-31,-2,-5,5,4,.14,-.22],[-11,-1.1,22,6,2,.21,.12],
    [9,-1,22,6,3,-.14,-.16],[27,-2,-2,5,2.7,.08,.19],[-44,6,-31,4,3,-.32,.25],
    [-34,8,-53,7,3,.13,.22],[-9,9,-43,4,2,-.42,-.21],[54,-11,29,4,3,.15,-.19],
    [25,-12,45,5,3,.19,.26],[12,-13,24,5,3,-.31,.19],[-15,13,-20,6,3,-.24,-.09],
    [-28,21,-28,3.4,1.7,-.43,.42],[-36,17,-21,5,3,.32,-.14],[1,4,-37,7,3,.32,-.21],
    [-10,-11,-18,4,2,-.3,.52],[51,-8,18,6,2,.15,-.28],[-17,32,-50,2.5,1,.63,.21],
  ];
  for(const [i,[x,y,z,w,d,rx,rz]] of shards.entries()){
    const poly=[[-w*.60,-d*.28],[-w*.24,-d*.52],[w*.31,-d*.39],[w*.56,-d*.04],[w*.34,d*.36],[-w*.16,d*.55],[-w*.39,d*.31]];
    const slab = mesh(slabGeometry(poly,0,.52+(i%4)*.21,3190+i),[palette.top,palette.edge],root);
    slab.position.set(x,y,z); slab.rotation.set(rx,(i%5-2)*.24,rz);
  }

  for(const stair of stairs) stairMesh(root,stair);
  for(const stair of [
    {a:[-7,5,-29],b:[4,10.5,-36],width:2.9},
    {a:[-32,10.4,-39],b:[-26,17.0,-29],width:2.9},
    {a:[-2,3,-26],b:[9,9,-11],width:3.1},
    {a:[-15,14,-32],b:[-29,19,-18],width:2.6},
    {a:[19,-7,28],b:[10,-4,16],width:2.7},
    {a:[30,2,-1],b:[39,7,-13],width:3},
  ]) stairMesh(root,stair,true);

  const mainFaults = [
    [[-25,3],[-21,5],[-18,4],[-16,5.9],[-12,5],[-10,6.4],[-8,6]],
    [[-17,5],[-15,3],[-13.7,1.9],[-14,-2],[-12.1,-3.6]],
    [[-10,6.4],[-10.4,9],[-7.7,10.1],[-7.1,13],[-4,14]],
    [[9,-17],[8,-13],[10,-11],[8.3,-8],[11,-6],[10,-3.4],[14,-1.6],[15,1]],
    [[11,-6],[14,-7.5],[16,-6.6],[19,-7.4],[23,-6.6]],
    [[2,16],[4,13],[3.3,11],[7,8],[6.6,6],[8.2,3]],
  ];
  mainFaults.forEach((path,i)=>drawFault(root,.013,path,.14+(i%3)*.035));
  drawFault(root,.018,[[-17.8,4.15],[-16,5.9],[-14.8,5.60],[-13.79,5.41]],.071,true);
  drawFault(root,.018,[[8.55,-7.86],[11,-6],[10.65,-4.94]],.06,true);
  drawFault(root,10.415,[[-39,-35],[-34,-36],[-32,-38],[-29,-37.5],[-26,-41],[-21,-42]],.11);
  drawFault(root,-9.186,[[17,32],[23,31],[25,28],[31,29],[34,28],[38,30],[43,29],[49,27]],.13);

  obstacles.push(mobius(root));
  return obstacles;
}

const timeStairs = [
  { a: [-15,19,5], b: [1,23,21], width: 3.4, treads: 17, thickness: .82 },
  { a: [-43,24,-5], b: [-34,28,-19], width: 3.0, treads: 17, thickness: .72, inverted: true },
  { a: [37,37,-24], b: [52,42,-17], width: 3.1, treads: 16, thickness: .68 },
];

function edgeDetail(outline) {
  return outline.flatMap(([x,z],i) => {
    const [a,b] = outline[(i+1)%outline.length];
    const cuts = Math.max(1,Math.round(Math.hypot(a-x,b-z)/3.2));
    return Array.from({length:cuts},(_,j) => [x+(a-x)*j/cuts,z+(b-z)*j/cuts]);
  });
}

function createClassicalSpace(root, layout, timeStudy, motionSources) {
  const edge = timeStudy ? classical.edge.clone() : classical.edge;
  if (timeStudy) {
    edge.color.setHex(0xa69e90);
    edge.onBeforeCompile = classical.edge.onBeforeCompile;
    edge.customProgramCacheKey = classical.edge.customProgramCacheKey;
  }
  const materials = [classical.top, edge];
  const obstacles = [];
  for (const [i, deck] of layout.decks.entries()) {
    for (const [part, outline] of (deck.sections ?? [deck.outline]).entries()) {
      const detailed = timeStudy && (deck.id === "middle" || deck.id === "garden");
      const rim = detailed ? edgeDetail(outline) : outline;
      obstacles.push(mesh(slabGeometry(rim, deck.y, deck.depth + part * .56, 9727 + i + part * 41, true), materials, root));
    }
  }
  for (const stair of layout.stairs) obstacles.push(stairMesh(root, stair, false, classical));
  for (const stair of [...spaceComposition.unrealStairs, ...(timeStudy ? timeStairs : [])]) {
    const steps = stairMesh(root, stair, true, classical);
    if (timeStairs.includes(stair)) steps.name = "孤立景观阶";
    if (stair.inverted) {
      const level = (stair.a[1] + stair.b[1]) * .5;
      steps.scale.y = -1;
      steps.position.y = level * 2;
    }
    const studyIndex = timeStairs.indexOf(stair);
    if (motionSources && (studyIndex === 1 || studyIndex === 2)) {
      motionSources.stairs.push(steps);
    } else obstacles.push(steps);
  }
  for (const [i, [x,y,z,w,d,depth,rx,rz]] of spaceComposition.shards.entries()) {
    const random = seeded(81103 + i);
    const sides = 6 + i % 3;
    const polygon = Array.from({ length: sides }, (_, j) => {
      const angle = 2 * Math.PI * j / sides;
      const reach = .38 + random() * .30;
      return [w * Math.cos(angle) * reach, d * Math.sin(angle) * reach];
    });
    const shard = mesh(slabGeometry(polygon, 0, depth, 97321 + i, true), materials, root);
    shard.position.set(x,y,z);
    shard.rotation.set(rx, .19 * (i % 7), rz);
    if (motionSources && [1,6,9,12].includes(i)) motionSources.shards.push(shard);
    if (w > 6) obstacles.push(shard);
  }
  for (const [i, { y, w, points, gild }] of spaceComposition.faults.entries()) {
    const trace = new THREE.CatmullRomCurve3(points.map(([x,z]) => new THREE.Vector3(x,0,z)));
    const count = points.length * 7;
    const path = Array.from({ length: count + 1 }, (_, j) => {
      const p = trace.getPointAt(j/count);
      return [p.x + w*.75*Math.sin(j*2.1+i),p.z+w*.62*Math.sin(j*3.4+i)];
    });
    drawFault(root, y + (gild ? .018 : .010), path, w, gild, classical);
  }
  if (timeStudy) {
    drawFault(root,.012,[[-19,8.5],[-18.28,9.9],[-18.5,10.6],[-17.91,11.19],[-17.61,12.22]],.044,false,classical);
    drawFault(root,3.212,[[46.2,12],[45.54,12.55],[45.52,13.39],[45.20,13.77]],.037,false,classical);
  }
  const ring = timeStudy ? { ...spaceComposition.ring, half: 7.1, angles: [.69,.46,-.43], twistPhase: .91 }
    : spaceComposition.ring;
  obstacles.push(mobius(root, ring, classical));
  return obstacles;
}
