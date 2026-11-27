import { WINTER_TREE } from "./winter-layout.js";

const timing = {
  gap: 1500,
  stopWindow: 6300,
  guide: 6500,
  sustainedRun: 6.2,
  running: [45000, 75000],
  music: [75000, 120000],
  reading: { base: 3400, perCharacter: 145, min: 4800, max: 10000 },
};

const lines = {
  welcome: [
    "又见面了，真好。",
    "一起看看雪吧。",
    "一个人看雪的时候，我也会想起你。",
    "你不在的时候，这里也很美。只是有些话，不知道该说给谁听。",
  ],
  guide: "要不要试试在雪地里跑起来？",
  approach: "看，天空里有什么！",
  descent: "它好像也很喜欢有人陪伴。",
  encounter: "我喜欢看它自由自在的样子。",
  return: "它有自己的天空，就像你也有自己的世界。",
  "lake-echo": "冰里也有一条鲸鱼。",
  tree: "有些日子很平常，后来想起来，却觉得很珍贵。",
  flower: "雪地也会开花呢。",
  dance: "雪花也在陪我们跑。",
  running: [
    "我喜欢这样毫无理由的快乐。",
    "如果回忆有形状，我希望它是一朵不会融化的雪花。",
    "雪花好像追上我们了。",
    "我喜欢和你一起浪费时间。",
    "你回头看看，那是我们一起走过的路。",
  ],
  resting: [
    "刚才好像和你跳了一支舞。",
    "能陪你走一小段路，对我来说也是很好的事。",
    "它们会慢慢变回雪花，但我会记得它们盛开过。",
  ],
  fall: "有一片羽毛。",
  near: "羽毛里好像藏着音乐。",
  start: "不是每一次想念，都需要一次见面。",
  pause: "后来，我有了一个想要分享所有的人。",
  music: [
    "我不知道你在人间过着怎样的生活，但我希望你过得很好。",
    "我喜欢你，并不是因为你给了我什么。",
    "我不知道时间是什么时候开始变得珍贵的。",
    "如果有一天你忘记了这里，也不要忘记自己曾经快乐过。",
  ],
};

const whalePhases = new Set(["descent", "encounter", "return"]);
const openSnow = (player) => Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z) >= WINTER_TREE.shelter[1];

export function createWinterDialogue(discovery, { random = Math.random, onDiscover = () => {} } = {}) {
  const interval = ([min, max]) => min + random() * (max - min);
  const pick = (pool, last) => {
    const options = pool.filter(text => text !== last);
    return options[Math.floor(random() * options.length)];
  };
  let visit, lastWelcome;

  function discover(kind) {
    if (discovery[kind]) return;
    discovery[kind] = true;
    onDiscover();
  }

  function enqueue(kind, text = lines[kind]) {
    if (visit.queue.some(entry => entry.kind === kind)) return false;
    visit.queue.push({ kind, text });
    return true;
  }

  function enqueueOnce(kind) {
    if (visit.seen.has(kind)) return;
    visit.seen.add(kind);
    enqueue(kind);
  }

  return {
    enter(now) {
      visit = {
        entered: now, nextLineAt: now, queue: [], seen: new Set(),
        running: 0, stopUntil: -Infinity, nextRunAt: now + interval(timing.running),
        musicLeft: interval(timing.music), lastFrame: now, wasPlaying: false,
      };
      enqueue("welcome", pick(lines.welcome, lastWelcome));
    },
    leave() { visit = undefined; },
    whaleCue({ type }) {
      if (!visit) return;
      if (type === "sighting") discover("whale");
      else if (type === "lake-echo" || type === "approach") enqueueOnce(type);
      else if (whalePhases.has(type)) enqueue(type);
    },
    motion(event, player, now) {
      if (!visit) return;
      visit.running = event.running;
      if (event.running > 0) visit.stopUntil = -Infinity;
      if (event.flower) {
        discover("flower");
        if (openSnow(player)) enqueueOnce("flower");
      }
      if (event.dance && openSnow(player)) enqueueOnce("dance");
      if (event.stopped) visit.stopUntil = now + timing.stopWindow;
    },
    featherCue(kind) {
      if (!visit) return;
      if (kind === "start") visit.musicLeft = interval(timing.music);
      if (kind === "fall" || kind === "near") enqueueOnce(kind);
      else enqueue(kind);
    },
    touch(now, duration, available) {
      if (!visit || !available) return false;
      visit.nextLineAt = now + duration + timing.gap;
      return true;
    },
    line(player, now, { available, playing }) {
      if (!visit) return;

      const distance = Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z);
      if (distance < 9 && !discovery.tree) {
        discover("tree");
        enqueue("tree");
      }
      if (distance >= WINTER_TREE.shelter[1]) {
        if (!discovery.flower && visit.running === 0 && now - visit.entered >= timing.guide) enqueueOnce("guide");
        if (now >= visit.nextRunAt && (visit.running > timing.sustainedRun || now < visit.stopUntil)) {
          const kind = visit.running > timing.sustainedRun ? "running" : "resting";
          const text = pick(lines[kind], visit.lastRun);
          if (enqueue(kind, text)) {
            visit.lastRun = text;
            visit.nextRunAt = now + interval(timing.running);
            visit.stopUntil = -Infinity;
          }
        }
      }

      if (playing && visit.wasPlaying) visit.musicLeft -= Math.max(0, now - visit.lastFrame);
      if (playing && visit.musicLeft <= 0) {
        const text = pick(lines.music, visit.lastMusic);
        if (enqueue("music", text)) visit.lastMusic = text;
        visit.musicLeft = interval(timing.music);
      }
      if (!playing && visit.wasPlaying) visit.queue = visit.queue.filter(entry => entry.kind !== "music");
      visit.lastFrame = now;
      visit.wasPlaying = playing;

      // A shared display gap is the only constraint between independent events.
      if (!available || now < visit.nextLineAt) return;
      const entry = visit.queue.shift();
      if (!entry) return;
      const { kind, text } = entry;
      if (kind === "welcome") lastWelcome = text;
      const { base, perCharacter, min, max } = timing.reading;
      const duration = Math.min(max, Math.max(min, base + text.length * perCharacter));
      visit.nextLineAt = now + duration + timing.gap;
      return { text, duration };
    },
  };
}
