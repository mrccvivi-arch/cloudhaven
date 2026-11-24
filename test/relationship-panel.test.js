import assert from "node:assert/strict";
import test from "node:test";
import { relationshipDetails } from "../src/companion-ui.js";
import { readSave } from "../src/save.js";

test("relationship display calculates progress between thresholds and uses reliable Beijing dates", () => {
  const { affection } = readSave({ affection: { affectionPoints: 72, firstMetDate: "2026-11-21" } });
  const before = Date.parse("2026-11-25T15:59:59Z");
  const result = relationshipDetails(affection, before);
  assert.equal(result.level, 3);
  assert.equal(result.current.name, "开始亲近");
  assert.equal(result.next.name, "悄悄信任");
  assert.equal(result.next.minimum, 96);
  assert.equal(result.progress / result.span, .5);
  assert.equal(result.days, 5);
  assert.equal(relationshipDetails(affection, before + 1000).days, 6);
  assert.equal(result.text, "我没有很多故事，不过我们可以慢慢积累。");
});

test("an old maximum-level save preserves points with no next level or invented acquaintance date", () => {
  const { affection } = readSave({ affection: { affectionPoints: 2501, lastTouchDate: "2026-11-24" } });
  const result = relationshipDetails(affection, Date.parse("2026-11-25T15:59:59Z"));
  assert.equal(result.level, 6);
  assert.equal(result.points, 2501);
  assert.equal(result.current.name, "月光羁绊");
  assert.equal(result.next, undefined);
  assert.equal(result.days, undefined);
});
