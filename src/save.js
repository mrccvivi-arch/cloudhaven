import { cameraDistance } from "./camera.js";
import { readAffection } from "./affection.js";
import { readPianoProgress } from "./piano-rules.js";
import { DAY_LENGTH, normalizeWorldTime } from "./day-night.js";
import { HOME, SKY, WORLD_LIMIT } from "./map.js";
import { readGathering, readMaterialCounts } from "./materials.js";
import { constructionSite, facilityGeometry, fixedPlacement } from "./construction-sites.js";
import { floorAt } from "./motion.js";

export const SAVE_KEY = "cloudhaven-save-v1";

function poseFrom(value, fallback, facilities) {
  if (!value || !["ground", "sky"].includes(value.layer) ||
      !Number.isFinite(value.x) || !Number.isFinite(value.z) ||
      Math.abs(value.x) > WORLD_LIMIT || Math.abs(value.z) > WORLD_LIMIT) return { ...fallback };
  const floor = floorAt(value.layer, value.x, value.z, value.layer === "sky" && Number.isFinite(value.y) ? value.y + .25 : Infinity, 0, Number.isFinite(value.y) ? value.y + .24 : Infinity, facilities);
  return Number.isFinite(floor.y) ? { x: value.x, y: floor.y, z: value.z, layer: value.layer } : { ...fallback };
}

function readPlacements(raw) {
  if (!Array.isArray(raw)) return [];
  const fixed = new Set();
  return raw.flatMap((entry) => {
    if (entry?.type === "fixed-facility") {
      const site = constructionSite(entry.id);
      if (!site || fixed.has(site.id)) return [];
      fixed.add(site.id);
      return [fixedPlacement(site)];
    }
    return typeof entry?.id === "string" && typeof entry.type === "string" &&
      [entry.position?.x, entry.position?.y, entry.position?.z, entry.rotation].every(Number.isFinite) ? [entry] : [];
  });
}

export function readSave(raw) {
  const placements = readPlacements(raw?.placements);
  const facilities = facilityGeometry(placements);
  const checkpoint = poseFrom(raw?.checkpoint?.layer === "sky" ? raw.checkpoint : SKY, SKY);
  const pose = poseFrom(raw?.pose, raw?.pose?.layer === "sky" ? checkpoint : HOME, facilities);
  const affection = readAffection(raw?.affection);
  const hasTouchHistory = Boolean(affection.firstMetDate || affection.affectionPoints || affection.dailyTouchCount ||
    affection.lastTouchAt || affection.lastTouchDate || affection.lastDialogueId ||
    Object.values(affection.specialAt).some(Boolean) ||
    (Number.isSafeInteger(raw?.affection?.ginkgoDialogueAt) && raw.affection.ginkgoDialogueAt > 0) ||
    (typeof raw?.affection?.lastGinkgoDialogueId === "string" && /^ginkgo-\d+$/.test(raw.affection.lastGinkgoDialogueId)));
  return {
    version: 1, pose, checkpoint,
    cameraDistance: cameraDistance(raw?.cameraDistance),
    cameraYaw: Number.isFinite(raw?.cameraYaw) ? raw.cameraYaw % (Math.PI * 2) : -.62,
    materials: readMaterialCounts(raw?.materials),
    storedMaterials: readMaterialCounts(raw?.storedMaterials),
    gathering: readGathering(raw?.gathering),
    worldTime: Number.isFinite(raw?.worldTime) ? normalizeWorldTime(raw.worldTime) : DAY_LENGTH / 4,
    moonlightEnergy: Number.isFinite(raw?.moonlightEnergy) ? Math.max(0, Math.min(100, raw.moonlightEnergy)) : 100,
    infoPanel: ["expanded", "compact", "hidden"].includes(raw?.infoPanel) ? raw.infoPanel : "compact",
    audio: {
      enabled: raw?.audio?.enabled !== false,
      volume: Number.isFinite(raw?.audio?.volume) ? Math.min(1, Math.max(0, raw.audio.volume)) : .65,
    },
    music: {
      enabled: raw?.music?.enabled !== false,
      volume: Number.isFinite(raw?.music?.volume) ? Math.min(1, Math.max(0, raw.music.volume)) : .25,
    },
    affection,
    hasMetMoon: typeof raw?.hasMetMoon === "boolean" ? raw.hasMetMoon : hasTouchHistory,
    piano: readPianoProgress(raw?.piano),
    reachedLookout: raw?.reachedLookout === true,
    placements,
  };
}

export function loadGame(storage) {
  return readSave(JSON.parse(storage.getItem(SAVE_KEY)));
}

export function saveGame(storage, state) {
  storage.setItem(SAVE_KEY, JSON.stringify(state));
}
