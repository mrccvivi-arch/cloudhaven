import { Box3, Vector3 } from "three";
import { createObjectTutorial } from "./object-touch.js";

export function createFeatherPrompt(element, feather, moon, speech, camera, occludes, layer) {
  const button = element.querySelector("button");
  const screen = element.parentElement;
  const box = new Box3(), point = new Vector3();
  const gap = 12;

  function projectBounds(width, height) {
    const rect = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          point.set(x, y, z).project(camera);
          if (point.z < -1 || point.z > 1) continue;
          rect.left = Math.min(rect.left, (point.x + 1) * width / 2);
          rect.right = Math.max(rect.right, (point.x + 1) * width / 2);
          rect.top = Math.min(rect.top, (1 - point.y) * height / 2);
          rect.bottom = Math.max(rect.bottom, (1 - point.y) * height / 2);
        }
      }
    }
    return rect;
  }

  const place = projection => {
    const view = screen.getBoundingClientRect();
    const { width, height } = view;
    feather.bounds(box);
    const body = projectBounds(width, height);
    box.setFromObject(moon);
    const avatar = projectBounds(width, height);
    const obstacles = [body, avatar].filter(rect => Number.isFinite(rect.left));
    if (!speech.hidden) {
      const bubble = speech.getBoundingClientRect();
      obstacles.push({
        left: bubble.left - view.left, right: bubble.right - view.left,
        top: bubble.top - view.top, bottom: bubble.bottom - view.top,
      });
    }
    const halfWidth = element.offsetWidth / 2, halfHeight = element.offsetHeight / 2;
    const midX = (projection.x + 1) * width / 2, midY = (1 - projection.y) * height / 2;
    const offset = gap + 2;
    const right = [body.right + offset + halfWidth, midY];
    const left = [body.left - offset - halfWidth, midY];
    const sides = midX >= (avatar.left + avatar.right) / 2 ? [right, left] : [left, right];
    const below = body.bottom + offset + halfHeight, above = body.top - offset - halfHeight;
    const candidates = [
      ...sides, [midX, below], [midX, above],
      ...sides.flatMap(([x]) => [[x, below], [x, above]]),
      [Math.max(...obstacles.map(rect => rect.right)) + offset + halfWidth, midY],
      [Math.min(...obstacles.map(rect => rect.left)) - offset - halfWidth, midY],
      [midX, Math.max(...obstacles.map(rect => rect.bottom)) + offset + halfHeight],
      [midX, Math.min(...obstacles.map(rect => rect.top)) - offset - halfHeight],
    ];
    const margin = 16;
    for (const [cx, cy] of candidates) {
      const x = Math.max(margin + halfWidth, Math.min(width - margin - halfWidth, cx));
      const y = Math.max(margin + halfHeight, Math.min(height - margin - halfHeight, cy));
      const overlaps = obstacles.some(rect =>
        x + halfWidth > rect.left - gap && x - halfWidth < rect.right + gap &&
        y + halfHeight > rect.top - gap && y - halfHeight < rect.bottom + gap);
      if (overlaps) continue;
      const left = x.toFixed(1) + "px", top = y.toFixed(1) + "px";
      if (element.style.left !== left) element.style.left = left;
      if (element.style.top !== top) element.style.top = top;
      return true;
    }
    return false;
  };

  const tutorial = createObjectTutorial(element, camera, occludes, 0, place);
  return (eligible, time) => {
    const visible = tutorial(eligible, feather.anchor, feather.target, layer, time);
    if (button.disabled !== !visible) button.disabled = !visible;
  };
}
