import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const account = process.env.DIARY_ACCOUNT || "insomniavi.bsky.social";
const api = "https://public.api.bsky.app/xrpc/";
const run = promisify(execFile);
const exists = (path) => access(path).then(() => true, () => false);

async function request(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: "error" });
      if (![408, 429].includes(response.status) && response.status < 500) return response;
      if (attempt === 3) return response;
      const retry = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      if (retry > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(30000, retry * 1000)));
        continue;
      }
    } catch (error) {
      if (attempt === 3) throw new Error(`Request failed: ${url}`, { cause: error });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

async function json(method, params, base = api) {
  const url = base + method + "?" + new URLSearchParams(params);
  const response = await request(url);
  if (!response.ok) throw Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

export function original(item, did) {
  const { post, reason, reply } = item;
  const record = post?.record;
  if (reason || reply || record?.reply || post?.author?.did !== did ||
      !post.uri?.startsWith(`at://${did}/app.bsky.feed.post/`) ||
      record?.$type !== "app.bsky.feed.post") return;
  const embed = record.embed;
  const types = [embed?.$type, post.embed?.$type];
  if (types.some((type) => type?.startsWith("app.bsky.embed.record"))) return;
  if (typeof record.text !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
    throw Error(`Invalid post: ${post.uri}`);
  }
  const images = post.embed?.images ?? [];
  if (embed?.$type === "app.bsky.embed.images" &&
      (!Array.isArray(embed.images) || images.length !== embed.images.length)) {
    throw Error(`Incomplete images: ${post.uri}`);
  }
  return { uri: post.uri, createdAt: record.createdAt, text: record.text, images: images.map((image, index) => {
    const url = new URL(image.fullsize);
    if (url.origin !== "https://cdn.bsky.app") throw Error("Unexpected Bluesky image host");
    const cid = embed?.images?.[index]?.image?.ref?.$link;
    const hash = createHash("sha256").update(cid || url.href).digest("hex");
    return { file: `${hash}.webp`, alt: embed?.images?.[index]?.alt ?? image.alt ?? "", url: url.href };
  }) };
}

async function recordDeleted(uri, did) {
  if (!/^did:plc:[a-z0-9]+$/.test(did)) return false;
  const identity = await request(`https://plc.directory/${did}`);
  if (!identity.ok) throw Error(`DID directory returned ${identity.status}`);
  const doc = await identity.json();
  if (doc.id !== did) throw Error("DID document identity mismatch");
  const endpoint = doc.service?.find((entry) => entry.id === "#atproto_pds" || entry.id === `${did}#atproto_pds`)?.serviceEndpoint;
  if (!/^https:\/\/[a-z0-9.-]+\.host\.bsky\.network$/i.test(endpoint ?? "")) return false;
  const params = new URLSearchParams({ repo: did, collection: "app.bsky.feed.post", rkey: uri.split("/").at(-1) });
  const response = await request(`${endpoint}/xrpc/com.atproto.repo.getRecord?${params}`);
  if (![400, 404].includes(response.status)) {
    if (!response.ok) throw Error(`PDS returned ${response.status} for ${uri}`);
    const { uri: returnedUri, value } = await response.json();
    if (returnedUri !== uri || !value) throw Error(`Invalid PDS record for ${uri}`);
    return Boolean(value.reply || value.embed?.$type?.startsWith("app.bsky.embed.record"));
  }
  return (await response.json()).error === "RecordNotFound";
}

export async function sync({ directory = "public", handle = account, full = false, fetchJson = json,
  deleted = recordDeleted, download = request } = {}) {
  const manifest = join(directory, "diary.json"), media = join(directory, "diary-media");
  const prior = await exists(manifest) ? JSON.parse(await readFile(manifest, "utf8")) : { entries: [] };
  const sameAccount = prior.handle === handle;
  const did = (sameAccount && prior.did) || (await fetchJson("app.bsky.actor.getProfile", { actor: handle })).did;
  if (!/^did:(plc|web):[a-zA-Z0-9.:%_-]+$/.test(did ?? "")) throw Error("Could not resolve account DID");
  const old = new Map((sameAccount ? prior.entries : []).map((entry) => [entry.uri, entry]));
  const entries = new Map(old);
  const observed = new Set(), cursors = new Set();
  const historical = full || !old.size;
  let cursor, pages = 0;
  do {
    const page = await fetchJson("app.bsky.feed.getAuthorFeed", {
      actor: did, filter: "posts_no_replies", limit: "100", ...(cursor ? { cursor } : {}),
    });
    if (!Array.isArray(page.feed) || (page.cursor && typeof page.cursor !== "string")) throw Error("Invalid feed page");
    let overlap = false;
    for (const item of page.feed) {
      if (!item?.post?.uri) throw Error("Invalid feed item");
      if (item.post.author?.did === did && !item.reason) observed.add(item.post.uri);
      const entry = original(item, did);
      const record = item.post.record;
      if (!entry && item.post.author?.did === did && !item.reason &&
          record?.$type === "app.bsky.feed.post" &&
          (record.reply || record.embed?.$type?.startsWith("app.bsky.embed.record"))) entries.delete(item.post.uri);
      if (!entry) continue;
      overlap ||= old.has(entry.uri);
      entries.set(entry.uri, entry);
    }
    cursor = page.cursor;
    if (cursor && (!page.feed.length || cursors.has(cursor))) throw Error("Incomplete or looping pagination");
    cursors.add(cursor);
    if (!historical && ++pages >= 2 && overlap) break;
  } while (cursor);

  if (historical && !cursor) {
    for (const uri of old.keys()) {
      if (!observed.has(uri) && await deleted(uri, did)) entries.delete(uri);
    }
  }

  await mkdir(media, { recursive: true });
  const staging = await mkdtemp(join(directory, ".diary-"));
  const newFiles = new Set();
  try {
    const ordered = [...entries.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0));
    for (const entry of ordered) for (const image of entry.images) {
      if (newFiles.has(image.file) || await exists(join(media, image.file))) continue;
      if (!image.url) throw Error(`Missing cached image: ${image.file}`);
      const response = await download(image.url);
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw Error(`Image download failed: ${image.url}`);
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 16 * 1024 * 1024) throw Error("Image exceeds input limit");
      const input = join(staging, "source");
      await writeFile(input, data);
      await run("convert", ["-limit", "memory", "128MiB", input + "[0]", "-auto-orient", "-resize", "1600x1600>", "-strip",
        "-quality", "83", join(staging, image.file)], { timeout: 30000 });
      newFiles.add(image.file);
    }
    const snapshot = { handle, did, entries: ordered.map(({ images, ...entry }) => ({
      ...entry, images: images.map(({ file, alt }) => ({ file, alt })),
    })) };
    const content = JSON.stringify(snapshot, null, 2) + "\n";
    const oldContent = await exists(manifest) ? await readFile(manifest, "utf8") : "";
    for (const file of newFiles) await rename(join(staging, file), join(media, file));
    if (content !== oldContent) {
      await writeFile(join(staging, "diary.json"), content);
      await rename(join(staging, "diary.json"), manifest);
    }
    const used = new Set(snapshot.entries.flatMap(({ images }) => images.map(({ file }) => file)));
    for (const file of await readdir(media)) if (/^[a-f0-9]{64}\.webp$/.test(file) && !used.has(file)) await rm(join(media, file));
    console.log(`Diary: ${ordered.length} posts for ${handle} (${did})`);
    return snapshot;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await sync({ full: process.argv.includes("--full") });
}
