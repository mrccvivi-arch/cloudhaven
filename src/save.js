import { WINTER, WINTER_ENTRY } from "./winter-layout.js";
import { SUMMER, SUMMER_ENTRY, restoreTowerPose } from "./summer-layout.js";
import { cameraDistance } from "./camera.js";
import { readAffection } from "./affection.js";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "./collision.js";
import { readPianoProgress } from "./piano-rules.js";
import { DAY_CYCLE_SECONDS, DAY_LENGTH, normalizeWorldTime } from "./day-night.js";
import { HOME, SKY, WORLD_LIMIT } from "./map.js";
import { readGathering, readMaterialCounts } from "./materials.js";
import { constructionSite, facilityGeometry, fixedPlacement } from "./construction-sites.js";
import { floorAt, restoreWinterPose } from "./motion.js";

export const SAVE_KEY = "cloudhaven-save-v1";
const LEGACY_WORLD_CYCLE_SECONDS = 20 * 60;

function poseFrom(value, fallback, facilities) {
  if (value?.layer === WINTER) return restoreWinterPose(value);
  if (!value || !["ground", "sky", SUMMER].includes(value.layer) ||
      !Number.isFinite(value.x) || !Number.isFinite(value.z) ||
      Math.abs(value.x) > WORLD_LIMIT || Math.abs(value.z) > WORLD_LIMIT) return { ...fallback };
  if (value.layer === SUMMER) value = restoreTowerPose(value, PLAYER_RADIUS, PLAYER_HEIGHT);
  const floor = floorAt(value.layer, value.x, value.z, value.layer !== "ground" && Number.isFinite(value.y) ? value.y + .25 : Infinity, 0, Number.isFinite(value.y) ? value.y + .24 : Infinity, facilities);
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
  const savedCycleSeconds = Number.isFinite(raw?.worldCycleSeconds) && raw.worldCycleSeconds > 0
    ? raw.worldCycleSeconds : LEGACY_WORLD_CYCLE_SECONDS;
  const savedTime = Number.isFinite(raw?.worldTime)
    ? normalizeWorldTime(raw.worldTime, savedCycleSeconds)
    : savedCycleSeconds * (DAY_LENGTH / DAY_CYCLE_SECONDS / 4);
  const worldPhase = savedTime / savedCycleSeconds;
  const placements = readPlacements(raw?.placements);
  const facilities = facilityGeometry(placements);
  const checkpoint = poseFrom(raw?.checkpoint?.layer === "sky" ? raw.checkpoint : SKY, SKY);
  const pose = poseFrom(raw?.pose, raw?.pose?.layer === WINTER ? WINTER_ENTRY : raw?.pose?.layer === SUMMER ? SUMMER_ENTRY : raw?.pose?.layer === "sky" ? checkpoint : HOME, facilities);
  const affection = readAffection(raw?.affection);
  const hasTouchHistory = Boolean(affection.firstMetDate || affection.affectionPoints || affection.dailyTouchCount ||
    affection.lastTouchAt || affection.lastTouchDate || affection.lastDialogueId ||
    Object.values(affection.specialAt).some(Boolean) ||
    (Number.isSafeInteger(raw?.affection?.ginkgoDialogueAt) && raw.affection.ginkgoDialogueAt > 0) ||
    (typeof raw?.affection?.lastGinkgoDialogueId === "string" && /^ginkgo-\d+$/.test(raw.affection.lastGinkgoDialogueId)));
  return {
    version: 1, pose, checkpoint,
    winterDiscovery: {
      whale: raw?.winterDiscovery?.whale === true, tree: raw?.winterDiscovery?.tree === true,
      flower: raw?.winterDiscovery?.flower === true,
    },
    cameraDistance: cameraDistance(raw?.cameraDistance),
    cameraYaw: Number.isFinite(raw?.cameraYaw) ? raw.cameraYaw % (Math.PI * 2) : -.62,
    materials: readMaterialCounts(raw?.materials),
    storedMaterials: readMaterialCounts(raw?.storedMaterials),
    gathering: readGathering(raw?.gathering, worldPhase),
    worldTime: savedCycleSeconds === DAY_CYCLE_SECONDS ? savedTime : worldPhase * DAY_CYCLE_SECONDS,
    worldCycleSeconds: DAY_CYCLE_SECONDS,
    moonlightEnergy: Number.isFinite(raw?.moonlightEnergy) ? Math.max(0, Math.min(100, raw.moonlightEnergy)) : 100,
    infoPanel: ["expanded", "compact", "hidden"].includes(raw?.infoPanel) ? raw.infoPanel : "compact",
    minimapCollapsed: raw?.minimapCollapsed === true,
    audio: {
      enabled: raw?.audio?.enabled !== false,
      volume: Number.isFinite(raw?.audio?.volume) ? Math.min(1, Math.max(0, raw.audio.volume)) : .65,
    },
    music: {
      enabled: raw?.music?.enabled !== false,
      volume: Number.isFinite(raw?.music?.volume) ? Math.min(1, Math.max(0, raw.music.volume)) : .25,
    },
    affection,
    springDiscovery: {
      discovered: raw?.springDiscovery?.discovered === true,
      lastEntryAt: Number.isSafeInteger(raw?.springDiscovery?.lastEntryAt) ? Math.max(0, raw.springDiscovery.lastEntryAt) : 0,
    },
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
