const normalizeId = (id) => id.replace(/\/index(?:\.md)?$/, "");

/**
 * @template {{ id: string }} T
 * @param {T[]} lineup
 * @param {{ title: string, figureIds: string[] }[]} groups
 * @returns {{ title: string, figures: T[] }[]}
 */
export function groupLineup(lineup, groups) {
  if (groups.length === 0) return [{ title: "ラインナップ", figures: lineup }];

  const figuresById = new Map(lineup.map((figure) => [normalizeId(figure.id), figure]));
  const seen = new Set();
  const sections = groups.map(({ title, figureIds }) => ({
    title,
    figures: figureIds.map((id) => {
      const key = normalizeId(id);
      const figure = figuresById.get(key);
      if (!figure) throw new Error(`Lineup group "${title}" references missing figure "${id}"`);
      if (seen.has(key)) throw new Error(`Figure "${id}" appears in multiple lineup groups`);
      seen.add(key);
      return figure;
    })
  }));
  const ungrouped = lineup.find((figure) => !seen.has(normalizeId(figure.id)));
  if (ungrouped) throw new Error(`Figure "${ungrouped.id}" is missing from lineup groups`);
  return sections;
}
