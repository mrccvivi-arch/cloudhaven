import { Box3, Raycaster, Sphere, Vector3 } from "three";
import { staticColliders } from "./collision.js";
import { GROUND_DECKS, PLATFORMS, SKY_GATE, SKY_TREES, TREES, terrainHeight } from "./map.js";

export const DEFAULT_CAMERA_DISTANCE = 8;
export function cameraDistance(value) {
  return Number.isFinite(value) ? Math.max(3, Math.min(16, value)) : DEFAULT_CAMERA_DISTANCE;
}

function box(x, y, z, w, h, d) {
  return new Box3(new Vector3(x - w / 2, y - h / 2, z - d / 2),
    new Vector3(x + w / 2, y + h / 2, z + d / 2));
}

function cameraObstacles(layer, trees, decks, gates) {
  const obstacles = staticColliders(layer).filter(({ kind }) => kind === "rock" || kind === "rail")
    .map(({ x, z, w, d, cos, sin, bottom, top }) =>
      box(x, (top + bottom) / 2, z, w * Math.abs(cos) + d * Math.abs(sin) + .2,
        top - bottom + .2, d * Math.abs(cos) + w * Math.abs(sin) + .2));
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
  ground: cameraObstacles("ground", TREES, GROUND_DECKS, [
    { ...SKY_GATE, y: terrainHeight(SKY_GATE.x, SKY_GATE.z) },
  ]),
  sky: cameraObstacles("sky", SKY_TREES, PLATFORMS, [
    { x: -4, y: 29, z: 15 }, { x: 2.4, y: 30.4, z: -25 },
  ]),
};

export function createCameraRig(camera, initialYaw, initialDistance) {
  let yaw = initialYaw;
  let followYaw = yaw;
  let pitch = .37;
  let followPitch = pitch;
  let distance = cameraDistance(initialDistance);
  let orbitDistance = distance;
  let clearDistance = distance;
  const target = new Vector3();
  const focus = new Vector3();
  const direction = new Vector3();
  const point = new Vector3();
  const raycaster = new Raycaster();
  const hits = [];

  function clearLength(layer, length, cloud) {
    const ray = raycaster.ray;
    ray.set(focus, direction);
    for (const obstacle of obstacles[layer] ?? []) {
      if (obstacle.containsPoint(focus)) continue;
      const hit = obstacle.isBox3 ? ray.intersectBox(obstacle, point) : ray.intersectSphere(obstacle, point);
      if (hit) length = Math.min(length, Math.max(.65, focus.distanceTo(hit) - .38));
    }
    if (layer === "ground") {
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

  function update(player, dt, snap = false, cloud, closeUp) {
    const blend = snap ? 1 : 1 - Math.exp(-12 * dt);
    const turn = yaw - followYaw;
    followYaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * blend;
    followPitch += (pitch - followPitch) * blend;
    const subject = closeUp ?? player;
    target.set(subject.x, subject.y + 1, subject.z);
    focus.lerp(target, blend);
    orbitDistance += ((closeUp ? 5.3 : distance) - orbitDistance) * blend;
    direction.set(Math.sin(followYaw) * Math.cos(followPitch), Math.sin(followPitch),
      Math.cos(followYaw) * Math.cos(followPitch));
    const limit = clearLength(player.layer, orbitDistance, cloud);
    clearDistance = snap ? limit : Math.min(limit, clearDistance + (limit - clearDistance) * blend);
    camera.position.copy(focus).addScaledVector(direction, clearDistance);
    camera.lookAt(focus);
  }

  return {
    update,
    look(dx, dy) {
      yaw -= dx * .007;
      pitch = Math.max(.12, Math.min(1.15, pitch + dy * .005));
    },
    zoom(amount) {
      const next = cameraDistance(distance * Math.exp(amount));
      if (next === distance) return false;
      distance = next;
      return true;
    },
    getDistance() { return distance; },
    getYaw() { return yaw; },
    face(angle) { yaw = angle; pitch = .37; },
    align(angle) { yaw = followYaw = angle; },
  };
}
