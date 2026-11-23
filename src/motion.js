import { GROUND_DECKS, PLATFORMS, TREES, WORLD_LIMIT, terrainHeight } from "./map.js";

export const MOVE_SPEED = 8.1;
export const JUMP_SPEED = 8.35;
export const GRAVITY = 16;
const radius = .44;

function includes(deck, x, z, pad = 0) {
  return Math.abs(x - deck.x) <= deck.w / 2 + pad && Math.abs(z - deck.z) <= deck.d / 2 + pad;
}

function decks(layer) {
  return layer === "sky" ? PLATFORMS : GROUND_DECKS;
}

export function floorAt(layer, x, z, ceiling = Infinity) {
  let best = layer === "ground" ? { y: terrainHeight(x, z) } : { y: -Infinity };
  for (const deck of decks(layer)) {
    if (includes(deck, x, z, radius * .35) && deck.y <= ceiling && deck.y > best.y) best = deck;
  }
  return best;
}

export function spawnPlayer(pose) {
  const floor = floorAt(pose.layer, pose.x, pose.z, Number.isFinite(pose.y) ? pose.y + .21 : Infinity);
  return { ...pose, y: floor.y, vy: 0, grounded: true };
}

export function jump(player) {
  if (!player.grounded) return false;
  player.vy = JUMP_SPEED;
  player.grounded = false;
  return true;
}

function canMove(player, x, z) {
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return false;
  if (player.layer === "ground" && TREES.some((tree) =>
    (tree.x - x) ** 2 + (tree.z - z) ** 2 < (tree.radius + radius) ** 2)) return false;
  return !decks(player.layer).some((deck) =>
    deck.id !== "creek-bridge" && player.y < deck.y - .38 &&
    !includes(deck, player.x, player.z, radius * .3) && includes(deck, x, z, radius * .3));
}

export function movePlayer(player, dx, dz, dt, practiceArea) {
  if (practiceArea) {
    const { x, z, halfWidth } = practiceArea;
    player.x = Math.max(x - halfWidth, Math.min(x + halfWidth, player.x + dx));
    player.z = Math.max(z - halfWidth, Math.min(z + halfWidth, player.z + dz));
  } else {
    if (canMove(player, player.x + dx, player.z)) player.x += dx;
    if (canMove(player, player.x, player.z + dz)) player.z += dz;
  }

  const oldY = player.y;
  const floor = practiceArea ? { y: 0 } : floorAt(
    player.layer, player.x, player.z, oldY + (player.grounded ? .4 : .025),
  );
  if (player.grounded && Math.abs(floor.y - oldY) <= .4) {
    player.y = floor.y;
  } else {
    player.grounded = false;
    player.vy -= GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.vy <= 0 && player.y <= floor.y) {
      player.y = floor.y;
      player.vy = 0;
      player.grounded = true;
    }
  }
  return { checkpoint: player.grounded && floor.checkpoint, fell: player.y < (player.layer === "sky" ? 16 : -8) };
}
