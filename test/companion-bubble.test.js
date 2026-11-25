import assert from "node:assert/strict";
import test from "node:test";
import { Object3D, PerspectiveCamera } from "three";
import { createCompanionBubble } from "../src/companion-ui.js";

test("scene welcomes replace ordinary speech and remain visible even off-camera", () => {
  const speech = { textContent: "" };
  const hint = {};
  const element = {
    classList: { toggle() {}, remove() {} },
    style: {},
    querySelector: (tag) => tag === "span" ? speech : hint,
  };
  const bubble = createCompanionBubble(element);
  const avatar = new Object3D(), camera = new PerspectiveCamera();
  avatar.position.set(20, 0, -10);
  assert.equal(bubble.canSee(avatar, camera), false);
  bubble.show("ordinary", 1, 5000, "ambient");
  bubble.update(avatar, camera, 2, false);
  assert.equal(element.hidden, true);
  bubble.show("你来啦。", 3, 4000, "ginkgo-entry");
  bubble.show("touch", 4, 4000, "ginkgo-touch");
  bubble.show("wind", 4, 4000, "spring-environment");
  bubble.show("ordinary", 5, 5000, "ambient");
  bubble.update(avatar, camera, 6, false);
  assert.equal(speech.textContent, "你来啦。");
  assert.equal(element.hidden, false);
  assert.equal(element.style.left, "50.00%");
  bubble.show("wind", 4100, 4000, "spring-environment");
  assert.equal(bubble.canPresent(4400, "spring-environment"), false);
  assert.equal(speech.textContent, "wind");
});
