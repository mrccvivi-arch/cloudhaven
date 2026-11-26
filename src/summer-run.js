import { blockingSolid, PLAYER_RADIUS } from "./collision.js";
import { movePlayer } from "./motion.js";
import { SUMMER, SWING, islandHeight, pondDistance, summerSurface } from "./summer-layout.js";

const COAST_TIME = .20;

function hasRunningRoom(player, vx, vz) {
  const { x, z } = player;
  const floor = islandHeight(x, z);
  if (!summerSurface(x, z, .95, Math.max(player.y, floor)) || pondDistance(x, z) < 1.29 ||
      Math.hypot(x - SWING.x, z - SWING.z) < 3.4) return false;

  const speed = Math.hypot(vx, vz);
  const sideX = vz / speed * 1.05, sideZ = -vx / speed * 1.05;
  // Check the shoulders of the route at terrain height, including during jumps.
  for (const side of [-1, 1]) {
    const px = x + sideX * side, pz = z + sideZ * side;
    const y = islandHeight(px, pz);
    if (!summerSurface(px, pz, PLAYER_RADIUS, y) || Math.abs(y - floor) > .48 ||
        blockingSolid(SUMMER, px, y, pz)) return false;
  }
  return true;
}

export function createSummerRun() {
  let sustained, boost, coastRemaining, lastX, lastZ;
  let running;

  function reset() {
    sustained = boost = coastRemaining = lastX = lastZ = 0;
    running = false;
  }
  reset();

  return {
    reset,
    get running() { return running; },
    get poseWeight() { return boost; },
    move(player, vx, vz, dt, cloudOffset, facilities) {
      const input = vx !== 0 || vz !== 0;
      const coasting = !input && coastRemaining > 0;
      const allowed = (input || coasting) && hasRunningRoom(player, input ? vx : lastX, input ? vz : lastZ);
      if (!allowed) reset();
      else if (input) {
        running = sustained >= 2 - 1e-8;
        boost = running ? Math.min(1, boost + dt / .42) : 0;
        const multiplier = 1 + boost * .25;
        vx *= multiplier;
        vz *= multiplier;
        lastX = vx;
        lastZ = vz;
        coastRemaining = boost > 0 ? COAST_TIME : 0;
      } else {
        sustained = 0;
        running = false;
        const weight = (coastRemaining / COAST_TIME) ** 2;
        vx = lastX * weight;
        vz = lastZ * weight;
        coastRemaining = Math.max(0, coastRemaining - dt);
        boost = Math.min(boost, coastRemaining / COAST_TIME);
      }

      const x = player.x, z = player.z;
      const dx = vx * dt, dz = vz * dt;
      const result = movePlayer(player, dx, dz, dt, undefined, cloudOffset, facilities);
      const obstructed = Math.hypot(player.x - x - dx, player.z - z - dz) > 1e-5;
      if (obstructed || result.fell) reset();
      else if (allowed && input && (player.grounded || running)) sustained = Math.min(2, sustained + dt);
      return result;
    },
  };
}
