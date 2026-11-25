import { GINKGO_DIALOGUE } from "./dialogue.js";
import { GOLDEN_GINKGO } from "./map.js";
import { MOON_LINES } from "./moon-lines.js";

const LEAVE_MARGIN = .8;
const lines = [...new Set([...GINKGO_DIALOGUE, ...MOON_LINES.filter(({ trigger }) => trigger === "ginkgo").map(({ text }) => text)])];

export function createGinkgoInteraction(random = Math.random) {
  let inside = false;
  let lastLine;
  let welcomePending = false;

  return {
    get inside() { return inside; },
    reset() { inside = welcomePending = false; },
    update(player) {
      const wasInside = inside;
      const { x, z, canopyRadius } = GOLDEN_GINKGO;
      const radius = canopyRadius + (wasInside ? LEAVE_MARGIN : 0);
      inside = player.layer === "ground" && Math.hypot(player.x - x, player.z - z) <= radius;
      if (!inside || !wasInside) welcomePending = inside;
    },
    welcome() {
      if (!welcomePending) return;
      welcomePending = false;
      return "你来啦。";
    },
    touch() {
      if (!inside) return;
      const pool = lines.filter((line) => line !== lastLine);
      lastLine = pool[Math.floor(random() * pool.length)];
      return lastLine;
    },
  };
}
