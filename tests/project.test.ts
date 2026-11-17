import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectText, resolveProject } from "../extensions/shared/project.ts";
import memoryExtension from "../extensions/long-memory/index.ts";

test("project identity is canonical and distinct for folders, repositories and checkouts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "project-scope-"));
  try {
    const a = join(directory, "a");
    const b = join(directory, "b");
    mkdirSync(a);
    mkdirSync(b);
    execFileSync("git", ["init", "-q", a]);
    execFileSync("git", ["init", "-q", b]);
    mkdirSync(join(a, "src"));
    symlinkSync(a, join(directory, "alias"));
    const project = await resolveProject(a);
    assert.equal(project.root, realpathSync(a));
    assert.equal(project.kind, "git repository");
    assert.deepEqual(await resolveProject(join(a, "src")), project);
    assert.deepEqual(await resolveProject(join(directory, "alias")), project);
    assert.notEqual((await resolveProject(b)).root, project.root);
    assert.equal((await resolveProject(directory)).kind, "folder scope");
    assert.match(projectText(project), /Project: a · git repository\nPath:/);
    await assert.rejects(resolveProject(join(directory, "missing")), /ENOENT/);
    mkdirSync(join(directory, "missing"));
    assert.equal((await resolveProject(join(directory, "missing"))).kind, "folder scope");
    execFileSync("git", ["init", "-q", join(a, "src")]);
    assert.deepEqual(await resolveProject(join(a, "src")), project);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("memory confirmation identifies its project before a write and project command does not need a database", async () => {
  let tool: any;
  let command: any;
  let confirmation = "";
  let output = "";
  memoryExtension({ on() {}, registerTool(value: unknown) { tool = value; }, registerCommand(_name: string, value: unknown) { command = value; } } as never);
  const ctx = { cwd: tmpdir(), hasUI: true, mode: "print", ui: {
    confirm: async (_title: string, detail: string) => { confirmation = detail; return false; },
    notify: (message: string) => { output = message; },
  } };
  await assert.rejects(tool.execute("id", { action: "save", scope: "project", content: "test" }, undefined, undefined, ctx), /cancelled/);
  assert.ok(confirmation.includes(`Path: ${(await resolveProject(ctx.cwd)).root}`));
  await command.handler("project", ctx);
  assert.ok(output.includes("Active memory project"));
  assert.ok(output.includes("folder scope"));
});
