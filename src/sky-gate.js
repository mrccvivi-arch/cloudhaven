import { SKY_GATE, terrainHeight } from "./map.js";

const openingSize = {
  halfWidth: 1.48,
  height: 3.32,
  halfDepth: .23,
};

export const gateOpenings = {
  ground: { ...openingSize, ...SKY_GATE, y: terrainHeight(SKY_GATE.x, SKY_GATE.z) },
  sky: { ...openingSize, x: -4, y: 29, z: 15 },
};

function insideOpening(gate, x, y) {
  return Math.abs(x - gate.x) < gate.halfWidth &&
    y > gate.y && y < gate.y + gate.height;
}

export function createSkyGateTrigger() {
  let readyAt = 0;
  const crossingByLayer = {
    ground: { armed: false, approachSide: 0 },
    sky: { armed: false, approachSide: 0 },
  };

  return {
    crossed(before, after, time) {
      const gate = gateOpenings[before.layer];
      if (!gate || before.layer !== after.layer) return false;
      const crossing = crossingByLayer[before.layer];

      const start = before.z - gate.z;
      const end = after.z - gate.z;
      if (Math.abs(start) > gate.halfDepth || !insideOpening(gate, before.x, before.y)) {
        crossing.armed = true;
      }

      // Interpolate at the doorway plane so a fast or diagonal step checks the actual intersection.
      if (start !== 0) crossing.approachSide = Math.sign(start);
      if (!crossing.armed || end === 0 || Math.sign(end) !== -crossing.approachSide) return false;
      const fraction = start / (start - end);
      const x = before.x + fraction * (after.x - before.x);
      const y = before.y + fraction * (after.y - before.y);
      if (!insideOpening(gate, x, y)) return false;

      crossing.armed = false;
      if (time < readyAt) return false;
      readyAt = time + 2000;
      return true;
    },
  };
}
