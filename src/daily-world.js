const BEIJING_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
});
const BEIJING_TIME = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const BEIJING_DAY = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long",
});
const TOPICS = {
  太空探索: ["宇宙", "M20.8 14.2A8.8 8.8 0 0 1 9.8 3.2a8.8 8.8 0 1 0 11 11Z"],
  国际时事: ["世界", "M3 12h18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c-5 4-5 14 0 18 5-4 5-14 0-18Z"],
  自然: ["自然", "M4 20 16 8M7 17C2 9 12 4 21 3c-1 9-5 17-14 14Z"],
  科学: ["科学", "M9 3h6m-5 0v7L5 18a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8"],
  财经: ["经济", "M4 4v16h16M7 15l4-4 3 2 5-6m-4 0h4v4"],
};
const SVG = "http://www.w3.org/2000/svg";

export function newsDateLabel(updatedAt) {
  return BEIJING_DAY.format(updatedAt);
}

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
    if (!item || ![item.titleEn, item.source, item.url].every((value) => typeof value === "string" && value.trim())) return false;
    try {
      return new URL(item.url).protocol === "https:";
    } catch {
      return false;
    }
  }).slice(0, 4);
  return items.length ? { updatedAt, items } : undefined;
}

export function newsHeadlines(snapshot, english) {
  return (snapshot?.items ?? []).flatMap((item) => {
    const title = english ? item.titleEn : typeof item.titleZh === "string" ? item.titleZh.trim() : "";
    return title ? [{ ...item, title }] : [];
  });
}

function newsRow({ title, source, category, url }, english) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const [topic, icon] = TOPICS[category] ?? ["科技", TOPICS.科学[1]];
  const artwork = document.createElementNS(SVG, "svg");
  artwork.setAttribute("viewBox", "0 0 24 24");
  artwork.setAttribute("aria-hidden", "true");
  artwork.setAttribute("fill", "none");
  artwork.setAttribute("stroke", "currentColor");
  artwork.setAttribute("stroke-width", "1.45");
  artwork.setAttribute("stroke-linecap", "round");
  artwork.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", icon);
  artwork.append(path);
  const content = document.createElement("div");
  const meta = document.createElement("small");
  meta.textContent = `${topic} · ${source}`;
  const headline = document.createElement("strong");
  headline.lang = english ? "en" : "zh-CN";
  headline.textContent = title;
  content.append(meta, headline);
  link.append(artwork, content);
  item.append(link);
  return item;
}

export function createDailyWorld(dialog) {
  const status = dialog.querySelector(".daily-world-status");
  const list = dialog.querySelector(".daily-world-headlines");
  const close = dialog.querySelector("#daily-world-close");
  const language = dialog.querySelector("#daily-world-language");
  const date = dialog.querySelector(".daily-world-date");
  const updated = dialog.querySelector(".daily-world-updated");
  let snapshot;
  let loading;
  let english = false;
  close.addEventListener("click", () => dialog.close());
  language.addEventListener("click", () => {
    english = !english;
    render();
  });

  function render() {
    const headlines = newsHeadlines(snapshot, english);
    status.textContent = !snapshot ? "今天的消息还在路上。" :
      !headlines.length ? "中文标题暂缺，可切换 English 阅读原文。" : "";
    language.hidden = !snapshot;
    language.setAttribute("aria-pressed", String(english));
    date.hidden = updated.hidden = !snapshot;
    if (snapshot) {
      date.dateTime = beijingDate(snapshot.updatedAt);
      date.textContent = newsDateLabel(snapshot.updatedAt);
      updated.dateTime = new Date(snapshot.updatedAt).toISOString();
      updated.textContent = newsUpdateLabel(snapshot.updatedAt);
    }
    list.replaceChildren(...headlines.map((item) => newsRow(item, english)));
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
