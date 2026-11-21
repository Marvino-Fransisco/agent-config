import assert from "node:assert/strict";
import { test } from "node:test";
import { createSlashAnywhere, slashToken } from "../extensions/ui/editor/slash-anywhere.ts";

function harness() {
  let draft = "";
  let pickName = "skill:teach";
  const calls: string[] = [];
  const catalog = ["skill:teach", "reload", "task", "review"];
  const native = {
    async getSuggestions(lines: string[], line: number, col: number) {
      const prefix = lines[line].slice(0, col);
      if (!prefix.startsWith("/")) return null;
      return { prefix, items: catalog.filter((name) => name.replace(/^skill:/, "").startsWith(prefix.slice(1))).map((value) => ({ label: value, value })) };
    },
    applyCompletion() { assert.fail("Expected a Slash Anywhere completion"); },
  };
  const editor = { async onSubmit(command: string) { calls.push(command); await Promise.resolve(); draft = ""; } };
  const slash = createSlashAnywhere({
    getCommands: () => [{ name: "skill:teach", source: "skill" }, { name: "review", source: "prompt" }, { name: "task", source: "extension" }],
    sendUserMessage(command: string, options: { expandPromptTemplates: boolean }) {
      assert.equal(options.expandPromptTemplates, true);
      calls.push(command);
    },
  } as never, {
    isIdle: () => true,
    ui: {
      getEditorText: () => draft,
      setEditorText: (value: string) => { draft = value; },
      select: async (_title: string, choices: string[]) => choices.find((choice) => choice === `/${pickName}`),
      notify: assert.fail,
    },
  } as never);
  const provider = slash.wrap(native, editor);

  return {
    calls,
    draft: () => draft,
    setDraft: (value: string) => { draft = value; },
    pick: (name = "skill:teach") => { pickName = name; return slash.pick(editor); },
    async complete(value: string, line: number, col: number, name: string) {
      const lines = value.split("\n");
      const suggestions = await provider.getSuggestions(lines, line, col, { force: false, signal: new AbortController().signal });
      assert.ok(suggestions);
      assert.ok(!suggestions.prefix.startsWith("/"), "native Enter must delegate selection to Slash Anywhere");
      const dispatches = calls.length;
      const item = suggestions.items.find((item) => item.value === name);
      assert.ok(item);
      const result = provider.applyCompletion(lines, line, col, item, suggestions.prefix);
      draft = result.lines.join("\n");
      assert.equal(calls.length, dispatches, "dispatch must wait until the editor has applied the completion");
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  };
}

test("moves inline skills and templates to the start without submitting or losing surrounding text", async () => {
  const h = harness();
  await h.complete("Teach me\naccess /teach control", 1, 10, "skill:teach");
  assert.equal(h.draft(), "/skill:teach Teach me\naccess control");
  await h.complete("Use /rev the diff", 0, 8, "review");
  assert.equal(h.draft(), "/review Use the diff");
  await h.complete("/te", 0, 3, "skill:teach");
  assert.equal(h.draft(), "/skill:teach ");
  assert.deepEqual(h.calls, []);
  assert.equal(slashToken(["look /usr/bin"], 0, 9), undefined);
  assert.equal(slashToken(["see https://host/reload"], 0, 23), undefined);
});

test("runs selected commands separately and restores the draft after a native command clears Main", async () => {
  const h = harness();
  await h.complete("unfinished /rel draft", 0, 15, "reload");
  assert.deepEqual(h.calls, ["/reload"]);
  assert.equal(h.draft(), "unfinished draft");

  await h.complete("keep /ta the draft", 0, 8, "task");
  assert.deepEqual(h.calls, ["/reload", "/task"]);
  assert.equal(h.draft(), "keep the draft");

  await h.complete("/rel", 0, 4, "reload");
  assert.deepEqual(h.calls, ["/reload", "/task", "/reload"]);
  assert.equal(h.draft(), "");
});

test("the fallback picker runs commands and stages skills without submitting the draft", async () => {
  const h = harness();
  h.setDraft("a draft\nwith another line");
  await h.pick("reload");
  assert.equal(h.draft(), "a draft\nwith another line");
  await h.pick();
  assert.equal(h.draft(), "/skill:teach a draft\nwith another line");
  assert.deepEqual(h.calls, ["/reload"]);
});
