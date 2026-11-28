export const humanLines = {
  H01: "这里好像没有季节。",
  H02: "原来时间也会破碎。",
  H03: "它们要去哪里呢？",
  H05: "你也曾经等过谁吗？",
  H06: "人类好像总是在练习告别。",
  H07: "可真正告别的时候，其实什么都说不出来。",
  H11: "原来活着，并不意味着一切都很好。",
  H14: "我可以在这里陪你一会儿。",
  H20: "明明已经破碎了，却还在运转。",
  H31: "如果不再见面，ta还活在你心里吗？",
  H45: "有些告别如同黑洞，世界甚至没有发出一点声音。",
  H65: "后来，日子又变得很平常。",
  H96: "原来最后一次见面的时候，人类并不知道那是最后一次。",
  H97: "你是不是也有一些舍不得丢掉的东西？",
  H104: "如果时间可以倒流，你想回到哪一天？",
  H107: "人类明明知道终有一天会分离，却还是会相爱。",
  H111: "你看，又有一朵花开了。",
};

export const humanTiming = {
  entry: [2000, 4000],
  moving: [18000, 30000],
  idle: [25000, 40000],
  short: [4000, 6000],
  long: [7000, 9000],
  longAt: 17,
  touchCooldown: 6000,
  fade: 420,
};

const ids = Object.keys(humanLines);

export function createHumanDialogue({ show, hide, updateCount, random = Math.random }) {
  let active = false, paused = false;
  let elapsed, expires, lastTouch, next, line, bag, last;
  const pickTime = ([min,max], fraction = random()) => min + fraction*(max-min);

  function shuffle() {
    bag = [...ids];
    for (let i=bag.length-1;i>0;i--) {
      const j = Math.floor(random()*(i+1));
      [bag[i],bag[j]] = [bag[j],bag[i]];
    }
    if (bag.at(-1) === last) {
      const j = Math.floor(random()*(bag.length-1));
      [bag[j],bag[bag.length-1]] = [bag.at(-1),bag[j]];
    }
    updateCount(bag.length);
  }

  function schedule(start) {
    next = {start, fraction:random()};
  }

  function play(kind, id) {
    if (!active || elapsed < expires) return false;
    if (kind === "touch" && elapsed - lastTouch < humanTiming.touchCooldown) return false;
    if (!id) {
      if (!bag.length) shuffle();
      id = bag.pop();
      last = id;
      updateCount(bag.length);
    }
    const text = humanLines[id];
    const duration = pickTime(text.length >= humanTiming.longAt ? humanTiming.long : humanTiming.short);
    line = {text, start: elapsed, duration};
    expires = elapsed + duration;
    if (kind === "touch") lastTouch = elapsed;
    if (kind !== "preview") schedule(kind === "touch" ? expires : elapsed);
    show(text, elapsed, duration);
    return true;
  }

  function enter() {
    active = true;
    paused = false;
    elapsed = expires = 0;
    lastTouch = -Infinity;
    line = last = undefined;
    shuffle();
    next = {entryAt:pickTime(humanTiming.entry)};
  }

  function advance(deltaMs, moving, panoramic) {
    if (!active) return;
    elapsed += deltaMs;
    if (paused || elapsed < expires) return;
    const due = next.entryAt ?? next.start + pickTime(moving ? humanTiming.moving : humanTiming.idle,next.fraction);
    if (elapsed < due) return;
    if (panoramic) schedule(elapsed);
    else play("auto");
  }

  return {
    enter, advance,
    leave() { active = false; line = undefined; hide(); },
    touch: () => play("touch"),
    next: () => play("test"),
    preview: id => Object.hasOwn(humanLines,id) && play("preview",id),
    reset: shuffle,
    setPaused(value) {
      if (paused === value) return;
      paused = value;
      if (!paused && active) {
        const deadline = next.entryAt ?? next.start + pickTime(humanTiming.moving,next.fraction);
        if (elapsed >= deadline) schedule(Math.max(elapsed,expires));
      }
    },
    get time() { return elapsed ?? 0; },
    get current() { return active && elapsed < expires ? line : undefined; },
  };
}
