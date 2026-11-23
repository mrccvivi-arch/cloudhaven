import { Vector3 } from "three";
import { terrainHeight } from "./map.js";

export function createCameraRig(camera, initialYaw) {
  let yaw = initialYaw;
  let followYaw = yaw;
  let pitch = .37;
  let followPitch = pitch;
  const target = new Vector3();
  const focus = new Vector3();
  const position = new Vector3();

  function update(player, dt, snap = false, closeUpYaw) {
    const blend = snap ? 1 : 1 - Math.exp(-12 * dt);
    const turn = (closeUpYaw ?? yaw) - followYaw;
    followYaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * blend;
    followPitch += (pitch - followPitch) * blend;
    target.set(player.x, player.y + 1, player.z);
    focus.lerp(target, blend);
    const length = (closeUpYaw === undefined ? 6.8 : 5.3) + Math.max(0, 1.1 - camera.aspect) * 4;
    const x = focus.x + Math.sin(followYaw) * Math.cos(followPitch) * length;
    const z = focus.z + Math.cos(followYaw) * Math.cos(followPitch) * length;
    const y = Math.max(player.layer === "ground" ? terrainHeight(x, z) + .65 : -Infinity,
      focus.y + Math.sin(followPitch) * length);
    position.set(x, y, z);
    camera.position.lerp(position, blend);
    camera.lookAt(focus);
  }

  return {
    update,
    look(dx, dy) {
      yaw -= dx * .007;
      pitch = Math.max(.12, Math.min(1.15, pitch + dy * .005));
    },
    getYaw() { return yaw; },
    align(angle) { yaw = followYaw = angle; },
  };
}
