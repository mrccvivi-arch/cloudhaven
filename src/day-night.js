export const DAY_CYCLE_SECONDS = 300;
export const DAY_LENGTH = DAY_CYCLE_SECONDS * .6;
export const NIGHT_LENGTH = DAY_CYCLE_SECONDS - DAY_LENGTH;
export const CYCLE_LENGTH = DAY_CYCLE_SECONDS;
const TWILIGHT = DAY_CYCLE_SECONDS * .0375;
const DAY_DRAIN = .12;
const MOONLIGHT_GAIN = .5;

export function normalizeWorldTime(seconds, cycleSeconds = CYCLE_LENGTH) {
  const wrapped = seconds % cycleSeconds;
  return wrapped < 0 ? wrapped + cycleSeconds : wrapped;
}

export function isNight(seconds) {
  return seconds >= DAY_LENGTH;
}

export function nightBlend(seconds) {
  // Positive distance is inside the night, negative distance inside the day.
  const distance = isNight(seconds)
    ? Math.min(seconds - DAY_LENGTH, DAY_CYCLE_SECONDS - seconds)
    : -Math.min(seconds, DAY_LENGTH - seconds);
  const t = Math.max(0, Math.min(1, .5 + distance / (2 * TWILIGHT)));
  return t * t * (3 - 2 * t);
}

export function clockText(seconds) {
  const hour = isNight(seconds) ? 18 + (seconds - DAY_LENGTH) / NIGHT_LENGTH * 12 : 6 + seconds / DAY_LENGTH * 12;
  const minutes = Math.floor(hour * 60) % 1440;
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

export function advanceCycle(state, elapsed, active, exposed) {
  // Split a frame that crosses dawn or dusk so each rate applies for its own phase.
  let time = state.worldTime;
  let energy = state.moonlightEnergy;
  while (elapsed > 0) {
    const night = isNight(time);
    const duration = Math.min(elapsed, (night ? DAY_CYCLE_SECONDS : DAY_LENGTH) - time);
    const rate = night ? (exposed ? MOONLIGHT_GAIN : 0) : (active ? -DAY_DRAIN : 0);
    energy = Math.max(0, Math.min(100, energy + rate * duration));
    time = normalizeWorldTime(time + duration);
    elapsed -= duration;
  }
  state.worldTime = time;
  state.moonlightEnergy = energy;
}
