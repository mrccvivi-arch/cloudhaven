import { WINTER, WINTER_ENTRY, winterHeight, winterWalkable } from "./winter-layout.js";
import { COAST_HEADROOM, FOREST_BRIDGE, RAINBOW_WIDTH, SUMMER, SUMMER_ENTRY, TOWER_LANDING, canReturnFromTower, clampGalleryStep, clampShoreStep,
  onRainbow, onTowerGallery, rainbowHeight, restoreTowerPose, summerDeckCeiling, summerFloor, summerWalkable, towerFloor, towerGalleryCeiling, towerHeadCeiling } from "./summer-layout.js";
import { HABITAT, cloudFloor, cloudFootprint } from "./cloud-house-layout.js";
import { BRIDGE_RAMPS, GROUND_DECKS, HOME, PLATFORMS, SKY, WORLD_LIMIT, rampHeight, terrainHeight } from "./map.js";
import { ENERGY_ALTAR, altarSurface } from "./energy-altar-layout.js";
import { lookoutCloud, onLookoutCloud } from "./lookout-cloud.js";
import { PLAYER_HEIGHT, PLAYER_RADIUS as radius, blockingSolid, constrainTowerWall, contactNormal } from "./collision.js";

export const MOVE_SPEED = 8.1;
export const JUMP_SPEED = 8.35;
export const GRAVITY = 16;
const MAX_HORIZONTAL_STEP = .12;
const towerMovement = new WeakMap();

function includes(deck, x, z, pad = 0) {
  return Math.abs(x - deck.x) <= deck.w / 2 + pad && Math.abs(z - deck.z) <= deck.d / 2 + pad;
}

function onRamp(ramp, x, z) {
  return Math.abs(x - ramp.x) <= ramp.w / 2 && (z - ramp.bridgeZ) * (z - ramp.landZ) <= 0;
}

function decks(layer, facilities) {
  return layer === "sky" ? PLATFORMS : facilities?.decks.length ? [...GROUND_DECKS, ...facilities.decks] : GROUND_DECKS;
}

function forestRainbowHeight(z) {
  return rainbowHeight(FOREST_BRIDGE, z, terrainHeight(FOREST_BRIDGE.x, FOREST_BRIDGE.start));
}

export function floorAt(layer, x, z, ceiling = Infinity, cloudOffset = 0, cloudCeiling = ceiling, facilities) {
  if (layer === WINTER) return { y: winterHeight(x, z) };
  if (layer === SUMMER) return { y: summerFloor(x, z, ceiling) };
  let best = layer === "ground" ? { y: terrainHeight(x, z) } : { y: -Infinity };
  for (const deck of decks(layer, facilities)) {
    if (includes(deck, x, z, deck.id === "creek-bridge" ? 0 : radius * .35) && deck.y <= ceiling && deck.y > best.y) best = deck;
  }
  if (layer === "sky" && lookoutCloud.y <= ceiling && lookoutCloud.y > best.y && onLookoutCloud(x, z)) {
    best = lookoutCloud;
  }
  if (layer === "ground") {
    const altar = altarSurface(x, z);
    if (altar <= ceiling && altar > best.y) best = { id: ENERGY_ALTAR.id, y: altar };
    if (onRainbow(FOREST_BRIDGE, x, z)) {
      const y = forestRainbowHeight(z);
      if (y <= ceiling && y > best.y) best = { id: "forest-rainbow", y };
    }
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
  const ceiling = (pose.layer === "sky" || pose.layer === SUMMER) && Number.isFinite(pose.y) ? pose.y + .25 : Infinity;
  const cloudCeiling = Number.isFinite(pose.y) ? pose.y + .24 : Infinity;
  const y = floorAt(pose.layer, pose.x, pose.z, ceiling, cloudOffset, cloudCeiling, facilities).y;
  const clear = (x, y, z) => Number.isFinite(y) &&
    !blockingSolid(pose.layer, x, y, z, facilities?.solids) && !underCloud(pose.layer, x, y, z) &&
    (pose.layer !== WINTER || winterWalkable(x, z, x, z)) &&
    (pose.layer !== SUMMER || summerWalkable({ x, y, z }, x, z, radius));
  if (clear(pose.x, y, pose.z)) return { ...pose, y };
  for (let distance = .25; distance <= 6; distance += .25) {
    for (let angle = Math.PI; angle < 3 * Math.PI; angle += Math.PI / 8) {
      const x = pose.x + Math.cos(angle) * distance;
      const z = pose.z + Math.sin(angle) * distance;
      if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) continue;
      const y = floorAt(pose.layer, x, z, ceiling + .5, cloudOffset, cloudCeiling, facilities).y;
      if (clear(x, y, z)) return { ...pose, x, y, z };
    }
  }
  const fallback = pose.layer === WINTER ? WINTER_ENTRY : pose.layer === SUMMER ? SUMMER_ENTRY : pose.layer === "sky" ? SKY : HOME;
  return { ...fallback, y: floorAt(fallback.layer, fallback.x, fallback.z).y };
}

export function spawnPlayer(pose, cloudOffset = 0, facilities) {
  if (pose.layer === SUMMER) pose = restoreTowerPose(pose, radius, PLAYER_HEIGHT);
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

function towerStepHeight(player, x, z) {
  if (!player.grounded || !canReturnFromTower(player)) return player.y;
  const next = towerFloor(x, z, player.y + .4, -Infinity);
  return Math.abs(next - player.y) <= .4 ? next : player.y;
}

function movementSolid(player, x, z, facilities) {
  const next = towerStepHeight(player, x, z);
  return blockingSolid(player.layer, x, player.y, z, facilities?.solids) ??
    (next !== player.y ? blockingSolid(player.layer, x, next, z, facilities?.solids) : undefined);
}

function canMove(player, x, z, cloudOffset, facilities) {
  if (player.layer === WINTER) return winterWalkable(player.x, player.z, x, z);
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return false;
  const solid = movementSolid(player, x, z, facilities);
  if (solid) {
    // A pose already overlapping a tower surface can take a step out of it.
    if (!canReturnFromTower(player) || blockingSolid(SUMMER, player.x, player.y, player.z)?.kind !== solid.kind) return false;
    const [nx, nz] = contactNormal(solid, player.x, player.z);
    if ((x - player.x) * nx + (z - player.z) * nz <= 1e-8) return false;
  }
  if (player.layer === SUMMER) {
    if (!player.grounded && player.y < TOWER_LANDING &&
        player.y + PLAYER_HEIGHT > towerGalleryCeiling(x, z) &&
        player.y + PLAYER_HEIGHT <= towerGalleryCeiling(player.x, player.z)) return false;
    return summerWalkable(player, x, z, radius);
  }
  if (player.layer === "ground") {
    const onBridge = onRainbow(FOREST_BRIDGE, player.x, player.z);
    const inLane = onRainbow(FOREST_BRIDGE, x, z, RAINBOW_WIDTH - 2 * radius);
    if (onBridge && player.y > terrainHeight(player.x, player.z) + .18 &&
        !inLane && z < FOREST_BRIDGE.start - .15) return false;
    if (!onBridge && inLane && forestRainbowHeight(z) > player.y + .4) return false;
    if (underCloud(player.layer, x, player.y, z) && !underCloud(player.layer, player.x, player.y, player.z)) return false;
    const clearance = player.y + (player.grounded ? .4 : .025);
    if (altarSurface(x, z) > clearance && altarSurface(player.x, player.z) <= clearance) return false;
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

function towerStandingIsSafe(player) {
  if (blockingSolid(SUMMER, player.x, player.y, player.z) ||
      !summerWalkable(player, player.x, player.z, radius)) return false;
  const floor = summerFloor(player.x, player.z, player.y + .06);
  return Math.abs(floor - player.y) <= .06;
}

function checkTowerStall(player, dx, dz, dt, x, z) {
  const history = towerMovement.get(player);
  if (!canReturnFromTower(player)) {
    if (history) towerMovement.delete(player);
    return;
  }
  if (!player.grounded) {
    if (history) history.blocked = 0;
    return;
  }
  if (towerStandingIsSafe(player)) {
    const record = history ?? { last: {}, blocked: 0 };
    Object.assign(record.last, { x: player.x, y: player.y, z: player.z });
    record.blocked = 0;
    if (!history) towerMovement.set(player, record);
    return;
  }
  if (!history?.last) return;
  const input = Math.hypot(dx, dz);
  if (input < .001 || Math.hypot(player.x - x, player.z - z) >= input * .08) {
    history.blocked = 0;
    return;
  }
  history.blocked += dt;
  const { last } = history;
  if (history.blocked >= .46 && Math.abs(player.y - last.y) <= .8 &&
      Math.hypot(player.x - last.x, player.z - last.z) <= 1.5 &&
      towerStandingIsSafe({ layer: SUMMER, ...last })) {
    Object.assign(player, last, { vy: 0, grounded: true });
    history.blocked = 0;
  }
}

export function movePlayer(player, dx, dz, dt, practiceArea, cloudOffset = 0, facilities) {
  const { x, z } = player;
  if (!practiceArea && canReturnFromTower(player) && player.grounded && !towerMovement.has(player) && towerStandingIsSafe(player)) {
    towerMovement.set(player, { last: { x, y: player.y, z }, blocked: 0 });
  }
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / MAX_HORIZONTAL_STEP));
  let checkpoint;
  let fell = false;
  for (let i = 0; i < steps && !fell; i++) {
    const result = moveStep(player, dx / steps, dz / steps, dt / steps, practiceArea, cloudOffset, facilities);
    checkpoint = result.checkpoint || checkpoint;
    fell = result.fell;
  }
  if (!practiceArea && player.layer === SUMMER) checkTowerStall(player, dx, dz, dt, x, z);
  return { checkpoint, fell };
}

function moveStep(player, dx, dz, dt, practiceArea, cloudOffset, facilities) {
  if (practiceArea) {
    const { x, z, halfWidth } = practiceArea;
    player.x = Math.max(x - halfWidth, Math.min(x + halfWidth, player.x + dx));
    player.z = Math.max(z - halfWidth, Math.min(z + halfWidth, player.z + dz));
  } else if (dx || dz) {
    const { x, y, z, layer } = player;
    // Project onto the relevant circular boundary before resolving other solids.
    const wallHeight = y < TOWER_LANDING
      ? Math.min(TOWER_LANDING - .0001, Math.max(y, towerStepHeight(player, x + dx, z + dz))) : y;
    const bounded = onTowerGallery(player)
      ? clampGalleryStep(player, x + dx, z + dz, radius)
      : constrainTowerWall(player, x + dx, wallHeight, z + dz) ?? clampShoreStep(player, x + dx, z + dz, radius);
    if (bounded) {
      dx = bounded.x - x;
      dz = bounded.z - z;
    }
    if (canMove(player, x + dx, z + dz, cloudOffset, facilities)) {
      player.x += dx;
      player.z += dz;
    } else {
      const solid = movementSolid(player, x + dx, z + dz, facilities);
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
    const nextY = oldY + player.vy * dt;
    const ceiling = !practiceArea && player.layer === SUMMER && player.vy > 0 && oldY < TOWER_LANDING
      ? Math.max(oldY, Math.min(towerHeadCeiling(player.x, player.z, radius) - PLAYER_HEIGHT,
        summerDeckCeiling(player.x, player.z, oldY, radius) - COAST_HEADROOM)) : Infinity;
    player.y = Math.min(nextY, ceiling);
    if (nextY >= ceiling) player.vy = 0;
    if (player.vy <= 0 && player.y <= floor.y) {
      player.y = floor.y;
      if (!practiceArea) Object.assign(player, constrainTowerWall(player, player.x, player.y, player.z));
      if (!practiceArea && !canReturnFromTower(player) && (blockingSolid(player.layer, player.x, player.y, player.z, facilities?.solids) ||
          underCloud(player.layer, player.x, player.y, player.z))) {
        Object.assign(player, safePosition(player, cloudOffset, facilities));
      }
      player.vy = 0;
      player.grounded = true;
    }
  }
  if (!practiceArea && player.y > oldY) {
    Object.assign(player, constrainTowerWall(player, player.x, player.y, player.z));
  }
  return { checkpoint: player.grounded && floor.checkpoint, fell: player.y < (player.layer === "sky" ? 16 : -8) };
}
