/**
 * Resolve FIGURE images stored next to each FIGURE's index.md.
 *
 * Example:
 * src/content/figures/kaiyodo/capsuleq/nihon-no-doubutsu-1/001/
 *   index.md
 *   anima_japI_015.jpg
 *
 * Markdown stores the original filename. Vite's import.meta.glob imports the
 * local image and gives us the final URL used by the browser.
 */

const figureImages = import.meta.glob(
  "../content/figures/**/*.{jpg,jpeg,png,webp,gif,JPG,JPEG,PNG,WEBP,GIF}",
  {
    eager: true,
    query: "?url",
    import: "default"
  }
) as Record<string, string>;

function normalize(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function resolveFigureImage(
  entryId: string,
  ref: string | number | undefined
) {
  if (ref === undefined || ref === null || String(ref).trim() === "") {
    return undefined;
  }

  const value = String(ref).trim();

  // Allow absolute URLs or already-generated site paths.
  if (
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }
  if (value.startsWith("/img/")) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const assetPath = value.startsWith("/") ? value.slice(1) : value;
    return `${base}/${assetPath}`;
  }
  if (value.startsWith("/")) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${base}${value}`;
  }

  // Keep the old numeric notation working: 1 -> 001.jpg.
  const filename = /^\d+$/.test(value)
    ? `${value.padStart(3, "0")}.jpg`
    : value;

  // Astro content IDs normally end in /index for an index.md entry.
  // Accept both /index and /index.md so the resolver is not sensitive to
  // how the content entry ID is represented.
  const cleanEntryId = normalize(entryId)
    .replace(/^\//, "")
    .replace(/\/index(?:\.md)?$/, "");

  const targetSuffix = `/content/figures/${cleanEntryId}/${filename}`;

  const match = Object.entries(figureImages).find(([path]) =>
    normalize(path).endsWith(targetSuffix)
  );

  return match?.[1];
}
