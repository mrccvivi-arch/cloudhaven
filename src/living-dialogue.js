import { STAGE_LINES, eligibleStageLine, pickStageLine } from "./affection.js";
import { beijingDialogueTime, daysBetween } from "./beijing-time.js";
export { beijingDialogueTime } from "./beijing-time.js";
import { LIVING_DIALOGUE } from "./dialogue.js";
import { MOON_LINES } from "./moon-lines.js";

const STORAGE_KEY = "cloudhaven-living-dialogue-v1";
const MIN_GAP = 45_000;
const IDLE_TIME = 75_000;
const MAX_HISTORY = 240;
const categoryWeights = { curious: 35, playful: 30, nature: 15, warm: 10, philosophy: 10 };
const periods = ["morning", "afternoon", "evening", "night"];
const officialByText = new Map(MOON_LINES.map((line) => [line.text, line]));
const officialById = new Map(MOON_LINES.map((line) => [line.id, line]));
const canonical = new Map([
  ["摸摸我的耳朵。", officialById.get("BASE-04").text],
  [LIVING_DIALOGUE.beforeSkyVisit, officialById.get("BASE-05").text],
  ["你来啦。", officialById.get("BASE-06").text],
]);
const oldLines = [
  ...LIVING_DIALOGUE.general.map((text) => ({ text, category: "curious" })),
  ...periods.flatMap((period) => LIVING_DIALOGUE[period].map((text) => ({
    text, category: period === "night" ? "warm" : "nature", period,
  }))),
].filter(({ text }) => !officialByText.has(text) && !canonical.has(text))
  .map((line) => ({ trigger: "daily", weight: 1, ...line }));
const autoLines = [...new Map([...oldLines, ...STAGE_LINES.flat(), ...MOON_LINES].map((line) => [line.text, line])).values()];
const sequenceFor = (id) => MOON_LINES.filter(({ sequenceId }) => sequenceId === id)
  .sort((a, b) => a.sequenceOrder - b.sequenceOrder);
const continuation = {
  "first-meeting-memory": sequenceFor("first-meeting-memory"),
  "first-acquaintance": sequenceFor("first-acquaintance"),
};
const WEEK = 7 * 86_400_000;

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
  let sequence, pendingTouch, activeScene;
  const sequenceAt = {
    "first-meeting-memory": Number(saved?.sequenceAt?.["first-meeting-memory"]) || 0,
    "first-acquaintance": Number(saved?.sequenceAt?.["first-acquaintance"]) || 0,
  };
  let ecologyDate = saved?.ecologyDate;
  let previousDate = saved?.previousDate;
  let lastAuto = Number.isFinite(saved?.lastAuto) ? saved.lastAuto : 0;
  let cooldown = Number.isFinite(saved?.cooldown) ? Math.max(MIN_GAP, Math.min(90_000, saved.cooldown)) : MIN_GAP;
  let lastAutomaticPhilosophy = saved?.lastAutomaticPhilosophy === true;
  let lastPhilosophyAt = Number(saved?.lastPhilosophyAt) || 0;
  let lastInteractionAt = Number(saved?.lastInteractionAt) || 0;
  const featureAt = Object.fromEntries(["butterfly", "firefly", "mushroom", "newFlower"]
    .filter((feature) => Number.isFinite(saved?.featureAt?.[feature]))
    .map((feature) => [feature, saved.featureAt[feature]]));
  let minute, clock, enterAt, idleSince;
  let scanAt = 0;

  function persist() {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify({
        seed, skyDate, meetingDate, visitDate, sequenceAt, ecologyDate, previousDate,
        lastAuto, cooldown, lastAutomaticPhilosophy, lastPhilosophyAt, lastInteractionAt, featureAt, history: [...seen.values()],
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
        visitDate = clock.date;
        persist();
      }
    }
    return clock;
  }

  function remember(text, now, date) {
    const line = canonical.get(text) ?? text;
    if (officialByText.get(line)?.philosophical) lastPhilosophyAt = now;
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
    const last = lastLine();
    const alternatives = pool.filter(({ text }) => (canonical.get(text) ?? text) !== last);
    const unheard = alternatives.filter(({ text }) => !seen.has(canonical.get(text) ?? text));
    if (unheard.length) return unheard;
    const older = alternatives.filter(({ text }) => daysBetween(seen.get(canonical.get(text) ?? text)?.date, date) >= 7);
    if (older.length) return older;
    const otherDay = alternatives.filter(({ text }) => seen.get(canonical.get(text) ?? text)?.date !== date);
    if (otherDay.length) return otherDay;
    const oldest = Math.min(...alternatives.map(({ text }) => seen.get(canonical.get(text) ?? text)?.time ?? Infinity));
    return alternatives.filter(({ text }) => seen.get(canonical.get(text) ?? text)?.time === oldest);
  }

  function pick(pool, date) {
    return weighted(freshPool(pool, date), (line) => line.weight);
  }

  function matches(line, context, now, date, period) {
    const { night, scene, ginkgo, features, level } = context;
    if (!eligibleStageLine(line, level, context)) return false;
    if (line.scene && line.scene !== scene && !(line.openSky && context.openSky)) return false;
    if (line.phase === "night" && !night) return false;
    if (line.phase === "day" && night && line.nightScene !== scene) return false;
    if (line.period && (line.period !== period || (night ? !["night", "evening"].includes(period) : period === "night"))) return false;
    if (line.beforeSkyVisit && (skyDate === date || scene === "sky")) return false;
    if (line.feature && (!features?.[line.feature] || now - (featureAt[line.feature] ?? -Infinity) < line.cooldown)) return false;
    return line.trigger !== "ginkgo" || ginkgo;
  }

  function randomDaily(pool) {
    const categories = [...new Set(pool.map(({ category }) => category))];
    const category = weighted(categories, (entry) => categoryWeights[entry]);
    return weighted(pool.filter((line) => line.category === category), (line) => line.weight);
  }

  function choose(now, context, idleFor) {
    const { level, scene, ginkgo, lastTouchDate, lastTouchAt } = context;
    const { date, period } = currentTime(now);
    const skipPhilosophy = lastAutomaticPhilosophy || !philosophyReady(now);
    const eligible = autoLines.filter((line) =>
      (!line.philosophical || !skipPhilosophy) && matches(line, context, now, date, period));
    if (meetingDate !== date) {
      meetingDate = date;
      const reunion = eligible.find(({ trigger }) => trigger === "reunion");
      const lastInteraction = Math.max(lastTouchAt ?? 0, lastInteractionAt);
      const away = lastInteraction ? now - lastInteraction >= 3 * 86_400_000 : daysBetween(lastTouchDate, date) >= 3;
      if (reunion && away && random() < reunion.weight &&
          reunion.text !== lastLine()) return reunion;
      if (random() < .42) {
        const meeting = pick(eligible.filter(({ trigger }) => trigger === "meeting"), date);
        if (meeting) return meeting;
      }
      persist();
    }
    const environment = eligible.filter(({ trigger, text, philosophical }) =>
      (trigger === "ginkgo" || trigger === "environment") &&
      seen.get(text)?.date !== date && (!philosophical || random() < .28));
    if (environment.length && random() < (ginkgo || scene === "sky" ? .82 : .52)) {
      const line = pick(environment, date);
      if (line) return line;
    }
    const idle = eligible.filter(({ trigger, idle, text }) =>
      (trigger === "idle" || idle) && seen.get(text)?.date !== date);
    if (idleFor >= IDLE_TIME && idle.length && random() < .38) {
      const line = pick(idle, date);
      if (line) return line;
    }
    if (!ginkgo && random() < .09) {
      const starts = eligible.filter((line) => line.trigger === "sequence" &&
        (!sequenceAt[line.sequenceId] || now - sequenceAt[line.sequenceId] >= WEEK));
      const start = pick(starts, date);
      if (start) return start;
    }
    const daily = eligible.filter(({ trigger, id, chance }) => trigger === "daily" &&
      (!ginkgo || id !== "F31") && (!chance || random() < chance));
    const stages = eligible.filter(({ trigger, idle }) => trigger === "stage" && !idle);
    if (random() < .30) {
      const stage = pickStageLine(level, freshPool(stages, date), (pool) => pick(pool, date), random);
      if (stage) return stage;
    }
    return randomDaily(freshPool(daily, date));
  }

  function philosophyReady(now) {
    return !officialByText.get(lastLine())?.philosophical &&
      (!lastPhilosophyAt || now < lastPhilosophyAt || now - lastPhilosophyAt >= 180_000);
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
    isLast(text) { return (canonical.get(text) ?? text) === lastLine(); },
    freshTouch(pool) { return freshPool(pool, currentTime(wallTime()).date); },
    pickTouch(pool) {
      return pick(pool, currentTime(wallTime()).date);
    },
    rememberTouch(text) {
      const now = wallTime();
      sequence = undefined;
      lastInteractionAt = now;
      pendingTouch = text === officialById.get("C6").text ? { id: "C7", expires: now + 38_000 } : undefined;
      const line = officialByText.get(text);
      if (line?.feature) featureAt[line.feature] = now;
      remember(text, now, currentTime(now).date);
    },
    pendingTouch(level) {
      const now = wallTime();
      const pending = pendingTouch;
      pendingTouch = undefined;
      if (!pending || now >= pending.expires) return;
      const lines = pending.id === "secret"
        ? ["D1", "D2", "D3", "D4"].map((id) => officialById.get(id))
        : [officialById.get(pending.id)];
      return pick(lines.filter(({ minLevel }) => minLevel <= level), currentTime(now).date);
    },
    ordinaryTouch(level, context = {}) {
      const now = wallTime();
      const { date, period } = currentTime(now);
      const environment = MOON_LINES.filter((line) => line.trigger === "environment" && line.feature &&
        seen.get(line.text)?.date !== date && matches(line, { ...context, level }, now, date, period));
      if (environment.length && random() < .4) return pick(environment, date);
      const line = officialById.get("F32");
      if (seen.get(line.text)?.date !== date && random() < .12) return line;
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
      sequence = pendingTouch = undefined;
    },
    get continuing() { return Boolean(sequence); },
    update(time, {
      blocked, interrupted, idle, night, scene = "forest", ginkgo = false, level = 1, met, moving, daysKnown,
      lastTouchDate, lastTouchAt, profile, features = () => ({}),
    }) {
      if (!idle) idleSince = undefined;
      else idleSince ??= time;
      if (interrupted || (activeScene && activeScene !== scene)) sequence = pendingTouch = undefined;
      activeScene = scene;
      if (sequence && (sequence.scene !== scene || time > sequence.nextAt + 3000)) sequence = undefined;
      if (blocked || time < scanAt) return;
      scanAt = time + 250;
      const now = wallTime();
      const { date } = currentTime(now);
      if (sequence) {
        if (time < sequence.nextAt || !canSee()) return;
        const line = sequence.lines[sequence.index++];
        const relationship = profile?.() ?? { level, met, daysKnown };
        if (!eligibleStageLine(line, relationship.level, { ...relationship, night, moving })) {
          sequence = undefined;
          return;
        }
        show(line.text, time, "ambient");
        recordAutomatic(line, now, date);
        if (sequence.index === sequence.lines.length) sequence = undefined;
        else sequence.nextAt = time + 5300;
        return;
      }
      if (!automaticReady(now) || !canSee()) return;
      enterAt ??= time + 3000 + random() * 3000;
      if (time < enterAt) return;

      const relationship = profile?.() ?? { level, met, daysKnown, lastTouchDate, lastTouchAt };
      const line = choose(now, { night, scene, ginkgo, moving, ...relationship, features: features() },
        idleSince === undefined ? 0 : time - idleSince);
      if (!line) return;
      if (line.trigger === "sequence") {
        sequenceAt[line.sequenceId] = now;
        sequence = { lines: continuation[line.sequenceId], index: 1, nextAt: time + 5300, scene };
      }
      if (line.id === "F31") pendingTouch = { id: "secret", expires: now + 45_000 };
      show(line.text, time, ginkgo ? "ginkgo" : "ambient");
      recordAutomatic(line, now, date);
    },
  };
}
