import * as THREE from "three";
import { BATH, BATH_CLEARANCE, seeded } from "./map.js";
import { part } from "./models.js";
import { floorAt } from "./motion.js";

const { lerp, smoothstep } = THREE.MathUtils;
const shortTurn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createBaseAnimations(avatar, props) {
  const grass = new THREE.Group();
  avatar.root.parent.add(grass);
  const random = seeded(123);
  for (let i = 0; i < 8; i++) {
    const x = (random() - .5) * .14;
    const stem = part(grass, "log", i % 2 ? 0xaaa950 : 0x788636, x, .07, 0, .012, .24, .012);
    stem.rotation.z = x * 5;
    part(grass, "ball", 0xa6a45b, x * 1.75, .19, 0, .027, .065, .025).rotation.z = stem.rotation.z;
  }
  grass.visible = false;

  const dust = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: 0xeed3a0, flatShading: true }),
    12,
  );
  dust.frustumCulled = false;
  dust.visible = false;
  props.bath.add(dust);
  const grain = new THREE.Object3D();
  const grip = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const { root, body, head, mouth, paws } = avatar;
  let action;

  function start(id, player, cameraYaw = 0) {
    if (action) return false;
    const prop = props[id].position;
    const offset = Math.atan2(player.x - prop.x, player.z - prop.z);
    const distance = Math.hypot(player.x - prop.x, player.z - prop.z);
    let heading = offset;
    if (id === "bowl") {
      // Keep the feeding pose clear of the adjacent bath.
      const nearBath = (angle) => Math.hypot(
        prop.x + Math.sin(angle) * 1.03 - BATH.x, prop.z + Math.cos(angle) * 1.03 - BATH.z,
      ) < BATH_CLEARANCE;
      while (nearBath(heading)) heading += Math.cos(offset) >= 0 ? -.15 : .15;
    }
    const reach = id === "bowl" ? 1.03 : Math.max(distance, BATH_CLEARANCE + .05);
    const x = prop.x + Math.sin(heading) * reach;
    const z = prop.z + Math.cos(heading) * reach;
    const cameraAngles = [heading + 2.16, heading - 2.16];
    const viewYaw = Math.abs(shortTurn(cameraYaw, cameraAngles[0])) < Math.abs(shortTurn(cameraYaw, cameraAngles[1]))
      ? cameraAngles[0] : cameraAngles[1];
    action = {
      id, prop, time: 0, from: { ...player },
      to: new THREE.Vector3(x, floorAt(player.layer, x, z).y, z),
      yaw: root.rotation.y, turn: shortTurn(root.rotation.y, heading), viewYaw,
    };
    return true;
  }

  function feed(t, bowl) {
    const reach = smoothstep(t, .55, .95) * (1 - smoothstep(t, 1.05, 1.65));
    const hold = smoothstep(t, 1.05, 1.65) * (1 - smoothstep(t, 2.85, 3.30));
    head.rotation.x = -.52 * reach - .14 * hold;
    const chew = smoothstep(t, 1.5, 1.7) * (1 - smoothstep(t, 2.65, 2.85));
    mouth.position.y = -.07 + Math.sin(t * 31) * .027 * chew;
    mouth.scale.y = .16 + Math.cos(t * 31) * .014 * chew;
    for (const [i, paw] of paws.entries()) {
      paw.position.set((i === 0 ? -1 : 1) * (.2 - .10 * (reach + hold)),
        .35 + .12 * reach + .32 * hold, -.41 - .47 * reach - .24 * hold);
      paw.rotation.x = .7 * (reach + hold);
    }

    grass.visible = t < 2.85;
    if (grass.visible) {
      grip.copy(paws[0].position).lerp(paws[1].position, .5);
      grip.z -= .065;
      body.localToWorld(grip);
      grass.position.copy(bowl);
      grass.position.y += .42;
      grass.position.lerp(grip, smoothstep(t, .86, 1.02));
      grass.rotation.y = root.rotation.y;
      grass.rotation.x = -.86 * hold;
      grass.scale.setScalar(1 - .92 * smoothstep(t, 2.25, 2.85));
    }
  }

  function bathe(t, tub, edge) {
    const inward = smoothstep(t, .46, .92) * (1 - smoothstep(t, 3.38, 3.84));
    const aboveRim = smoothstep(t, .22, .46) * (1 - smoothstep(t, .92, 1.18))
      + smoothstep(t, 3.14, 3.38) * (1 - smoothstep(t, 3.84, 4.09));
    root.position.x = lerp(root.position.x, tub.x, inward);
    root.position.z = lerp(root.position.z, tub.z, inward);
    root.position.y = lerp(root.position.y, tub.y + BATH.sand, inward);
    root.position.y = lerp(root.position.y, Math.max(edge.y, tub.y + BATH.rim) + .18, aboveRim);
    const rollWeight = smoothstep(t, 1.36, 1.58) * (1 - smoothstep(t, 2.75, 3.08));
    const roll = Math.sin((t - 1.36) * 8.5) * 1.47 * rollWeight;
    const crouch = smoothstep(t, 1.10, 1.40) * (1 - smoothstep(t, 2.95, 3.14));
    const shake = Math.sin((t - 4.10) * 48) * .13 * smoothstep(t, 4.09, 4.19) * (1 - smoothstep(t, 4.32, 4.62));
    const pivot = .64 * (1 - .24 * crouch);
    body.scale.set(1, 1 - .24 * crouch, 1 - .10 * crouch);
    body.rotation.z = roll;
    body.rotation.y = shake;
    body.position.set(Math.sin(roll) * pivot, pivot * (1 - Math.cos(roll)) + .23 * Math.abs(Math.sin(roll)), 0);

    dust.visible = t > 1.38 && t < 3.08;
    if (dust.visible) {
      for (let i = 0; i < dust.count; i++) {
        const life = ((t - 1.38) * 1.7 + i / dust.count) % 1;
        const angle = i * 2.4;
        const radius = .48 + life * .93;
        grain.position.set(Math.cos(angle) * radius, .44 + Math.sin(life * Math.PI) * .47, Math.sin(angle) * radius);
        grain.scale.setScalar(.065 * Math.sin(life * Math.PI) * rollWeight);
        grain.updateMatrix();
        dust.setMatrixAt(i, grain.matrix);
      }
      dust.instanceMatrix.needsUpdate = true;
    }
  }

  return {
    start,
    get active() { return Boolean(action); },
    get cameraYaw() { return action?.id === "bowl" ? action.viewYaw : undefined; },
    get cameraTarget() { return cameraTarget; },
    update(dt, player) {
      if (!action) return;
      const { id, prop, to, from, yaw, turn } = action;
      const isFeed = id === "bowl";
      const duration = isFeed ? 3.45 : 4.65;
      const t = action.time = Math.min(duration, action.time + dt);
      const approach = smoothstep(t, 0, isFeed ? .55 : .22);
      root.position.set(lerp(from.x, to.x, approach), lerp(from.y, to.y, approach), lerp(from.z, to.z, approach));
      root.rotation.y = yaw + turn * smoothstep(t, 0, .50) * (1 - smoothstep(t, duration - .25, duration));
      if (isFeed) feed(t, prop);
      else bathe(t, prop, to);
      cameraTarget.copy(root.position);
      cameraTarget.y = to.y;
      if (!isFeed && avatar.shadow.visible) {
        avatar.shadow.position.set(root.position.x, to.y + .035, root.position.z);
        avatar.shadow.visible = root.position.y < prop.y + BATH.sand;
      }
      if (t === duration) {
        Object.assign(player, { x: to.x, y: to.y, z: to.z });
        action = undefined;
        return id;
      }
    },
  };
}
