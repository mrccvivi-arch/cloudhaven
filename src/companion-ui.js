import { Vector3 } from "three";
import { affectionLevel, LEVELS } from "./affection.js";

export function createCompanionBubble(element, onNext) {
  const speech = element.querySelector("p");
  const next = element.querySelector("button");
  const line = next.querySelector("span");
  const anchor = new Vector3();
  let expires = 0;
  let active = false;
  next.addEventListener("click", onNext);

  return {
    show(text, intro, time) {
      active = Boolean(text);
      if (!active) {
        next.blur();
        element.hidden = true;
        return;
      }
      next.hidden = !intro;
      speech.hidden = intro;
      if (intro) {
        line.textContent = text;
        next.setAttribute("aria-label", text + " 继续对话");
      } else {
        speech.textContent = text;
      }
      expires = intro ? Infinity : time + 3650;
    },
    update(avatar, camera, time, suppressed) {
      if (!active || time >= expires || suppressed || !avatar.visible) {
        element.hidden = true;
        return;
      }
      camera.updateMatrixWorld();
      anchor.copy(avatar.position);
      anchor.y += 1.92;
      anchor.project(camera);
      element.hidden = anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x) > 1 || Math.abs(anchor.y) > 1;
      if (element.hidden) return;
      const x = Math.max(35, Math.min(65, (anchor.x + 1) * 50));
      element.style.left = x.toFixed(2) + "%";
      element.style.top = Math.max(34, (1 - anchor.y) * 50).toFixed(2) + "%";
    },
  };
}

export function renderAffection(element, state) {
  const level = affectionLevel(state.affectionPoints);
  const current = LEVELS[level - 1];
  const next = LEVELS[level];
  element.querySelector("#affection-rank").textContent = `Lv.${level} · ${current.name}`;
  element.querySelector("#affection-points").textContent = `累计好感度 ${state.affectionPoints}`;
  const bar = element.querySelector("#affection-progress");
  bar.hidden = !next;
  if (next) {
    bar.max = next.minimum - current.minimum;
    bar.value = state.affectionPoints - current.minimum;
  }
  element.querySelector("#affection-next").textContent = next
    ? `距离「${next.name}」还差 ${next.minimum - state.affectionPoints}`
    : "月光羁绊";
}
