export const DIARY_ENTRY_LIMIT = 5;

export function latestDiaryEntries(entries) {
  return [...entries].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
    (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0)).slice(0, DIARY_ENTRY_LIMIT);
}
