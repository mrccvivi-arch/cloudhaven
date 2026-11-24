const DAY = 86_400_000;
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", hourCycle: "h23",
});
export function beijingDialogueTime(now) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const hour = Number(parts.hour);
  const period = hour < 6 || hour >= 22 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, period };
}

export function daysBetween(from, to) {
  return (Date.parse(to) - Date.parse(from)) / DAY;
}

export function acquaintanceDays(firstDate, now = Date.now()) {
  const days = daysBetween(firstDate, beijingDialogueTime(now).date);
  return Number.isFinite(days) && days >= 0 ? days + 1 : undefined;
}
