import { readPianoProgress } from "./piano-rules.js";
import { DAY_LENGTH, normalizeWorldTime } from "./day-night.js";
import { BATH, BATH_CLEARANCE, HOME, POIS, SKY, WORLD_LIMIT } from "./map.js";
import { floorAt } from "./motion.js";

export const SAVE_KEY = "cloudhaven-save-v1";
export const ITEMS = { wood: "木材", stone: "小石头", seed: "种子" };

function poseFrom(value, fallback) {
  if (!value || !["ground", "sky"].includes(value.layer) ||
      !Number.isFinite(value.x) || !Number.isFinite(value.z) ||
      Math.abs(value.x) > WORLD_LIMIT || Math.abs(value.z) > WORLD_LIMIT) return { ...fallback };
  const floor = floorAt(value.layer, value.x, value.z, value.layer === "sky" && Number.isFinite(value.y) ? value.y + .25 : Infinity);
  return Number.isFinite(floor.y) ? { x: value.x, y: floor.y, z: value.z, layer: value.layer } : { ...fallback };
}

function readCounts(value) {
  return Object.fromEntries(Object.keys(ITEMS).map((id) => [
    id, Number.isSafeInteger(value?.[id]) && value[id] >= 0 ? value[id] : 0,
  ]));
}

export function transferItem(state, id, deposit) {
  if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) return false;
  const [source, target] = deposit ? [state.inventory, state.chest] : [state.chest, state.inventory];
  if (source[id] === 0 || target[id] === Number.MAX_SAFE_INTEGER) return false;
  source[id]--;
  target[id]++;
  return true;
}

export function readSave(raw) {
  const checkpoint = poseFrom(raw?.checkpoint?.layer === "sky" ? raw.checkpoint : SKY, SKY);
  let pose = poseFrom(raw?.pose, raw?.pose?.layer === "sky" ? checkpoint : HOME);
  if (pose.layer === "ground" && Math.hypot(pose.x - BATH.x, pose.z - BATH.z) < BATH_CLEARANCE) {
    pose = poseFrom({ x: BATH.x, z: BATH.z + BATH_CLEARANCE + .05, layer: "ground" }, HOME);
  }
  const knownItems = Array.isArray(raw?.discovered) ? raw.discovered : [];
  const collected = Array.isArray(raw?.collected)
    ? POIS.filter((spot) => spot.item && raw.collected.includes(spot.id)).map((spot) => spot.id) : [];
  return {
    version: 1, pose, checkpoint,
    cameraYaw: Number.isFinite(raw?.cameraYaw) ? raw.cameraYaw % (Math.PI * 2) : -.62,
    inventory: readCounts(raw?.inventory),
    chest: readCounts(raw?.chest),
    discovered: Object.keys(ITEMS).filter((id) => knownItems.includes(id) || raw?.inventory?.[id] > 0 || raw?.chest?.[id] > 0),
    collected,
    fed: Number.isFinite(raw?.fed) ? raw.fed : 0,
    worldTime: Number.isFinite(raw?.worldTime) ? normalizeWorldTime(raw.worldTime) : DAY_LENGTH / 4,
    moonlightEnergy: Number.isFinite(raw?.moonlightEnergy) ? Math.max(0, Math.min(100, raw.moonlightEnergy)) : 100,
    bathed: Number.isFinite(raw?.bathed) ? raw.bathed : 0,
    infoPanel: ["expanded", "compact", "hidden"].includes(raw?.infoPanel) ? raw.infoPanel : "compact",
    audio: {
      enabled: raw?.audio?.enabled !== false,
      volume: Number.isFinite(raw?.audio?.volume) ? Math.min(1, Math.max(0, raw.audio.volume)) : .65,
    },
    piano: readPianoProgress(raw?.piano),
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
