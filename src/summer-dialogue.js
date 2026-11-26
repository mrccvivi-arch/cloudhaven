const LINES = {
  welcome: ["大海！是大海！", "今天适合到处乱跑。", "欢迎来到我的夏天。"],
  sand: ["这里可以跑很远很远。", "沙滩好软呀。", "你看，夏天没有边界。"],
  run: ["跑起来的时候，风也是朋友。", "今天不需要慢慢走。", "我们去追风吧！", "好像连影子都跑不动啦。"],
  water: ["哈哈，脚湿啦！", "海浪在挠我痒痒。", "再往前一点点。", "大海好像在呼吸。"],
  rest: ["呼……今天好开心。", "我们刚刚跑到哪里啦？", "偶尔什么都不想，也很好。", "要不要再跑一次？"],
  night: ["原来大海也藏着星星。", "夏天的夜晚好长呀。"],
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

  function pick(kind) {
    const pool = LINES[kind].filter((line) => line !== last);
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
    update(time, { step, dt, night, atSea, paused, canSpeak }) {
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
          return pick("welcome");
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
      return pick(kind);
    },
  };
}

export const SUMMER_DIALOGUE = {
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
};
