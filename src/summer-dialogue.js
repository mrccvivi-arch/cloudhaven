import { CYCLE_LENGTH } from "./day-night.js";
import { summerSkySituation } from "./summer-light.js";

const SEA_STARS_LINE = "原来大海也藏着星星。";

const LINES = {
  welcome: ["大海！是大海！", "今天适合到处乱跑。", "欢迎来到我的夏天。"],
  sand: ["这里可以跑很远很远。", "沙滩好软呀。", "你看，夏天没有边界。"],
  run: ["跑起来的时候，风也是朋友。", "今天不需要慢慢走。", "我们去追风吧！", "好像连影子都跑不动啦。"],
  water: ["哈哈，脚湿啦！", "海浪在挠我痒痒。", "再往前一点点。", "大海好像在呼吸。"],
  rest: ["呼……今天好开心。", "我们刚刚跑到哪里啦？", "偶尔什么都不想，也很好。", "要不要再跑一次？"],
  night: [SEA_STARS_LINE, "夏天的夜晚好长呀。"],
};
const CONTEXT = {
  sand: { chance: .48, cooldown: 65_000 },
  run: { chance: .56, cooldown: 70_000 },
  water: { chance: .56, cooldown: 75_000 },
  rest: { chance: .55, cooldown: 75_000 },
  night: { chance: .67, cooldown: 90_000 },
};

export function createSummerDialogue(random = Math.random) {
  const tryAgainAt = {};
  let quietUntil = 0;
  let welcome, speechCheckAt, entered, last, surface, bySea, runFor, restUntil, pending;

  function resetMotion() {
    surface = undefined;
    bySea = false;
    runFor = 0;
    restUntil = 0;
    pending = undefined;
  }
  resetMotion();

  function pick(kind, avoidLine) {
    const fresh = LINES[kind].filter((line) => !avoidLine?.(line));
    const candidates = fresh.length ? fresh : LINES[kind];
    const alternate = candidates.filter((line) => line !== last);
    const pool = alternate.length ? alternate : candidates;
    last = pool[Math.floor(random() * pool.length)];
    return last;
  }

  return {
    enter() {
      entered = welcome = true;
      speechCheckAt = 0;
      resetMotion();
    },
    leave() {
      entered = welcome = false;
      resetMotion();
    },
    get quietUntil() { return quietUntil; },
    get lastLine() { return last; },
    update(time, { step, dt, night, atSea, paused, canSpeak, onWelcome, avoidLine }) {
      if (!entered) return;
      if (paused) {
        // Transitions and menus do not count as stopping after a run.
        runFor = restUntil = 0;
        pending = undefined;
        return;
      }
      if (welcome && time >= speechCheckAt) {
        speechCheckAt = time + 250;
        if (canSpeak(true)) {
          welcome = false;
          quietUntil = Math.max(quietUntil, time + 5500);
          const line = pick("welcome", avoidLine);
          onWelcome?.(line);
          return line;
        }
      }
      if (!step) return;
      const { grounded, running, dx, dz } = step;
      const moving = Math.hypot(dx, dz) > .01;
      const current = grounded ? step.surface : surface;
      const newShore = atSea && night && !bySea;
      if (grounded || !night) bySea = atSea && night;
      let kind;
      if (newShore && grounded) kind = "night";
      else if (current !== surface && (current === "sand" || current === "water")) kind = current;
      surface = current;

      if (running && moving) {
        const continued = runFor >= 2.6;
        runFor += dt;
        if (!continued && runFor >= 2.6) kind ??= "run";
      } else if (runFor > 0) {
        if (runFor >= 1.75) restUntil = time + 1300;
        runFor = 0;
      }
      if (!running && restUntil > time && !moving && grounded) {
        restUntil = 0;
        kind ??= "rest";
      }
      if (kind && time >= (tryAgainAt[kind] ?? 0) && time + 6000 >= quietUntil) {
        pending = { kind, expires: time + 6000 };
      }
      if (!pending || welcome) return;
      const stillRelevant = {
        sand: current === "sand", water: current === "water", night: bySea,
        run: running && moving, rest: !running && !moving,
      };
      if (time > pending.expires || !stillRelevant[pending.kind]) {
        pending = undefined;
        return;
      }
      if (!grounded || time < quietUntil || time < speechCheckAt) return;
      speechCheckAt = time + 250;
      if (!canSpeak(false)) return;
      kind = pending.kind;
      pending = undefined;
      const { chance, cooldown } = CONTEXT[kind];
      tryAgainAt[kind] = time + cooldown;
      if (random() >= chance) return;
      quietUntil = time + 45_000 + random() * 15_000;
      return pick(kind, avoidLine);
    },
  };
}

export const SUMMER_NIGHT_DIALOGUE = {
  "summer-blue-tears": { chance: .82, cooldown: 90_000,
    lines: [SEA_STARS_LINE, "你看，海浪在发光！", "是不是星星掉进海里了？"] },
  "summer-running-glow": { chance: .40, cooldown: 110_000,
    lines: ["我们踩碎了一地星光。", "哈哈，大海被我们点亮啦！", "今晚的海会发光。", "再跑一圈吧！"] },
  "summer-lantern-near": { chance: .68, cooldown: 100_000,
    lines: ["我们给大海点一盏灯吧。", "这里好像离月亮更近一点。"] },
  "summer-lantern-lit": { chance: 1, cooldown: 90_000,
    lines: ["这样，迷路的星星就能找到家啦。", "你看，我们点亮了一个夏夜。", "希望远方也有人看见这束光。"] },
  "summer-lantern-revisit": { chance: .55, cooldown: 120_000,
    lines: ["灯还亮着呢。", "有一盏灯，总是让人觉得安心。"] },
  "summer-fireflies-near": { chance: .63, cooldown: 100_000,
    lines: ["这里藏着好多小小的月亮。", "原来夜晚也会开花。", "嘘……星星在草地上散步。"] },
  "summer-fireflies-around": { chance: .52, cooldown: 110_000,
    lines: ["它们是不是把我当成月亮了？", "今晚有好多小朋友。"] },
  "summer-lit-pier": { chance: .65, cooldown: 100_000,
    lines: ["我们在这里看一会儿海吧。", "有灯的地方，夜晚就没有那么远。", "今天可以晚一点回家。"] },
};

export const SUMMER_WEATHER_DIALOGUE = {
  "summer-sea-breeze": { chance: .21, cooldown: 105_000,
    lines: ["起风啦，我们去追风吧！", "海风闻起来像夏天。", "风是不是也想跟我们一起玩？", "今天的风好自由。"] },
  "summer-shower-start": { chance: .68, cooldown: 95_000,
    lines: ["夏天漏水啦！", "咦，天空怎么开始下雨了？", "下雨也可以撒欢呀！", "我们今天是湿漉漉的小朋友。"] },
  "summer-shower-running": { chance: .44, cooldown: 95_000,
    lines: ["反正都湿啦，再跑一圈吧！", "雨滴也在和我们一起跳舞。", "今天的夏天有好多水。"] },
  "summer-shower-end": { chance: .65, cooldown: 95_000,
    lines: ["天空洗完澡了。", "太阳又回来啦！", "刚才的雨好像一场很短的梦。"] },
  "summer-weather-rainbow": { chance: .74, cooldown: 95_000,
    lines: ["快看，天空也有一座彩虹桥！", "原来雨水里面藏着颜色。", "今天的夏天有七种颜色。", "这座彩虹会通往哪里呢？"] },
  "summer-meteor-sighted": { chance: .63, cooldown: 105_000,
    lines: ["快看，有一颗星星跑掉啦！", "刚才那颗星星，你看见了吗？", "听说人类会对着流星许愿。", "我就不许愿啦，现在这样就很好。"] },
};

export const SUMMER_DIALOGUE = {
  ...SUMMER_NIGHT_DIALOGUE,
  ...SUMMER_WEATHER_DIALOGUE,
  "summer-bubble-meet": {
    chance: .82, cooldown: 90_000,
    lines: ["你看，风把彩虹吹过来了。", "夏天怎么还会冒泡泡呀？"],
  },
  "summer-bubble-pop": {
    chance: .35, cooldown: 90_000,
    lines: ["抓住一个夏天！", "啪！一个小小的梦。", "这个泡泡里面有彩虹。", "它飞走啦。", "再追一个吧！"],
  },
  "summer-butterfly-startle": {
    chance: .34, cooldown: 90_000,
    lines: ["原来花朵也会飞。", "嘘……别吓到它们。", "它们好像也很喜欢夏天。"],
  },
  "summer-butterfly-follow": {
    chance: .40, cooldown: 90_000,
    lines: ["你看，我们有新朋友啦。", "它是不是也想跟我们一起去看海？", "今天的风好热闹。"],
  },
  "summer-butterfly-leave": {
    chance: .28, cooldown: 90_000,
    lines: ["再见啦，小小的夏天。", "它有自己的地方要去。"],
  },
  "summer-golden-hour": {
    chance: .62, cooldown: 90_000,
    lines: ["你看，天空开始变甜了。", "今天的太阳要回家啦。", "原来夏天也有粉色。", "我们慢一点走吧。"],
  },
  "summer-sunset": {
    chance: .72, cooldown: 90_000,
    lines: ["太阳掉进海里了。", "要是能把这一刻装进口袋就好了。", "今天好像过得特别快。", "你喜欢这样的天空吗？"],
  },
  "summer-blue-hour": {
    chance: .63, cooldown: 90_000,
    lines: ["白天和夜晚之间，原来还有一种颜色。", "太阳走了，天空还舍不得睡。", "现在的海，好像一个很安静的梦。"],
  },
  "summer-moonlit-sea": {
    chance: .65, cooldown: 90_000,
    lines: ["月亮把自己分给了大海。", "你看，海上有一条月光做的路。", "白天跑了那么久，现在可以慢慢走啦。", "今晚的海，应该不会做噩梦。"],
  },
  "summer-dawn": {
    chance: .61, cooldown: 90_000,
    lines: ["我们又捡到一个新的夏天。", "太阳回来啦。", "原来昨天已经变成了今天。"],
  },
};

export function createSummerSkyDialogue() {
  const attempted = new Set();
  let previous = -Infinity;
  return (worldTime, onIsland, atSea, speak) => {
    // Keep the two halves of dawn in the same dialogue cycle.
    const cycleTime = (worldTime + CYCLE_LENGTH - 9) % CYCLE_LENGTH;
    if (cycleTime < previous) attempted.clear();
    previous = cycleTime;
    if (!onIsland) return;
    const kind = summerSkySituation(worldTime);
    if (!kind || attempted.has(kind) ||
        (!atSea && (kind === "summer-moonlit-sea" || kind === "summer-sunset"))) return;
    if (speak(kind)) attempted.add(kind);
  };
}
