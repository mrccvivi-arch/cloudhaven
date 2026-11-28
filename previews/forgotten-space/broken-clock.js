import * as THREE from "three";

const TAU = Math.PI * 2;
export const clockRadius = 17.7;
export const clockMinutePeriod = 420;
const first = 2.25, last = TAU + .42;
const brokenRim = [[.67,.94],[.58,.83],[.67,.64],[.47,.59],[.50,.48],
  [.28,.43],[.23,.31],[.30,.17],[.51,.23],[.62,.35],[.86,.34]];
const polar = (angle, r = 1) => [r * clockRadius * Math.sin(angle), r * clockRadius * Math.cos(angle)];
const bronze = new THREE.MeshStandardMaterial({ color: 0x927347, roughness: .72, metalness: .13 });
bronze.userData.artSurface="gold";
const engraving = new THREE.MeshStandardMaterial({ color: 0x3b3028, roughness: .94, side: THREE.DoubleSide });
const seam = new THREE.MeshStandardMaterial({ color: 0x776551, roughness: .96, side: THREE.DoubleSide });

const glyphs = {
  I: { width: .42, lines: [[.21,0,.21,1,.14],[.02,0,.40,0,.08],[.02,1,.40,1,.08]] },
  V: { width: .72, lines: [[.05,1,.37,0,.14],[.37,0,.67,1,.10],[.0,1,.24,1,.07],[.51,1,.72,1,.07]] },
  X: { width: .68, lines: [[.08,1,.62,0,.15],[.62,1,.08,0,.10],[0,1,.26,1,.07],[.43,0,.68,0,.07]] },
};
const numerals = ["XII","I","II","III","IV","V","VI","VII","VIII","IX","X","XI"];

function remains(outline, x, y) {
  let hit = false;
  for (let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const [a,b] = outline[i], [c,d] = outline[j];
    if ((b>y)!==(d>y) && x < (c-a)*(y-b)/(d-b)+a) hit=!hit;
  }
  return hit;
}

function arc(start, end, steps) {
  return Array.from({ length: steps+1 }, (_, i) => {
    const a = THREE.MathUtils.lerp(start,end,i/steps);
    const roughness = .005*Math.sin(a*17)+.0025*Math.sin(a*39+.8);
    return polar(a, 1 + roughness);
  });
}

function createPlate(points, depth, materials, bevel = .12) {
  const shape = new THREE.Shape(points.map(([x,y]) => new THREE.Vector2(x,y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
  });
  geometry.translate(0,0,-depth);
  const object = new THREE.Mesh(geometry, materials);
  object.castShadow = object.receiveShadow = true;
  return object;
}

function strip(target, x1, y1, x2, y2, width, z) {
  const dx = x2-x1, dy = y2-y1;
  const length = Math.hypot(dx,dy);
  if (length < 1e-5) return;
  const a = width*.5*dy/length, b = -width*.5*dx/length;
  target.push(x1+a,y1+b,z,x1-a,y1-b,z,x2+a,y2+b,z,
    x2+a,y2+b,z,x1-a,y1-b,z,x2-a,y2-b,z);
}

function flatDetails(vertices, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry,material);
  mesh.receiveShadow = true;
  return mesh;
}

function number(target, text, x, y, size, partial = false) {
  const width = [...text].reduce((sum,c)=>sum+glyphs[c].width+.10, -.10);
  let cursor = -width*.5;
  for (const [index, c] of [...text].entries()) {
    const { lines, width } = glyphs[c];
    lines.forEach(([x1,y1,x2,y2,weight],stroke) => {
      if (partial && index > 0 && stroke % 2 === 0) return;
      const place = (m,n) => [x+(cursor+m)*size,y+(n-.5)*size];
      strip(target,...place(x1,y1),...place(x2,y2),size*weight,.137);
    });
    cursor += width+.10;
  }
}

function hand(length, width, z) {
  const outline = [[0,length],[-width*.58,length*.76],[-width*.32,length*.62],
    [-width*.33,length*.25],[-width*.72,length*.17],[-width*.43,length*.035],
    [-width*.32,-1.95],[0,-2.88],[width*.32,-1.95],[width*.43,length*.035],
    [width*.72,length*.17],[width*.33,length*.25],[width*.32,length*.62],[width*.58,length*.76]];
  const pivot = new THREE.Group();
  const needle = createPlate(outline,.20,bronze,.047);
  needle.position.z = z;
  // Static stone shadows stay baked while the two small hands rotate.
  needle.castShadow = false;
  needle.receiveShadow = false;
  pivot.add(needle);
  return pivot;
}

function debris(materials) {
  return [
    { from:.55,to:.79,inner:.79,offset:[2.7,1.6,-.21],rotation:[.12,-.19,.087],number:1 },
    { from:.93,to:1.27,inner:.60,offset:[4.25,1.0,.55],rotation:[-.17,.12,-.12],number:2 },
    { from:1.43,to:1.69,inner:.73,offset:[3.9,-.31,-.30],rotation:[.24,.12,.13],number:3 },
    { from:1.82,to:2.10,inner:.57,offset:[3.1,-2.5,.45],rotation:[-.19,-.18,-.16],number:4 },
    { from:.64,to:.75,inner:.56,offset:[1.1,2.2,-.92],rotation:[.36,.33,.21] },
  ].map(({from,to,inner,offset,rotation,number: hour},i) => {
    const pieces = new THREE.Group();
    const outline = [...arc(from,to,6).map(([x,y]) => [x*(i===4?.75:1),y*(i===4?.75:1)]),
      polar(to-.044,inner+.035), polar((to+from)*.5,inner), polar(from+.028,inner+.072)];
    pieces.add(createPlate(outline,.74+.11*(i%3),materials,.083));
    if (hour) {
      const marks = [];
      number(marks,numerals[hour],...polar((from+to)*.5,.892),1.54,true);
      pieces.add(flatDetails(marks,engraving));
    }
    pieces.position.set(...offset);
    pieces.rotation.set(...rotation);
    return pieces;
  });
}

export function createBrokenClock(materials) {
  const root = new THREE.Group();
  root.name = "破碎时钟";
  root.position.set(18,25.8,-8);
  root.rotation.set(.14,-.24,-.19);
  const outline = [...arc(first,last,70),...brokenRim.map(([angle,r]) => polar(angle,r))];
  const plate = createPlate(outline,1.44,materials);
  root.add(plate);

  const details = [], narrow = [];
  for (const [ratio,width] of [[.947,.155],[.927,.038],[.737,.082],[.717,.038]]) {
    const lo = first + .026, hi = last - .026;
    for (let i=0;i<96;i++) {
      strip(narrow,...polar(THREE.MathUtils.lerp(lo,hi,i/96),ratio),
        ...polar(THREE.MathUtils.lerp(lo,hi,(i+1)/96),ratio),width,.142);
    }
  }
  for (let i=0;i<60;i++) {
    const angle = i*TAU/60;
    const dialAngle = angle < first ? angle+TAU : angle;
    if (dialAngle < first+.046 || dialAngle > last-.046) continue;
    strip(details,...polar(angle,.773),...polar(angle,i%5===0?.803:.786),i%5===0?.123:.045,.14);
    if (i%5===0) number(details,numerals[i/5],...polar(angle,.862),1.66);
  }
  root.add(flatDetails(narrow,seam),flatDetails(details,engraving),...debris(materials));

  const cracks = [], goldTrace = [];
  const fractures = [
    [[.71,.65],[.62,.62],[.47,.52],[.35,.38],[.27,.30],[.17,.21],[.03,.17]],
    [[.36,.38],[.32,.28],[.33,.20],[.26,.14]],
    [[-.56,.81],[-.50,.69],[-.54,.59],[-.47,.51],[-.45,.41]],
    [[-.56,-.72],[-.52,-.65],[-.37,-.57],[-.36,-.46]],
  ];
  for (const [n, fracture] of fractures.entries()) {
    for (let i=1;i<fracture.length;i++){
      const [a,b] = fracture[i-1], [c,d] = fracture[i];
      const taper = 1-i/fracture.length;
      for (let k=0;k<12;k++) {
        const x=THREE.MathUtils.lerp(a,c,k/12)*clockRadius, y=THREE.MathUtils.lerp(b,d,k/12)*clockRadius;
        const u=THREE.MathUtils.lerp(a,c,(k+1)/12)*clockRadius, v=THREE.MathUtils.lerp(b,d,(k+1)/12)*clockRadius;
        if (remains(outline,x,y) && remains(outline,u,v)) {
          strip(cracks,x,y,u,v,(.047+.085*taper)*(.74+.26*Math.sin(n+i*2.1+k*.33)**2),.15);
        }
      }
      if (n === 1 && i === 2 || n === 3 && i === 1) {
        const x=(a*.4+c*.6)*clockRadius, y=(b*.4+d*.6)*clockRadius;
        if (remains(outline,x,y) && remains(outline,c*clockRadius,d*clockRadius)) {
          strip(goldTrace,x,y,c*clockRadius,d*clockRadius,.081,.156);
        }
      }
    }
  }
  root.add(flatDetails(cracks,seam),flatDetails(goldTrace,new THREE.MeshStandardMaterial({
    color: 0x927347, roughness: .78, metalness: .12, side: THREE.DoubleSide, userData:{artSurface:"gold"},
  })));

  const minute = hand(clockRadius*.83,.65,.82);
  const hour = hand(clockRadius*.58,.85,.48);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(.58,.79,1.06,20),bronze);
  pin.rotation.x = Math.PI/2;
  pin.position.z = .56;
  root.add(hour,minute,pin);

  function update(seconds) {
    const turns = seconds/clockMinutePeriod;
    minute.rotation.z = -TAU*((turns+1/6)%1);
    hour.rotation.z = -TAU*((turns/12+61/72)%1);
  }
  update(0);
  return { root, plate, minute, hour, update };
}
