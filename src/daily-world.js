const BEIJING_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});
const BEIJING_TIME = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function beijingDate(value) {
  const parts = Object.fromEntries(BEIJING_DATE.formatToParts(value).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function newsUpdateLabel(updatedAt, now = Date.now()) {
  const date = beijingDate(updatedAt);
  const label = `北京时间 ${date} ${BEIJING_TIME.format(updatedAt)} 更新`;
  return date === beijingDate(now) ? label : `上次更新 · ${label}`;
}

export function readNews(raw) {
  const updatedAt = typeof raw?.updatedAt === "string" ? Date.parse(raw.updatedAt) : NaN;
  if (!Number.isFinite(updatedAt) || !Array.isArray(raw.items)) return undefined;
  const items = raw.items.filter((item) => {
    if (!item || ![item.title, item.category, item.source, item.url].every((value) => typeof value === "string" && value.trim())) return false;
    try {
      return new URL(item.url).protocol === "https:";
    } catch {
      return false;
    }
  }).slice(0, 8);
  return items.length ? { updatedAt, items } : undefined;
}

export function createDailyWorld(dialog) {
  const status = dialog.querySelector(".daily-world-status");
  const list = dialog.querySelector(".daily-world-headlines");
  const close = dialog.querySelector("button");
  let snapshot;
  let loading;
  close.addEventListener("click", () => dialog.close());

  function render() {
    status.textContent = snapshot ? newsUpdateLabel(snapshot.updatedAt) : "今天的消息还在路上。";
    list.replaceChildren(...(snapshot?.items ?? []).map(({ title, url, category, source }) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      const meta = document.createElement("small");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = title;
      meta.textContent = `${category} · ${source}`;
      link.append(meta);
      item.append(link);
      return item;
    }));
  }

  return {
    open() {
      render();
      if (!snapshot) status.textContent = "正在读取消息…";
      dialog.showModal();
      if (!loading) {
        loading = fetch(`${import.meta.env.BASE_URL}news.json`, { cache: "no-cache" })
          .then((response) => response.ok ? response.json() : undefined)
          .then((data) => { snapshot = readNews(data) ?? snapshot; })
          .catch(() => {})
          .finally(() => {
            loading = undefined;
            if (dialog.open) render();
          });
      }
    },
  };
}
