import * as THREE from "three";
import { CONSTRUCTION_SITES, fixedBuilt } from "./construction-sites.js";
import { buildFacility, disposeFacilityPreview } from "./construction-architecture.js";
import { terrainHeight } from "./map.js";

const pebble = new THREE.IcosahedronGeometry(1, 1);
const markerStone = [0x929786, 0xa8ad9a, 0x777f76].map((color) =>
  new THREE.MeshStandardMaterial({ color, roughness: .92, flatShading: true }));

function addMarker(parent, site, material, x, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(pebble, material);
  mesh.position.set(x, terrainHeight(site.x + x, site.z + z) - site.y + .045, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
}

function marker(site) {
  const root = new THREE.Group();
  const { footprint } = site;
  const outline = footprint.w
    ? (footprint.parts ?? [footprint]).flatMap((part) => [-1, 1].flatMap((side) => [-1, 0, 1].map((end) =>
      [side * part.w / 2, part.z - site.z + end * part.d / 2])))
    : [0, .45, 2.05, 2.52, 4.15, 4.6].map((angle) =>
      [Math.cos(angle) * site.radius * .94, Math.sin(angle) * site.radius * .94]);
  for (const [index, [x, z]] of outline.entries()) {
    addMarker(root, site, markerStone[index % 3], x, z, .24, .11, .17);
  }
  addMarker(root, site, markerStone[0], 0, 0, .47, .12, .34);
  return root;
}

const previewTints = {
  "starlight-circle": 0xffe5ab,
  "forest-platform": 0xffefd4,
  "golden-garden": 0xffe6b8,
  "moon-altar": 0xcce4ff,
};

function createConstructionGhost(built, site) {
  const ghost = new THREE.Group();
  const tint = previewTints[site.id];
  const material = new THREE.MeshLambertMaterial({
    color: tint, emissive: tint, emissiveIntensity: .42,
    transparent: true, opacity: 0, depthWrite: false,
  });
  built.updateMatrixWorld(true);
  built.traverse((mesh) => {
    if (!mesh.isMesh || mesh.material.transparent) return;
    const preview = mesh.isInstancedMesh
      ? new THREE.InstancedMesh(mesh.geometry, material, 0)
      : new THREE.Mesh(mesh.geometry, material);
    if (mesh.isInstancedMesh) {
      preview.count = mesh.count;
      preview.instanceMatrix = mesh.instanceMatrix;
    }
    preview.matrixAutoUpdate = false;
    preview.matrix.copy(mesh.matrixWorld);
    preview.raycast = () => {};
    ghost.add(preview);
  });
  ghost.visible = false;
  return { ghost, material };
}

export function createConstructionModels(parent, batch) {
  const modelsById = new Map();
  const occluders = [];
  let elapsed = 0;
  const completion = new THREE.Mesh(new THREE.RingGeometry(.955, 1, 36), new THREE.MeshBasicMaterial({
    color: 0xffebba, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  completion.rotation.x = -Math.PI / 2;
  parent.add(completion);
  completion.visible = false;
  let completedAt = -Infinity;
  let completionRadius = 0;
  for (const site of CONSTRUCTION_SITES) {
    const root = new THREE.Group();
    const built = new THREE.Group();
    root.name = site.name;
    built.name = site.id;
    const update = buildFacility(built, site);
    batch(built);
    built.visible = false;
    const outline = marker(site);
    const { ghost, material } = createConstructionGhost(built, site);
    if (site.id !== "golden-garden") built.traverse((object) => {
      if (object.isMesh && !object.material.transparent) occluders.push(object);
    });
    root.position.set(site.x, site.y, site.z);
    root.add(outline, built, ghost);
    parent.add(root);
    modelsById.set(site.id, { site, built, outline, update, ghost, material });
  }
  return {
    occluders,
    sync(placements) {
      for (const [id, { built, outline, ghost }] of modelsById) {
        built.visible = fixedBuilt(placements, id);
        outline.visible = !built.visible;
        if (built.visible) ghost.visible = false;
      }
    },
    complete(site) {
      completedAt = elapsed;
      completionRadius = site.footprint.w ? Math.max(site.footprint.w, site.footprint.d) / 2 : site.radius;
      completion.position.set(site.x, (site.decks?.at(-1).y ?? site.y) + .44, site.z);
    },
    update(night, dt, player) {
      if (!player) {
        completion.visible = false;
        for (const { ghost } of modelsById.values()) ghost.visible = false;
        return;
      }
      elapsed += dt;
      const t = (elapsed - completedAt) / 1.5;
      completion.visible = t < 1;
      if (completion.visible) {
        completion.material.opacity = .5 * Math.sin(Math.PI * Math.min(1, t + .1));
        completion.scale.setScalar(completionRadius * (.10 + .95 * t));
        completion.position.y += dt * .16;
      }
      for (const { site, built, update, ghost, material } of modelsById.values()) {
        if (built.visible) {
          update(night);
          continue;
        }
        const distance = Math.hypot(site.x - player.x, site.z - player.z);
        ghost.visible = distance < site.range * 1.85;
        if (!ghost.visible) continue;
        const fade = 1 - THREE.MathUtils.smoothstep(distance, site.range * 1.22, site.range * 1.85);
        const breath = .235 + .035 * Math.sin(elapsed * (2 * Math.PI / 3.6));
        material.opacity = fade * breath;
      }
    },
  };
}

export function renderFacilityPreview(renderer, site, canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdbe2cf);
  scene.add(new THREE.HemisphereLight(0xfff5e0, 0x929d83, 2.25));
  const sun = new THREE.DirectionalLight(0xffeed3, 2.3);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  const model = new THREE.Group();
  buildFacility(model, site, true);
  scene.add(model);
  const aspect = canvas.width / canvas.height;
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const halfHeight = bounds.getSize(new THREE.Vector3()).length() * .37;
  const camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, .1, 50);
  camera.position.copy(center).add(new THREE.Vector3(6.8, 7, 11.6));
  camera.lookAt(center);
  const target = new THREE.WebGLRenderTarget(canvas.width, canvas.height, { colorSpace: THREE.SRGBColorSpace });
  const previous = renderer.getRenderTarget();
  const rgba = new Uint8Array(canvas.width * canvas.height * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, canvas.width, canvas.height, rgba);
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
    disposeFacilityPreview(model);
  }
  const context = canvas.getContext("2d");
  const image = context.createImageData(canvas.width, canvas.height);
  const row = canvas.width * 4;
  for (let y = 0; y < canvas.height; y++) {
    const offset = (canvas.height - 1 - y) * row;
    image.data.set(rgba.subarray(offset, offset + row), y * row);
  }
  context.putImageData(image, 0, 0);
}
