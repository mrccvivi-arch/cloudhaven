import { WINTER_TREE, winterLakeExtent } from "./winter-layout.js";

const entryLines = ["你看，整个世界都变白了。", "这里好大，我们去跑一跑吧。"];
const visitLines = {
  approach: "你看，天空里有什么。",
  descent: "它好像要下来了。",
  encounter: "原来它这么大呀。",
  return: "它又回到天空里了。",
};
const treeLine = "这里收藏了好多场雪。";
const runningLines = ["原来冬天也会开花。", "我们跑过的地方，都变漂亮了。", "雪花好像追上我们了。", "今天可以尽情撒欢。", "你回头看看。"];
const restingLines = ["刚才好像和雪跳了一支舞。", "花朵还在呢。", "它们会慢慢变回雪花。"];

export function createWinterDialogue(discovery, random = Math.random) {
  const pick = lines => lines[Math.floor(random() * lines.length)];
  let welcome, visitLine, nextAt, nextCasual, arrivedAt, echoUntil, echoSpoken;
  let guide, flowerSeen, danced, firstFlowerUntil, firstDanceUntil, stopUntil, running, previousCasual;

  return {
    enter() {
      welcome = pick(entryLines);
      visitLine = previousCasual = undefined;
      arrivedAt = nextCasual = undefined;
      flowerSeen = danced = false;
      echoUntil = 0;
      echoSpoken = false;
      guide = !discovery.flower && welcome !== entryLines[1];
      firstFlowerUntil = firstDanceUntil = stopUntil = running = nextAt = 0;
    },
    whaleCue(cue, now) {
      if (cue.type === "sighting") discovery.whale = true;
      else if (cue.type === "lake-echo") {
        if (!echoSpoken) echoUntil = now + 11500;
      } else if (Object.hasOwn(visitLines, cue.type)) {
        visitLine = { text: visitLines[cue.type], expires: now + 6500 };
      }
    },
    motion(event, now) {
      running = event.running;
      if (running > 0) stopUntil = 0;
      if (event.flower && !flowerSeen) {
        discovery.flower = flowerSeen = true;
        firstFlowerUntil = now + 13500;
        guide = false;
      }
      if (event.dance && !danced) {
        danced = true;
        firstDanceUntil = now + 13500;
      }
      if (event.stopped) stopUntil = now + 6300;
    },
    line(player, now, available) {
      const distance = Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z);
      const close = distance < 9;
      const openSnow = distance >= WINTER_TREE.shelter[1];
      arrivedAt ??= now;
      nextCasual ??= now + 24000;
      if (!available || now < nextAt) return;
      let text;
      if (visitLine && now < visitLine.expires) {
        text = visitLine.text;
        visitLine = undefined;
      } else if (!echoSpoken && now < echoUntil && winterLakeExtent(player.x, player.z) < 1.16) {
        echoSpoken = true;
        text = "你看，冰里也有一条鲸鱼。";
      } else if (close && !discovery.tree) {
        discovery.tree = true;
        text = treeLine;
      } else if (welcome) {
        text = welcome;
        welcome = undefined;
      } else if (openSnow && now < firstFlowerUntil) {
        text = "你看，雪地开花了。";
        firstFlowerUntil = 0;
      } else if (openSnow && now < firstDanceUntil) {
        text = "好像连雪花都在陪我们跑。";
        firstDanceUntil = 0;
      } else if (openSnow && guide && now - arrivedAt > 6500 && running === 0) {
        text = "要不要试试在雪地里跑起来？";
        guide = false;
      } else if (openSnow && now >= nextCasual && (running > 6.2 || now < stopUntil)) {
        const options = running > 6.2 ? runningLines : restingLines;
        text = pick(options.filter(line => line !== previousCasual));
        previousCasual = text;
        nextCasual = now + 23000 + random() * 9000;
        stopUntil = 0;
      }
      if (text) nextAt = now + (4850);
      return text;
    },
  };
}
