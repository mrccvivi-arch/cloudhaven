import assert from "node:assert/strict";
import test from "node:test";
import { readNews, newsUpdateLabel } from "../src/daily-world.js";
import { DAILY_WORLD, availableSpot, canReadDailyWorld } from "../src/map.js";

test("the home notice board is available nearby on the ground only", () => {
  const near = { ...DAILY_WORLD, x: DAILY_WORLD.x - 1 };
  assert.equal(canReadDailyWorld(near), true);
  assert.equal(availableSpot(near, []), DAILY_WORLD);
  assert.equal(canReadDailyWorld({ ...near, layer: "sky" }), false);
  assert.equal(canReadDailyWorld({ ...near, x: near.x - 5 }), false);
});

test("the displayed update uses the actual Beijing date and time across midnight", () => {
  const updatedAt = Date.parse("2026-11-24T15:58:01Z");
  assert.equal(newsUpdateLabel(updatedAt, Date.parse("2026-11-24T15:59:59Z")), "北京时间 2026-11-24 23:58 更新");
  assert.equal(newsUpdateLabel(updatedAt, Date.parse("2026-11-24T16:00:00Z")), "上次更新 · 北京时间 2026-11-24 23:58 更新");
});

test("invalid or empty snapshots are unavailable and unsafe links are discarded", () => {
  const updatedAt = "2026-11-24T07:17:00+08:00";
  const story = { title: "标题", category: "科学与自然", source: "来源", url: "https://example.org/article" };
  assert.equal(readNews({ updatedAt, items: [] }), undefined);
  assert.equal(readNews({ updatedAt: "invalid", items: [story] }), undefined);
  const result = readNews({ updatedAt, items: [null, { ...story, url: "javascript:alert(1)" }, story] });
  assert.deepEqual(result.items, [story]);
});
