import { canReturnFromTower, onTowerGallery } from "./summer-layout.js";

export function createTowerReturn() {
  let stalled = 0, remaining = 0;
  function reset() { stalled = remaining = 0; }
  return {
    reset,
    available(player) {
      return onTowerGallery(player) || (remaining > 0 && canReturnFromTower(player));
    },
    update(player, elapsed, input, distance) {
      if (!canReturnFromTower(player) || onTowerGallery(player) || !player.grounded ||
          distance > .16 * elapsed) {
        reset();
        return;
      }
      // Keep an earned recovery window open long enough to release the joystick and tap.
      remaining = Math.max(0, remaining - elapsed);
      stalled = input >= .35 ? stalled + elapsed : 0;
      if (stalled >= 1.8) remaining = 5;
    },
  };
}
