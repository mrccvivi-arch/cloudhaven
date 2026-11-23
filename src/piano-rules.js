export const NOTES = [
  { name: "Do", pitch: "C4", frequency: 261.63, color: 0xa7e7ff },
  { name: "Re", pitch: "D4", frequency: 293.66, color: 0xd5b9ff },
  { name: "Mi", pitch: "E4", frequency: 329.63, color: 0xffb5cf },
  { name: "Sol", pitch: "G4", frequency: 392, color: 0xa5efd0 },
  { name: "La", pitch: "A4", frequency: 440, color: 0xffd389 },
];
export const MELODIES = [[0, 1, 2], [2, 0, 3, 1], [4, 2, 3, 1, 0]];

export function readPianoProgress(raw) {
  return {
    unlocked: Number.isInteger(raw?.unlocked) ? Math.max(1, Math.min(MELODIES.length, raw.unlocked)) : 1,
    lastRewardDate: typeof raw?.lastRewardDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastRewardDate)
      ? raw.lastRewardDate : null,
  };
}

export function checkNote(level, position, note) {
  const melody = MELODIES[level];
  if (melody[position] !== note) return "retry";
  return position + 1 === melody.length ? "complete" : "next";
}

export function localDate(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
}

export function completePianoLevel(state, level, fullRun, date = localDate()) {
  const progress = state.piano;
  progress.unlocked = Math.max(progress.unlocked, Math.min(MELODIES.length, level + 2));
  if (level !== MELODIES.length - 1 || !fullRun ||
      (progress.lastRewardDate && progress.lastRewardDate >= date)) return { claimed: false, energy: 0 };
  progress.lastRewardDate = date;
  const energy = Math.min(10, 100 - state.moonlightEnergy);
  state.moonlightEnergy += energy;
  return { claimed: true, energy };
}
