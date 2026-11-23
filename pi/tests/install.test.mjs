import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = realpathSync(fileURLToPath(new URL("..", import.meta.url)));

function setup(t) {
  const cwd = mkdtempSync(join(tmpdir(), "pi config-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env, PI_CODING_AGENT_DIR: "agent with spaces" };
  const run = (name) => spawnSync(join(root, "scripts", `${name}.sh`), { cwd, env, encoding: "utf8" });
  const succeeds = (name) => {
    const result = run(name);
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  };
  return { agent: join(cwd, env.PI_CODING_AGENT_DIR), run, succeeds };
}

test("install and uninstall are repeatable and only create or remove configuration links", (t) => {
  const { agent, succeeds } = setup(t);
  mkdirSync(join(agent, "skills"), { recursive: true });
  symlinkSync(join(root, "skills/teach"), join(agent, "skills/teach"));
  succeeds("install");
  succeeds("install");
  assert.deepEqual(readdirSync(join(agent, "extensions")).sort(), ["brainstorming", "prompt", "shared", "shared-hook", "task-memory", "thinking-shortcuts", "tutor", "ui", "undo-send"]);
  assert.deepEqual(readdirSync(join(agent, "skills")).sort(), ["brainstorm", "debugging", "domain-modeling", "spec", "teach"]);
  for (const name of readdirSync(join(agent, "skills"))) {
    assert.equal(realpathSync(join(agent, "skills", name)), join(root, "../shared/skills", name));
  }
  writeFileSync(join(agent, "settings.json"), "{}");
  succeeds("uninstall");
  succeeds("uninstall");
  assert.deepEqual(readdirSync(join(agent, "extensions")), []);
  assert.deepEqual(readdirSync(join(agent, "skills")), []);
  assert.equal(readFileSync(join(agent, "settings.json"), "utf8"), "{}");
  assert.ok(readFileSync(join(root, "skills/spec/SKILL.md"), "utf8"));
});

test("uninstall removes owned links to retired skills and preserves unrelated skills", (t) => {
  const { agent, succeeds } = setup(t);
  succeeds("install");
  const skills = join(agent, "skills");
  symlinkSync(join(root, "skills/retired"), join(skills, "retired"));
  mkdirSync(join(skills, "local-skill"));
  succeeds("uninstall");
  assert.deepEqual(readdirSync(skills), ["local-skill"]);
});

test("uninstall leaves conflicts untouched and keeps shared for separately installed long-memory", (t) => {
  const { agent, run, succeeds } = setup(t);
  succeeds("install");
  const extensions = join(agent, "extensions");
  rmSync(join(extensions, "tutor"));
  writeFileSync(join(extensions, "tutor"), "custom tutor");
  rmSync(join(extensions, "ui"));
  symlinkSync(join(agent, "different-checkout"), join(extensions, "ui"));
  mkdirSync(join(extensions, "long-memory"));
  const result = run("uninstall");
  assert.equal(result.status, 1, result.error?.message ?? result.stderr);
  assert.match(result.stderr, /Left unchanged.*tutor/);
  assert.match(result.stderr, /Left unchanged.*ui/);
  assert.match(result.stdout, /Kept.*shared/);
  assert.deepEqual(readdirSync(extensions).sort(), ["long-memory", "shared", "tutor", "ui"]);
  assert.equal(readFileSync(join(extensions, "tutor"), "utf8"), "custom tutor");
  assert.deepEqual(readdirSync(join(agent, "skills")), []);
});
