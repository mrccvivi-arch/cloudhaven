import { terrainHeight } from "./map.js";

const platform = { x: 37.25, z: 13.5, w: 14.8, d: 10.6 };
const platformBase = { ...platform, w: 15.04, d: 10.84 };
const platformGround = Math.min(...[-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) =>
  terrainHeight(platform.x + dx * platformBase.w / 2, platform.z + dz * platformBase.d / 2))));
const stepDepth = .65;
const deckY = 2.94;
const stairs = Array.from({ length: 6 }, (_, index) => ({
  id: `forest-platform-step-${index}`, x: platform.x,
  z: platform.z + platform.d / 2 + (5.5 - index) * stepDepth,
  w: 3.8, d: stepDepth, y: deckY - (6 - index) * .205,
}));
const platformDeck = { ...platform, id: "forest-platform", y: deckY };
const northEdge = platform.z - platformBase.d / 2;
const southEdge = stairs[0].z + stepDepth / 2;
const platformFootprint = {
  x: platform.x, z: (northEdge + southEdge) / 2, w: platformBase.w, d: southEdge - northEdge,
  parts: [platformBase, {
    x: platform.x, z: (platform.z + platform.d / 2 + southEdge) / 2,
    w: stairs[0].w, d: stairs.length * stepDepth,
  }],
};

export const CONSTRUCTION_SITES = [
  { id: "starlight-circle", name: "星光石阵", x: -18, z: 11.5, radius: 4.8, range: 6.75,
    footprint: { x: -18, z: 11.5, w: 11, d: 9.65 }, recipe: { stone: 30, stardust: 5 } },
  { id: "forest-platform", name: "森林观景台", ...platform, range: 11,
    recipe: { branch: 30, stone: 15 }, y: platformGround,
    base: platformBase, footprint: platformFootprint, decks: [...stairs, platformDeck] },
  { id: "golden-garden", name: "金叶花园", x: -31.5, z: -9, radius: 4.52, range: 6,
    recipe: { golden_leaf: 30, wildflower: 20 } },
  { id: "moon-altar", name: "月光祭坛", x: -10.25, z: -6, radius: 4.27, range: 5.85,
    recipe: { stone: 40, stardust: 15 } },
].map(({ x, z, radius, name, ...site }) => ({
  ...site, x, z, radius, name, layer: "ground", label: `建造 · ${name}`,
  y: site.y ?? terrainHeight(x, z),
  footprint: site.footprint ?? { x, z, radius },
}));

export const constructionSite = (id) => CONSTRUCTION_SITES.find((site) => site.id === id);

export function footprintDistance(footprint, x, z) {
  if (footprint.parts) return Math.min(...footprint.parts.map((part) => footprintDistance(part, x, z)));
  const dx = Math.abs(x - footprint.x), dz = Math.abs(z - footprint.z);
  return footprint.w ? Math.hypot(Math.max(0, dx - footprint.w / 2), Math.max(0, dz - footprint.d / 2))
    : Math.hypot(dx, dz) - footprint.radius;
}

export function fixedPlacement(site) {
  return {
    id: site.id, type: "fixed-facility",
    position: { x: site.x, y: site.y, z: site.z }, rotation: 0,
  };
}

export const fixedBuilt = (placements, id) => placements.some((entry) =>
  entry.type === "fixed-facility" && entry.id === id);

function groundPoint(site, dx, dz, radius, height) {
  const x = site.x + dx, z = site.z + dz;
  return { x, z, y: terrainHeight(x, z), radius, height };
}

export function starStones(site) {
  return [
    [2.08, 3.72, .43, 1.52], [4.04, 2.48, .58, 2.14], [4.78, -.12, .62, 2.82], [3.73, -2.78, .63, 3.05],
    [1.88, -3.65, .55, 2.38], [-1.9, -3.83, .57, 2.86], [-3.84, -2.59, .68, 3.24],
    [-4.79, -.22, .61, 2.68], [-4.12, 2.22, .56, 1.87], [-2.32, 3.67, .47, 1.42],
  ].map(([x, z, radius, height]) => groundPoint(site, x, z, radius, height));
}

export function platformPosts(site) {
  return [-3.9, 3.9].flatMap((x) => [-3.8, .1].map((z) => ({ x: site.x + x, z: site.z + z })));
}

export function platformRails(site) {
  const edgeX = site.w / 2 - .24, edgeZ = site.d / 2 - .23;
  const entrance = stairs[0].w / 2 + .11;
  const frontRun = edgeX - entrance;
  return [
    ...[-1, 1].map((sign) => ({ x: site.x + sign * edgeX, z: site.z, w: .24, d: 2 * edgeZ })),
    { x: site.x, z: site.z - edgeZ, w: 2 * edgeX, d: .24 },
    ...[-1, 1].map((sign) => ({ x: site.x + sign * (entrance + frontRun / 2), z: site.z + edgeZ, w: frontRun, d: .24 })),
  ];
}

export function gardenBasin(site) {
  return groundPoint(site, -2.01, -.67, .71, .75);
}

export function altarPillars(site) {
  return [[-2.69, -1.72, .68, 3.28], [2.47, -1.94, .63, 3.88]]
    .map(([x, z, radius, height]) => groundPoint(site, x, z, radius, height));
}

function solid(kind, { x, z, y }, radius, height) {
  return { kind, x, z, radius, bottom: y - .18, top: y + height };
}

export function facilitySolids(site) {
  if (site.id === "starlight-circle") return [
    solid(site.id, site, 1.27, 2.78),
    ...starStones(site).map((stone) => solid(site.id, stone, stone.radius * 1.08, stone.height)),
  ];
  if (site.id === "forest-platform") {
    const y = site.decks.at(-1).y;
    return [
      ...platformPosts(site).map((post) => solid(site.id, { ...post, y }, .27, 4.06)),
      ...platformRails(site).map((rail) => ({ ...rail, kind: site.id, cos: 1, sin: 0, bottom: y - .06, top: y + 1.02 })),
    ];
  }
  if (site.id === "golden-garden") {
    const basin = gardenBasin(site);
    return [solid(site.id, basin, basin.radius, basin.height)];
  }
  return [solid(site.id, { ...site, z: site.z - .55 }, 1.45, 1.28),
    ...altarPillars(site).map((pillar) => solid(site.id, pillar, pillar.radius, pillar.height))];
}

// Runtime geometry is keyed by facility ID so old placements adopt the revised models.
export function facilityGeometry(placements) {
  const built = CONSTRUCTION_SITES.filter(({ id }) => fixedBuilt(placements, id));
  return {
    footprints: built.map(({ id, layer, footprint }) => ({ id, layer, ...footprint })),
    solids: built.flatMap(facilitySolids),
    decks: built.flatMap((site) => site.decks ?? []),
    cameraRoofs: built.filter((site) => site.id === "forest-platform").map((site) => ({
      x: site.x, y: site.decks.at(-1).y + 4.99, z: site.z - 1.82, w: 10.1, h: 1.74, d: 6.33,
    })),
  };
}
