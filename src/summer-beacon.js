import * as THREE from "three";
import { addSummerHalo, summerHaloMap } from "./summer-glow.js";
import { onTowerGallery, pierPoint, PIER, TOWER, TOWER_CAP_RADIUS } from "./summer-layout.js";

const { lerp, smoothstep } = THREE.MathUtils;

export function nearSummerLantern(player) {
  if (!onTowerGallery(player) || !player.grounded) return false;
  const radius = Math.hypot(player.x - TOWER.x, player.z - TOWER.z);
  return radius >= TOWER_CAP_RADIUS + .30 && radius <= TOWER.gallery - .65;
}

function createBeam() {
  const points = [], uv = [], index = [];
  // Two crossed sheets give the beam a soft profile from the shore and from the gallery.
  const length = 122;
  for (const vertical of [true, false]) {
    const start = points.length / 3;
    for (const [x, width] of [[2.8, .68], [length, 8.5]]) {
      for (const side of [-1, 1]) {
        const drop = -.225 * (x - 2.8);
        points.push(x, drop + (vertical ? width * side : 0), vertical ? 0 : width * side);
        uv.push((x - 2.8) / (length - 2.8), (side + 1) / 2);
      }
    }
    index.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { gain: { value: 0 }, reach: { value: 0 } },
    vertexShader: `
      varying vec2 beamUv;
      void main() {
        beamUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }`,
    fragmentShader: `
      varying vec2 beamUv;
      uniform float gain, reach;
      void main() {
        float across = 1. - smoothstep(.07, .5, abs(beamUv.y - .5));
        float distant = 1. - smoothstep(.15, 1., beamUv.x);
        float arrival = 1. - smoothstep(reach - .16, reach + .01, beamUv.x);
        gl_FragColor = vec4(1., .72, .34, gain * across * distant * arrival);
        #include <colorspace_fragment>
      }`,
  });
  const beam = new THREE.Mesh(geometry, material);
  beam.name = "summer-lighthouse-beam";
  beam.renderOrder = 3;
  beam.visible = false;
  return beam;
}

export function createSummerBeacon(parent, core) {
  const halo = addSummerHalo(parent, core.position, 0xffc467, 12);
  const beam = createBeam();
  beam.position.copy(core.position);
  parent.add(beam);
  let litAt;
  let previousSituation;
  const base = new THREE.Color(0xffffff), gold = new THREE.Color(0xffdda5);
  return {
    target: core.parent ?? core,
    anchor: core.position,
    get lit() { return litAt !== undefined; },
    light(time, player) {
      if (litAt !== undefined || !nearSummerLantern(player)) return false;
      litAt = time;
      previousSituation = "summer-lantern-revisit";
      return true;
    },
    pause() { previousSituation = undefined; },
    update(time, darkness, player, emit) {
      const near = !!player && nearSummerLantern(player);
      const strength = litAt === undefined ? 0 : smoothstep(time - litAt, 0, 2.7);
      const breath = near && litAt === undefined ? .13 + .19 * (1 + Math.sin(time * 2.15)) / 2 : 0;
      const gain = strength * lerp(.20, 1, darkness);
      core.material.color.copy(base).lerp(gold, breath + .55 * gain).multiplyScalar(1 + 1.35 * gain + breath);
      halo.material.opacity = .55 * gain + breath;
      halo.visible = halo.material.opacity > .005;
      beam.visible = gain > .005;
      if (beam.visible) {
        beam.rotation.y = -.98 + Math.max(0, time - litAt - .8) * Math.PI * 2 / 25;
        beam.material.uniforms.gain.value = .33 * gain;
        beam.material.uniforms.reach.value = strength;
      }
      const situation = near && (litAt === undefined ? "summer-lantern-near" :
        darkness > .55 ? "summer-lantern-revisit" : undefined);
      if (situation && situation !== previousSituation && emit) emit(situation);
      if (!near || emit) previousSituation = situation;

    },
  };
}

export function createPierLight(parent, lamp) {
  const halo = addSummerHalo(parent, lamp.position, 0xffca76, 3.4);
  const { x, z } = pierPoint(1.9, PIER.length - 1.45);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffbb69, map: summerHaloMap, depthWrite: false, transparent: true, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, opacity: 0,
  });
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), material);
  patch.position.set(x, PIER.y + .014, z);
  patch.rotation.y = PIER.yaw;
  patch.renderOrder = 2;
  patch.name = "summer-pier-light";
  parent.add(patch);
  return (strength) => {
    lamp.material.emissive.setHex(0xffbc68);
    lamp.material.emissiveIntensity = strength * 1.2;
    halo.visible = patch.visible = strength > .004;
    halo.material.opacity = strength * .70;
    material.opacity = strength * .52;
  };
}
