import * as THREE from "three";
import { snowTexture } from "../previews/snow-whale/snow.js";
import { BODY_RADIUS } from "./cotton-candy.js";
import { SNOW_GATE, WINTER_LIMIT, WINTER_TREE, winterHeight, winterWalkable } from "./winter-layout.js";

const length = 2 * BODY_RADIUS * .82;
const fallHeight = 2.05;
const hover = length * .68;
const reach = 4.35;

function allowedLanding(player, x, z) {
  if (Math.hypot(x, z) > WINTER_LIMIT - .55 ||
      Math.hypot(x - WINTER_TREE.x, z - WINTER_TREE.z) < WINTER_TREE.trunk + .95 ||
      Math.hypot(x - SNOW_GATE.x, z - SNOW_GATE.z) < 3.1) return false;
  let fromX = player.x, fromZ = player.z;
  for (let i = 1; i <= 5; i++) {
    const nextX = THREE.MathUtils.lerp(player.x, x, i / 5);
    const nextZ = THREE.MathUtils.lerp(player.z, z, i / 5);
    if (!winterWalkable(fromX, fromZ, nextX, nextZ)) return false;
    fromX = nextX;
    fromZ = nextZ;
  }
  return true;
}

export function featherLanding(player, heading, target) {
  for (const distance of [3.55, 2.65]) {
    for (const offset of [0, -.43, .43, -.93, .93, -1.55, 1.55, Math.PI]) {
      const x = player.x + Math.sin(heading + offset) * distance;
      const z = player.z + Math.cos(heading + offset) * distance;
      if (allowedLanding(player, x, z)) return target.set(x, winterHeight(x, z) + hover, z);
    }
  }
}

function bladePoint(t, side, span) {
  const width = Math.sin(Math.PI * t) ** .78 * (side < 0 ? .137 : .165);
  return new THREE.Vector3(.19 * t * t - .085 + side * span * width,
    (t - .5) * length + span * width * .67,
    .075 * Math.sin(Math.PI * t) + span * width * (.22 - .42 * span));
}

function bladeGeometry(filaments) {
  const positions = [], colors = [], margins = [];
  const gold = new THREE.Color(), edge = new THREE.Color(0xffedc7);
  function triangle(points, spans, tint) {
    for (const [i, point] of points.entries()) {
      const span = spans[i];
      positions.push(point.x, point.y, point.z + (filaments ? .0025 : 0));
      colors.push(...gold.copy(tint).lerp(edge, .08 + span * .37));
      margins.push(span);
    }
  }
  for (const side of [-1, 1]) {
    const count = filaments ? 35 : 24;
    for (let i = 0; i < count; i++) {
      const t = .024 + i / count * .93;
      const tip = filaments ? .81 + .16 * Math.sin(i * 4.77 + side) : 1;
      const step = filaments ? .006 : .93 / count + .001;
      const tint = new THREE.Color(i % 4 === 0 ? 0xf4d8a0 : i % 3 === 0 ? 0xb78241 : 0xd3a665);
      const a = bladePoint(t, side, .015), b = bladePoint(t + step, side, .015);
      const c = bladePoint(t, side, tip), d = bladePoint(t + step * (filaments ? .26 : 1), side, tip);
      triangle([a, b, c], [.015, .015, tip], tint);
      triangle([c, b, d], [tip, .015, tip], tint);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("featherSpan", new THREE.Float32BufferAttribute(margins, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function makeFeather() {
  const root = new THREE.Group(), feather = new THREE.Group();
  root.add(feather);
  const filament = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, metalness: .10, roughness: .48,
    emissive: 0x9a6c33, emissiveIntensity: .32,
  });
  const vane = new THREE.MeshStandardMaterial({
    vertexColors: true, side: THREE.DoubleSide, metalness: .08, roughness: .58,
    emissive: 0x93632d, emissiveIntensity: .26, transparent: true, opacity: .72, depthWrite: false,
  });
  vane.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>",
      "#include <common>\nattribute float featherSpan;\nvarying float vaneSpan;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvaneSpan = featherSpan;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
      "#include <common>\nvarying float vaneSpan;")
      .replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(.24,.10,.023) * smoothstep(.68,1.,vaneSpan);`);
  };
  feather.add(new THREE.Mesh(bladeGeometry(false), vane), new THREE.Mesh(bladeGeometry(true), filament));
  const shaft = new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, i) => bladePoint(i / 11, 1, 0)));
  feather.add(new THREE.Mesh(new THREE.TubeGeometry(shaft, 18, .008, 5, false),
    new THREE.MeshStandardMaterial({ color: 0xffedc2, roughness: .48, metalness: .07, emissive: 0xae7336, emissiveIntensity: .62 })));
  const hit = new THREE.Mesh(new THREE.SphereGeometry(.48, 9, 6), new THREE.MeshBasicMaterial({ visible: false }));
  root.add(hit);

  const count = 15;
  const geometry = new THREE.BufferGeometry();
  const points = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", points);
  const moteMaterial = new THREE.PointsMaterial({
    map: snowTexture("snow"), color: 0xf2cf88, size: .052, transparent: true, depthWrite: false,
  });
  const motes = new THREE.Points(geometry, moteMaterial);
  motes.frustumCulled = false;
  root.add(motes);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff1cd";
  context.font = "46px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("♪", 32, 35);
  const noteMap = new THREE.CanvasTexture(canvas);
  noteMap.colorSpace = THREE.SRGBColorSpace;
  const notes = Array.from({ length: 4 }, () => new THREE.Sprite(new THREE.SpriteMaterial({
    map: noteMap, color: 0xf7dba3, transparent: true, depthWrite: false,
  })));
  root.add(...notes);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.93, 1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffdca0, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  ring.rotation.x = -Math.PI / 2;
  root.add(ring);

  return { root, feather, hit, ring, notes, animate(time, night, dropping, playing) {
    const breath = .5 + .5 * Math.sin(time * 1.8);
    filament.emissiveIntensity = .31 + night * .19 + (playing ? .20 + breath * .18 : 0);
    vane.emissiveIntensity = filament.emissiveIntensity * .75;
    moteMaterial.opacity = .62 + night * .17;
    for (let i = 0; i < count; i++) {
      const phase = i * 2.399 + time * (.35 + .025 * (i % 5));
      const radius = .14 + .38 * (i % 6) / 5;
      const height = THREE.MathUtils.euclideanModulo(i * .167 + time * (dropping ? .23 : .12), 1);
      points.setXYZ(i, Math.cos(phase) * radius, (height - .34) * (dropping ? 1.2 : .76), Math.sin(phase) * radius);
    }
    points.needsUpdate = true;
    notes.forEach((note, i) => {
      note.visible = playing;
      if (!playing) return;
      const t = (time * .23 + i * .249) % 1;
      const side = i % 2 ? 1 : -1;
      note.position.set(side * (.17 + t * .37), .2 + t * 1.20, .12 * Math.sin(t * Math.PI + i));
      note.scale.setScalar(.21 + t * .12);
      note.material.opacity = Math.sin(Math.PI * t) * (.52 + night * .17);
    });
    const phase = (time % 6) / 2.4;
    ring.visible = playing && phase < 1;
    if (ring.visible) {
      ring.scale.setScalar(.23 + .74 * phase);
      ring.position.y = winterHeight(root.position.x, root.position.z) - root.position.y + .029;
      ring.material.opacity = Math.sin(Math.PI * phase) * (.14 + night * .05);
    }
  } };
}

export function createWinterFeather(cue, random = Math.random) {
  const landing = new THREE.Vector3(), desired = new THREE.Vector3(), forward = new THREE.Vector3();
  let visual, elapsed, fallAt, dropStarted, duration, landed, wasNear;

  function near(player) {
    return landed && !!visual?.root.parent &&
      Math.hypot(player.x - landing.x, player.z - landing.z) <= reach;
  }

  return {
    enter(parent) {
      visual ??= makeFeather();
      parent.add(visual.root);
      visual.root.visible = false;
      elapsed = 0;
      dropStarted = undefined;
      fallAt = 15 + random() * 10;
      duration = 5 + random() * 3;
      landed = wasNear = false;
    },
    leave() {
      visual?.root.removeFromParent();
    },
    get target() { return visual?.hit; },
    get anchor() { return visual?.root.position; },
    bounds(box) {
      visual.feather.updateWorldMatrix(true, false);
      box.setFromObject(visual.feather);
    },
    near,
    update(dt, player, camera, night, playing) {
      if (!visual?.root.parent) return;
      elapsed += dt;
      if (elapsed < fallAt) return;
      const { root, feather } = visual;
      if (!landed) {
        camera.getWorldDirection(forward);
        const heading = forward.x ** 2 + forward.z ** 2 > .006 ? Math.atan2(forward.x, forward.z) : 0;
        if (featherLanding(player, heading, desired)) {
          if (!root.visible) {
            landing.copy(desired);
            root.visible = true;
            dropStarted = elapsed;
            cue("fall");
          } else if (!allowedLanding(player, landing.x, landing.z) || landing.distanceTo(desired) > .65) {
            landing.lerp(desired, 1 - Math.exp(-4.5 * dt));
          }
        }
        if (!root.visible) return;
        const t = Math.min(1, (elapsed - dropStarted) / duration);
        if (t === 1) {
          if ((Math.hypot(player.x - landing.x, player.z - landing.z) > reach ||
              !allowedLanding(player, landing.x, landing.z)) && featherLanding(player, heading, desired)) landing.copy(desired);
          landing.y = winterHeight(landing.x, landing.z) + hover;
          landed = true;
        }
        const sway = Math.sin(elapsed * 3.0) * .19 * Math.sin(Math.PI * t);
        root.position.set(landing.x + sway, winterHeight(landing.x, landing.z) + hover +
          fallHeight * (1 - THREE.MathUtils.smoothstep(t, 0, 1)), landing.z);
      } else {
        root.position.copy(landing);
        root.position.y += Math.sin(elapsed * 1.7) * .085;
      }
      feather.rotation.y = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z) +
        .38 * Math.sin(elapsed * 1.4);
      feather.rotation.z = -.19 + Math.sin(elapsed * 2.2) * (landed ? .10 : .30);
      visual.animate(elapsed, night, !landed, playing);
      if (!wasNear && near(player)) {
        wasNear = true;
        cue("near");
      }
    },
  };
}
