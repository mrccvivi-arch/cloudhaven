import { Vector3 } from "three";
import { acquaintanceDays } from "./beijing-time.js";
import { MOON_LINES } from "./moon-lines.js";
import { affectionLevel, LEVELS } from "./affection.js";

const scenePriority = {
  "spring-entry": 3, "ginkgo-entry": 3,
  "spring-environment": 2, "spring-settled": 2,
  "spring-touch": 1, "ginkgo-touch": 1,
};

export function createCompanionBubble(element) {
  const speech = element.querySelector("span");
  const hint = element.querySelector("small");
  const anchor = new Vector3();
  let expires = 0;
  let kind;

  function canSee(avatar, camera) {
    if (!avatar.visible) return false;
    camera.updateMatrixWorld();
    anchor.copy(avatar.position);
    anchor.y += 1.92;
    anchor.project(camera);
    return anchor.z >= -1 && anchor.z <= 1 && Math.abs(anchor.x) <= 1 && Math.abs(anchor.y) <= 1;
  }

  function canPresent(time, source) {
    const active = scenePriority[kind] ?? 0;
    const next = scenePriority[source] ?? 0;
    return time >= expires || next > active || (next <= 1 && active === next);
  }

  return {
    canSee, canPresent,
    isActive(time, source) { return time < expires && (source === undefined || source === kind); },
    show(text, time, duration = 3650, source = "touch") {
      if (!canPresent(time, source)) return;
      speech.textContent = text;
      hint.hidden = source !== "introduction";
      element.classList.toggle("introducing", source === "introduction");
      expires = time + duration;
      kind = source;
    },
    dismiss(source) {
      if (kind !== source) return;
      expires = 0;
      kind = undefined;
      element.classList.remove("introducing");
    },
    update(avatar, camera, time, suppressed) {
      if (time >= expires || suppressed) {
        element.hidden = true;
        return;
      }
      const anchored = canSee(avatar, camera);
      element.hidden = !anchored && (!scenePriority[kind] || !avatar.visible);
      if (element.hidden) return;
      if (!anchored) anchor.set(0, .32, 0);
      const x = Math.max(35, Math.min(65, (anchor.x + 1) * 50));
      element.style.left = x.toFixed(2) + "%";
      element.style.top = Math.max(34, Math.min(68, (1 - anchor.y) * 50)).toFixed(2) + "%";
    },
  };
}

const panelLines = ["A60", "B3", "C28", "D29", "E11", "E30"].map((id) => MOON_LINES.find((line) => line.id === id));

export function relationshipDetails(state, now = Date.now()) {
  const points = state.affectionPoints;
  const level = affectionLevel(points);
  const current = LEVELS[level - 1];
  const next = LEVELS[level];
  return {
    level, points, current, next, progress: next ? points - current.minimum : undefined,
    span: next ? next.minimum - current.minimum : undefined,
    days: acquaintanceDays(state.firstMetDate, now),
    text: panelLines[level - 1].text,
  };
}

export function renderAffection(element, state) {
  const { level, points, current, next, progress, span, days, text } = relationshipDetails(state);
  element.querySelector("#affection-rank").textContent = `Lv.${level} · ${current.name}`;
  element.querySelector("#affection-points").textContent = next ? `亲密度：${points} / ${next.minimum}` : `亲密度：${points}`;
  const bar = element.querySelector("#affection-progress");
  bar.hidden = !next;
  if (next) {
    bar.max = span;
    bar.value = progress;
  }
  const following = element.querySelector("#affection-next");
  following.hidden = !next;
  following.textContent = next ? `下一阶段：${next.name}` : "";
  const elapsed = element.querySelector("#affection-days");
  elapsed.hidden = days === undefined;
  elapsed.textContent = days === undefined ? "" : `相识的第${days}天`;
  element.querySelector("#affection-line").textContent = `“${text}”`;
}
