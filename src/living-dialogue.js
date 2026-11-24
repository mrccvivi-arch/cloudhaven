import { LIVING_DIALOGUE } from "./dialogue.js";
import { seeded } from "./map.js";

const STORAGE_KEY = "cloudhaven-living-dialogue-v1";
const MIN_GAP = 90_000;
const IDLE_TIME = 15_000;
const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});
const periods = ["morning", "afternoon", "evening", "night"];
const knownLines = new Set([
  ...periods.flatMap((period) => LIVING_DIALOGUE[period]),
  ...LIVING_DIALOGUE.general, LIVING_DIALOGUE.beforeSkyVisit,
]);

export function beijingDialogueTime(now) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const hour = Number(parts.hour);
  const period = hour < 6 || hour >= 22 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, period };
}

function dailySample(lines, count, random) {
  const remaining = [...lines];
  return Array.from({ length: count }, () => remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
}

export function createLivingDialogue({ storage, random = Math.random, wallTime = Date.now, show, canSee }) {
  let saved;
  try {
    saved = JSON.parse(storage()?.getItem(STORAGE_KEY));
  } catch {
    // Dialogue still works for the session when storage is unavailable.
  }
  const seed = Number.isInteger(saved?.seed) ? saved.seed : Math.floor(random() * 2 ** 32);
  let skyDate = typeof saved?.skyDate === "string" ? saved.skyDate : undefined;
  let history = Array.isArray(saved?.history)
    ? saved.history.filter((entry) => knownLines.has(entry?.line) && typeof entry.date === "string" &&
      Number.isFinite(entry.time)).slice(-knownLines.size)
    : [];
  let minute;
  let clock;
  let daily;
  let enterAt;
  let nextIdleAt;
  let idleSince;
  let checkVisibilityAt = 0;

  function visible(time) {
    if (time < checkVisibilityAt) return false;
    if (canSee()) return true;
    checkVisibilityAt = time + 250;
    return false;
  }

  function persist() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify({ seed, skyDate, history }));
    } catch {
      // Keep the current history in memory.
    }
  }

  function currentTime(now) {
    const currentMinute = Math.floor(now / 60_000);
    if (minute !== currentMinute) {
      minute = currentMinute;
      clock = beijingDialogueTime(now);
    }
    return clock;
  }

  function remember(line, now, date) {
    history = history.filter((entry) => entry.line !== line);
    history.push({ line, time: now, date });
    persist();
  }

  function choose(now, night) {
    const { date, period } = currentTime(now);
    if (daily?.date !== date) {
      const dailyRandom = seeded(seed ^ Number(date.replaceAll("-", "")));
      daily = { date, general: dailySample(LIVING_DIALOGUE.general, 7, dailyRandom) };
      for (const slot of periods) daily[slot] = dailySample(LIVING_DIALOGUE[slot], 2, dailyRandom);
    }
    // Beijing picks the time slot. The in-game sky can rule out lines about the wrong phase.
    const matchingPhase = night ? period === "night" || period === "evening" : period !== "night";
    const contextual = skyDate === date ? [] : [LIVING_DIALOGUE.beforeSkyVisit];
    const preferred = [...(matchingPhase ? daily[period] : []), ...daily.general, ...contextual];
    const eligible = [...(matchingPhase ? LIVING_DIALOGUE[period] : []), ...LIVING_DIALOGUE.general, ...contextual];
    const seen = new Map(history.map((entry) => [entry.line, entry]));
    const fresh = (line) => seen.get(line)?.date !== date;
    let pool = preferred.filter(fresh);
    if (!pool.length) pool = eligible.filter(fresh);
    if (!pool.length) pool = preferred;
    const last = history[history.length - 1]?.line;
    const alternatives = pool.filter((line) => line !== last);
    if (alternatives.length) pool = alternatives;
    const weighted = pool.map((line) => {
      const prior = seen.get(line);
      const age = prior ? Math.max(0, now - prior.time) : Infinity;
      return [line, .15 + .85 * Math.min(1, age / (3 * DAY))];
    });
    let draw = random() * weighted.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [line, weight] of weighted) {
      if (draw < weight) return line;
      draw -= weight;
    }
    return pool[pool.length - 1];
  }

  return {
    rememberTouch(line) {
      if (!knownLines.has(line)) return;
      const now = wallTime();
      remember(line, now, currentTime(now).date);
    },
    recordSkyVisit() {
      const { date } = currentTime(wallTime());
      if (skyDate === date) return;
      skyDate = date;
      persist();
    },
    resetIdle() {
      idleSince = undefined;
    },
    update(time, { blocked, idle, night }) {
      if (blocked || !idle) idleSince = undefined;
      else idleSince ??= time;
      if (blocked) return;
      if (nextIdleAt === undefined) {
        if (enterAt === undefined) {
          if (visible(time)) enterAt = time + 3000 + random() * 3000;
          return;
        }
        if (time < enterAt) return;
      } else if (time < nextIdleAt || idleSince === undefined || time - idleSince < IDLE_TIME) {
        return;
      }
      if (!visible(time)) return;
      const now = wallTime();
      const line = choose(now, night);
      show(line, time);
      remember(line, now, currentTime(now).date);
      nextIdleAt = time + MIN_GAP + random() * 60_000;
    },
  };
}
