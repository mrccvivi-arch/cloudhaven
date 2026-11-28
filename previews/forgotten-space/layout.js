import { movePlayer } from "../../src/motion.js";
import { PLAYER_RADIUS } from "../../src/collision.js";

export const spawn = { x: 4, y: 0, z: 13, vy: 0, grounded: true, layer: "preview" };
export const treePosition = [-13, -4];
export const decks = [
  { id: "middle", y: 0, depth: 3, outline: [[-26,12],[-24,4],[-27,-3],[-23,-12],[-17,-17],[-9,-18],[-7,-15],[0,-20],[10,-17],[14,-13],[22,-14],[25,-5],[23,1],[25,8],[22,12],[15,12],[11,17],[3,16],[-5,19],[-9,16],[-17,18],[-20,14]] },
  { id: "upper", y: 10.4, depth: 2.5, outline: [[-40,-28],[-35,-30],[-26,-28],[-24,-32],[-17,-32],[-17,-39],[-21,-42],[-17,-46],[-25,-49],[-31,-46],[-40,-48],[-43,-40],[-41,-35]] },
  { id: "lower", y: -9.2, depth: 2.7, outline: [[36,16],[43,16],[47,19],[45,23],[50,27],[46,33],[39,37],[34,35],[27,40],[20,37],[16,32],[18,26],[15,22],[22,19],[28,23],[32,18]] },
  { id: "upper-turn", y: 5.7, depth: 1.5, outline: [[-16,-24],[-7,-24],[-7,-30],[-9,-32],[-17,-31],[-19,-28]] },
  { id: "lower-turn", y: -4.8, depth: 1.6, outline: [[32,5],[38,4],[42,8],[42,13],[36,14],[32,12]] },
];

export const stairs = [
  { a: [-12,0,-14.5], b: [-12,5.7,-27], width: 4.5 },
  { a: [-15,5.7,-27.1], b: [-32.4,10.4,-32.1], width: 4.5 },
  { a: [20,0,7.3], b: [36,-4.8,8.0], width: 4.7 },
  { a: [37,-4.8,10.8], b: [39,-9.2,20], width: 4.3 },
];

export const routes = [
  [[4,13],[-12,10],[-12,-14.5],[-12,-27],[-15,-27.1],[-32.4,-32.1],[-32.4,-39]],
  [[4,13],[16,10],[20,7.3],[36,8],[37,10.8],[39,20],[38,27]],
];
export const s1 = { spawn, decks, stairs, treePosition };

export function inside(outline, x, z) {
  let found = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [a, b] = outline[i], [c, d] = outline[j];
    if ((b > z) !== (d > z) && x < (c - a) * (z - b) / (d - b) + a) found = !found;
  }
  return found;
}

function stairLane(stair, x, z) {
  const { a, b, width } = stair;
  const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
  const along = ((x - a[0]) * dx + (z - a[2]) * dz) / length;
  const side = ((x - a[0]) * dz - (z - a[2]) * dx) / length;
  if (along < -.84 || along > length + .84 || Math.abs(side) >= width / 2) return NaN;
  return stairHeight(stair, along / length);
}

export function stairHeight({ a, b, start = 0, end = 1 }, fraction) {
  const t = Math.max(0, Math.min(1, (fraction - start) / (end - start)));
  return a[1] + (b[1] - a[1]) * t;
}

export function footing(x, z, reference, layout = s1, stairTolerance = .38) {
  let y;
  let smallest = .50;
  for (const deck of layout.decks) {
    const delta = Math.abs(deck.y - reference);
    if (delta < smallest && inside(deck.outline, x, z)) {
      smallest = delta;
      y = deck.y;
    }
  }
  let stairDelta = stairTolerance;
  for (const stair of layout.stairs) {
    const level = stairLane(stair, x, z);
    const delta = Math.abs(level - reference);
    if (delta < stairDelta) {
      stairDelta = delta;
      y = level;
    }
  }
  return y;
}

export function safeFooting(x, z, reference, layout = s1) {
  const y = footing(x, z, reference, layout);
  const [treeX, treeZ] = layout.treePosition;
  if (y === undefined || (Math.abs(y) < 2 && Math.hypot(x - treeX, z - treeZ) < 1.48 + PLAYER_RADIUS)) return undefined;
  const margin = PLAYER_RADIUS * .71;
  for (const [dx,dz] of [[margin,0],[-margin,0],[0,margin],[0,-margin]]) {
    if (footing(x + dx, z + dz, y, layout, layout === s1 ? .38 : .61) === undefined) return undefined;
  }
  return y;
}

const physicsSpace = { x: 0, z: 0, halfWidth: 90 };

export function createWalker(initial = spawn, layout = s1) {
  const player = { ...initial };
  let surface = player.y;
  let last = { ...player };

  function recover() {
    Object.assign(player, last, { vy: 0, grounded: true });
    surface = last.y;
  }

  function step(dx, dz, dt) {
    if (![player.x, player.y, player.z, player.vy].every(Number.isFinite) || player.y < surface - 1 ||
        safeFooting(player.x, player.z, surface, layout) === undefined) recover();
    const x = player.x, z = player.z;
    const tryStep = (a, b) => {
      const y = safeFooting(x + a, z + b, surface, layout);
      if (y === undefined) return false;
      if (!player.grounded && y > player.y + .36) return false;
      // Keep the soft margin before the edge, without slowing tangential or inward motion.
      if (safeFooting(x + a * 4, z + b * 4, y, layout) === undefined) {
        a *= .62;
        b *= .62;
      }
      const checked = safeFooting(x + a, z + b, surface, layout);
      if (checked === undefined) return false;
      dx = a;
      dz = b;
      surface = checked;
      return true;
    };
    if ((dx || dz) && !tryStep(dx, dz)) {
      const a = dx, b = dz;
      let sliding = false;
      for (const angle of [.33, -.33, .67, -.67, 1.03, -1.03, 1.39, -1.39]) {
        const cos = Math.cos(angle), sin = Math.sin(angle);
        if (tryStep((a * cos - b * sin) * .76, (a * sin + b * cos) * .76)) {
          sliding = true;
          break;
        }
      }
      if (!sliding) dx = dz = 0;
    }

    // The mature flat-floor solver runs relative to this section's walkable height.
    // World-space jump height is preserved when the floor changes under an airborne player.
    player.y = player.grounded ? 0 : player.y - surface;
    movePlayer(player, dx, dz, dt, physicsSpace);
    player.y += surface;
    if (player.grounded && safeFooting(player.x, player.z, surface, layout) !== undefined) last = { ...player };
  }
  return { player, step, recover };
}
