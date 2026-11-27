export const WINTER_CALL_RANGE = 76;
export const WINTER_CALL_WINDOW = 5;
export const WINTER_CALL_COOLDOWN = 52;

export function createWinterWhaleCall() {
  let offered, readyAt, jumps, wasEligible;

  return {
    reset() {
      offered = wasEligible = false;
      readyAt = 0;
      jumps = [];
    },
    update(time, eligible, completedJump) {
      if (!eligible || time < readyAt) {
        jumps.length = 0;
        const left = wasEligible;
        wasEligible = false;
        return { hint: false, requested: false, left };
      }
      const hint = !offered;
      offered = wasEligible = true;
      while (jumps.length && time - jumps[0] > WINTER_CALL_WINDOW) jumps.shift();
      if (completedJump) jumps.push(time);
      const requested = jumps.length >= 3;
      if (requested) jumps.length = 0;
      return { hint, requested };
    },
    started(time, duration) {
      readyAt = time + duration + WINTER_CALL_COOLDOWN;
      jumps.length = 0;
    },
  };
}
