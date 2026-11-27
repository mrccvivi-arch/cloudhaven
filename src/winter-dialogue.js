import { WINTER_TREE } from "./winter-layout.js";

const entryLines = ["你看，整个世界都变白了。", "这里好大，我们去跑一跑吧。"];
const approachLine = "嘘，好像有什么要来了。";
const whaleLines = {
  cruise: ["原来天空也可以是一片海。", "它游得好慢呀。", "你看，它又来了。"],
  pass: ["好大一只鲸鱼！", "它是不是也在天空里撒欢？", "你看天空。"],
  climb: ["原来天空也可以是一片海。", "你看天空。", "它游得好慢呀。"],
};
const treeLine = "这里收藏了好多场雪。";
const runningLines = ["原来冬天也会开花。", "我们跑过的地方，都变漂亮了。", "雪花好像追上我们了。", "今天可以尽情撒欢。", "你回头看看。"];
const restingLines = ["刚才好像和雪跳了一支舞。", "花朵还在呢。", "它们会慢慢变回雪花。"];

export function createWinterDialogue(discovery, random = Math.random) {
  const pick = lines => lines[Math.floor(random() * lines.length)];
  let welcome, whaleLine, nextAt, nextCasual, arrivedAt;
  let approachUntil, lookUntil, lastWhaleLine, nextWhaleLine, treeUntil;
  let guide, flowerSeen, danced, firstFlowerUntil, firstDanceUntil, stopUntil, running, previousCasual;

  return {
    enter() {
      welcome = pick(entryLines);
      whaleLine = previousCasual = lastWhaleLine = undefined;
      arrivedAt = nextCasual = undefined;
      flowerSeen = danced = false;
      approachUntil = lookUntil = nextWhaleLine = treeUntil = 0;
      guide = !discovery.flower && welcome !== entryLines[1];
      firstFlowerUntil = firstDanceUntil = stopUntil = running = nextAt = 0;
    },
    whaleCue(cue, now, night = 0) {
      if (cue.type === "approach") {
        approachUntil = now + 2050;
      } else if (cue.type === "look") {
        lookUntil = now + 9000;
        approachUntil = 0;
      } else if (cue.type === "sighting") {
        discovery.whale = true;
        if (cue.initial || now < nextWhaleLine) return;
        const lines = night > .45 ? [...whaleLines[cue.kind], "它把星星留在了天空里。"] : whaleLines[cue.kind];
        whaleLine = { text: pick(lines.filter(line => line !== lastWhaleLine)), expires: now + 9000 };
      } else if (cue.type === "depart" && now >= nextWhaleLine && lastWhaleLine !== "它还会回来的。" && random() < .36) {
        whaleLine = { text: "它还会回来的。", expires: now + 6500 };
      }
    },
    look(now, available) {
      if (!available || now >= lookUntil || now < treeUntil) return;
      lookUntil = approachUntil = 0;
      nextAt = now + 4550;
      nextWhaleLine = now + 24000;
      return "快抬头看！";
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
      if (now < lookUntil) return;
      if (now < approachUntil) {
        approachUntil = 0;
        text = approachLine;
      } else if (whaleLine && now < whaleLine.expires) {
        text = lastWhaleLine = whaleLine.text;
        whaleLine = undefined;
        nextWhaleLine = now + 27000;
      } else if (close && !discovery.tree) {
        discovery.tree = true;
        treeUntil = now + 4100;
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
      if (text) nextAt = now + (text === approachLine ? 2000 : 4850);
      return text;
    },
  };
}
