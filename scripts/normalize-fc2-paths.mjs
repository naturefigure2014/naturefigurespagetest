import { createHash } from "node:crypto";
import { access, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

if (process.env.DEPLOY_TARGET !== "fc2") {
  process.exit(0);
}

const distPath = path.resolve(process.argv[2] ?? "dist");
const safeName = (name) => /^[A-Za-z0-9._-]+$/.test(name);
const replacements = new Map();
const renamed = new Map();

function safeSegment(name) {
  if (safeName(name)) return name;

  if (!replacements.has(name)) {
    const hash = createHash("sha256").update(name).digest("hex").slice(0, 16);
    const replacement = `u-${hash}`;
    const existing = renamed.get(replacement);
    if (existing && existing !== name) {
      throw new Error(`Generated path name collision for ${replacement}`);
    }
    replacements.set(name, replacement);
    renamed.set(replacement, name);
  }

  return replacements.get(name);
}

async function renameTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const currentPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await renameTree(currentPath);

    const replacement = safeSegment(entry.name);
    if (replacement === entry.name) continue;

    const replacementPath = path.join(directory, replacement);
    try {
      await access(replacementPath);
      throw new Error(`Refusing to overwrite generated path: ${replacementPath}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(currentPath, replacementPath);
  }
}

function rewriteUrl(value) {
  const suffixIndex = value.search(/[?#]/);
  const pathname = suffixIndex < 0 ? value : value.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? "" : value.slice(suffixIndex);

  const rewrittenPath = pathname.split("/").map((segment) => {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return segment;
    }
    return replacements.get(decoded) ?? segment;
  }).join("/");

  return `${rewrittenPath}${suffix}`;
}

function rewriteSrcset(value) {
  return value.replace(/(^|,\s*)([^\s,]+)/g, (_match, prefix, url) => `${prefix}${rewriteUrl(url)}`);
}

async function rewriteReferences(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const currentPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteReferences(currentPath);
      continue;
    }

    if (!/\.(?:html?|css|js|json|xml|webmanifest)$/i.test(entry.name)) continue;

    const source = await readFile(currentPath, "utf8");
    const rewritten = source
      .replace(
        /\b(href|src|action|poster|cite|data|srcset|content)\s*=\s*(["'])([^"']*)\2/gi,
        (_match, attribute, quote, value) => {
          const nextValue = attribute.toLowerCase() === "srcset"
            ? rewriteSrcset(value)
            : rewriteUrl(value);
          return `${attribute}=${quote}${nextValue}${quote}`;
        }
      )
      .replace(/url\((["']?)([^)"']+)\1\)/gi, (_match, quote, url) => `url(${quote}${rewriteUrl(url)}${quote})`);

    if (rewritten !== source) await writeFile(currentPath, rewritten, "utf8");
  }
}

await renameTree(distPath);
await rewriteReferences(distPath);

const remaining = [];
async function findUnsafePaths(directory, relativePath = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.posix.join(relativePath, entry.name);
    if (!safeName(entry.name)) remaining.push(entryPath);
    if (entry.isDirectory()) await findUnsafePaths(path.join(directory, entry.name), entryPath);
  }
}

await findUnsafePaths(distPath);
if (remaining.length > 0) {
  throw new Error(`Non-ASCII or unsupported output paths remain: ${remaining.slice(0, 10).join(", ")}`);
}

console.log(`Normalized ${replacements.size} FC2 output path segment(s) to ASCII names.`);
