import { blockingSolid, PLAYER_RADIUS } from "./collision.js";
import { CONSTRUCTION_SITES, constructionSite, facilitySolids, fixedBuilt, fixedPlacement } from "./construction-sites.js";
import { hasMaterials, materialCount, spendMaterials } from "./materials.js";

export function canReachSite(player, site) {
  return player.layer === site.layer && player.grounded &&
    Math.abs(player.y - site.y) <= (site.decks ? 1.65 : 1.15) && Math.hypot(player.x - site.x, player.z - site.z) < site.range;
}

export function nearbyConstruction(player, state) {
  return CONSTRUCTION_SITES.find((site) => canReachSite(player, site) && !fixedBuilt(state.placements, site.id));
}

export function recipeStatus(state, site) {
  return Object.entries(site.recipe).map(([id, required]) => {
    const held = materialCount(state, id);
    return { id, required, held, missing: Math.max(0, required - held) };
  });
}

export function prepareConstruction(state, player, id) {
  const site = constructionSite(id);
  if (!site || fixedBuilt(state.placements, id) || !canReachSite(player, site)) return { error: "建造点已不可用。" };
  if (!hasMaterials(state, site.recipe)) return { error: "背包里的材料还不足。" };
  const overlapsDeck = site.decks && [site.base, ...site.decks].some((deck) =>
    Math.abs(player.x - deck.x) < deck.w / 2 + PLAYER_RADIUS &&
    Math.abs(player.z - deck.z) < deck.d / 2 + PLAYER_RADIUS);
  if (overlapsDeck || blockingSolid(player.layer, player.x, player.y, player.z, facilitySolids(site))) {
    return { error: "请走到基座旁边再建造。" };
  }
  const next = { ...state, materials: { ...state.materials }, placements: [...state.placements, fixedPlacement(site)] };
  spendMaterials(next, site.recipe);
  return { site, next };
}
