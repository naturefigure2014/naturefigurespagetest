import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const stateName = "fc2-deploy-state.json";
const stateVersion = 2;
const safePath = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const hashPattern = /^[a-f0-9]{64}$/;

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

export async function buildManifest(root) {
  const files = Object.create(null);
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!safePath.test(relative) || entry.name === "." || entry.name === "..") {
        throw new Error(`Unsupported deployment path: ${relative}`);
      }
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full, relative);
      else if (entry.isFile()) files[relative] = await hashFile(full);
      else throw new Error(`Unsupported deployment entry: ${relative}`);
    }
  }
  await visit(root);
  if (Object.hasOwn(files, stateName)) throw new Error(`Reserved deployment filename: ${stateName}`);
  if (Object.keys(files).length === 0) throw new Error("Build artifact contains no files.");
  return { version: stateVersion, complete: true, files };
}

export function parseState(text) {
  let state;
  try {
    state = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid FC2 deployment state JSON: ${error.message}`);
  }
  if (!state || ![1, stateVersion].includes(state.version) || typeof state.complete !== "boolean") {
    throw new Error("Unsupported FC2 deployment state.");
  }
  if (state.version === 1) {
    console.warn("Previous FC2 deployment state predates the destination fix; transferring all files.");
    return null;
  }
  if (!state.complete) {
    console.warn("Previous FC2 deployment was incomplete; transferring all files.");
    return null;
  }
  if (!state.files || typeof state.files !== "object" || Array.isArray(state.files)) {
    throw new Error("Invalid FC2 deployment state file list.");
  }
  for (const [file, hash] of Object.entries(state.files)) {
    if (!safePath.test(file) || file.split("/").some((part) => part === "." || part === "..") ||
        file === stateName || typeof hash !== "string" || !hashPattern.test(hash)) {
      throw new Error(`Invalid FC2 deployment state entry: ${file}`);
    }
  }
  return state;
}

export function changedFiles(current, previous) {
  return Object.keys(current.files).filter((file) => !previous || previous.files[file] !== current.files[file]);
}

function quote(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function ftp(commands, capture = false) {
  const { FTP_SERVER, FTP_USERNAME, LFTP_PASSWORD } = process.env;
  if (!FTP_SERVER || !FTP_USERNAME || !LFTP_PASSWORD) throw new Error("FC2 FTP secrets must be configured.");
  const setup = "set cmd:fail-exit yes; set ftp:ssl-allow no; set ftp:passive-mode yes; " +
    "set ftp:prefer-epsv no; set ftp:ignore-pasv-address no; set ftp:fix-pasv-address no; " +
    "set net:timeout 20; set net:max-retries 3;";
  const result = spawnSync("lftp", ["--env-password", "-u", FTP_USERNAME, "-e",
    `${setup} ${commands}; bye`, `ftp://${FTP_SERVER}`], {
    encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`lftp failed with exit status ${result.status ?? result.signal}${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
    error.stderr = result.stderr;
    throw error;
  }
  if (result.stderr) process.stderr.write(result.stderr);
  return result.stdout ?? "";
}

function isMissingStateError(error) {
  return error && typeof error.stderr === "string" &&
    /\b550\b[^\r\n]*\b(?:no such file|file not found)\b/i.test(error.stderr);
}

async function writeAndVerifyState(localPath, text, ftpClient) {
  await writeFile(localPath, text, "utf8");
  ftpClient(`put ${quote(localPath)} -o /test/${stateName}`);
  const downloaded = `${localPath}.download`;
  await rm(downloaded, { force: true });
  ftpClient(`get /test/${stateName} -o ${quote(downloaded)}`);
  if (await readFile(downloaded, "utf8") !== text) {
    throw new Error("FC2 deployment state did not match after uploading.");
  }
}

export async function deploy({ root, dryRun = false, forceFull = false, ftpClient = ftp, tempRoot = tmpdir() }) {
  const temp = await mkdtemp(path.join(tempRoot, "fc2-deploy-"));
  try {
    const manifest = await buildManifest(root);
    const statePath = path.join(temp, stateName);
    let previous = null;
    if (forceFull) {
      console.log("Full deployment requested; transferring all files.");
    } else {
      let stateExists = true;
      try {
        ftpClient(`get /test/${stateName} -o ${quote(statePath)}`, true);
      } catch (error) {
        if (!isMissingStateError(error)) {
          throw new Error(`Cannot retrieve FC2 deployment state; deployment stopped: ${error.message}`);
        }
        stateExists = false;
        console.log("No previous FC2 deployment state found; transferring all files.");
      }
      if (stateExists) {
        const stateText = await readFile(statePath, "utf8");
        try {
          previous = parseState(stateText);
        } catch (error) {
          console.warn(`Cannot trust FC2 deployment state: ${error.message}; transferring all files.`);
        }
      }
    }
    const changed = changedFiles(manifest, previous);
    console.log(`Files: ${Object.keys(manifest.files).length}; to transfer: ${changed.length}; unchanged: ${Object.keys(manifest.files).length - changed.length}.`);
    if (dryRun) {
      for (const file of changed) console.log(`Would transfer: ${file}`);
      return;
    }
    if (changed.length === 0 && previous) {
      console.log("No file content changes to transfer.");
      return;
    }

    const stage = path.join(temp, "stage");
    await mkdir(stage);
    for (const file of changed) {
      const destination = path.join(stage, ...file.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      const source = path.join(root, ...file.split("/"));
      try {
        await link(source, destination);
      } catch (error) {
        if (error.code !== "EXDEV") throw error;
        await copyFile(source, destination);
      }
    }
    const probeName = `fc2-deploy-probe-${randomBytes(16).toString("hex")}.txt`;
    if (Object.hasOwn(manifest.files, probeName)) throw new Error(`Reserved deployment filename: ${probeName}`);
    const probeText = randomBytes(32).toString("hex");
    await writeFile(path.join(stage, probeName), probeText, "utf8");
    await writeAndVerifyState(statePath, JSON.stringify({ version: stateVersion, complete: false }), ftpClient);
    ftpClient(`mirror --reverse --verbose --no-perms --transfer-all ${quote(stage)} /test`);
    const downloadedProbe = path.join(temp, "probe.download");
    ftpClient(`get /test/${probeName} -o ${quote(downloadedProbe)}`);
    if (await readFile(downloadedProbe, "utf8") !== probeText) {
      throw new Error("FC2 deployment destination probe did not match.");
    }
    ftpClient(`rm /test/${probeName}`);
    await writeAndVerifyState(statePath, JSON.stringify(manifest), ftpClient);
    console.log("FC2 deployment state saved and verified.");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deploy({
    root: path.resolve("dist"),
    dryRun: process.env.DRY_RUN === "true",
    forceFull: process.env.FORCE_FULL === "true"
  }).catch((error) => {
    console.error(`FC2 deployment failed: ${error.message}`);
    process.exitCode = 1;
  });
}
