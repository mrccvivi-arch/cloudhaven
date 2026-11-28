import * as THREE from "three";
import { createTreeVersions } from "../forgotten-tree/variants.js";
import { createRoseStudies } from "../forgotten-roses/roses.js";
import { s1 } from "./layout.js";

function gardenDetail(source) {
  // The rose study uses a 15-by-15 vertex grid for every petal. Sample every
  // second vertex for smaller garden specimens and keep its original normals and UVs.
  const row = 15;
  const patch = row * row;
  const count = source.attributes.position.count / patch;
  if (!Number.isInteger(count) || source.index.count !== count * 14 * 14 * 6) return source;
  const samples = [], index = [];
  for (let p = 0; p < count; p++) {
    for (let y = 0; y < row; y += 2) {
      for (let x = 0; x < row; x += 2) {
        const at = samples.length;
        samples.push(p * patch + y * row + x);
        if (x < 14 && y < 14) index.push(at, at + 1, at + 8, at + 1, at + 9, at + 8);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = new Float32Array(samples.length * attribute.itemSize);
    for (let i = 0; i < samples.length; i++) {
      for (let j = 0; j < attribute.itemSize; j++) values[i * attribute.itemSize + j] = attribute.getComponent(samples[i], j);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  geometry.setIndex(index);
  return geometry;
}

let treeAsset, roseAssets;
const reduced = new WeakMap();

export function placePlantings(root, layout = s1, motionSources) {
  const {roses} = prepareRoseAssets();
  treeAsset ??= createTreeVersions()[4];
  const { treePosition } = layout;
  const expanded = layout !== s1;
  const cameraVolumes = [];
  const tree = treeAsset.clone();
  tree.position.set(treePosition[0], -.17, treePosition[1]);
  root.add(tree);
  cameraVolumes.push({ x: treePosition[0], z: treePosition[1], bottom: -.3, top: 13, radius: 1.8 });

  const invertedTree = tree.clone();
  const inverted = expanded ? [4, 14.8, -49] : [-34, 7.8, -43];
  invertedTree.position.set(...inverted);
  invertedTree.rotation.z = Math.PI + .11;
  invertedTree.rotation.y = -.62;
  invertedTree.scale.setScalar(.69);
  root.add(invertedTree);
  cameraVolumes.push({ x: inverted[0], z: inverted[2], bottom: inverted[1] - 13, top: inverted[1] + .2, radius: 1.31 });

  const open = roses[7], dying = roses[5], oilGarden = roses[8];
  const batches = new Map();
  const pose = new THREE.Object3D();
  const sourcePose = new THREE.Matrix4();
  const sourceScale = new THREE.Vector3();
  const point = new THREE.Vector3();
  if (motionSources) {
    motionSources.bluePetal = open.children[1];
    motionSources.ivoryMaterial = oilGarden.children.find(mesh =>
      mesh.material.map && mesh.material.vertexColors && mesh.geometry.attributes.position.count === 23 * 225)?.material;
  }

  function recordBloom(mesh, matrix, giant = false) {
    if (!motionSources) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const origin = mesh.geometry.boundingBox.getCenter(point).clone().applyMatrix4(matrix);
    const ivory = Boolean(mesh.material.map && mesh.material.vertexColors && mesh.geometry.attributes.position.count === 23 * 225);
    motionSources.blooms.push({ origin, giant, ivory });
  }
  function batch(source, matrix, simplified = false) {
    if (simplified && !reduced.has(source.geometry)) reduced.set(source.geometry, gardenDetail(source.geometry));
    const key = simplified ? reduced.get(source.geometry) : source.geometry;
    if (!batches.has(key)) batches.set(key, { geometry: key, material: source.material, matrices: [] });
    batches.get(key).matrices.push(matrix);
  }
  function individual(model, position, rotation, scale) {
    pose.position.set(...position);
    pose.rotation.set(...rotation);
    pose.scale.setScalar(scale);
    pose.updateMatrix();
    for (const mesh of model.children) batch(mesh, pose.matrix.clone());
    recordBloom(model.children[1], pose.matrix, scale > 4);
  }
  function bank(x,y,z,angle,scale,keep = 1) {
    pose.position.set(x,y,z);
    pose.rotation.set(0,angle,0);
    pose.scale.setScalar(scale);
    pose.updateMatrix();
    for (const mesh of oilGarden.children) {
      for (let i=0;i<mesh.count;i++) {
        mesh.getMatrixAt(i,sourcePose);
        sourceScale.setFromMatrixScale(sourcePose);
        if (sourceScale.y > 4 || (keep < 1 && (i * .618) % 1 > keep)) continue;
        const placement = sourcePose.clone().premultiply(pose.matrix);
        batch(mesh, placement, true);
        if (motionSources && mesh.material.map && mesh.geometry.attributes.position.count >= 16 * 225 &&
            i % 3 === 1) recordBloom(mesh, placement);
      }
    }
  }
  if (expanded) {
    bank(37,3.2,-11,-.33,1.65);
    bank(59,3.2,-11,.89,1.75);
    bank(36,3.2,4,1.43,1.28);
    bank(61,3.2,8,-.72,1.62);
    bank(48,3.2,1,.38,1.58,.71);
    bank(56,3.2,15,1.27,1.28,.62);
    bank(-35,0,-8,-.82,1.22,.53);
    bank(-4,0,20,.54,1.47,.67);
    bank(-12,18,-54,.96,1.30,.59);
    bank(-6,-18,65,.84,1.46,.69);
    bank(29,-18,68,-.15,1.51,.80);

    individual(open,[37.9,3.2,-13.3],[.11,.43,-.23],5.68);
    individual(open,[66.4,3.2,11.2],[.15,-.31,.31],5.88);
    individual(open,[13,-18,53],[-.26,-.71,-.30],5.85);
    individual(open,[58, -.7, -9],[.28,.69,Math.PI-.19],4.99);
    individual(open,[-6,18,-56],[-.25,1.15,.32],2.06);
    individual(open,[-4,0,25],[.25,-.65,.22],2.15);
    individual(dying,[31,3.2,3],[.12,1.64,-.16],1.35);
    individual(dying,[18,-18,71],[.18,.44,-.17],1.82);
    individual(dying,[27,-18,56],[.10,-.82,.18],1.31);
    individual(dying,[-37,18,-48],[.08,.78,.12],1.21);
    cameraVolumes.push(
      { x: 39.8,z:-11.9,bottom:10,top:15.1,radius:2.6 },
      { x: 63.6,z:12,bottom:11,top:15.5,radius:2.8 },
      { x: 16,z:51,bottom:-11,top:-6,radius:2.85 },
      { x: 57,z:-9,bottom:-10.6,top:-6.4,radius:2.6 },
    );
  } else {
    bank(8,0,-5,-.31,1.52);
    bank(16,0,-2,.91,1.46);
    bank(9,0,5,-.89,1.19,.62);
    bank(-28,10.4,-40,.81,.97,.55);
    bank(29,-9.2,29,1.08,1.20,.68);
    bank(41,-9.2,24,-.56,1.05,.62);

    individual(open,[16.7,0,-9.3],[.21,.62,-.23],5.45);
    individual(open,[31.6,-9.2,24],[-.29,-.51,.39],5.13);
    individual(open,[-23.9,8.1,-35],[.12,1.2,Math.PI-.38],4.93);
    individual(open,[-8,0,-12],[-.19,-1,.13],1.98);
    individual(dying,[-30,10.4,-35],[0,.8,.04],1.25);
    individual(dying,[23,-9.2,29],[.1,1.71,.12],1.65);
    individual(dying,[35,-9.2,31],[.15,-.76,-.12],1.44);
    individual(dying,[5,0,10],[.07,-1.02,.03],.96);
    individual(dying,[-19,0,10],[.03,.77,-.04],1.17);

    cameraVolumes.push(
      { x: 18.7,z:-7.4,bottom:6.2,top:11.6,radius:2.55 },
      { x: 28.7,z:21.9,bottom:-3.8,top:1.4,radius:2.50 },
      { x: -24.5,z:-35,bottom:-1.8,top:2.5,radius:2.40 },
    );
  }
  // Instance across all tiers by geometry and material from the original studies.
  for (const { geometry, material, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((matrix,index)=>mesh.setMatrixAt(index,matrix));
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
  }
  return cameraVolumes;
}

function prepareRoseAssets() {
  if (!roseAssets) {
    const growth = {};
    roseAssets = {roses:createRoseStudies(growth),growth};
  }
  return roseAssets;
}

export function getGrowthAssets() {
  return prepareRoseAssets().growth;
}
