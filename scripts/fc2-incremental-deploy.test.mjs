import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildManifest, changedFiles, deploy, parseState } from "./fc2-incremental-deploy.mjs";

test("hash comparison detects same-size changes and validates state", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "fc2-hash-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "page.html"), "first");
  const before = await buildManifest(dir);
  await writeFile(path.join(dir, "page.html"), "other");
  const after = await buildManifest(dir);
  assert.deepEqual(changedFiles(after, before), ["page.html"]);
  assert.deepEqual(changedFiles(after, parseState(JSON.stringify(after))), []);
  assert.equal(parseState('{"version":1,"complete":false}'), null);
  assert.equal(parseState(JSON.stringify({ ...after, version: 1 })), null);
  assert.equal(parseState('{"version":2,"complete":false}'), null);
  assert.throws(() => parseState('{"version":2,"complete":true,"files":{"../page":"bad"}}'));
});

test("deploy handles unchanged files, failed transfers, dry runs, and full recovery", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "fc2-deploy-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "dist");
  const remote = path.join(dir, "remote");
  await mkdir(path.join(root, "sub"), { recursive: true });
  await mkdir(remote);
  await writeFile(path.join(root, "index.html"), "first");
  await writeFile(path.join(root, "sub", "image.jpg"), "image");
  let mirrors = 0;
  let failMirror = false;
  let wrongDestination = false;
  let corruptProbe = false;
  let stateError = null;
  let stateReads = 0;
  let transferred = [];
  function fakeFtp(command, capture = false) {
    const put = /^put "([^"]+)" -o \/test\/fc2-deploy-state\.json$/.exec(command);
    if (put) {
      cpSync(put[1], path.join(remote, "fc2-deploy-state.json"));
      return "";
    }
    const get = /^get \/test\/fc2-deploy-state\.json -o "([^"]+)"$/.exec(command);
    if (get) {
      if (capture) stateReads++;
      if (capture && stateError) throw stateError;
      if (!existsSync(path.join(remote, "fc2-deploy-state.json"))) {
        const error = new Error("FTP state file not found");
        error.stderr = "get: Access failed: 550 No such file";
        throw error;
      }
      cpSync(path.join(remote, "fc2-deploy-state.json"), get[1]);
      return "";
    }
    const probeGet = /^get \/test\/(fc2-deploy-probe-[a-f0-9]+\.txt) -o "([^"]+)"$/.exec(command);
    if (probeGet) {
      cpSync(path.join(remote, probeGet[1]), probeGet[2]);
      if (corruptProbe) writeFileSync(probeGet[2], "unexpected content");
      return "";
    }
    const probeRemove = /^rm \/test\/(fc2-deploy-probe-[a-f0-9]+\.txt)$/.exec(command);
    if (probeRemove) {
      rmSync(path.join(remote, probeRemove[1]));
      return "";
    }
    const mirror = /^mirror --reverse --verbose --no-perms --transfer-all "([^"]+)" (\/test\/?)$/.exec(command);
    if (!mirror) throw new Error(`Unexpected FTP command: ${command}`);
    mirrors++;
    transferred = [];
    const targetRoot = mirror[2].endsWith("/") || wrongDestination
      ? path.join(remote, path.basename(mirror[1]))
      : remote;
    function copyFiles(source, relative = "") {
      for (const entry of readdirSync(source, { withFileTypes: true })) {
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) copyFiles(path.join(source, entry.name), name);
        else {
          const target = path.join(targetRoot, ...name.split("/"));
          mkdirSync(path.dirname(target), { recursive: true });
          cpSync(path.join(source, entry.name), target);
          if (!name.startsWith("fc2-deploy-probe-")) transferred.push(name);
        }
      }
    }
    copyFiles(mirror[1]);
    if (failMirror) throw new Error("Simulated interrupted transfer");
    return "";
  }
  const options = { root, ftpClient: fakeFtp, tempRoot: dir };

  await deploy(options);
  assert.equal(mirrors, 1);
  assert.equal(stateReads, 1);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  assert.equal(parseState(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8")).complete, true);
  assert.equal(existsSync(path.join(remote, "stage")), false);
  assert.equal(readdirSync(remote).some((name) => name.startsWith("fc2-deploy-probe-")), false);

  await deploy(options);
  assert.equal(mirrors, 1);
  await writeFile(path.join(root, "index.html"), "other");
  await deploy({ ...options, dryRun: true });
  assert.equal(mirrors, 1);
  assert.equal(readFileSync(path.join(remote, "index.html"), "utf8"), "first");

  await deploy(options);
  assert.deepEqual(transferred, ["index.html"]);
  assert.equal(readFileSync(path.join(remote, "index.html"), "utf8"), "other");
  await writeFile(path.join(root, "index.html"), "third");
  failMirror = true;
  await assert.rejects(deploy(options), /Simulated interrupted transfer/);
  assert.equal(parseState(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8")), null);
  await writeFile(path.join(root, "index.html"), "other");
  failMirror = false;
  await deploy(options);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  assert.equal(readFileSync(path.join(remote, "index.html"), "utf8"), "other");

  const legacyState = await buildManifest(root);
  legacyState.version = 1;
  writeFileSync(path.join(remote, "fc2-deploy-state.json"), JSON.stringify(legacyState));
  await deploy({ ...options, dryRun: true });
  assert.equal(JSON.parse(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8")).version, 1);
  await deploy(options);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  assert.equal(JSON.parse(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8")).version, 2);
  const mirrorsAfterMigration = mirrors;
  await deploy(options);
  assert.equal(mirrors, mirrorsAfterMigration);

  await writeFile(path.join(root, "index.html"), "wrong destination");
  wrongDestination = true;
  await assert.rejects(deploy(options), /ENOENT/);
  assert.equal(parseState(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8")), null);
  wrongDestination = false;
  await deploy(options);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  assert.equal(readFileSync(path.join(remote, "index.html"), "utf8"), "wrong destination");

  await writeFile(path.join(root, "index.html"), "probe mismatch");
  corruptProbe = true;
  await assert.rejects(deploy(options), /destination probe did not match/);
  assert.equal(parseState(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8")), null);
  corruptProbe = false;
  await deploy(options);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);

  writeFileSync(path.join(remote, "fc2-deploy-state.json"), "{");
  await deploy(options);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  const readsBeforeFailure = stateReads;
  stateError = new Error("Permission denied");
  stateError.stderr = "get: Access failed: 550 Permission denied";
  const stateBeforeFailure = readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8");
  const mirrorsBeforeFailure = mirrors;
  await assert.rejects(deploy(options), /Cannot retrieve FC2 deployment state; deployment stopped/);
  assert.equal(stateReads, readsBeforeFailure + 1);
  assert.equal(mirrors, mirrorsBeforeFailure);
  assert.equal(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8"), stateBeforeFailure);
  stateError = new Error("Connection timed out");
  stateError.stderr = "get: Connection timed out";
  await assert.rejects(deploy(options), /Cannot retrieve FC2 deployment state; deployment stopped/);
  assert.equal(mirrors, mirrorsBeforeFailure);
  const mirrorsBeforeFull = mirrors;
  await deploy({ ...options, forceFull: true });
  assert.equal(stateReads, readsBeforeFailure + 2);
  assert.equal(mirrors, mirrorsBeforeFull + 1);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  assert.ok(existsSync(path.join(remote, "fc2-deploy-state.json")));
});
