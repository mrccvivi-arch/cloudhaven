import { HOME, POIS, SKY, WORLD_LIMIT } from "./map.js";
import { floorAt } from "./motion.js";

export const SAVE_KEY = "cloudhaven-save-v1";
export const ITEMS = { wood: "木材", stone: "小石头", seed: "种子" };

function poseFrom(value, fallback) {
  if (!value || !["ground", "sky"].includes(value.layer) ||
      !Number.isFinite(value.x) || !Number.isFinite(value.z) ||
      Math.abs(value.x) > WORLD_LIMIT || Math.abs(value.z) > WORLD_LIMIT) return { ...fallback };
  const floor = floorAt(value.layer, value.x, value.z, Number.isFinite(value.y) ? value.y + .25 : Infinity);
  return Number.isFinite(floor.y) ? { x: value.x, y: floor.y, z: value.z, layer: value.layer } : { ...fallback };
}

export function readSave(raw) {
  const checkpoint = poseFrom(raw?.checkpoint?.layer === "sky" ? raw.checkpoint : SKY, SKY);
  const pose = poseFrom(raw?.pose, raw?.pose?.layer === "sky" ? checkpoint : HOME);
  const knownItems = Array.isArray(raw?.discovered) ? raw.discovered : [];
  const collected = Array.isArray(raw?.collected)
    ? POIS.filter((spot) => spot.item && raw.collected.includes(spot.id)).map((spot) => spot.id) : [];
  return {
    version: 1, pose, checkpoint,
    cameraYaw: Number.isFinite(raw?.cameraYaw) ? raw.cameraYaw % (Math.PI * 2) : -.62,
    inventory: Object.fromEntries(Object.keys(ITEMS).map((id) => [
      id, Number.isSafeInteger(raw?.inventory?.[id]) && raw.inventory[id] >= 0 ? raw.inventory[id] : 0,
    ])),
    discovered: Object.keys(ITEMS).filter((id) => knownItems.includes(id) || raw?.inventory?.[id] > 0),
    collected,
    fed: Number.isFinite(raw?.fed) ? raw.fed : 0,
    rested: Number.isFinite(raw?.rested) ? raw.rested : 0,
    bathed: Number.isFinite(raw?.bathed) ? raw.bathed : 0,
    reachedLookout: raw?.reachedLookout === true,
    // Placements are keyed by their future stable IDs; each holds a type, position and rotation.
    placements: Array.isArray(raw?.placements) ? raw.placements.filter((entry) =>
      typeof entry?.id === "string" && typeof entry.type === "string" &&
      [entry.position?.x, entry.position?.y, entry.position?.z, entry.rotation].every(Number.isFinite)) : [],
  };
}

export function loadGame(storage) {
  return readSave(JSON.parse(storage.getItem(SAVE_KEY)));
}

export function saveGame(storage, state) {
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}
