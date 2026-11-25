import { Scene } from "three";
import { createWorld } from "../src/world.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { original, sync } from "../scripts/sync-bluesky.mjs";
import { diaryDate, readDiary } from "../src/diary.js";
import { DIARY_ENTRY_LIMIT } from "../src/diary-config.js";

const did = "did:plc:sample";
const uri = (id) => `at://${did}/app.bsky.feed.post/${id}`;
const post = (id, text = "中文 English 🌙\n\n第二段") => ({ post: {
  author: { did }, uri: uri(id), record: {
    $type: "app.bsky.feed.post", text, createdAt: `2026-11-24T${id.padStart(2, "0")}:00:00Z`,
  },
} });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACAQMAAACnuvRZAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf//8P///w0f5ToAAAABYktHRAH/Ai3eAAAAB3RJTUUH6gsYCBMKFl8lEQAAAAxJREFUCNdjYGBgAAAABAABJzQnCgAAACV0RVh0ZGF0ZTpjcmVhdGUAMjAyNi0xMS0yNFQwODoxOToxMCswMDowMGfXfNUAAAAldEVYdGRhdGU6bW9kaWZ5ADIwMjYtMTEtMjRUMDg6MTk6MTArMDA6MDAWisRpAAAAKHRFWHRkYXRlOnRpbWVzdGFtcAAyMDI2LTExLTI0VDA4OjE5OjEwKzAwOjAwQZ/ltgAAAABJRU5ErkJggg==", "base64");
const withImages = (entry, ...ids) => {
  entry.post.record.embed = { $type: "app.bsky.embed.images", images: ids.map((id) => ({ image: { ref: { $link: id } }, alt: `图片 ${id}` })) };
  entry.post.embed = { images: ids.map((id) => ({ fullsize: `https://cdn.bsky.app/${id}` })) };
  return entry;
};

test("only independent original posts authored by the requested DID are eligible", () => {
  const first = post("16");
  assert.equal(original(first, did).text, "中文 English 🌙\n\n第二段");
  assert.equal(original({ ...first, reason: {} }, did), undefined);
  assert.equal(original({ ...first, reply: {} }, did), undefined);
  assert.equal(original(first, "did:plc:other"), undefined);
  first.post.record.embed = { $type: "app.bsky.embed.recordWithMedia" };
  assert.equal(original(first, did), undefined);
  first.post.record.embed = { $type: "app.bsky.embed.video" };
  assert.deepEqual(original(first, did).images, []);
  assert.equal(diaryDate("2026-11-24T15:59:59Z"), "2026年11月24日");
  assert.equal(diaryDate("2026-11-24T16:00:00Z"), "2026年11月25日");
});

test("snapshot paginates, deduplicates media and posts, retains on failure, and confirms deletions", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cloudhaven-diary-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const single = withImages(post("15"), "a");
  const multiple = withImages(post("16"), "a", "b");
  let pages = [{ feed: [multiple], cursor: "second" }, { feed: [single, multiple, post("14")] }];
  let resolveCount = 0, downloads = 0;
  let fail = false, missing = false;
  const options = { directory, full: true, fetchJson: async (method, params) => {
    if (method.endsWith("getProfile")) { resolveCount++; return { did }; }
    assert.equal(params.actor, did);
    if (fail) throw Error("API unavailable");
    return pages[params.cursor ? 1 : 0];
  }, deleted: async (uri) => missing && uri.endsWith("/16"), download: async () => {
    downloads++;
    return new Response(png, { headers: { "content-type": "image/png" } });
  } };
  const first = await sync(options);
  assert.deepEqual(readDiary(first).map(({ uri }) => uri), ["16", "15", "14"].map(uri));
  assert.equal(first.entries[0].images[1].alt, "图片 b");
  assert.equal(downloads, 2);
  const file = join(directory, "diary.json");
  const content = await readFile(file, "utf8");
  await sync(options);
  assert.equal(resolveCount, 1);
  assert.equal(downloads, 2);
  assert.equal(await readFile(file, "utf8"), content);
  fail = true;
  await assert.rejects(sync(options), /API unavailable/);
  assert.equal(await readFile(file, "utf8"), content);
  fail = false;
  pages = [{ feed: [single], cursor: "second" }, { feed: [], cursor: "second" }];
  await assert.rejects(sync(options), /pagination/);
  assert.equal(await readFile(file, "utf8"), content);
  const changed = withImages(post("15", "修改后"), "a");
  pages = [{ feed: [changed, post("14")] }];
  assert.equal((await sync(options)).entries.length, 3);
  missing = true;
  const confirmed = await sync(options);
  assert.equal(confirmed.entries.length, 2);
  assert.equal(confirmed.entries[0].text, "修改后");
  assert.equal((await readdir(join(directory, "diary-media"))).length, 1);
  pages = [{ feed: [withImages(post("17"), "broken")] }];
  await assert.rejects(sync({ ...options, download: async () => new Response(null, { status: 503 }) }), /Image download/);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), confirmed);
});

test("incremental sync adds new posts and checks for deletions even when it stops before the end of the feed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cloudhaven-diary-empty-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let pages = [{ feed: [] }];
  const checked = [];
  const options = { directory, fetchJson: async (method, { cursor }) => {
    if (method.endsWith("getProfile")) return { did };
    assert.notEqual(cursor, "unscanned");
    return pages[cursor ? 1 : 0];
  }, deleted: async (url) => { checked.push(url); return true; } };
  assert.deepEqual(readDiary(await sync(options)), []);
  pages = [{ feed: [post("16", "待删除"), post("14", "旧文字"), post("12")] }];
  await sync(options);
  pages = [
    { feed: [post("17"), post("14", "更新后的文字"), post("13")], cursor: "second" },
    { feed: [post("12"), post("11")], cursor: "unscanned" },
  ];
  const snapshot = await sync(options);
  assert.deepEqual(checked, [uri("16")]);
  assert.deepEqual(snapshot.entries.map((entry) => entry.uri), ["17", "14", "13", "12", "11"].map(uri));
  assert.equal(snapshot.entries[1].text, "更新后的文字");
});

test("a sync batch keeps only the most recent originals and preserves all thumbnail metadata", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "cloudhaven-diary-window-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const latest = withImages(post("22"), "first", "second");
  for (const image of latest.post.embed.images) {
    image.thumb = image.fullsize + "-thumb";
    image.aspectRatio = { width: 800, height: 600 };
  }
  const initial = ["14", "13", "12", "11", "10", "09"].map((id) => post(id));
  let feed = initial;
  const options = { directory, fetchJson: async (method) => method.endsWith("getProfile") ? { did } : { feed },
    download: async () => { throw Error("Images with Bluesky thumbnails require no local download"); } };
  const first = await sync(options);
  assert.equal(first.entries.length, DIARY_ENTRY_LIMIT);
  feed = [post("15"), latest, { ...post("23"), reason: {} }, post("20"), ...initial];
  const updated = await sync(options);
  assert.deepEqual(updated.entries.map((entry) => entry.uri), ["22", "20", "15", "14", "13"].map(uri));
  assert.deepEqual(updated.entries[0].images.map(({ thumbnail, fullsize, aspectRatio }) =>
    [thumbnail, fullsize, aspectRatio]), ["first", "second"].map((id) => [
    `https://cdn.bsky.app/${id}-thumb`, `https://cdn.bsky.app/${id}`, { width: 800, height: 600 },
  ]));
  assert.deepEqual(readDiary({ did, entries: [...updated.entries].reverse().concat(first.entries.slice(2)) }), updated.entries);
});

test("the unread star breathes and stays outside the board interaction object", () => {
  const scene = new Scene();
  const world = createWorld(scene);
  const star = scene.getObjectByName("Unread diary star");
  assert.equal(star.visible, false);
  assert.equal(star.parent, world.ground);
  world.updateDiaryStar(true, 0);
  const opacity = star.material.opacity;
  assert.equal(star.visible, true);
  world.updateDiaryStar(true, 1000);
  assert.notEqual(star.material.opacity, opacity);
  world.updateDiaryStar(false, 2000);
  assert.equal(star.visible, false);
});
