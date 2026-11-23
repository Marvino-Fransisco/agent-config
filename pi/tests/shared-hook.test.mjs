import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import extension from "../extensions/shared-hook/index.ts";

function toolCall(cwd = process.cwd()) {
  let handler;
  extension({ on(event, callback) {
    assert.equal(event, "tool_call");
    handler = callback;
  } });
  return (toolName, input) => handler({ toolName, input, parentToolCallId: "nested" }, { cwd });
}

test("Pi maps bash calls to the shared destructive command and dotenv rules", async () => {
  const call = toolCall();
  for (const [command, reason] of [
    ["rm -rf ./build", /recursive rm/],
    ["find . -delete", /find with delete/],
    ["git reset --hard HEAD", /git reset --hard/],
    ["cat config/.env.local", /\.env access via shell/],
  ]) {
    const result = await call("bash", { command });
    assert.equal(result?.block, true);
    assert.match(result.reason, reason);
  }
  assert.equal(await call("bash", { command: "git status --short" }), undefined);
  assert.equal(await call("bash", { command: "cat config/.env.example" }), undefined);
});

test("Pi maps read, edit and write paths but ignores unrelated tools", async () => {
  const call = toolCall();
  for (const name of ["read", "edit", "write"]) {
    const result = await call(name, { path: "directory with spaces/.env.local" });
    assert.equal(result?.block, true);
    assert.match(result.reason, /\.env file access/);
    assert.equal(await call(name, { path: "directory with spaces/.env.sample" }), undefined);
  }
  assert.equal(await call("domain_glossary", { query: ".env" }), undefined);
});

test("matched Pi calls are blocked if the hook cannot start", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-hook-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const call = toolCall(join(dir, "missing"));
  const result = await call("read", { path: "README.md" });
  assert.equal(result?.block, true);
  assert.match(result.reason, /Could not run the shared block-dangerous hook/);
});

test("the shared policy does not silently allow calls when jq is missing", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "pi-hook-no-jq-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  symlinkSync("/bin/cat", join(dir, "cat"));
  const hook = fileURLToPath(new URL("../../shared/hooks/block-dangerous.sh", import.meta.url));
  const result = spawnSync(hook, {
    env: { ...process.env, PATH: dir },
    input: JSON.stringify({ tool_name: "Read", tool_input: { file_path: "README.md" } }),
    encoding: "utf8",
  });
  assert.equal(result.status, 127, result.error?.message ?? result.stderr);
});
