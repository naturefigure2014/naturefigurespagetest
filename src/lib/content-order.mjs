/**
 * @param {{ id: string }} a
 * @param {{ id: string }} b
 */
export function compareContentId(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * @template {{ id: string }} T
 * @param {readonly T[]} entries
 * @returns {T[]}
 */
export function sortContentById(entries) {
  return [...entries].sort(compareContentId);
}

/**
 * @template {{ id: string, data: { date?: Date, contentType: string, titleId?: string } }} T
 * @param {readonly T[]} entries
 * @param {number} limit
 * @returns {T[]}
 */
export function selectRecentFigures(entries, limit) {
  /** @param {string} id */
  const normalizeId = (id) => id.replace(/\/index(?:\.md)?$/, "");
  let candidates = entries
    .filter((entry) => entry.data.date)
    .sort((a, b) => (b.data.date?.getTime() ?? 0) - (a.data.date?.getTime() ?? 0) || compareContentId(a, b));

  while (true) {
    const recent = candidates.slice(0, limit);
    const titleIds = new Set(recent.filter((entry) => entry.data.contentType === "title").map((entry) => normalizeId(entry.id)));
    const remaining = candidates.filter((entry) =>
      entry.data.contentType !== "figure" || !entry.data.titleId || !titleIds.has(normalizeId(entry.data.titleId))
    );
    if (remaining.length === candidates.length) return recent;
    candidates = remaining;
  }
}
