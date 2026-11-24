import { LIVING_DIALOGUE } from "./dialogue.js";
import { MOON_LINES } from "./moon-lines.js";

const STORAGE_KEY = "cloudhaven-living-dialogue-v1";
const MIN_GAP = 45_000;
const IDLE_TIME = 75_000;
const MAX_HISTORY = 160;
const categoryWeights = { curious: 35, playful: 30, nature: 15, warm: 10, philosophy: 10 };
const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});
const periods = ["morning", "afternoon", "evening", "night"];
const officialByText = new Map(MOON_LINES.map((line) => [line.text, line]));
const officialById = new Map(MOON_LINES.map((line) => [line.id, line]));
const canonical = new Map([
  ["摸摸我的耳朵。", officialById.get("moon-42").text],
  [LIVING_DIALOGUE.beforeSkyVisit, officialById.get("moon-43").text],
  ["你来啦。", officialById.get("moon-44").text],
]);
const oldLines = [
  ...LIVING_DIALOGUE.general.map((text) => ({ text, category: "curious" })),
  ...periods.flatMap((period) => LIVING_DIALOGUE[period].map((text) => ({
    text, category: period === "night" ? "warm" : "nature", period,
  }))),
].filter(({ text }) => !officialByText.has(text) && !canonical.has(text))
  .map((line) => ({ trigger: "daily", weight: 1, ...line }));
const autoLines = [...MOON_LINES, ...oldLines];

export function beijingDialogueTime(now) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const hour = Number(parts.hour);
  const period = hour < 6 || hour >= 22 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, period };
}

function daysBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / DAY;
}

export function createLivingDialogue({ storage, random = Math.random, wallTime = Date.now, show, canSee }) {
  let saved;
  try {
    saved = JSON.parse(storage()?.getItem(STORAGE_KEY));
  } catch {
    // Dialogue still works for the session when storage is unavailable.
  }
  const seed = Number.isInteger(saved?.seed) ? saved.seed : Math.floor(random() * 2 ** 32);
  const seen = new Map();
  if (Array.isArray(saved?.history)) {
    for (const entry of saved.history.slice(-MAX_HISTORY)) {
      if (typeof entry?.line !== "string" || entry.line.length > 100 ||
          typeof entry.date !== "string" || !Number.isFinite(entry.time)) continue;
      const line = canonical.get(entry.line) ?? entry.line;
      seen.delete(line);
      seen.set(line, { ...entry, line });
    }
  }
  let skyDate = saved?.skyDate;
  let meetingDate = saved?.meetingDate;
  let visitDate = saved?.visitDate;
  let reunionDate = saved?.reunionDate;
  let ecologyDate = saved?.ecologyDate;
  let previousDate = saved?.previousDate;
  let lastAuto = Number.isFinite(saved?.lastAuto) ? saved.lastAuto : 0;
  let cooldown = Number.isFinite(saved?.cooldown) ? Math.max(MIN_GAP, Math.min(90_000, saved.cooldown)) : MIN_GAP;
  let lastAutomaticPhilosophy = saved?.lastAutomaticPhilosophy === true;
  const featureAt = Object.fromEntries(["butterfly", "firefly", "mushroom", "newFlower"]
    .filter((feature) => Number.isFinite(saved?.featureAt?.[feature]))
    .map((feature) => [feature, saved.featureAt[feature]]));
  let minute, clock, enterAt, idleSince;
  let scanAt = 0;
  let welcomeScanAt = 0;

  function persist() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify({
        seed, skyDate, meetingDate, visitDate, reunionDate, ecologyDate, previousDate,
        lastAuto, cooldown, lastAutomaticPhilosophy, featureAt, history: [...seen.values()],
      }));
    } catch {
      // Keep the current history in memory.
    }
  }

  function currentTime(now) {
    const currentMinute = Math.floor(now / 60_000);
    if (minute !== currentMinute) {
      minute = currentMinute;
      clock = beijingDialogueTime(now);
      if (!visitDate || clock.date > visitDate) {
        reunionDate = daysBetween(visitDate, clock.date) >= 3 ? clock.date : undefined;
        visitDate = clock.date;
        persist();
      }
    }
    return clock;
  }

  function remember(text, now, date) {
    const line = canonical.get(text) ?? text;
    seen.delete(line);
    seen.set(line, { line, date, time: now });
    if (seen.size > MAX_HISTORY) seen.delete(seen.keys().next().value);
    persist();
  }

  function weighted(pool, weight) {
    let draw = random() * pool.reduce((sum, line) => sum + weight(line), 0);
    for (const line of pool) {
      draw -= weight(line);
      if (draw < 0) return line;
    }
    return pool.at(-1);
  }

  function lastLine() {
    return [...seen.keys()].at(-1);
  }

  function freshPool(pool, date) {
    const unheard = pool.filter(({ text }) => !seen.has(text));
    if (unheard.length) return unheard;
    const older = pool.filter(({ text }) => daysBetween(seen.get(text)?.date, date) >= 7);
    if (older.length) return older;
    const otherDay = pool.filter(({ text }) => seen.get(text)?.date !== date);
    if (otherDay.length) return otherDay;
    const last = lastLine();
    const alternatives = pool.filter(({ text }) => text !== last);
    return alternatives.length ? alternatives : pool;
  }

  function randomDaily(pool) {
    const categories = [...new Set(pool.map(({ category }) => category))];
    const category = weighted(categories, (entry) => categoryWeights[entry]);
    return weighted(pool.filter((line) => line.category === category), (line) => line.weight);
  }

  function choose(now, { night, scene, ginkgo, features }, idleFor) {
    const { date, period } = currentTime(now);
    const skipPhilosophy = lastAutomaticPhilosophy || officialByText.get(lastLine())?.philosophical;
    const eligible = autoLines.filter((line) => {
      if (line.philosophical && skipPhilosophy) return false;
      if (line.scene && line.scene !== scene) return false;
      if (line.phase === "night" && !night) return false;
      if (line.phase === "day" && night && line.nightScene !== scene) return false;
      if (line.period && (line.period !== period || (night ? !["night", "evening"].includes(period) : period === "night"))) return false;
      if (line.beforeSkyVisit && (skyDate === date || scene === "sky")) return false;
      if (line.feature && (!features[line.feature] || now - (featureAt[line.feature] ?? -Infinity) < line.cooldown)) return false;
      return line.trigger !== "ginkgo" || ginkgo;
    });
    const pick = (pool) => weighted(freshPool(pool, date), (line) => line.weight);
    if (meetingDate !== date) {
      const reunion = eligible.find(({ trigger }) => trigger === "reunion");
      if (reunion && reunionDate === date && random() < reunion.weight) return reunion;
      return pick(eligible.filter(({ trigger }) => trigger === "meeting"));
    }
    const environment = eligible.filter(({ trigger, text, philosophical }) =>
      (trigger === "ginkgo" || trigger === "environment") &&
      seen.get(text)?.date !== date && (!philosophical || random() < .28));
    if (environment.length && random() < (ginkgo || scene === "sky" ? .82 : .52)) return pick(environment);
    const idle = eligible.filter(({ trigger, text }) => trigger === "idle" && seen.get(text)?.date !== date);
    if (idleFor >= IDLE_TIME && idle.length && random() < .58) return pick(idle);
    const daily = eligible.filter(({ trigger }) => trigger === "daily");
    return randomDaily(freshPool(daily, date));
  }

  function automaticReady(now) {
    return !lastAuto || now < lastAuto || now - lastAuto >= cooldown;
  }

  function recordAutomatic(line, now, date) {
    lastAuto = now;
    cooldown = MIN_GAP + random() * MIN_GAP;
    lastAutomaticPhilosophy = !!line.philosophical;
    if (line.trigger === "meeting" || line.trigger === "reunion") meetingDate = date;
    if (line.feature) featureAt[line.feature] = now;
    remember(line.text, now, date);
  }

  currentTime(wallTime());
  if (saved?.seed !== seed) persist();

  return {
    seed,
    forestDay() {
      const { date } = currentTime(wallTime());
      if (ecologyDate !== date) {
        previousDate = daysBetween(ecologyDate, date) === 1 ? ecologyDate : undefined;
        ecologyDate = date;
        persist();
      }
      return { date, previousDate };
    },
    rememberTouch(line) {
      const now = wallTime();
      remember(line, now, currentTime(now).date);
    },
    ordinaryTouch() {
      const now = wallTime();
      const line = officialById.get("moon-32");
      const { date } = currentTime(now);
      if (seen.get(line.text)?.date !== date && random() < .28) return line;
    },
    ginkgoTouch(legacy) {
      const now = wallTime();
      const { date } = currentTime(now);
      const skipPhilosophy = officialByText.get(lastLine())?.philosophical;
      const lines = MOON_LINES.filter(({ trigger, philosophical, text, weight }) =>
        trigger === "ginkgo" && (!philosophical || (!skipPhilosophy && seen.get(text)?.date !== date && random() < weight)));
      const pool = [...lines, ...legacy.map((text) => ({ text, weight: 1 }))];
      const line = weighted(freshPool(pool, date), (entry) => entry.weight);
      remember(line.text, now, date);
      return line.text;
    },
    welcomeGinkgo(time, ready) {
      const now = wallTime();
      if (!automaticReady(now) || time < welcomeScanAt) return false;
      welcomeScanAt = time + 250;
      if (!ready()) return false;
      const line = officialById.get("moon-44");
      show(line.text, time, "ginkgo");
      recordAutomatic(line, now, currentTime(now).date);
      return true;
    },
    recordSkyVisit() {
      const { date } = currentTime(wallTime());
      if (skyDate === date) return;
      skyDate = date;
      persist();
    },
    resetIdle() {
      idleSince = undefined;
      enterAt = undefined;
    },
    update(time, { blocked, idle, night, scene = "forest", ginkgo = false, features = () => ({}) }) {
      if (!idle) idleSince = undefined;
      else idleSince ??= time;
      if (blocked || time < scanAt) return;
      scanAt = time + 250;
      const now = wallTime();
      if (!automaticReady(now) || !canSee()) return;
      enterAt ??= time + 3000 + random() * 3000;
      if (time < enterAt) return;

      const line = choose(now, { night, scene, ginkgo, features: features() }, idleSince === undefined ? 0 : time - idleSince);
      show(line.text, time, ginkgo ? "ginkgo" : "ambient");
      recordAutomatic(line, now, currentTime(now).date);
    },
  };
}
