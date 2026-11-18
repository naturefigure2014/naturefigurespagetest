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
