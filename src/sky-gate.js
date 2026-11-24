import { SKY_GATE, terrainHeight } from "./map.js";

export const gateOpening = {
  ...SKY_GATE,
  y: terrainHeight(SKY_GATE.x, SKY_GATE.z),
  halfWidth: 1.48,
  height: 3.32,
  halfDepth: .23,
};

function insideOpening(x, y) {
  return Math.abs(x - gateOpening.x) < gateOpening.halfWidth &&
    y > gateOpening.y && y < gateOpening.y + gateOpening.height;
}

export function createSkyGateTrigger() {
  let armed = false;
  let readyAt = 0;
  let approachSide = 0;

  return {
    crossed(before, after, time) {
      if (before.layer !== "ground" || after.layer !== "ground") return false;

      const start = before.z - gateOpening.z;
      const end = after.z - gateOpening.z;
      if (Math.abs(start) > gateOpening.halfDepth || !insideOpening(before.x, before.y)) {
        armed = true;
      }

      // Interpolate at the doorway plane so a fast or diagonal step checks the actual intersection.
      if (start !== 0) approachSide = Math.sign(start);
      if (!armed || end === 0 || Math.sign(end) !== -approachSide) return false;
      const fraction = start / (start - end);
      const x = before.x + fraction * (after.x - before.x);
      const y = before.y + fraction * (after.y - before.y);
      if (!insideOpening(x, y)) return false;

      armed = false;
      if (time < readyAt) return false;
      readyAt = time + 2000;
      return true;
    },
  };
}
