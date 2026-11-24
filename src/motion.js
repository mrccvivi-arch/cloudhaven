import { HABITAT, cloudFloor, cloudFootprint } from "./cloud-house-layout.js";
import { BRIDGE_RAMPS, GROUND_DECKS, HOME, PLATFORMS, SKY, WORLD_LIMIT, rampHeight, terrainHeight } from "./map.js";
import { lookoutCloud, onLookoutCloud } from "./lookout-cloud.js";
import { PLAYER_RADIUS as radius, blockingSolid, contactNormal } from "./collision.js";

export const MOVE_SPEED = 8.1;
export const JUMP_SPEED = 8.35;
export const GRAVITY = 16;
const MAX_HORIZONTAL_STEP = .12;

function includes(deck, x, z, pad = 0) {
  return Math.abs(x - deck.x) <= deck.w / 2 + pad && Math.abs(z - deck.z) <= deck.d / 2 + pad;
}

function onRamp(ramp, x, z) {
  return Math.abs(x - ramp.x) <= ramp.w / 2 && (z - ramp.bridgeZ) * (z - ramp.landZ) <= 0;
}

function decks(layer, facilities) {
  return layer === "sky" ? PLATFORMS : facilities?.decks.length ? [...GROUND_DECKS, ...facilities.decks] : GROUND_DECKS;
}

export function floorAt(layer, x, z, ceiling = Infinity, cloudOffset = 0, cloudCeiling = ceiling, facilities) {
  let best = layer === "ground" ? { y: terrainHeight(x, z) } : { y: -Infinity };
  for (const deck of decks(layer, facilities)) {
    if (includes(deck, x, z, deck.id === "creek-bridge" ? 0 : radius * .35) && deck.y <= ceiling && deck.y > best.y) best = deck;
  }
  if (layer === "sky" && lookoutCloud.y <= ceiling && lookoutCloud.y > best.y && onLookoutCloud(x, z)) {
    best = lookoutCloud;
  }
  if (layer === "ground") {
    const cloudY = cloudFloor(x, z, cloudOffset);
    if (cloudY <= cloudCeiling && cloudY > best.y) best = { id: HABITAT.id, y: cloudY };
    for (const ramp of BRIDGE_RAMPS) {
      if (!onRamp(ramp, x, z)) continue;
      const y = rampHeight(ramp, x, z);
      if (y <= ceiling && y > best.y) best = { id: ramp.id, y };
    }
  }
  return best;
}

function safePosition(pose, cloudOffset, facilities) {
  const ceiling = pose.layer === "sky" && Number.isFinite(pose.y) ? pose.y + .25 : Infinity;
  const cloudCeiling = Number.isFinite(pose.y) ? pose.y + .24 : Infinity;
  const y = floorAt(pose.layer, pose.x, pose.z, ceiling, cloudOffset, cloudCeiling, facilities).y;
  if (Number.isFinite(y) && !blockingSolid(pose.layer, pose.x, y, pose.z, facilities?.solids) && !underCloud(pose.layer, pose.x, y, pose.z)) return { ...pose, y };
  for (let distance = .25; distance <= 6; distance += .25) {
    for (let angle = Math.PI; angle < 3 * Math.PI; angle += Math.PI / 8) {
      const x = pose.x + Math.cos(angle) * distance;
      const z = pose.z + Math.sin(angle) * distance;
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
      const y = floorAt(pose.layer, x, z, ceiling + .5, cloudOffset, cloudCeiling, facilities).y;
      if (Number.isFinite(y) && !blockingSolid(pose.layer, x, y, z, facilities?.solids) && !underCloud(pose.layer, x, y, z)) return { ...pose, x, y, z };
    }
  }
  const fallback = pose.layer === "sky" ? SKY : HOME;
  return { ...fallback, y: floorAt(fallback.layer, fallback.x, fallback.z).y };
}

export function spawnPlayer(pose, cloudOffset = 0, facilities) {
  return { ...safePosition(pose, cloudOffset, facilities), vy: 0, grounded: true };
}

export function jump(player) {
  if (!player.grounded) return false;
  player.vy = JUMP_SPEED;
  player.grounded = false;
  return true;
}

function underCloud(layer, x, y, z) {
  return layer === "ground" && y < 1.10 && cloudFootprint(x, z) < .94;
}

function canMove(player, x, z, cloudOffset, facilities) {
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return false;
  if (blockingSolid(player.layer, x, player.y, z, facilities?.solids)) return false;
  if (player.layer === "ground") {
    if (underCloud(player.layer, x, player.y, z) && !underCloud(player.layer, player.x, player.y, player.z)) return false;
    const clearance = player.y + (player.grounded ? .4 : .025);
    if (cloudFloor(x, z, cloudOffset) > clearance &&
        cloudFloor(player.x, player.z, cloudOffset) <= clearance) return false;
  }
  if (player.layer === "ground" && BRIDGE_RAMPS.some((ramp) =>
    onRamp(ramp, x, z) && !onRamp(ramp, player.x, player.z) &&
    rampHeight(ramp, x, z) > player.y + .4)) return false;
  return !decks(player.layer, facilities).some((deck) =>
    player.y < deck.y - .38 &&
    !includes(deck, player.x, player.z, radius * .3) && includes(deck, x, z, radius * .3));
}

export function movePlayer(player, dx, dz, dt, practiceArea, cloudOffset = 0, facilities) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_HORIZONTAL_STEP));
  let checkpoint;
  let fell = false;
  for (let i = 0; i < steps && !fell; i++) {
    const result = moveStep(player, dx / steps, dz / steps, dt / steps, practiceArea, cloudOffset, facilities);
    checkpoint = result.checkpoint || checkpoint;
    fell = result.fell;
  }
  return { checkpoint, fell };
}

function moveStep(player, dx, dz, dt, practiceArea, cloudOffset, facilities) {
  if (practiceArea) {
    const { x, z, halfWidth } = practiceArea;
    player.x = Math.max(x - halfWidth, Math.min(x + halfWidth, player.x + dx));
    player.z = Math.max(z - halfWidth, Math.min(z + halfWidth, player.z + dz));
  } else if (dx || dz) {
    const { x, y, z, layer } = player;
    if (canMove(player, x + dx, z + dz, cloudOffset, facilities)) {
      player.x += dx;
      player.z += dz;
    } else {
      const solid = blockingSolid(layer, x + dx, y, z + dz, facilities?.solids);
      let slideX = dx, slideZ = dz;
      if (solid) {
        const [nx, nz] = contactNormal(solid, x, z);
        const toward = Math.min(0, dx * nx + dz * nz);
        slideX -= nx * toward;
        slideZ -= nz * toward;
      }
      if (solid && canMove(player, x + slideX, z + slideZ, cloudOffset, facilities)) {
        player.x += slideX;
        player.z += slideZ;
      } else {
        // At a corner, keep any component that neither obstacle blocks.
        if (dx && canMove(player, player.x + dx, player.z, cloudOffset, facilities)) player.x += dx;
        if (dz && canMove(player, player.x, player.z + dz, cloudOffset, facilities)) player.z += dz;
      }
    }
  }

  const oldY = player.y;
  const floor = practiceArea ? { y: 0 } : floorAt(
    player.layer, player.x, player.z, oldY + (player.grounded ? .4 : .025), cloudOffset, undefined, facilities,
  );
  if (player.grounded && Math.abs(floor.y - oldY) <= .4) {
    player.y = floor.y;
  } else {
    player.grounded = false;
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.vy <= 0 && player.y <= floor.y) {
      player.y = floor.y;
      if (!practiceArea && (blockingSolid(player.layer, player.x, player.y, player.z, facilities?.solids) ||
          underCloud(player.layer, player.x, player.y, player.z))) {
        Object.assign(player, safePosition(player, cloudOffset, facilities));
      }
      player.vy = 0;
      player.grounded = true;
    }
  }
  return { checkpoint: player.grounded && floor.checkpoint, fell: player.y < (player.layer === "sky" ? 16 : -8) };
}
