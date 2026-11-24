import { Vector3 } from "three";
import { MATERIALS } from "./materials.js";

const nearbyLines = {
  stone: ["咦，那里有块石头。", "试着捡起来看看？"],
  stardust: ["星星也会掉在地上哦。"],
  other: ["这些小东西以后可能会派上用场。", "我们可以用捡来的东西造点什么。"],
};

export function createGatheringDialogue(state) {
  const firstLine = "我们好像可以慢慢建造自己的森林了。";
  // Existing inventory and collection history already identify saves that have gathered.
  let gathered = Object.values(state.materials).some(Boolean) || Object.values(state.storedMaterials).some(Boolean) ||
    Object.keys(state.gathering.collected).length > 0;
  let firstPendingUntil = 0;
  let nearbySince;
  let nearbyKey;
  let nextAt = 25_000;
  let lastLine;
  let lastSpokenAt = -Infinity;

  return {
    collected(time) {
      if (gathered) return;
      gathered = true;
      firstPendingUntil = time + 20_000;
    },
    update(time, slot, canSpeak) {
      if (nearbyKey !== slot?.key) {
        nearbyKey = slot?.key;
        nearbySince = slot && time;
      }
      if (time >= firstPendingUntil) firstPendingUntil = 0;
      if (!firstPendingUntil && (!slot || time < nextAt || time - nearbySince < 2500)) return;
      if (time - lastSpokenAt < 8500 || !canSpeak()) return;
      const pool = firstPendingUntil ? [firstLine] : nearbyLines[slot.id] ?? nearbyLines.other;
      const otherLines = pool.filter((line) => line !== lastLine);
      if (!otherLines.length) return;
      lastSpokenAt = time;
      lastLine = otherLines[Math.floor(Math.random() * otherLines.length)];
      firstPendingUntil = 0;
      nextAt = time + 90_000;
      return lastLine;
    },
  };
}

export function createMaterialPrompt(element, speech, facility) {
  const name = element.querySelector("strong");
  const anchor = new Vector3();
  let current;
  let shown = false;

  function show(visible) {
    if (shown === visible) return;
    shown = visible;
    element.classList.toggle("visible", visible);
  }
  return {
    hide() { show(false); },
    collected(slot) {
      if (slot !== current) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      element.classList.add("immediate");
      show(false);
      current = undefined;
    },
    update(slot, camera) {
      if (!slot) { show(false); return; }
      camera.updateMatrixWorld();
      anchor.set(slot.x, slot.y + (slot.id === "stardust" ? 1.11 : .82), slot.z).project(camera);
      if (anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x) > .93 || Math.abs(anchor.y) > .90) {
        show(false);
        return;
      }
      if (current !== slot) {
        current = slot;
        name.textContent = MATERIALS[slot.id].name;
      }
      element.classList.remove("immediate");
      element.style.left = ((anchor.x + 1) * 50).toFixed(2) + "%";
      element.style.top = ((1 - anchor.y) * 50).toFixed(2) + "%";

      const overlaps = (other, rectangle) => {
        const box = other.getBoundingClientRect();
        return rectangle.left < box.right + 6 && rectangle.right > box.left - 6 &&
          rectangle.top < box.bottom + 6 && rectangle.bottom > box.top - 6;
      };
      if (!speech.hidden || !facility.hidden) {
        const box = element.getBoundingClientRect();
        if ((!speech.hidden && overlaps(speech, box)) || (!facility.hidden && overlaps(facility, box))) {
          show(false);
          return;
        }
      }
      show(true);
    },
  };
}
