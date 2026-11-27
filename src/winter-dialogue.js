import { WINTER_TREE, winterLakeExtent } from "./winter-layout.js";

const timing = {
  quiet: 20000,
  window: 60000,
  limit: 2,
  welcome: 5000,
  guide: 6500,
  sustainedRun: 6.2,
  running: [45000, 75000],
  music: [75000, 120000],
  activityDuringMusic: 90000,
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

const priority = {
  start: 5, pause: 5,
  near: 4, fall: 4, welcome: 4, approach: 4, "lake-echo": 4, tree: 4, flower: 4,
  descent: 3, encounter: 3, return: 3, dance: 3, guide: 3,
  music: 2, running: 1, resting: 1,
};

const whalePhases = new Set(["approach", "descent", "encounter", "return", "lake-echo"]);
const activities = new Set(["descent", "encounter", "return", "dance", "running", "resting"]);

export function createWinterDialogue(discovery, { random = Math.random, onDiscover = () => {} } = {}) {
  const interval = ([min, max]) => min + random() * (max - min);
  let visit, lastWelcome;

  function discover(kind) {
    if (discovery[kind]) return;
    discovery[kind] = true;
    onDiscover();
  }

  function offerOnce(kind) {
    if (visit.seen.has(kind)) return;
    visit.seen.add(kind);
    visit.offers.add(kind);
  }

  function choose(kind) {
    const pool = lines[kind];
    if (!Array.isArray(pool)) return pool;
    const options = pool.filter(text => !visit.spoken.has(text) && (kind !== "welcome" || text !== lastWelcome));
    return options[Math.floor(random() * options.length)];
  }

  return {
    enter(now) {
      visit = {
        entered: now, quietUntil: now, starts: [],
        offers: new Set(), seen: new Set(), spoken: new Set(),
        running: 0, nextRunAt: now + interval(timing.running),
        musicLeft: interval(timing.music), nextMusicActivity: Infinity,
        lastFrame: now, wasPlaying: false,
      };
    },
    leave() { visit = undefined; },
    whaleCue({ type }) {
      if (!visit) return;
      if (type === "sighting") discover("whale");
      else if (type === "lake-echo" || type === "approach") offerOnce(type);
      else if (whalePhases.has(type)) visit.offers.add(type);
    },
    motion(event) {
      if (!visit) return;
      visit.running = event.running;
      if (event.flower) {
        discover("flower");
        offerOnce("flower");
      }
      if (event.dance) offerOnce("dance");
      if (event.stopped) visit.offers.add("resting");
    },
    featherCue(kind) {
      if (!visit) return;
      if (kind === "start") visit.musicLeft = interval(timing.music);
      offerOnce(kind);
    },
    touch(now, duration, available) {
      if (!visit || !available) return false;
      visit.quietUntil = now + duration + timing.quiet;
      return true;
    },
    line(player, now, { available, playing }) {
      if (!visit) return;

      // Event offers last for this update, even when speech is blocked.
      const offers = visit.offers;
      const distance = Math.hypot(player.x - WINTER_TREE.x, player.z - WINTER_TREE.z);
      const openSnow = distance >= WINTER_TREE.shelter[1];
      if (distance < 9 && !discovery.tree) {
        discover("tree");
        offers.add("tree");
      }
      if (now - visit.entered < timing.welcome && !visit.seen.has("welcome")) offers.add("welcome");
      if (openSnow && !playing && !discovery.flower && !visit.seen.has("guide") &&
          visit.running === 0 && now - visit.entered >= timing.guide) offers.add("guide");
      if (visit.running > timing.sustainedRun) offers.add("running");

      if (playing && visit.wasPlaying) visit.musicLeft -= Math.max(0, now - visit.lastFrame);
      if (playing && !visit.wasPlaying) visit.nextMusicActivity = now + timing.activityDuringMusic;
      if (playing && visit.musicLeft <= 0) {
        visit.musicLeft = interval(timing.music);
        offers.add("music");
      }
      visit.lastFrame = now;
      visit.wasPlaying = playing;

      if (visit.starts.length && now - visit.starts[0] >= timing.window) {
        visit.starts = visit.starts.filter(start => now - start < timing.window);
      }
      let selected, text;
      if (available && now >= visit.quietUntil && visit.starts.length < timing.limit) {
        for (const kind of offers) {
          if (selected && priority[kind] <= priority[selected]) continue;
          if (kind === "lake-echo" && winterLakeExtent(player.x, player.z) >= 1.16) continue;
          if ((kind === "flower" || kind === "dance") && !openSnow) continue;
          if ((kind === "running" || kind === "resting") && (!openSnow || now < visit.nextRunAt)) continue;
          if (playing && activities.has(kind) && now < visit.nextMusicActivity) continue;
          if ((kind === "start" && !playing) || (kind === "pause" && playing)) continue;
          const candidate = choose(kind);
          if (candidate) {
            selected = kind;
            text = candidate;
          }
        }
      }
      offers.clear();
      if (!selected) return;

      if (selected === "running" || selected === "resting") visit.nextRunAt = now + interval(timing.running);
      if (playing && activities.has(selected)) visit.nextMusicActivity = now + timing.activityDuringMusic;
      if (selected === "welcome") lastWelcome = text;
      visit.seen.add(selected);
      visit.spoken.add(text);
      const { base, perCharacter, min, max } = timing.reading;
      const duration = Math.min(max, Math.max(min, base + text.length * perCharacter));
      visit.starts.push(now);
      visit.quietUntil = now + duration + timing.quiet;
      return { text, duration };
    },
  };
}
