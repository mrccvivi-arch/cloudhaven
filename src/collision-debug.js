import * as THREE from "three";
import { PLAYER_HEIGHT, PLAYER_RADIUS, staticColliders } from "./collision.js";
import { BRIDGE_RAMPS, CREEK_BRIDGE, PLATFORMS, terrainHeight } from "./map.js";

function outline(parent, vertices, color, loop) {
  const geometry = new THREE.BufferGeometry().setFromPoints(vertices.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const material = new THREE.LineBasicMaterial({ color, depthTest: false, toneMapped: false });
  parent.add(loop ? new THREE.LineLoop(geometry, material) : new THREE.LineSegments(geometry, material));
}

export function createCollisionDebug(scene) {
  const groups = { ground: new THREE.Group(), sky: new THREE.Group() };
  for (const [layer, group] of Object.entries(groups)) {
    scene.add(group);
    for (const solid of staticColliders(layer)) {
      const { x, z } = solid;
      const bottom = Number.isFinite(solid.bottom) ? solid.bottom : terrainHeight(x, z);
      const top = Number.isFinite(solid.top) ? solid.top : bottom + 1.1;
      const vertices = solid.radius ? Array.from({ length: 16 }, (_, i) => {
        const angle = i * Math.PI / 8;
        return [x + Math.cos(angle) * solid.radius, z + Math.sin(angle) * solid.radius];
      }) : [[-1,-1], [1,-1], [1,1], [-1,1]].map(([sx, sz]) => {
        const dx = sx * solid.w / 2, dz = sz * solid.d / 2;
        return [x + dx * solid.cos + dz * solid.sin, z - dx * solid.sin + dz * solid.cos];
      });
      const color = solid.kind === "tree" ? 0x7af48a : solid.kind === "rock" ? 0xffb859 : 0xff7298;
      outline(group, vertices.map(([px, pz]) => [px, bottom, pz]), color, true);
      outline(group, vertices.map(([px, pz]) => [px, top, pz]), color, true);
      const uprights = vertices.filter((_, i) => vertices.length === 4 || i % 4 === 0)
        .flatMap(([px, pz]) => [[px, bottom, pz], [px, top, pz]]);
      outline(group, uprights, color, false);
    }
  }
  function deck(layer, { x, y, z, w, d }) {
    outline(groups[layer], [[x - w/2,y,z - d/2], [x + w/2,y,z - d/2],
      [x + w/2,y,z + d/2], [x - w/2,y,z + d/2]], 0x72edff, true);
  }
  deck("ground", CREEK_BRIDGE);
  deck("sky", PLATFORMS.find(({ id }) => id === "bridge"));
  for (const ramp of BRIDGE_RAMPS) {
    const { xs, heights, y, bridgeZ, landZ } = ramp;
    outline(groups.ground, [...xs.map((x, i) => [x, heights[i], landZ]),
      [xs.at(-1), y, bridgeZ], [xs[0], y, bridgeZ]], 0x72edff, true);
  }
  const body = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_HEIGHT, 12)),
    new THREE.LineBasicMaterial({ color: 0xf7fd55, depthTest: false, toneMapped: false }),
  );
  scene.add(body);
  return (player, practice) => {
    groups.ground.visible = !practice && player.layer === "ground";
    groups.sky.visible = !practice && player.layer === "sky";
    body.visible = !practice;
    body.position.set(player.x, player.y + PLAYER_HEIGHT / 2, player.z);
  };
}
