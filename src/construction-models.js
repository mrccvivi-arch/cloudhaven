import * as THREE from "three";
import { CONSTRUCTION_SITES, fixedBuilt, starStones } from "./construction-sites.js";
import { seeded, terrainHeight } from "./map.js";

const pebble = new THREE.IcosahedronGeometry(1, 1);
const crystal = new THREE.OctahedronGeometry(1);
const blossom = new THREE.IcosahedronGeometry(1, 0);
const box = new THREE.BoxGeometry();
const stone = [0x929786, 0xa8ad9a, 0x777f76].map((color) => finish(color));
const moss = [finish(0x507150), finish(0x74834b), finish(0x94a45d)];
const timber = [0x9f6641, 0xb67b50, 0xb78659, 0x986548, 0xad744d].map((color) => finish(color));
const bronze = finish(0xb9a16b);
const petals = [0xffda77, 0xeaa28c, 0xffe9bb, 0xd9b8df].map((color) => finish(color));
const gold = [0xc5a051, 0xe1b554, 0xedae5b].map((color) => finish(color));

function finish(color, emissive = 0) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0, roughness: .92, flatShading: true });
}

function piece(parent, geometry, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function disk(parent, material, y, r, height, upper = 1) {
  return piece(parent, new THREE.CylinderGeometry(r * upper, r, height, 24), material, 0, y, 0, 1, 1, 1);
}

function ring(parent, material, radius, width, y) {
  const mesh = piece(parent, new THREE.RingGeometry(radius - width, radius, 36), material, 0, y, 0, 1, 1, 1);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function groundAt(site, x, z, preview) {
  return preview ? 0 : terrainHeight(site.x + x, site.z + z) - site.y;
}

function starlight(root, site, preview) {
  for (const [index, rock] of starStones(site).entries()) {
    const x = rock.x - site.x, z = rock.z - site.z;
    const y = groundAt(site, x, z, preview);
    piece(root, pebble, stone[index % 3], x, y + rock.height * .32, z,
      rock.radius, rock.height * .68, rock.radius * .91).rotation.y = index * 1.7;
    const mossY = groundAt(site, x * 1.08, z * 1.08, preview);
    piece(root, pebble, moss[index % 3], x * 1.08, mossY + .13, z * 1.08, .40, .22, .29);
  }
  const center = new THREE.Group();
  center.scale.setScalar(site.scale);
  root.add(center);
  disk(center, stone[2], .045, .54, .28);
  disk(center, stone[1], .20, .56, .14, .85);
  ring(center, bronze, .405, .026, .272);
  const glow = finish(0xf4e9cc, 0xffeabc);
  const core = piece(center, crystal, glow, 0, .62, 0, .23, .35, .23);
  core.rotation.z = -.14;
  for (const side of [-1, 1]) {
    const shard = piece(center, crystal, glow, side * .27, .43, -.03, .09, .18, .10);
    shard.rotation.z = side * -.36;
  }
  const spark = new THREE.MeshBasicMaterial({ color: 0xffedc2, transparent: true, depthWrite: false });
  const motes = Array.from({ length: 5 }, () => piece(center, crystal, spark, 0, 0, 0, .034, .049, .034));
  return (night, time) => {
    glow.emissiveIntensity = night * (.8 + .15 * Math.sin(time * 1.7));
    const flicker = Math.max(0, Math.sin(time * .87)) ** 1.5 * night;
    spark.opacity = flicker * .72;
    motes.forEach((mote, index) => {
      mote.visible = flicker > .06;
      const angle = time * .58 + index * 2.4;
      const rise = (time * .31 + index * .23) % 1;
      mote.position.set(Math.cos(angle) * (.42 + .13 * index), .38 + rise * .91, Math.sin(angle) * (.42 + .13 * index));
    });
  };
}

function woodenPlatform(root, site) {
  const deck = site.decks.at(-1);
  const base = site.base;
  const deckY = deck.y - site.y;
  const bottom = -.22;
  const foundationTop = deckY - .19;
  for (let column = 0; column < 7; column++) {
    const x = (column - 3) * base.w / 7;
    piece(root, box, stone[column % 3], x, (foundationTop + bottom) / 2, 0,
      base.w / 7 - .016, foundationTop - bottom, base.d);
  }
  for (const [index, step] of site.decks.slice(0, -1).entries()) {
    const top = step.y - site.y;
    piece(root, box, stone[index % 3], step.x - site.x, (top + bottom) / 2, step.z - site.z,
      step.w, top - bottom, step.d);
  }
  const rows = 30;
  for (let row = 0; row < rows; row++) {
    const z = (row + .5) * deck.d / rows - deck.d / 2;
    piece(root, box, timber[row % timber.length], 0, deckY - .095, z, deck.w, .19, deck.d / rows - .018);
  }
  for (const x of [-deck.w / 2 + .19, deck.w / 2 - .19]) {
    for (const z of [-deck.d / 2 + .16, deck.d / 2 - .16]) {
      piece(root, box, timber[3], x, deckY - .14, z, .23, .35, .23);
      piece(root, box, bronze, x, deckY + .004, z, .07, .018, .07);
    }
  }
}

function garden(root, site, preview) {
  const random = seeded(316);
  const clusters = [
    [-1.42, -2.78], [-2.65, -1.76], [-1.43, -.65], [-3.12, .1], [-2.53, 1.58], [-1.43, 2.88],
    [1.49, -2.64], [2.74, -1.45], [1.38, -.42], [3.08, .5], [1.45, 1.42], [2.02, 2.7],
  ];
  for (const [index, [x, z]] of clusters.entries()) {
    const y = groundAt(site, x, z, preview);
    piece(root, pebble, moss[index % 3], x, y + .08, z, .52, .22, .45);
    for (let bloom = 0; bloom < 4; bloom++) {
      const bx = x + (random() - .5) * .65, bz = z + (random() - .5) * .53;
      const by = y + .25 + random() * .16;
      piece(root, box, moss[0], bx, by - .16, bz, .028, .31, .028);
      for (let petal = 0; petal < 4; petal++) {
        const theta = petal * Math.PI / 2;
        piece(root, blossom, petals[(index + bloom) % petals.length], bx + Math.cos(theta) * .075,
          by, bz + Math.sin(theta) * .075, .075, .039, .069);
      }
      piece(root, blossom, gold[1], bx, by + .032, bz, .053, .042, .053);
    }
  }
  for (let index = 0; index < 44; index++) {
    const angle = random() * Math.PI * 2, radius = .38 + random() * 3.63;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    piece(root, crystal, gold[index % 3], x, groundAt(site, x, z, preview) + .050, z,
      .075 + random() * .05, .023, .056).rotation.y = angle;
  }
  for (const angle of [.26, .53, 2.9, 3.17, 5.16]) {
    const x = Math.cos(angle) * 3.97, z = Math.sin(angle) * 3.97;
    piece(root, pebble, stone[1], x, groundAt(site, x, z, preview) + .035, z, .17, .096, .12);
  }
}

function moonAltar(root, site, preview) {
  const pedestal = new THREE.Group();
  pedestal.scale.setScalar(site.scale);
  root.add(pedestal);
  disk(pedestal, stone[2], -.012, 1.28, .44, .98);
  disk(pedestal, stone[0], .23, 1.28, .22, .89);
  disk(pedestal, stone[1], .38, .91, .09, .95);
  const glow = finish(0xc9dae1, 0xabd9ff);
  ring(pedestal, glow, .84, .027, .428);
  const shape = new THREE.Shape();
  shape.moveTo(.22, .53);
  shape.bezierCurveTo(-.52, .69, -.76, -.22, -.30, -.49);
  shape.bezierCurveTo(.04, -.72, .46, -.49, .53, -.20);
  shape.bezierCurveTo(-.03, -.50, -.42, .16, .22, .53);
  const moon = new THREE.ExtrudeGeometry(shape, {
    depth: .11, curveSegments: 9, bevelSegments: 1, bevelSize: .032, bevelThickness: .033,
  });
  piece(pedestal, moon, glow, 0, .91, 0, 1, 1, 1).rotation.y = -.32;
  for (const x of [-1, 1]) {
    const offset = x * 1.52 * site.scale, z = .21 * site.scale;
    piece(root, pebble, moss[1], offset, groundAt(site, offset, z, preview) + .14, z, .47, .25, .45);
  }
  return (night) => { glow.emissiveIntensity = night * .69; };
}

const models = {
  "starlight-circle": starlight,
  "forest-platform": woodenPlatform,
  "golden-garden": garden,
  "moon-altar": moonAltar,
};

function marker(site) {
  const root = new THREE.Group();
  const { footprint } = site;
  const outline = footprint.w
    ? [-1, 1].flatMap((side) => [-1, 0, 1].map((end) =>
      [side * footprint.w / 2, footprint.z - site.z + end * footprint.d / 2]))
    : [0, .45, 2.05, 2.52, 4.15, 4.6].map((angle) =>
      [Math.cos(angle) * site.radius * .88, Math.sin(angle) * site.radius * .88]);
  for (const [index, [x, z]] of outline.entries()) {
    piece(root, pebble, stone[index % 3], x, groundAt(site, x, z, false) + .05, z, .24, .11, .17);
  }
  piece(root, pebble, stone[0], 0, groundAt(site, 0, 0, false) + .023, 0, .47, .12, .34);
  return root;
}

export function createConstructionModels(parent, batch) {
  const modelsById = new Map();
  const occluders = [];
  let elapsed = 0;
  const completion = ring(parent, new THREE.MeshBasicMaterial({
    color: 0xffebba, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }), 1, .045, 0);
  completion.visible = false;
  let completedAt = -Infinity;
  let completionRadius = 0;
  for (const site of CONSTRUCTION_SITES) {
    const root = new THREE.Group();
    const built = new THREE.Group();
    const update = models[site.id](built, site, false);
    if (site.decks || site.id === "golden-garden") batch(built);
    built.visible = false;
    const outline = marker(site);
    if (site.id !== "golden-garden") built.traverse((object) => {
      if (object.isMesh && !object.material.transparent) occluders.push(object);
    });
    root.position.set(site.x, site.y, site.z);
    root.add(outline, built);
    parent.add(root);
    modelsById.set(site.id, { built, outline, update });
  }
  return {
    occluders,
    sync(placements) {
      for (const [id, { built, outline }] of modelsById) {
        built.visible = fixedBuilt(placements, id);
        outline.visible = !built.visible;
      }
    },
    complete(site) {
      completedAt = elapsed;
      completionRadius = site.radius ?? site.w / 2;
      completion.position.set(site.x, (site.decks?.at(-1).y ?? site.y) + .44, site.z);
    },
    update(night, dt) {
      elapsed += dt;
      const t = (elapsed - completedAt) / 1.5;
      completion.visible = t < 1;
      if (completion.visible) {
        completion.material.opacity = .5 * Math.sin(Math.PI * Math.min(1, t + .1));
        completion.scale.setScalar(completionRadius * (.10 + .95 * t));
        completion.position.y += dt * .16;
      }
      for (const { built, update } of modelsById.values()) if (built.visible) update?.(night, elapsed);
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
  models[site.id](model, site, true);
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
    model.traverse((object) => {
      if (!object.isMesh) return;
      if (![pebble, crystal, blossom, box].includes(object.geometry)) object.geometry.dispose();
      if (![...stone, ...moss, ...timber, bronze, ...petals, ...gold].includes(object.material)) object.material.dispose();
    });
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
