const makerImages = import.meta.glob(
  "../content/makers/**/*.{jpg,jpeg,png,webp,gif,JPG,JPEG,PNG,WEBP,GIF}",
  {
    eager: true,
    query: "?url",
    import: "default"
  }
) as Record<string, string>;

function normalize(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function resolveMakerImage(entryId: string, ref: string | number | undefined) {
  if (ref === undefined || ref === null || String(ref).trim() === "") {
    return undefined;
  }

  const value = String(ref).trim();

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    return `${base}${value}`;
  }

  const cleanEntryId = normalize(entryId)
    .replace(/^\//, "")
    .replace(/\/index(?:\.md)?$/, "");

  const filename = value.replace(/^.*\//, "");
  const targetSuffixes = [
    `/content/makers/${cleanEntryId}/img/${filename}`
  ];
  const parentEntryId = cleanEntryId.includes("/")
    ? cleanEntryId.slice(0, cleanEntryId.lastIndexOf("/"))
    : undefined;
  if (parentEntryId) {
    targetSuffixes.push(`/content/makers/${parentEntryId}/img/${filename}`);
  }

  const match = Object.entries(makerImages).find(([path]) =>
    targetSuffixes.some((targetSuffix) => normalize(path).endsWith(targetSuffix))
  );

  if (match) return match[1];

  return Object.entries(makerImages).find(([path]) =>
    normalize(path).endsWith(`/img/${filename}`)
  )?.[1];
}
