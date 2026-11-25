import { GINKGO_DIALOGUE } from "./dialogue.js";
import { GOLDEN_GINKGO } from "./map.js";
import { MOON_LINES } from "./moon-lines.js";

const LEAVE_MARGIN = .8;
const WELCOME = MOON_LINES.find(({ trigger }) => trigger === "ginkgo-welcome").text;
const lines = [...new Set([...GINKGO_DIALOGUE, ...MOON_LINES.filter(({ trigger }) => trigger === "ginkgo").map(({ text }) => text)])];
const LISTEN_DELAY = 5;
const LISTEN_DAY = [
  "这棵树好像一直在等什么。",
  "你听，叶子落下来的声音。",
  "有些东西落下了，也还是很美。",
  "我们不赶时间吧？",
  "下次来的时候，它还会在这里。",
];
const LISTEN_NIGHT = [
  ...LISTEN_DAY,
  "你看，有一片叶子在发光。",
  "它们好像从树上落下来的星星。",
  "有你陪着的夜晚，好像比别处温柔一点。",
  "再待一会儿吧。",
  "人类，你还会做那些乱七八糟的梦吗？",
];

function nearGinkgo(player, margin = 0) {
  const { x, z, canopyRadius } = GOLDEN_GINKGO;
  return player?.layer === "ground" && Math.hypot(player.x - x, player.z - z) <= canopyRadius + margin;
}

export function createGinkgoInteraction(random = Math.random) {
  let inside = false;
  let lastLine;
  let welcomePending = false;
  let idleTime = 0;
  let listened = false;

  return {
    get inside() { return inside; },
    get awaitingWelcome() { return welcomePending; },
    reset(player) {
      inside = nearGinkgo(player);
      welcomePending = listened = false;
      idleTime = 0;
    },
    update(player) {
      const wasInside = inside;
      inside = nearGinkgo(player, wasInside ? LEAVE_MARGIN : 0);
      if (inside === wasInside) return;
      welcomePending = inside;
      idleTime = 0;
      listened = false;
    },
    welcome(ready) {
      if (!welcomePending || !ready) return;
      welcomePending = false;
      return WELCOME;
    },
    listen(dt, stationary, night, ready) {
      if (!inside || listened || !stationary) {
        idleTime = 0;
        return;
      }
      idleTime = Math.min(LISTEN_DELAY, idleTime + dt);
      if (idleTime < LISTEN_DELAY || welcomePending || !ready()) return;
      listened = true;
      const pool = night ? LISTEN_NIGHT : LISTEN_DAY;
      return pool[Math.floor(random() * pool.length)];
    },
    touch() {
      if (!inside) return;
      const pool = lines.filter((line) => line !== lastLine);
      lastLine = pool[Math.floor(random() * pool.length)];
      return lastLine;
    },
  };
}
