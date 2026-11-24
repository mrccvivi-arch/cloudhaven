import { PLATFORMS } from "./map.js";

const overlook = PLATFORMS.find(({ id }) => id === "overlook");
const edge = overlook.z - overlook.d / 2;
const lobes = [
  [-.75, .45], [3.65, .45], [3.9, -.1], [3.72, -.75],
  [3.17, -1.19], [2.65, -1.13], [2.37, -1.7], [1.79, -1.96],
  [1.14, -1.9], [.75, -1.53], [.24, -1.64], [-.39, -1.34],
  [-.77, -.82], [-.91, -.18],
];

const outline = lobes.flatMap(([x, z], index) => {
  const [prevX, prevZ] = lobes.at(index - 1);
  const [nextX, nextZ] = lobes[(index + 1) % lobes.length];
  return Array.from({ length: 6 }, (_, step) => {
    const t = step / 6;
    return [
      x + ((prevX - x) * (1 - t) ** 2 + (nextX - x) * t ** 2) / 2,
      edge + z + ((prevZ - z) * (1 - t) ** 2 + (nextZ - z) * t ** 2) / 2,
    ];
  });
});

export const lookoutCloud = { id: "lookout-cloud", y: overlook.y, outline };

export function onLookoutCloud(x, z) {
  if (x < -1 || x > 4 || z < edge - 2 || z > edge + .45) return false;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, az] = outline[i];
    const [bx, bz] = outline[j];
    if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside;
  }
  return inside;
}
