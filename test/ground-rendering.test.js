import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Matrix4, Scene } from "three";
import { GROUND_DECKS, terrainHeight } from "../src/map.js";
import { createWorld } from "../src/world.js";

const scene = new Scene();
createWorld(scene);
const ground = scene.children[0];
const byColor = (color) => ground.children.find((mesh) => mesh.material?.color?.getHex() === color);

function boundsOfInstances(mesh) {
  const matrix = new Matrix4();
  mesh.geometry.computeBoundingBox();
  return Array.from({ length: mesh.count }, (_, index) => {
    mesh.getMatrixAt(index, matrix);
    return new Box3().copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
  });
}

test("forest ledges meet at the soil seam without overlapping sides or changing the walkable height", () => {
  const soil = boundsOfInstances(ground.children.find((mesh) => mesh.isInstancedMesh && mesh.material.color.getHex() === 0x907458));
  const moss = boundsOfInstances(byColor(0x779e65));
  assert.equal(soil.length, moss.length);
  const ledges = GROUND_DECKS.filter(({ id }) => id !== "creek-bridge");
  for (const [index, ledge] of ledges.entries()) {
    assert.ok(Math.abs(soil[index].max.y - moss[index].min.y) < 1e-6);
    assert.ok(Math.abs(moss[index].max.y - ledge.y) < 1e-6);
    assert.ok(Math.abs(soil[index].min.y - (ledge.y - .78)) < 1e-6);
  }
});

test("both forest paths stay above grass between ribbon vertices", () => {
  for (const color of [0xc9b88a, 0xabb17c]) {
    const mesh = byColor(color);
    assert.equal(mesh.material.polygonOffset, true);
    assert.ok(mesh.material.polygonOffsetUnits < 0);
    const vertices = mesh.geometry.attributes.position;
    const divisions = 8;
    for (let i = 0; i < vertices.count; i += 3) {
      for (let a = 0; a <= divisions; a++) {
        for (let b = 0; a + b <= divisions; b++) {
          const coord = (axis) => (a * vertices.getComponent(i, axis) +
            b * vertices.getComponent(i + 1, axis) +
            (divisions - a - b) * vertices.getComponent(i + 2, axis)) / divisions;
          assert.ok(coord(1) > terrainHeight(coord(0), coord(2)), "A path triangle cuts through the grass");
        }
      }
    }
  }
});
