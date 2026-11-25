import { DIALOGUE, SPECIAL_DIALOGUE } from "./dialogue.js";
import { MOON_LINES } from "./moon-lines.js";
import { beijingDialogueTime, daysBetween } from "./beijing-time.js";

export const AFFINITY_TEST_MODE = true;

export const LEVELS = [
  { name: "初次相遇", minimum: 0 },
  { name: "渐渐熟悉", minimum: 16 },
  { name: "开始亲近", minimum: 48 },
  { name: "悄悄信任", minimum: 96 },
  { name: "亲密伙伴", minimum: 176 },
  { name: "月光羁绊", minimum: 288 },
];

export const AFFECTION_RULES = {
  generousTouches: 3,
  rewardedTouches: 10,
  generousPoints: 3,
  regularPoints: 1,
  touchCooldown: 2000,
  busyWindow: 7000,
  busyTouches: 5,
  lowEnergy: 20,
  absenceDays: 3,
  specialCooldown: { busy: 45000, lowEnergy: 120000, reunited: 86400000 },
};

// Keep IDs for unchanged Lv.1 lines so legacy saves still avoid the last line.
const levelOneIds = [8, 9, 10, 1, 2, 3, 5, 6, 7, 11];
const officialByText = new Map(MOON_LINES.map((line) => [line.text, line]));
export const STAGE_LINES = DIALOGUE.map((stage, index) => [
  ...stage.map((text, line) => officialByText.get(text) ?? {
    id: `level-${index + 1}-${index === 0 ? levelOneIds[line] : line + 1}`,
    text, stage: index + 1, minLevel: index + 1, trigger: "stage", weight: 1, category: "curious",
  }),
  ...MOON_LINES.filter((line) => line.stage === index + 1 && !stage.includes(line.text)),
]);
const aliases = { "moon-32": "F32", "level-1-8": "BASE-01", "level-1-9": "BASE-02", "level-1-10": "BASE-03" };
const knownIds = new Set([...STAGE_LINES.flat().map(({ id }) => id), ...Object.keys(SPECIAL_DIALOGUE), ...MOON_LINES.map(({ id }) => id)]);
const currentStageWeight = [1, .8, .75, .7, .65, .65];

export function eligibleStageLine(line, level, { night, moving, met, daysKnown, scene } = {}) {
  return (line.minLevel ?? 1) <= level && (!line.maxLevel || level <= line.maxLevel) &&
    (line.phase !== "day" || night === false || (line.nightScene && line.nightScene === scene)) && (!line.moving || moving) &&
    (!line.met || met) && (!line.daysKnown || daysKnown >= line.daysKnown);
}

export function pickStageLine(level, pool, pick, random, upgraded = false) {
  const current = pool.filter((line) => line.stage === level);
  if (upgraded) return pick(current);
  const prior = pool.filter((line) => line.stage < level);
  if (current.length && (!prior.length || random() < currentStageWeight[level - 1])) return pick(current) ?? pick(prior);
  return pick(prior) ?? pick(current);
}

function count(value, limit = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) ? Math.min(limit, Math.max(0, value)) : 0;
}
function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function readAffection(raw) {
  const lastTouchAt = count(raw?.lastTouchAt);
  const lastTouchDay = lastTouchAt && lastTouchAt <= 8.64e15 ? beijingDialogueTime(lastTouchAt).date : null;
  const date = dateValue(raw?.dailyTouchDate);
  // Old saves counted by device date. Carry the existing quota onto the last confirmed Beijing day.
  const dailyTouchDate = raw?.touchCalendar === "beijing" || !date ? date : lastTouchDay ?? date;
  const lastTouchDate = lastTouchDay ?? dateValue(raw?.lastTouchDate);
  const lastDialogueId = Object.hasOwn(aliases, raw?.lastDialogueId) ? aliases[raw.lastDialogueId] : raw?.lastDialogueId;
  return {
    affectionPoints: count(raw?.affectionPoints),
    dailyTouchCount: dailyTouchDate ? count(raw?.dailyTouchCount, AFFECTION_RULES.rewardedTouches) : 0,
    dailyTouchDate, lastTouchDate, lastTouchAt, touchCalendar: "beijing",
    firstMetDate: dateValue(raw?.firstMetDate),
    lastDialogueId: knownIds.has(lastDialogueId) ? lastDialogueId : null,
    specialAt: Object.fromEntries(Object.keys(SPECIAL_DIALOGUE).map((id) => [id, count(raw?.specialAt?.[id])])),
  };
}

export function affectionLevel(points) {
  return LEVELS.reduce((level, { minimum }, index) => points >= minimum ? index + 1 : level, 1);
}

export function createAffection(state, random = Math.random, testMode = AFFINITY_TEST_MODE) {
  const rules = AFFECTION_RULES;
  const recent = [];
  function special(id, now, isLast) {
    const prior = state.specialAt[id];
    if (isLast(SPECIAL_DIALOGUE[id]) || state.lastDialogueId === id || (prior && now >= prior && now - prior < rules.specialCooldown[id])) return undefined;
    state.specialAt[id] = now;
    state.lastDialogueId = id;
    return SPECIAL_DIALOGUE[id];
  }
  function ordinary(level, upgraded, context, pick, prioritize) {
    const pool = STAGE_LINES.flat().filter((line) => (["stage", "stage-touch"].includes(line.trigger) || line.id.startsWith("BASE-")) &&
      eligibleStageLine(line, level, context) && !line.idle && line.id !== state.lastDialogueId);
    return pickStageLine(level, !upgraded && prioritize ? prioritize(pool) : pool, pick ?? ((lines) => lines[Math.floor(random() * lines.length)]), random, upgraded);
  }

  return {
    upgradeDialogue(context, pick) {
      const line = ordinary(affectionLevel(state.affectionPoints), true, context, pick);
      if (line) state.lastDialogueId = line.id;
      return line?.text;
    },
    touch({ night, energy, now = new Date(), context = {}, pick, prioritize, extra, pending, quiet = false, isLast = () => false }) {
      const time = now.getTime();
      const date = beijingDialogueTime(time).date;
      while (recent.length && (recent[0] > time || time - recent[0] > rules.busyWindow)) recent.shift();
      recent.push(time);
      if (recent.length > rules.busyTouches) recent.shift();
      const level = affectionLevel(state.affectionPoints);
      if (!testMode && state.lastTouchAt && time >= state.lastTouchAt && time - state.lastTouchAt < rules.touchCooldown) {
        if (quiet) return;
        const text = recent.length >= rules.busyTouches ? special("busy", time, isLast) : undefined;
        return text ? { text, level, blocked: true } : undefined;
      }

      const previousDate = state.lastTouchDate;
      const hasPreviousTouch = Boolean(previousDate || state.lastTouchAt);
      if (!state.dailyTouchDate || date > state.dailyTouchDate) {
        state.dailyTouchDate = date;
        state.dailyTouchCount = 0;
      }
      const points = state.dailyTouchCount < rules.rewardedTouches
        ? state.dailyTouchCount++ < rules.generousTouches ? rules.generousPoints : rules.regularPoints
        : testMode ? rules.regularPoints : 0;
      state.affectionPoints = Math.min(Number.MAX_SAFE_INTEGER, state.affectionPoints + points);
      state.lastTouchDate = date;
      state.lastTouchAt = time;
      const next = affectionLevel(state.affectionPoints);
      const upgraded = next > level;
      if (quiet) return { level: next, points, upgraded };
      const away = daysBetween(previousDate, date) >= rules.absenceDays;
      let line = !upgraded && pending?.(next);
      let text;
      if (!line && !upgraded && hasPreviousTouch) {
        if (recent.length >= rules.busyTouches) text = special("busy", time, isLast);
        if (!text && away) text = special("reunited", time, isLast);
        if (!text && night && energy < rules.lowEnergy) text = special("lowEnergy", time, isLast);
      }
      if (!text) {
        line ||= (!upgraded && extra?.(next)) || ordinary(next, upgraded, { ...context, night }, pick, prioritize);
        if (line) state.lastDialogueId = line.id;
        text = line?.text;
      }
      return { text, level: next, points, upgraded };
    },
  };
}
