import assert from "node:assert/strict";
import { test } from "node:test";
import { Raycaster, Scene } from "three";
import { createConstructionModels } from "../src/construction-models.js";
import { CONSTRUCTION_SITES, fixedPlacement } from "../src/construction-sites.js";

test("all construction previews share geometry, fade at distance, and disappear on construction or departure", () => {
  const scene = new Scene();
  const construction = createConstructionModels(scene, () => {});
  for (const [index, site] of CONSTRUCTION_SITES.entries()) {
    construction.sync([]);
    const [, built, ghost] = scene.children[index + 1].children;
    assert.deepEqual(ghost.position.toArray(), built.position.toArray());
    assert.deepEqual(ghost.quaternion.toArray(), built.quaternion.toArray());
    const meshes = [];
    built.traverse((mesh) => { if (mesh.isMesh && !mesh.material.transparent) meshes.push(mesh); });
    assert.equal(ghost.children.length, meshes.length);
    for (const [i, preview] of ghost.children.entries()) {
      assert.equal(preview.geometry, meshes[i].geometry);
      assert.notEqual(preview.material, meshes[i].material);
      assert.ok(!preview.castShadow && !preview.receiveShadow);
      assert.ok(!construction.occluders.includes(preview));
      assert.equal(preview.raycast(new Raycaster(), []), undefined);
    }
    const playerAt = (factor) => ({ x: site.x, z: site.z + site.range * factor });
    const material = ghost.children[0].material;
    construction.update(0, 0, playerAt(1.9));
    assert.equal(ghost.visible, false);
    construction.update(0, 0, playerAt(1.7));
    assert.equal(ghost.visible, true);
    const faint = material.opacity;
    construction.update(0, 0, playerAt(1.1));
    assert.ok(material.opacity > faint && material.opacity >= .15 && material.opacity <= .30);
    assert.equal(built.visible, false);
    const prior = material.opacity;
    construction.update(1, .9, playerAt(1.1));
    assert.notEqual(material.opacity, prior);
    construction.update(1, .9, undefined);
    assert.equal(ghost.visible, false);
    construction.update(1, .1, playerAt(1.1));
    construction.sync([fixedPlacement(site)]);
    assert.equal(ghost.visible, false);
    assert.equal(built.visible, true);
    construction.update(1, .1, playerAt(1.1));
    assert.equal(ghost.visible, false);
  }
});
