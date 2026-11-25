import { latestDiaryEntries } from "./diary-config.js";

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric",
});
const readKey = "cloudhaven-diary-read";
const OPEN_CHECK_INTERVAL = 30_000;
const BACKGROUND_CHECK_INTERVAL = 5 * 60_000;
const REQUEST_TIMEOUT = 12_000;
const base = () => import.meta.env?.BASE_URL ?? "./";
const isLocalImage = (file) => /^[a-f0-9]{64}\.webp$/.test(file);
const localImage = (file) => isLocalImage(file) && `${base()}diary-media/${file}`;
function isBlueskyImage(url) {
  try { return typeof url === "string" && new URL(url).origin === "https://cdn.bsky.app"; }
  catch { return false; }
}

export function diaryDate(date) { return dateFormat.format(new Date(date)); }

export function readDiary(raw) {
  if (typeof raw?.did !== "string" || !Array.isArray(raw.entries)) throw Error("Invalid diary");
  for (const entry of raw.entries) {
    if (!entry?.uri?.startsWith(`at://${raw.did}/app.bsky.feed.post/`) ||
        typeof entry.text !== "string" || !Number.isFinite(Date.parse(entry.createdAt)) ||
        !Array.isArray(entry.images) || entry.images.some((image) =>
          typeof image?.alt !== "string" ||
          (!isLocalImage(image.file) &&
            !isBlueskyImage(image.thumbnail) && !isBlueskyImage(image.fullsize)))) throw Error("Invalid diary entry");
  }
  return latestDiaryEntries(raw.entries);
}

const whispers = [
  "人类真是一种有趣的生物。",
  "这就是你的生活吗？",
  "很有趣，明天我也想看。",
  "下次来的时候你再给我讲讲。",
  "如果我也能去人间看看就好了。",
];

function whisperIndex(uri) {
  let hash = 2166136261;
  for (const character of uri) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return (hash >>> 0) % whispers.length;
}

function createWhisper(uri, responses) {
  const section = document.createElement("section");
  section.className = "diary-whisper";

  const title = document.createElement("h3");
  const moon = document.createElement("span");
  moon.setAttribute("aria-hidden", "true");
  moon.textContent = "☾";
  title.append(moon, "棉花糖的悄悄话");

  let current = responses.get(uri) ?? whisperIndex(uri);
  const line = document.createElement("p");
  line.setAttribute("aria-live", "polite");
  line.textContent = whispers[current];

  const action = document.createElement("div");
  action.className = "diary-whisper-action";
  const pet = document.createElement("button");
  pet.type = "button";
  pet.textContent = "摸摸它";
  const heart = document.createElement("span");
  heart.className = "diary-whisper-heart";
  heart.setAttribute("aria-hidden", "true");
  heart.textContent = "♥";
  let animation;
  pet.onclick = () => {
    // Offsetting by at least one excludes the line already displayed.
    current = (current + 1 + Math.floor(Math.random() * (whispers.length - 1))) % whispers.length;
    responses.set(uri, current);
    line.textContent = whispers[current];

    animation?.cancel();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animation = heart.animate(reduced ? [{ opacity: 1 }, { opacity: 0 }] : [
      { opacity: 0, transform: "translateY(.2rem) scale(.8)" },
      { opacity: 1, transform: "translateY(0) scale(1)", offset: .2 },
      { opacity: 0, transform: "translateY(-.6rem) scale(1.12)" },
    ], { duration: 650, easing: "ease-out" });
  };

  action.append(pet, heart);
  section.append(title, line, action);
  return section;
}

export function createDiary(dialog, preview) {
  const status = dialog.querySelector(".daily-world-status");
  const list = dialog.querySelector(".diary-entries");
  const big = preview.querySelector("img");
  const previous = preview.querySelector("[data-previous]");
  const next = preview.querySelector("[data-next]");
  let loading, entries, gallery, index, start, renderSource;
  const responses = new Map();
  let nextCheck = 0;
  let requestNumber = 0;
  let seen;
  try { seen = localStorage.getItem(readKey); } catch { /* In-memory reading state still works. */ }

  function showImage(position) {
    if (!gallery) return;
    index = Math.max(0, Math.min(position, gallery.length - 1));
    const { file, alt, thumbnail, fullsize } = gallery[index];
    big.src = (isBlueskyImage(fullsize) && fullsize) || localImage(file) || thumbnail;
    big.alt = alt;
    previous.hidden = next.hidden = gallery.length < 2;
    previous.disabled = index === 0;
    next.disabled = index === gallery.length - 1;
  }

  function clearPreview() {
    if (preview.open) preview.close();
    big.removeAttribute("src");
    big.alt = "";
    gallery = undefined;
    start = undefined;
  }

  function clearDisplay() {
    clearPreview();
    list.replaceChildren();
    renderSource = undefined;
  }

  dialog.querySelector("#daily-world-close").onclick = () => dialog.close();
  dialog.addEventListener("close", () => { if (!dialog.open) clearDisplay(); });
  preview.querySelector("[data-close]").onclick = () => preview.close();
  preview.addEventListener("close", () => { if (!preview.open) clearPreview(); });
  previous.onclick = () => showImage(index - 1);
  next.onclick = () => showImage(index + 1);
  preview.onclick = (event) => { if (event.target === preview) preview.close(); };
  preview.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") showImage(index - 1);
    if (event.key === "ArrowRight") showImage(index + 1);
  });
  big.addEventListener("touchstart", (event) => {
    start = event.changedTouches[0].clientX;
  }, { passive: true });
  big.addEventListener("touchend", (event) => {
    const delta = event.changedTouches[0].clientX - start;
    if (Math.abs(delta) > 35) showImage(index + (delta < 0 ? 1 : -1));
  }, { passive: true });

  function render() {
    if (!dialog.open) return;
    if (!entries) {
      clearDisplay();
      status.textContent = "日记加载失败，请稍后重试。";
      return;
    }
    status.textContent = entries.length ? "" : "故事尚未落笔。";
    if (renderSource !== entries) {
      clearPreview();
      const rows = document.createDocumentFragment();
      for (const entry of entries) {
        const article = document.createElement("article");
        const date = document.createElement("time");
        date.dateTime = entry.createdAt;
        date.textContent = diaryDate(entry.createdAt);
        article.append(date);
        if (entry.text) {
          const text = document.createElement("p");
          text.textContent = entry.text;
          article.append(text);
        }
        if (entry.images.length) {
          const images = document.createElement("div");
          images.className = "diary-images";
          images.dataset.multiple = String(entry.images.length > 1);
          entry.images.forEach(({ file, alt, thumbnail, fullsize, aspectRatio }, position) => {
            const button = document.createElement("button");
            const image = document.createElement("img");
            button.type = "button";
            button.setAttribute("aria-label", alt || `查看第 ${position + 1} 张图片`);
            image.alt = alt;
            image.loading = "lazy";
            image.decoding = "async";
            image.setAttribute("fetchpriority", "low");
            if (Number.isSafeInteger(aspectRatio?.width) && aspectRatio.width > 0 &&
                Number.isSafeInteger(aspectRatio?.height) && aspectRatio.height > 0) {
              image.style.aspectRatio = `${aspectRatio.width} / ${aspectRatio.height}`;
            }
            image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
            image.addEventListener("error", () => image.classList.add("is-loaded"), { once: true });
            image.src = (isBlueskyImage(thumbnail) && thumbnail) || localImage(file) || fullsize;
            button.append(image);
            button.onclick = () => {
              gallery = entry.images;
              showImage(position);
              preview.showModal();
            };
            images.append(button);
          });
          article.append(images);
        }
        article.append(createWhisper(entry.uri, responses));
        rows.append(article);
      }
      list.replaceChildren(rows);
      renderSource = entries;
    }
    if (entries[0] && seen !== entries[0].uri) {
      seen = entries[0].uri;
      try { localStorage.setItem(readKey, seen); } catch { /* Storage may be disabled. */ }
    }
  }

  async function load() {
    loading?.abort();
    const controller = new AbortController();
    loading = controller;
    nextCheck = performance.now() + (dialog.open ? OPEN_CHECK_INTERVAL : BACKGROUND_CHECK_INTERVAL);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const url = `${base()}diary.json?v=${Date.now()}-${++requestNumber}`;
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw Error("Diary unavailable");
      const snapshot = readDiary(await response.json());
      if (loading !== controller) return;
      if (JSON.stringify(snapshot) !== JSON.stringify(entries)) entries = snapshot;
      const current = new Set(snapshot.map(({ uri }) => uri));
      for (const uri of responses.keys()) if (!current.has(uri)) responses.delete(uri);
      if (seen && !current.has(seen)) {
        seen = undefined;
        try { localStorage.removeItem(readKey); } catch { /* Storage may be disabled. */ }
      }
    } catch {
      if (loading === controller) entries = undefined;
    } finally {
      clearTimeout(timeout);
      if (loading === controller) {
        loading = undefined;
        render();
      }
    }
  }

  function refresh() {
    clearDisplay();
    status.textContent = "正在读取日记…";
    void load();
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && dialog.open) refresh();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && dialog.open) refresh();
  });
  void load();
  return {
    poll(time) { if (!loading && time >= nextCheck) void load(); },
    get unread() { return !!entries?.[0] && entries[0].uri !== seen; },
    open() {
      dialog.showModal();
      refresh();
    },
  };
}
