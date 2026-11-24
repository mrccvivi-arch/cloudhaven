const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric",
});
const readKey = "cloudhaven-diary-read";
const base = () => import.meta.env.BASE_URL;

export function diaryDate(date) { return dateFormat.format(new Date(date)); }

export function readDiary(raw) {
  if (typeof raw?.did !== "string" || !Array.isArray(raw.entries)) throw Error("Invalid diary");
  for (const entry of raw.entries) {
    if (!entry?.uri?.startsWith(`at://${raw.did}/app.bsky.feed.post/`) ||
        typeof entry.text !== "string" || !Number.isFinite(Date.parse(entry.createdAt)) ||
        !Array.isArray(entry.images) || entry.images.some((image) =>
          !/^[a-f0-9]{64}\.webp$/.test(image?.file) || typeof image.alt !== "string")) throw Error("Invalid diary entry");
  }
  return raw.entries;
}

export function createDiary(dialog, preview) {
  const status = dialog.querySelector(".daily-world-status");
  const list = dialog.querySelector(".diary-entries");
  const big = preview.querySelector("img");
  const previous = preview.querySelector("[data-previous]");
  const next = preview.querySelector("[data-next]");
  let loading, entries, gallery, index, start, renderSource;
  let nextCheck = 0;
  let seen;
  try { seen = localStorage.getItem(readKey); } catch { /* In-memory reading state still works. */ }

  function showImage(position) {
    index = Math.max(0, Math.min(position, gallery.length - 1));
    const { file, alt } = gallery[index];
    big.src = `${base()}diary-media/${file}`;
    big.alt = alt;
    previous.hidden = next.hidden = gallery.length < 2;
    previous.disabled = index === 0;
    next.disabled = index === gallery.length - 1;
  }

  dialog.querySelector("#daily-world-close").onclick = () => dialog.close();
  preview.querySelector("[data-close]").onclick = () => preview.close();
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
    status.textContent = entries ? (entries.length ? "" : "故事尚未落笔。")
      : loading ? "" : "今天的故事还在路上。";
    if (!entries) return;
    if (renderSource !== entries) {
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
          entry.images.forEach(({ file, alt }, position) => {
            const button = document.createElement("button");
            const image = document.createElement("img");
            button.type = "button";
            button.setAttribute("aria-label", alt || `查看第 ${position + 1} 张图片`);
            image.src = `${base()}diary-media/${file}`;
            image.alt = alt;
            image.loading = "lazy";
            image.decoding = "async";
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

  function load() {
    if (loading) return loading;
    nextCheck = performance.now() + 5 * 60_000;
    loading = fetch(`${base()}diary.json`, { cache: "no-cache" }).then(async (response) => {
      if (!response.ok) throw Error("Diary unavailable");
      const snapshot = readDiary(await response.json());
      if (JSON.stringify(snapshot) !== JSON.stringify(entries)) entries = snapshot;
    }).catch(() => {}).finally(() => {
      loading = undefined;
      render();
    });
    return loading;
  }

  void load();
  return {
    poll(time) { if (time >= nextCheck) void load(); },
    get unread() { return !!entries?.[0] && entries[0].uri !== seen; },
    open() {
      dialog.showModal();
      void load();
      if (entries) render();
    },
  };
}
