import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  assert.throws(() => parseState('{"version":1,"complete":true,"files":{"../page":"bad"}}'));
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
  let transferred = [];
  function fakeFtp(command) {
    if (command === "cls -1 /test/") return readdirSync(remote).join("\n");
    const put = /^put "([^"]+)" -o \/test\/fc2-deploy-state\.json$/.exec(command);
    if (put) {
      cpSync(put[1], path.join(remote, "fc2-deploy-state.json"));
      return "";
    }
    const get = /^get \/test\/fc2-deploy-state\.json -o "([^"]+)"$/.exec(command);
    if (get) {
      cpSync(path.join(remote, "fc2-deploy-state.json"), get[1]);
      return "";
    }
    const mirror = /^mirror --reverse --verbose --no-perms --transfer-all "([^"]+)" \/test\/$/.exec(command);
    if (!mirror) throw new Error(`Unexpected FTP command: ${command}`);
    mirrors++;
    transferred = [];
    function copyFiles(source, relative = "") {
      for (const entry of readdirSync(source, { withFileTypes: true })) {
        const name = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) copyFiles(path.join(source, entry.name), name);
        else {
          const target = path.join(remote, ...name.split("/"));
          mkdirSync(path.dirname(target), { recursive: true });
          cpSync(path.join(source, entry.name), target);
          transferred.push(name);
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
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  assert.equal(parseState(readFileSync(path.join(remote, "fc2-deploy-state.json"), "utf8")).complete, true);

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

  writeFileSync(path.join(remote, "fc2-deploy-state.json"), "{");
  await deploy(options);
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  await deploy({ ...options, forceFull: true });
  assert.deepEqual(transferred.sort(), ["index.html", "sub/image.jpg"]);
  assert.ok(existsSync(path.join(remote, "fc2-deploy-state.json")));
});
