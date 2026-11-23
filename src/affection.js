import { DIALOGUE, SPECIAL_DIALOGUE } from "./dialogue.js";
import { localDate } from "./piano-rules.js";

export const LEVELS = [
  { name: "初次相遇", minimum: 0 },
  { name: "渐渐熟悉", minimum: 100 },
  { name: "开始亲近", minimum: 300 },
  { name: "悄悄信任", minimum: 700 },
  { name: "亲密伙伴", minimum: 1400 },
  { name: "月光羁绊", minimum: 2500 },
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
const lines = DIALOGUE.map((stage, index) => stage.map((text, line) => ({
  id: `level-${index + 1}-${index === 0 ? levelOneIds[line] : line + 1}`, text,
})));
const knownIds = new Set([...lines.flat().map(({ id }) => id), ...Object.keys(SPECIAL_DIALOGUE)]);
function count(value, limit = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) ? Math.min(limit, Math.max(0, value)) : 0;
}
function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

export function readAffection(raw) {
  const dailyTouchDate = dateValue(raw?.dailyTouchDate);
  const lastTouchDate = dateValue(raw?.lastTouchDate);
  return {
    affectionPoints: count(raw?.affectionPoints),
    dailyTouchCount: dailyTouchDate ? count(raw?.dailyTouchCount, AFFECTION_RULES.rewardedTouches) : 0,
    dailyTouchDate, lastTouchDate,
    lastTouchAt: count(raw?.lastTouchAt),
    lastDialogueId: knownIds.has(raw?.lastDialogueId) ? raw.lastDialogueId : null,
    specialAt: Object.fromEntries(Object.keys(SPECIAL_DIALOGUE).map((id) => [id, count(raw?.specialAt?.[id])])),
  };
}

export function affectionLevel(points) {
  return LEVELS.reduce((level, { minimum }, index) => points >= minimum ? index + 1 : level, 1);
}

export function createAffection(state, random = Math.random) {
  const rules = AFFECTION_RULES;
  const recent = [];
  function special(id, now) {
    const prior = state.specialAt[id];
    if (state.lastDialogueId === id || (prior && now >= prior && now - prior < rules.specialCooldown[id])) return undefined;
    state.specialAt[id] = now;
    state.lastDialogueId = id;
    return SPECIAL_DIALOGUE[id];
  }
  function ordinary(level, upgraded) {
    const lower = level > 1 && random() < .25;
    const stage = lines[lower ? Math.floor(random() * (level - 1)) : level - 1];
    const pool = stage.filter(({ id }) => id !== state.lastDialogueId);
    const line = upgraded ? lines[level - 1][0] : pool[Math.floor(random() * pool.length)];
    state.lastDialogueId = line.id;
    return line.text;
  }

  return {
    touch({ night, energy, now = new Date() }) {
      const time = now.getTime();
      const date = localDate(now);
      while (recent.length && (recent[0] > time || time - recent[0] > rules.busyWindow)) recent.shift();
      recent.push(time);
      if (recent.length > rules.busyTouches) recent.shift();
      const level = affectionLevel(state.affectionPoints);
      if (state.lastTouchAt && time >= state.lastTouchAt && time - state.lastTouchAt < rules.touchCooldown) {
        const text = recent.length >= rules.busyTouches ? special("busy", time) : undefined;
        return text ? { text, level, blocked: true } : undefined;
      }

      const previousDate = state.lastTouchDate;
      const hasPreviousTouch = Boolean(previousDate || state.lastTouchAt);
      if (!state.dailyTouchDate || date > state.dailyTouchDate) {
        state.dailyTouchDate = date;
        state.dailyTouchCount = 0;
      }
      const points = state.dailyTouchCount < rules.rewardedTouches
        ? state.dailyTouchCount++ < rules.generousTouches ? rules.generousPoints : rules.regularPoints : 0;
      state.affectionPoints = Math.min(Number.MAX_SAFE_INTEGER, state.affectionPoints + points);
      state.lastTouchDate = date;
      state.lastTouchAt = time;
      const next = affectionLevel(state.affectionPoints);
      const upgraded = next > level;
      const away = previousDate && (Date.parse(date) - Date.parse(previousDate)) / 86400000 >= rules.absenceDays;
      let text;
      if (!upgraded && hasPreviousTouch) {
        if (recent.length >= rules.busyTouches) text = special("busy", time);
        if (!text && away) text = special("reunited", time);
        if (!text && night && energy < rules.lowEnergy) text = special("lowEnergy", time);
      }
      return { text: text ?? ordinary(next, upgraded), level: next, points, upgraded };
    },
  };
}
