import { orderLineupByFigureIds } from "./lineup-groups.mjs";

const normalizeId = (id) => id.replace(/\/index(?:\.md)?$/, "");

/**
 * @template {{ id: string, data: { contentType: string, figureIds?: string[] } }} T
 * @param {T[]} figures
 * @param {{ href?: string, figureFolder?: string }} creator
 * @returns {T[]}
 */
export function getCreatorFigures(figures, creator) {
  const folder = creator.figureFolder ?? creator.href?.match(/^\/figures\/(sculptors\/[^/]+)\/?$/)?.[1];
  if (!folder) return [];
  const normalizedFolder = normalizeId(folder).replace(/\/$/, "");
  const items = figures.filter((entry) =>
    entry.data.contentType === "figure" && normalizeId(entry.id).startsWith(`${normalizedFolder}/`)
  );
  const creatorEntry = figures.find((entry) => normalizeId(entry.id) === normalizedFolder);
  const listed = orderLineupByFigureIds(items, creatorEntry?.data.figureIds ?? []);
  const listedEntries = new Set(listed);
  return [...listed, ...items.filter((entry) => !listedEntries.has(entry))];
}
