import assert from "node:assert/strict";
import { test } from "node:test";
import { blockingSolid } from "../src/collision.js";
import { nearbyConstruction, prepareConstruction, recipeStatus } from "../src/construction.js";
import { CONSTRUCTION_SITES, facilityGeometry, fixedPlacement } from "../src/construction-sites.js";
import { MATERIAL_SLOTS } from "../src/materials.js";
import { GOLDEN_GINKGO, HOME, SKY_GATE, TREES, terrainHeight } from "../src/map.js";
import { movePlayer, spawnPlayer } from "../src/motion.js";
import { loadGame, readSave, saveGame } from "../src/save.js";

const recipes = {
  "starlight-circle": { stone: 30, stardust: 5 },
  "forest-platform": { branch: 30, stone: 15 },
  "golden-garden": { golden_leaf: 30, wildflower: 20 },
  "moon-altar": { stone: 40, stardust: 15 },
};

test("four fixed builds use the backpack once and restore through the existing save", () => {
  let serialized;
  const storage = { setItem: (_key, value) => { serialized = value; }, getItem: () => serialized };
  let state = readSave({ materials: { stone: 85, branch: 30, golden_leaf: 30, wildflower: 20, stardust: 20 } });
  for (const site of CONSTRUCTION_SITES) {
    const player = spawnPlayer({ x: site.x, z: site.z + site.range - .5, layer: "ground" });
    assert.deepEqual(site.recipe, recipes[site.id]);
    assert.equal(nearbyConstruction(player, state), site);
    assert.ok(recipeStatus(state, site).every(({ missing }) => !missing));
    const before = { ...state.materials };
    const { next } = prepareConstruction(state, player, site.id);
    assert.deepEqual(state.materials, before);
    assert.equal(next.placements.length, state.placements.length + 1);
    for (const [id, amount] of Object.entries(before)) {
      assert.equal(next.materials[id], amount - (recipes[site.id][id] ?? 0));
    }
    saveGame(storage, next);
    state = loadGame(storage);
    assert.equal(nearbyConstruction(player, state), undefined);
    assert.ok(prepareConstruction(state, player, site.id).error);
  }
  assert.equal(state.placements.length, 4);
  assert.ok(Object.values(state.materials).every((count) => count === 0));
  assert.equal(readSave(null).placements.length, 0);
});

test("construction validates reach and occupancy, and ignores materials stored in the chest", () => {
  const site = CONSTRUCTION_SITES[0];
  const player = spawnPlayer({ x: site.x, z: site.z + site.range - .5, layer: "ground" });
  const emptyBag = readSave({ storedMaterials: site.recipe });
  assert.deepEqual(recipeStatus(emptyBag, site).map(({ missing }) => missing), [30, 5]);
  assert.ok(prepareConstruction(emptyBag, player, site.id).error);
  assert.deepEqual(emptyBag.placements, []);
  const fullBag = readSave({ materials: site.recipe });
  assert.ok(prepareConstruction(fullBag, { ...player, layer: "sky" }, site.id).error);
  assert.ok(prepareConstruction(fullBag, { ...player, grounded: false }, site.id).error);
  assert.ok(prepareConstruction(fullBag, { ...player, z: site.z, y: site.y }, site.id).error);
  const platform = CONSTRUCTION_SITES[1];
  const onMarker = spawnPlayer({ x: platform.x, z: platform.z, layer: "ground" });
  assert.ok(prepareConstruction(readSave({ materials: platform.recipe }), onMarker, platform.id).error);
  assert.deepEqual(fullBag.materials, { stone: 30, branch: 0, golden_leaf: 0, wildflower: 0, stardust: 5 });
});

function footprintDistance({ x, z, w, d, radius }, point) {
  const dx = Math.abs(x - point.x), dz = Math.abs(z - point.z);
  return w ? Math.hypot(Math.max(0, dx - w / 2), Math.max(0, dz - d / 2)) : Math.hypot(dx, dz) - radius;
}

test("larger footprints keep material slots, trees, portal, spawn and ginkgo canopy clear", () => {
  for (const site of CONSTRUCTION_SITES) {
    for (const point of [...MATERIAL_SLOTS, HOME, SKY_GATE]) {
      assert.ok(footprintDistance(site.footprint, point) > .44, site.name);
    }
    for (const tree of TREES) {
      assert.ok(footprintDistance(site.footprint, tree) > tree.radius, site.name);
    }
  }
  const garden = CONSTRUCTION_SITES.find(({ id }) => id === "golden-garden");
  assert.ok(footprintDistance(garden.footprint, GOLDEN_GINKGO) > GOLDEN_GINKGO.canopyRadius);
});

test("star circle has open entrances and space to walk around the core", () => {
  const site = CONSTRUCTION_SITES[0];
  const geometry = facilityGeometry([fixedPlacement(site)]);
  assert.equal(blockingSolid("ground", site.x, site.y, site.z, geometry.solids).kind, site.id);
  const player = spawnPlayer({ x: site.x, z: site.z + 4.8, layer: "ground" }, 0, geometry);
  for (let frame = 0; frame < 35; frame++) movePlayer(player, 0, -.08, .01, undefined, 0, geometry);
  assert.ok(Math.abs(player.z - site.z - 2) < .05);
  for (let frame = 1; frame <= 80; frame++) {
    const angle = frame * Math.PI / 80;
    const x = site.x + 2 * Math.sin(angle), z = site.z + 2 * Math.cos(angle);
    movePlayer(player, x - player.x, z - player.z, .01, undefined, 0, geometry);
    assert.ok(Math.hypot(x - player.x, z - player.z) < .08);
  }
  for (let frame = 0; frame < 38; frame++) movePlayer(player, 0, -.08, .01, undefined, 0, geometry);
  assert.ok(player.z < site.z - site.radius);
});

test("the taller platform supports walking up and down the stone steps", () => {
  const site = CONSTRUCTION_SITES[1];
  const placements = [fixedPlacement(site)];
  const geometry = facilityGeometry(placements);
  const top = site.decks.at(-1).y;
  for (const dx of [-.75, 0, .75]) {
    const player = spawnPlayer({ x: site.x + dx, z: site.z + 7.2, layer: "ground" }, 0, geometry);
    for (let frame = 0; frame < 55; frame++) movePlayer(player, 0, -.08, .01, undefined, 0, geometry);
    assert.equal(player.y, top);
    assert.equal(player.grounded, true);
    assert.equal(readSave({ placements, pose: player }).pose.y, top);
    for (let frame = 0; frame < 70; frame++) movePlayer(player, 0, .08, .01, undefined, 0, geometry);
    assert.equal(player.y, terrainHeight(player.x, player.z));
  }
});

test("legacy placements keep build progress and inventory at the canonical dimensions", () => {
  const previous = [[-14, 19.5], [34.5, 13.5], [56, 34.5], [-11, -7]];
  const materials = { stone: 7, branch: 4, stardust: 2, wildflower: 9, golden_leaf: 3 };
  const state = readSave({ materials, placements: CONSTRUCTION_SITES.map((site, index) => ({
    ...fixedPlacement(site), position: { x: previous[index][0], y: 0, z: previous[index][1] },
  })) });
  assert.deepEqual(state.placements, CONSTRUCTION_SITES.map(fixedPlacement));
  assert.deepEqual(state.materials, materials);
});
