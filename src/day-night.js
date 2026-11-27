export const DAY_DURATION_SECONDS = 180;
export const NIGHT_DURATION_SECONDS = 120;
export const TRANSITION_SECONDS = 15;
export const DAY_CYCLE_SECONDS = DAY_DURATION_SECONDS + NIGHT_DURATION_SECONDS;
export const DAY_LENGTH = DAY_DURATION_SECONDS;
export const NIGHT_LENGTH = NIGHT_DURATION_SECONDS;
export const CYCLE_LENGTH = DAY_CYCLE_SECONDS;
const SUNSET_ENERGY = 37.5;
const DAILY_ENERGY_CHANGE = 100 - SUNSET_ENERGY;
const DAY_DRAIN = DAILY_ENERGY_CHANGE / DAY_LENGTH;
const MOONLIGHT_GAIN = DAILY_ENERGY_CHANGE / NIGHT_LENGTH;

export function normalizeWorldTime(seconds, cycleSeconds = CYCLE_LENGTH) {
  const wrapped = seconds % cycleSeconds;
  return wrapped < 0 ? wrapped + cycleSeconds : wrapped;
}

export function isNight(seconds) {
  return seconds >= DAY_LENGTH;
}

export function nightBlend(seconds, transitionSeconds = TRANSITION_SECONDS) {
  // Positive distance is inside the night, negative distance inside the day.
  const distance = isNight(seconds)
    ? Math.min(seconds - DAY_LENGTH, DAY_CYCLE_SECONDS - seconds)
    : -Math.min(seconds, DAY_LENGTH - seconds);
  const t = Math.max(0, Math.min(1, .5 + distance / transitionSeconds));
  return t * t * (3 - 2 * t);
}

export function clockText(seconds) {
  const hour = isNight(seconds) ? 18 + (seconds - DAY_LENGTH) / NIGHT_LENGTH * 12 : 6 + seconds / DAY_LENGTH * 12;
  const minutes = Math.floor(hour * 60) % 1440;
  return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
}

export function advanceCycle(state, elapsed, exposed) {
  // Split a frame that crosses dawn or dusk so each rate applies for its own phase.
  let time = state.worldTime;
  let energy = state.moonlightEnergy;
  while (elapsed > 0) {
    const night = isNight(time);
    const duration = Math.min(elapsed, (night ? DAY_CYCLE_SECONDS : DAY_LENGTH) - time);
    const rate = night ? (exposed ? MOONLIGHT_GAIN : 0) : -DAY_DRAIN;
    energy = Math.max(0, Math.min(100, energy + rate * duration));
    time = normalizeWorldTime(time + duration);
    elapsed -= duration;
  }
  state.worldTime = time;
  state.moonlightEnergy = energy;
}
