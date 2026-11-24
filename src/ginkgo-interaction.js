import { GINKGO_DIALOGUE } from "./dialogue.js";
import { GOLDEN_GINKGO } from "./map.js";

const LEAVE_MARGIN = .8;

export function createGinkgoInteraction(random = Math.random) {
  let inside = false;
  let lastLine;
  let welcomePending = false;

  return {
    get inside() { return inside; },
    update(player) {
      const wasInside = inside;
      const { x, z, canopyRadius } = GOLDEN_GINKGO;
      const radius = canopyRadius + (wasInside ? LEAVE_MARGIN : 0);
      inside = player.layer === "ground" && Math.hypot(player.x - x, player.z - z) <= radius;
      if (!inside || !wasInside) welcomePending = inside;
    },
    welcome(bubbleActive) {
      if (!welcomePending || bubbleActive) return false;
      welcomePending = false;
      return true;
    },
    touch() {
      if (!inside) return undefined;
      welcomePending = false;
      const pool = GINKGO_DIALOGUE.filter((line) => line !== lastLine);
      lastLine = pool[Math.floor(random() * pool.length)];
      return lastLine;
    },
  };
}
