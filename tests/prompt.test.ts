import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import promptExtension from "../extensions/prompt/index.ts";

async function install(cwd: string) {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const notifications: string[] = [];
  let command: (...args: any[]) => unknown;
  let overlay: any;
  let options: any;
  const theme = { fg: (_kind: string, text: string) => text };
  const tui = {
    terminal: { columns: 100, rows: 30 }, requestRender() {},
    showOverlay(component: any, layout: any) {
      overlay = component;
      options = layout;
      return { hide() { overlay = undefined; }, focus() {}, isFocused() { return true; } };
    },
  };
  const ctx = { cwd, mode: "tui", ui: {
    setWidget: (_name: string, create: (...args: any[]) => unknown) => create(tui, theme),
    notify: (message: string) => notifications.push(message),
  } };
  promptExtension({
    on: (name: string, handler: (...args: any[]) => unknown) => handlers.set(name, handler),
    events: { on() {}, emit() {} },
    registerCommand(name: string, config: { handler: typeof command }) {
      assert.equal(name, "prompt");
      command = config.handler;
    },
  } as never);
  await handlers.get("session_start")?.({}, ctx);
  return {
    send: async (message: unknown) => handlers.get("message_start")?.({ message }, ctx),
    open: async () => command!("", ctx),
    shutdown: () => handlers.get("session_shutdown")?.({}, ctx),
    get overlay() { return overlay; }, get options() { return options; }, notifications,
  };
}

test("only sent user messages replace the project prompt, and /prompt opens and closes the saved text", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "last-prompt-")));
  const cwd = join(root, "subfolder");
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", root]);
  await mkdir(cwd);
  const path = join(root, ".pi", "last-prompt.txt");
  const ui = await install(cwd);
  t.after(ui.shutdown);
  await ui.open();
  assert.equal(ui.options.anchor, "top-right");
  assert.match(ui.overlay.render(60).join("\n"), /Belum ada prompt/);
  ui.overlay.handleInput("escape");
  assert.equal(ui.overlay, undefined);
  await assert.rejects(stat(path), { code: "ENOENT" });
  await ui.send({ role: "user", content: "First prompt" });
  assert.equal(await readFile(path, "utf8"), "First prompt");
  await ui.send({ role: "assistant", content: "Ignored" });
  assert.equal(await readFile(path, "utf8"), "First prompt");
  await ui.send({ role: "user", content: [{ type: "image", data: "binary omitted" }, { type: "text", text: "Second\nline" }] });
  assert.equal(await readFile(path, "utf8"), "Second\nline");
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(join(root, ".pi")), ["last-prompt.txt"]);
  assert.deepEqual(await readdir(cwd), []);
  const anotherSession = await install(cwd);
  t.after(anotherSession.shutdown);
  await anotherSession.open();
  assert.match(anotherSession.overlay.render(60).join("\n"), /Second[^\n]*\n[^\n]*line/);
  assert.deepEqual(ui.notifications, []);
});
