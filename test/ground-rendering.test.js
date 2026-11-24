import assert from "node:assert/strict";
import test from "node:test";
import { Box3, Color, Matrix4, Scene } from "three";
import { GROUND_DECKS, terrainHeight } from "../src/map.js";
import { createWorld } from "../src/world.js";

const scene = new Scene();
const { updateForestPalette } = createWorld(scene);
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

test("forest daylight grading keeps the original night terrain and leaves the sky islands alone", () => {
  const colors = ground.children[0].geometry.attributes.color;
  const positions = ground.children[0].geometry.attributes.position;
  const index = 40 * 81 + 40;
  const x = positions.getX(index), z = positions.getZ(index);
  const daylight = new Color().fromBufferAttribute(colors, index);
  assert.ok(daylight.g > daylight.r && daylight.g > daylight.b);
  const skyMaterial = scene.children[1].children.find((mesh) => mesh.isMesh).material;
  const skyColor = skyMaterial.color.clone();
  updateForestPalette(1);
  const expectedNight = new Color().setHSL(.25 + .015 * Math.sin(x * .1 + z * .06), .26,
    .46 + .07 * Math.sin(z * .115) * Math.cos(x * .05));
  const night = new Color().fromBufferAttribute(colors, index);
  assert.ok(Math.abs(night.r - expectedNight.r) < 1e-6);
  assert.ok(Math.abs(night.g - expectedNight.g) < 1e-6);
  assert.ok(Math.abs(night.b - expectedNight.b) < 1e-6);
  assert.ok(skyMaterial.color.equals(skyColor));
  updateForestPalette(0);
  assert.ok(new Color().fromBufferAttribute(colors, index).equals(daylight));
});
