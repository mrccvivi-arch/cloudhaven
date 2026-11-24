import assert from "node:assert/strict";
import test from "node:test";
import { Raycaster, Scene, Vector3 } from "three";
import { createDiaryHeart } from "../src/world.js";
import { readNews, newsUpdateLabel, newsDateLabel, newsHeadlines } from "../src/daily-world.js";
import { DAILY_WORLD, availableSpot, canReadDailyWorld } from "../src/map.js";

test("the diary is within tapping range on the ground without a generic interaction prompt", () => {
  const near = { ...DAILY_WORLD, x: DAILY_WORLD.x - 1 };
  assert.equal(canReadDailyWorld(near), true);
  assert.equal(availableSpot(near), undefined);
  assert.equal(canReadDailyWorld({ ...near, layer: "sky" }), false);
  assert.equal(canReadDailyWorld({ ...near, x: near.x - 5 }), false);
});

test("the heart eases in and out of proximity and opens once after the press animation", () => {
  const heart = createDiaryHeart(new Scene());
  const cloud = heart.board.getObjectByName("Diary heart");
  assert.equal(heart.update(0, 1, true, true), false);
  assert.equal(cloud.scale.x, 1.05);
  assert.equal(cloud.material.uniforms.glow.value, 1);

  heart.press(10);
  assert.equal(heart.update(60, .05, true, true), false);
  assert.ok(cloud.scale.x < 1.05);
  heart.press(100);
  assert.equal(heart.update(160, .1, true, true), false);
  assert.ok(cloud.scale.x > 1.05);
  assert.equal(heart.update(210, .05, true, true), true);
  assert.equal(heart.update(211, .001, true, true), false);

  heart.press(212);
  assert.equal(heart.update(225, .013, false, false), false);
  assert.ok(cloud.scale.x > 1 && cloud.scale.x < 1.05);
  assert.equal(heart.update(450, 1, false, false), false);
  assert.equal(cloud.scale.x, 1);
  assert.equal(cloud.material.uniforms.glow.value, 0);
});

test("the diary hand points inward and makes two small taps per approach", () => {
  const heart = createDiaryHeart(new Scene());
  const gesture = heart.board.getObjectByName("Diary tap gesture");
  const rest = gesture.position.clone();
  assert.ok(rest.x > 0 && rest.y < 1.63 && rest.z > 0);
  assert.equal(gesture.visible, true);
  assert.ok(Math.abs(gesture.rotation.z - 35 * Math.PI / 180) < .001);

  for (const [time, near, moving] of [
    [0, false, false], [50, true, false], [195, true, true], [340, true, false],
    [485, true, true], [630, true, false], [1200, true, false], [1300, false, false],
    [1500, true, false], [1645, true, true],
  ]) {
    assert.equal(heart.update(time, .016, near, near), false);
    if (moving) {
      assert.ok(gesture.position.x < rest.x && gesture.position.y > rest.y);
      assert.ok(gesture.position.distanceTo(rest) < .05);
    } else {
      assert.ok(gesture.position.equals(rest));
    }
  }

  heart.board.updateMatrixWorld(true);
  const origin = gesture.getWorldPosition(new Vector3()).add(new Vector3(0, 0, 4));
  const hit = heart.hit(new Raycaster(origin, new Vector3(0, 0, -1)));
  assert.equal(hit?.object.name, "Diary heart");
});

test("a tap just beyond the heart geometry still hits its enlarged touch area", () => {
  const heart = createDiaryHeart(new Scene());
  heart.update(0, 0, false, false);
  const { x, y, z } = heart.board.position;
  const ray = new Raycaster(new Vector3(x + 1.22, y + 1.94, z + 5), new Vector3(0, 0, -1));
  assert.ok(heart.hit(ray));
  ray.ray.origin.x = x + 1.5;
  assert.equal(heart.hit(ray), undefined);
});

test("the displayed update uses the actual Beijing date and time across midnight", () => {
  const updatedAt = Date.parse("2026-11-24T15:58:01Z");
  assert.equal(newsUpdateLabel(updatedAt, Date.parse("2026-11-24T15:59:59Z")), "北京时间 2026-11-24 23:58 更新");
  assert.equal(newsUpdateLabel(updatedAt, Date.parse("2026-11-24T16:00:00Z")), "上次更新 · 北京时间 2026-11-24 23:58 更新");
});

test("invalid or empty snapshots are unavailable and unsafe links are discarded", () => {
  const updatedAt = "2026-11-24T07:17:00+08:00";
  const story = { titleEn: "Example science headline", titleZh: "科学新闻", source: "来源", url: "https://example.org/article" };
  assert.equal(readNews({ updatedAt, items: [] }), undefined);
  assert.equal(readNews({ updatedAt, items: [{ ...story, titleEn: undefined, title: "旧版标题" }] }), undefined);
  assert.equal(readNews({ updatedAt: "invalid", items: [story] }), undefined);
  const result = readNews({ updatedAt, items: [null, { ...story, url: "javascript:alert(1)" }, story] });
  assert.deepEqual(result.items, [story]);
});


test("the issue date is in Beijing and editions never mix headline languages", () => {
  assert.match(newsDateLabel(Date.parse("2026-11-24T16:00:00Z")), /25日.*星期三/);
  const items = Array.from({ length: 6 }, (_, index) => ({
    titleEn: `English headline ${index}`, titleZh: index === 1 ? "中文标题" : undefined,
    source: "Publisher", category: "科学", url: `https://example.org/${index}`,
  }));
  const issue = readNews({ updatedAt: "2026-11-25T07:00:00+08:00", items });
  assert.deepEqual(newsHeadlines(issue, false).map(({ title }) => title), ["中文标题"]);
  assert.deepEqual(newsHeadlines(issue, true).map(({ title }) => title), items.slice(0, 4).map(({ titleEn }) => titleEn));
});
