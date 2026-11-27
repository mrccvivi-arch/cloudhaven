import { WINTER, WINTER_TREE, winterHeight } from "./winter-layout.js";
import { ISLAND_BRIDGE, LANTERN_BASE_RADIUS, PIER, PIER_THICKNESS, SUMMER, TOWER, TOWER_LANDING, canReturnFromTower,
  islandBridgeHeight, islandHeight, onIslandRainbowDeck, onRainbow, pierHeight, pierLocal, pierWidth, towerFloor, towerGalleryCeiling, towerHeadCeiling, towerShellAt } from "./summer-layout.js";
import { Box3, Raycaster, Sphere, Vector3 } from "three";
import { staticColliders } from "./collision.js";
import { GROUND_DECKS, PLATFORMS, SKY_GATE, SKY_TREES, TREES, terrainHeight } from "./map.js";

export const DEFAULT_CAMERA_DISTANCE = 8;
const TOWER_CAMERA_CLEARANCE = 2.25;
const TOWER_CAMERA_CLOSE_RANGE = 3.2;
export function cameraDistance(value) {
  return Number.isFinite(value) ? Math.max(3, Math.min(16, value)) : DEFAULT_CAMERA_DISTANCE;
}

function box(x, y, z, w, h, d) {
  return new Box3(new Vector3(x - w / 2, y - h / 2, z - d / 2),
    new Vector3(x + w / 2, y + h / 2, z + d / 2));
}

function cameraObstacles(layer, trees, decks, gates) {
  const obstacles = staticColliders(layer).filter(({ kind }) => kind === "rock" || kind === "rail" || kind === "ginkgo-trunk" || kind === "cherry-trunk")
    .map(({ x, z, w, d, cos, sin, bottom, top, radius }) =>
      box(x, (top + bottom) / 2, z, (radius ? radius * 2 : w * Math.abs(cos) + d * Math.abs(sin)) + .2,
        top - bottom + .2, (radius ? radius * 2 : d * Math.abs(cos) + w * Math.abs(sin)) + .2));
  for (const { x, z, size, y = terrainHeight(x, z) } of trees) {
    obstacles.push(box(x, y + 1.13 * size, z, .3 * size, 2.26 * size, .3 * size));
    obstacles.push(new Sphere(new Vector3(x, y + 2.77 * size, z), 1.31 * size));
  }
  for (const { x, y, z, w, d } of decks) obstacles.push(box(x, y - .38, z, w, .8, d));
  for (const { x, y, z } of gates) {
    for (const side of [-1, 1]) obstacles.push(box(x + side * 1.65, y + 1.8, z, .56, 3.7, .62));
    obstacles.push(box(x, y + 3.48, z, 3.9, .52, .65));
  }
  return obstacles;
}

const obstacles = {
  [WINTER]: [box(WINTER_TREE.x, winterHeight(WINTER_TREE.x, WINTER_TREE.z) + 2, WINTER_TREE.z, 2.4, 4, 2.4)],
  ground: cameraObstacles("ground", TREES, GROUND_DECKS, [
    { ...SKY_GATE, y: terrainHeight(SKY_GATE.x, SKY_GATE.z) },
  ]),
  sky: cameraObstacles("sky", SKY_TREES, PLATFORMS, [
    { x: -4, y: 29, z: 15 }, { x: 2.4, y: 30.4, z: -25 },
  ]),
};


export function createCameraRig(camera, initialYaw, initialDistance) {
  const fov = camera.fov;
  let yaw = initialYaw;
  let followYaw = yaw;
  let pitch = .37;
  let followPitch = pitch;
  let distance = cameraDistance(initialDistance);
  let orbitDistance = distance;
  let clearDistance = distance;
  let shaftPitch = 0;
  let shaftTurn = 0;
  let minimumPitch = .12;
  const target = new Vector3();
  const focus = new Vector3();
  const direction = new Vector3();
  const point = new Vector3();
  const raycaster = new Raycaster();
  const hits = [];
  let lastFacilities;
  let roofs = [];

  function clearLength(layer, length, cloud, facilities) {
    if (facilities !== lastFacilities) {
      lastFacilities = facilities;
      roofs = (facilities?.cameraRoofs ?? []).map(({ x, y, z, w, h, d }) => box(x, y, z, w, h, d));
    }
    const ray = raycaster.ray;
    ray.set(focus, direction);
    for (const obstacle of obstacles[layer] ?? []) {
      if (obstacle.containsPoint(focus)) continue;
      const hit = obstacle.isBox3 ? ray.intersectBox(obstacle, point) : ray.intersectSphere(obstacle, point);
      if (hit) length = Math.min(length, Math.max(.65, focus.distanceTo(hit) - .38));
    }
    if (layer === SUMMER) {
      for (let step = .24; step <= length + .21; step += .22) {
        ray.at(Math.min(step, length), point);
        const ground = islandHeight(point.x, point.z);
        let floor = towerFloor(point.x, point.z, point.y + .22, ground);
        if (onRainbow(ISLAND_BRIDGE, point.x, point.z)) {
          const bridge = islandBridgeHeight(point.z);
          if (focus.y >= bridge - .18 || point.y >= bridge - .18) floor = Math.max(floor, bridge);
        }
        const { across, along } = pierLocal(point.x, point.z);
        if (along >= 0 && along <= PIER.length && Math.abs(across) < pierWidth(along) / 2) {
          const deckHeight = pierHeight(along);
          if (focus.y >= deckHeight - PIER_THICKNESS - .06 || point.y >= deckHeight - PIER_THICKNESS - .06) floor = Math.max(floor, deckHeight);
        }
        const shaft = Math.hypot(point.x - TOWER.x, point.z - TOWER.z);
        const wall = towerShellAt(point.x, point.y, point.z, .06);
        const deck = point.y <= TOWER_LANDING + .06 && point.y >= towerGalleryCeiling(point.x, point.z) - .06;
        const core = point.y >= TOWER.y && shaft < (point.y < TOWER_LANDING ? TOWER.inner : LANTERN_BASE_RADIUS);
        // The tapered inner wall can be closer than the usual minimum chase distance.
        if (wall || core || deck) return Math.min(length, Math.max(.24, step - .38));
        if (point.y < Math.max(.07, floor) + .20) return Math.min(length, Math.max(.60, step - .40));
      }
    }
    if (layer === WINTER) {
      for (let step = .5; step <= length + .3; step += .32) {
        ray.at(Math.min(step, length), point);
        if (point.y < winterHeight(point.x, point.z) + .30) return Math.min(length, Math.max(.55, step - .36));
      }
    }
    if (layer === "ground") {
      for (const roof of roofs) {
        if (roof.containsPoint(focus)) continue;
        const hit = ray.intersectBox(roof, point);
        if (hit) length = Math.min(length, Math.max(.65, focus.distanceTo(hit) - .27));
      }
      if (cloud) {
        cloud.updateMatrixWorld();
        raycaster.far = length + .38;
        hits.length = 0;
        raycaster.intersectObject(cloud, false, hits);
        if (hits.length) length = Math.min(length, Math.max(.65, hits[0].distance - .38));
      }
      for (let step = .7; step <= length + .35; step += .35) {
        ray.at(Math.min(step, length), point);
        if (point.y < terrainHeight(point.x, point.z) + .4) {
          return Math.min(length, Math.max(.65, step - .5));
        }
      }
    }
    return length;
  }

  function update(player, dt, snap = false, cloud, closeUp, facilities) {
    minimumPitch = player.layer === WINTER ? -.86 : player.layer === SUMMER ? -.62 : .12;
    const blend = snap ? 1 : 1 - Math.exp(-12 * dt);
    const turn = yaw - followYaw;
    followYaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * blend;
    followPitch += (pitch - followPitch) * blend;
    const subject = closeUp ?? player;
    const alongBridge = onIslandRainbowDeck(player);
    const bridgeView = alongBridge ? Math.max(0, Math.min(1, (player.z - ISLAND_BRIDGE.start) / 8)) : 0;
    target.set(subject.x, subject.y + 1 + 1.40 * bridgeView, subject.z);
    if (player.layer === WINTER) {
      // Tilt toward the sky without pushing the chase camera into the snow
      // or filling the view with the avatar when the clearance ray shortens.
      const lift = Math.max(0, -Math.sin(followPitch));
      target.y += lift * (orbitDistance + 1);
    }
    focus.lerp(target, blend);
    if (player.layer === SUMMER && subject.y < TOWER_LANDING) {
      // Leave room for the minimum chase distance even when the player tilts the view upward.
      focus.y = Math.min(focus.y, towerHeadCeiling(focus.x, focus.z, .06) - .31);
    }
    orbitDistance += ((closeUp ? 5.3 : distance) - orbitDistance) * blend;
    function aim(turn, angle) {
      const azimuth = followYaw + turn;
      direction.set(Math.sin(azimuth) * Math.cos(angle), Math.sin(angle), Math.cos(azimuth) * Math.cos(angle));
    }
    aim(0, followPitch);
    // At the island bridge, keep the chase camera on the playable side of the seam.
    const rearLimit = alongBridge && direction.z > 0
      ? Math.max(.66, (ISLAND_BRIDGE.end - .28 - focus.z) / direction.z) : Infinity;
    const length = Math.min(orbitDistance, rearLimit);
    let limit = clearLength(player.layer, length, cloud, facilities);
    const inTower = canReturnFromTower(player);
    if (inTower) {
      const priorTurn = shaftTurn;
      shaftTurn = 0;
      let safePitch = followPitch;
      const closeRange = Math.min(length, TOWER_CAMERA_CLOSE_RANGE);
      function tryView(turn, angle) {
        aim(turn, angle);
        const clearance = clearLength(player.layer, closeRange, cloud, facilities);
        if (clearance > limit + .12) {
          shaftTurn = turn;
          safePitch = angle;
          limit = clearance;
        }
        return limit >= TOWER_CAMERA_CLEARANCE;
      }
      if (limit < TOWER_CAMERA_CLEARANCE) {
        // Try a higher view first, then look along the landing if the ceiling limits headroom.
        for (const angle of [.86, 1.17, 1.39, .18, -.14]) {
          if (tryView(0, angle)) break;
        }
        if (limit < TOWER_CAMERA_CLEARANCE) {
          const side = priorTurn < 0 ? -1 : 1;
          const turns = [priorTurn, side * .55, -side * .55, side * 1.05, -side * 1.05, side * 1.56, -side * 1.56];
          for (const turn of turns) {
            if (turn && (tryView(turn, .22) || tryView(turn, .82))) break;
          }
          if (limit < 1.45) {
            for (const turn of [side * 2.10, -side * 2.10, side * 2.65, -side * 2.65, Math.PI]) {
              if (tryView(turn, .22) || tryView(turn, .82) || tryView(turn, 1.15)) break;
            }
          }
        }
      }
      const targetPitch = safePitch - followPitch;
      shaftPitch = !snap && !targetPitch ? shaftPitch * (1 - blend) : targetPitch;
      aim(shaftTurn, followPitch + shaftPitch);
      if (shaftPitch || shaftTurn) limit = clearLength(player.layer, closeRange, cloud, facilities);
      if (clearDistance < 1.45 && limit >= 1.8) clearDistance = 1.8;
    } else {
      shaftPitch = shaftTurn = 0;
    }
    clearDistance = snap ? limit : Math.min(limit, clearDistance + (limit - clearDistance) * blend);
    const viewFov = inTower ? fov + Math.min(25, Math.max(0, (TOWER_CAMERA_CLOSE_RANGE - clearDistance) * 20)) : fov;
    if (Math.abs(camera.fov - viewFov) > .1 || (viewFov === fov && camera.fov !== fov)) {
      camera.fov = viewFov;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(focus).addScaledVector(direction, clearDistance);
    camera.lookAt(focus);
  }

  return {
    update,
    look(dx, dy) {
      yaw -= dx * .007;
      pitch = Math.max(minimumPitch, Math.min(1.15, pitch + dy * .005));
    },
    zoom(amount) {
      const next = cameraDistance(distance * Math.exp(amount));
      if (next === distance) return false;
      distance = next;
      return true;
    },
    getDistance() { return distance; },
    getYaw() { return yaw; },
    getMovementYaw() { return yaw + shaftTurn; },
    face(angle, elevation = .37) { yaw = angle; pitch = elevation; },
    align(angle) { yaw = followYaw = angle; shaftTurn = shaftPitch = 0; },
  };
}
