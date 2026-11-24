import { terrainHeight } from "./map.js";

const platform = { x: 37.25, z: 13.5, w: 10, d: 8.5 };
const platformBase = { ...platform, w: 10.38, d: 8.88 };
const platformGround = Math.min(...[-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) =>
  terrainHeight(platform.x + dx * platformBase.w / 2, platform.z + dz * platformBase.d / 2))));
const stairs = Array.from({ length: 3 }, (_, index) => ({
  id: `forest-platform-step-${index}`, x: platform.x, z: platform.z + platform.d / 2 + (2.5 - index) * .64,
  w: 2.7, d: .64, y: 1.52 + index * .24,
}));
const platformDeck = { ...platform, id: "forest-platform", y: 2.24 };
const northEdge = platform.z - platformBase.d / 2;
const southEdge = stairs[0].z + stairs[0].d / 2;
const platformFootprint = { x: platform.x, z: (northEdge + southEdge) / 2, w: platformBase.w, d: southEdge - northEdge };

export const CONSTRUCTION_SITES = [
  { id: "starlight-circle", name: "星光石阵", x: -18, z: 11.5, scale: 1.8, radius: 4.07, range: 5.75,
    recipe: { stone: 30, stardust: 5 } },
  { id: "forest-platform", name: "森林观景台", ...platform, range: 7.8,
    recipe: { branch: 30, stone: 15 }, y: platformGround,
    base: platformBase, footprint: platformFootprint, decks: [...stairs, platformDeck] },
  { id: "golden-garden", name: "金叶花园", x: 54.75, z: 36.75, radius: 4.32, range: 5.7,
    recipe: { golden_leaf: 30, wildflower: 20 } },
  { id: "moon-altar", name: "月光祭坛", x: -10.25, z: -6, scale: 1.8, radius: 3.35, range: 5.15,
    recipe: { stone: 40, stardust: 15 } },
].map(({ x, z, radius, name, ...site }) => ({
  ...site, x, z, radius, name, layer: "ground", label: `建造 · ${name}`,
  y: site.y ?? terrainHeight(x, z),
  footprint: site.footprint ?? { x, z, radius },
}));

export const constructionSite = (id) => CONSTRUCTION_SITES.find((site) => site.id === id);

export function fixedPlacement(site) {
  return {
    id: site.id, type: "fixed-facility",
    position: { x: site.x, y: site.y, z: site.z }, rotation: 0,
  };
}

export const fixedBuilt = (placements, id) => placements.some((entry) =>
  entry.type === "fixed-facility" && entry.id === id);

export function starStones(site) {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (index + .5) * Math.PI / 4;
    const x = site.x + 1.74 * site.scale * Math.cos(angle), z = site.z + 1.74 * site.scale * Math.sin(angle);
    return { x, z, y: terrainHeight(x, z), radius: (.31 + (index % 3) * .025) * site.scale, height: (.48 + (index % 4) * .14) * site.scale };
  });
}

function solid(kind, { x, z, y }, radius, height) {
  return { kind, x, z, radius, bottom: y - .25, top: y + height };
}

export function facilitySolids(site) {
  if (site.id === "starlight-circle") return [
    solid(site.id, site, .54 * site.scale, .95 * site.scale),
    ...starStones(site).map((stone) => solid(site.id, stone, stone.radius, stone.height)),
  ];
  if (site.id === "moon-altar") return [solid(site.id, site, 1.28 * site.scale, .43 * site.scale),
    solid(site.id, site, .55 * site.scale, 1.45 * site.scale)];
  return [];
}

// Movement and future placement checks can use the same built footprints.
export function facilityGeometry(placements) {
  const built = CONSTRUCTION_SITES.filter(({ id }) => fixedBuilt(placements, id));
  return {
    footprints: built.map(({ id, layer, footprint }) => ({ id, layer, ...footprint })),
    solids: built.flatMap(facilitySolids),
    decks: built.flatMap((site) => site.decks ?? []),
  };
}
