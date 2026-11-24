export const FIRST_GREETING = "你好，我是月。摸摸我的耳朵吧。";
export const FIRST_TOUCH = "原来这就是人类的温度。";
export const GREETING_DURATION = 6000;
const REPEAT_DELAY = 60_000;

export function createFirstMeeting(state) {
  let nextAt;
  let expires = 0;
  let shown = false;

  return {
    update(time, { nearby, idle, available, canSee }) {
      nextAt ??= time + 2000;
      if (state.hasMetMoon || !nearby || !available) expires = 0;
      if (state.hasMetMoon || !nearby || !available || !idle || time < nextAt || !canSee()) return false;
      expires = time + GREETING_DURATION;
      nextAt = time + REPEAT_DELAY;
      shown = true;
      return true;
    },
    hasPriority(nearby) {
      return nearby && !state.hasMetMoon && !shown;
    },
    elapsed(time) {
      return time < expires ? time - (expires - GREETING_DURATION) : undefined;
    },
    hide() {
      expires = 0;
    },
    meet() {
      if (state.hasMetMoon) return false;
      state.hasMetMoon = true;
      expires = 0;
      return true;
    },
  };
}
