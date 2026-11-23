import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ScrollView, VStack } from "@earendil-works/pi-tui";
import extension from "../extensions/tutor/index.ts";
import { captureMain, searchMain } from "../extensions/tutor/context.ts";
import { inspectPath, searchFiles, tutorTools } from "../extensions/tutor/files.ts";
import { tutorAutocomplete } from "../extensions/tutor/autocomplete.ts";
import { createTutorStore } from "../extensions/tutor/history.ts";
import { createTutorPanel } from "../extensions/tutor/panel.ts";
import { splitTutor } from "../extensions/tutor/split.ts";

type Branch = ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
function entry(id: string, role: string, text: string) {
  return { type: "message", id, message: { role, content: [{ type: "text", text }] } };
}

test("freezes the main branch, prefills only recent text and looks up older evidence by ID", () => {
  const entries = [
    entry("old", "assistant", "The original withdrawal decision was conditional."),
    entry("old-2", "user", "Btw, withdrawal was already discussed"),
    entry("hidden", "user", "passphrase"),
    entry("edited", "user", "old spelling"),
    { type: "context_edit", targetId: "hidden", replacement: null },
    { type: "context_edit", targetId: "edited", replacement: { content: "new spelling" } },
    entry("tool", "toolResult", "raw tool output"),
    { type: "compaction", id: "summary", summary: "Earlier business discussion" },
    ...Array.from({ length: 11 }, (_, i) => entry(`recent-${i}`, "assistant", `Recent question ${i}`)),
  ];
  const snapshot = captureMain(entries as Branch);
  entries.push(entry("new", "assistant", "new after opening"));
  assert.match(snapshot.recent, /Earlier business discussion/);
  assert.match(snapshot.recent, /Recent question 10/);
  assert.doesNotMatch(snapshot.recent, /original withdrawal|Recent question 0/);
  assert.deepEqual(searchMain(snapshot, "WITHDRAWAL").map(({ id }) => id), ["old-2", "old"]);
  assert.deepEqual(searchMain(snapshot, "withdrawal", "old-2").map(({ id }) => id), ["old"]);
  assert.deepEqual(searchMain(snapshot, "new spelling").map(({ id }) => id), ["edited"]);
  assert.equal(searchMain(snapshot, "old spelling").length, 0);
  assert.equal(searchMain(snapshot, "passphrase").length, 0);
  assert.equal(searchMain(snapshot, "raw tool output").length, 0);
  assert.equal(searchMain(snapshot, "new after opening").length, 0);
});

test("history is private JSON, project-scoped, reopenable, renameable and deletable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "tutor-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "project-a");
  const other = join(directory, "project-b");
  await mkdir(root);
  await mkdir(other);
  const store = createTutorStore(root);
  const first = store.create("First", { role: "user", text: "Why?" });
  const secondStore = createTutorStore(root);
  secondStore.rename(first.id, "Enrollment rules");
  const saved = store.append(first.id, { role: "assistant", text: "It depends." });
  assert.equal(saved.title, "Enrollment rules");
  const file = join(root, ".pi", "tutor-history", `${first.id}.json`);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), saved);
  assert.deepEqual(secondStore.list(), [saved]);
  assert.deepEqual(createTutorStore(other).list(), []);
  assert.deepEqual(await readdir(other), []);
  await symlink(join(root, ".pi"), join(other, ".pi"));
  assert.throws(() => createTutorStore(other).create("Escape", { role: "user", text: "No write" }), /requires a real directory/);
  assert.throws(() => createTutorStore(other).list(), /requires a real directory/);
  store.remove(first.id);
  assert.deepEqual(secondStore.list(), []);
  assert.throws(() => secondStore.append(first.id, { role: "user", text: "No resurrection" }), /ENOENT/);
  assert.throws(() => store.load("../outside"), /Invalid/);
});

test("workspace tools cite line numbers and refuse paths escaping the workspace", async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "tutor-tools-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "project");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "policy.ts"), "export const policy = 1;\nconst allowWithdrawal = true;\n");
  await writeFile(join(directory, "outside.txt"), "secret text");
  await symlink(directory, join(root, "escape"));
  assert.match(await inspectPath(root, "src/policy.ts", 2, 1), /2: const allowWithdrawal/);
  assert.match(await inspectPath(root, "src"), /policy\.ts/);
  assert.match(await searchFiles(root, "allowwithdrawal"), /src\/policy\.ts:2:/);
  assert.equal(await searchFiles(root, "policy.ts", ".", undefined, true), "src/policy.ts");
  assert.doesNotMatch(await searchFiles(root, "secret text"), /outside/);
  await assert.rejects(inspectPath(root, "../outside.txt"), /outside the Tutor workspace/);
  await assert.rejects(inspectPath(root, "escape/outside.txt"), /outside the Tutor workspace/);
  await assert.rejects(searchFiles(root, "secret", "escape"), /outside the Tutor workspace/);
  const stored = createTutorStore(root).create("Prior chat", { role: "user", text: "Private transcript" });
  const savedPath = join(".pi", "tutor-history", `${stored.id}.json`);
  await symlink(join(root, savedPath), join(root, "alias.json"));
  assert.doesNotMatch(await inspectPath(root, ".pi"), /tutor-history/);
  assert.doesNotMatch(await searchFiles(root, "Private transcript", ".pi"), /tutor-history/);
  await assert.rejects(inspectPath(root, savedPath), /Tutor history/);
  await assert.rejects(inspectPath(root, "alias.json"), /Tutor history/);
  await writeFile(join(root, "src", "withdrawal policy.md"), "reference only");
  const provider = tutorAutocomplete(root, [], assert.fail);
  const options = { signal: new AbortController().signal };
  const files = await provider.getSuggestions(["@"], 0, 1, options);
  assert.deepEqual(files?.items.map(({ description }) => description).sort(), ["src/policy.ts", "src/withdrawal policy.md"]);
  const line = 'check @"withdrawal next';
  const column = line.indexOf(" next");
  const suggestions = await provider.getSuggestions([line], 0, column, options);
  assert.equal(suggestions?.items[0].value, '@"src/withdrawal policy.md"');
  assert.equal(provider.applyCompletion([line], 0, column, suggestions!.items[0], suggestions!.prefix).lines[0],
    'check @"src/withdrawal policy.md"  next');
  assert.deepEqual(tutorTools(root).map(({ name }) => name), ["read", "ls", "grep", "find"]);
});

test("Tutor wheel scrolls without taking focus, and losing focus clears automatic refocus", async () => {
  const history = { id: "session", title: "Scroll test", updatedAt: "", messages: [{
    role: "assistant" as const, text: Array.from({ length: 35 }, (_, i) => `scroll-row-${i}`).join("\n\n"),
  }] };
  let focused = false;
  let released = false;
  const actions: string[] = [];
  const panel = createTutorPanel({ terminal: { rows: 24 }, requestRender() {} } as never,
    { fg: (_color: string, value: string) => value } as never, {
      root: process.cwd(), close() {}, ask: () => assert.fail("Local actions must not become prompts"), cancel() {},
      action: (action) => actions.push(action),
      read: () => ({ history, partial: "", status: "", phase: "ready" }),
      handle: () => ({
        focus: () => { focused = true; }, isFocused: () => focused,
        unfocus: () => { released = true; },
      } as never),
    });
  assert.match(panel.render(50).join("\n"), /scroll-row-34/);
  assert.deepEqual(panel.handleMouse?.({ type: "wheel", wheelDelta: -10 } as never), { handled: true });
  assert.doesNotMatch(panel.render(50).join("\n"), /scroll-row-34/);
  assert.equal(focused, false);
  assert.deepEqual(panel.handleMouse?.({ type: "click", button: "left", x: 5, y: 1, width: 50 } as never),
    { handled: true, focus: true });
  assert.equal(focused, true);
  panel.focused = true;
  panel.focused = false;
  focused = false;
  await Promise.resolve();
  assert.equal(released, true);
  const frame = panel.render(60);
  assert.match(frame[0], /^╭ Tutor /);
  assert.doesNotMatch(frame.join("\n"), /│ > /);
  assert.match(frame.join("\n"), /\^G Main · \^C Stop · Esc Close/);
  assert.doesNotMatch(frame.join("\n"), /Ctrl\+O/);
  panel.handleInput?.("\x0f");
  assert.deepEqual(actions, []);
  panel.handleInput?.("/");
  await sleep(10);
  assert.match(panel.render(60).join("\n"), /Ready to teach[\s\S]+Tutor commands[\s\S]+rename[\s\S]+history/);
  assert.doesNotMatch(panel.render(60).join("\n"), /settings/);
  for (const letter of "histo") panel.handleInput?.(letter);
  await sleep(10);
  assert.doesNotMatch(panel.render(60).join("\n"), /rename/);
  panel.handleInput?.("\t");
  assert.deepEqual(actions, []);
  panel.handleInput?.("\r");
  for (const letter of "/unknown") panel.handleInput?.(letter);
  panel.handleInput?.("\r");
  panel.handleInput?.("\x1b");
  assert.deepEqual(actions, ["history"]);
});

test("the split keeps the native viewport and routes clicks in the main pane to the main editor", async () => {
  const empty = { render: () => [], invalidate() {} };
  const transcript = new ScrollView(empty);
  const editor = { ...empty, handleInput() {}, isInputRule: (row: number) => row === 0 || row === 2 };
  const editorHost = {
    ...empty, children: [editor],
    render: (width: number) => ["─".repeat(width), "draft", "─".repeat(width)],
    handleMouse: ({ x, width }: { x: number; width: number }) => { assert.deepEqual([x, width], [4, 55]); return { handled: true }; },
  };
  const main = new VStack([transcript, new VStack([editorHost])]);
  main.render = empty.render;
  const tutor = { ...empty, handleInput() {}, isInputRule: () => false };
  let focused = editor;
  const tui = {
    terminal: { columns: 120, rows: 32 }, layoutRoot: main,
    setLayoutRoot(root: typeof main) { this.layoutRoot = root; },
    getFocusedComponent: () => focused, setFocus(component: typeof editor) { focused = component; },
    requestRender() {},
  };
  const split = splitTutor(tui as never, { fg: (_role: string, text: string) => text } as never, tutor)!;
  assert.notEqual(tui.layoutRoot, main);
  const root = tui.layoutRoot as any;
  assert.equal(root.entries[0].visible(), true);
  const columns = root.children[0];
  assert.deepEqual(columns.entries.map((entry: { basis: number }) => entry.basis), [59, 60]);
  const [mainBody, mainDock] = columns.children[0].children[1].children;
  assert.deepEqual(mainBody.entries.map(({ basis }: { basis: number }) => basis), [2, 0, 2]);
  assert.equal(mainBody.children[0].render(2)[0], "│ ");
  assert.equal(mainBody.children[2].render(2)[0], " │");
  const rules = `├${"─".repeat(57)}┤`;
  assert.deepEqual(mainDock.children[0].render(59), [rules, `│ ${"draft".padEnd(55)} │`, rules]);
  assert.deepEqual(mainDock.children[0].handleMouse({ x: 6, width: 59 }), { handled: true });
  const mainBranch = mainBody.children[1];
  assert.equal(mainBranch.children[0], transcript);
  assert.equal(mainBranch.render(60).length, 32);
  assert.equal(mainBranch.render(60), mainBranch.render(60));
  split.handle.focus();
  assert.equal(focused, tutor);
  columns.children[0].handleMouse({ type: "click", button: "left" });
  assert.equal(focused, editor);
  split.handle.focus();
  split.handle.unfocus();
  assert.equal(focused, editor);
  assert.equal(tui.layoutRoot, root);
  split.handle.focus();
  tui.terminal.columns = 70;
  assert.equal(root.entries[0].visible(), false);
  await Promise.resolve();
  assert.equal(focused, editor);
  split.close();
  assert.equal(tui.layoutRoot, main);
});

test("Tutor routes session title selection through its transcript, not the viewport frame", () => {
  const panel = createTutorPanel({ terminal: { rows: 24 }, requestRender() {} } as never,
    { fg: (_color: string, text: string) => text } as never, {
      root: process.cwd(), split: true, close() {}, ask: () => false, cancel() {}, action() {}, handle: () => undefined,
      read: () => ({ partial: "", status: "", phase: "ready" }),
    });
  const press = { type: "press", button: "left", x: 5, width: 60 } as const;
  assert.equal(panel.handleMouse?.({ ...press, y: 0 } as never)?.handled, true);
  assert.equal(panel.handleMouse?.({ ...press, y: 1 } as never), undefined);
});

test("Tutor uses frozen history and fills the Main draft only after handoff confirmation", async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "tutor-ui-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q", directory]);
  const cwd = join(directory, "src");
  await mkdir(cwd);
  await writeFile(join(directory, "Reference File.ts"), "not automatically attached");
  await writeFile(join(directory, "GLOSSARY.md"), "## Withdrawal\nAliases: WD\nCancels an active enrollment.\n\n## Invoice\nRequests payment.\n");
  const model = { id: "mock", provider: "test", api: "test-api" };
  const branch = [entry("old", "assistant", "Enrollment withdrawal needs an approval."),
    ...Array.from({ length: 10 }, (_, i) => entry(`other-${i}`, "user", `Unrelated ${i}`))];
  let shortcut: (ctx: any) => void;
  let shutdown: () => void;
  let panel: any;
  let focused = false;
  const frames: string[] = [];
  const requests: any[] = [];
  let mainDraft = "Existing Main draft";
  let editorWrites = 0;
  let overlayClosed = false;
  let panelOpening: (data: { name: string }) => void;
  const control = {
    focus() { focused = true; }, unfocus() { focused = false; }, isFocused() { return focused; },
  };
  const ctx = {
    mode: "tui", cwd, model,
    sessionManager: { getBranch: () => branch, getSessionId: () => "main" },
    modelRegistry: {
      streamSimple(_model: unknown, context: any) {
        requests.push(context);
        const content = requests.length === 1
          ? [
            { type: "toolCall", id: "lookup", name: "search_main_history", arguments: { query: "withdrawal" } },
            { type: "toolCall", id: "glossary", name: "domain_glossary", arguments: { query: "WD" } },
          ]
          : [{ type: "text", text: requests.length === 2 ? "Explanation with reference to main entry old." : "Suggested summary" }];
        const reply = { role: "assistant", content, api: model.api, model: model.id, provider: model.provider,
          stopReason: requests.length === 1 ? "toolUse" : "stop", timestamp: Date.now() };
        return { async *[Symbol.asyncIterator]() {
          if (content[0].type === "text") {
            yield { type: "start", partial: reply };
            yield { type: "text_delta", contentIndex: 0, delta: content[0].text, partial: reply };
          }
        }, result: async () => reply };
      },
    },
    ui: {
      notify(_message: string, type: string) { assert.notEqual(type, "error"); },
      getEditorText: () => mainDraft,
      setEditorText(text: string) { mainDraft = text; editorWrites++; },
      custom(factory: any, options: any) {
        return new Promise<void>((resolve) => {
          panel = factory({ terminal: { rows: 24, columns: 120 }, requestRender() {
            if (panel) frames.push(panel.render(60).join("\n"));
          } }, { fg: (_kind: string, text: string) => text, bg: (_kind: string, text: string) => `\x1b[44m${text}\x1b[49m` }, {}, () => {
            focused = false;
            overlayClosed = true;
            resolve();
          });
          options.onHandle(control);
        });
      },
      select: () => assert.fail("Tutor must not open dialogs in Main"),
      input: () => assert.fail("Tutor must not open dialogs in Main"),
      editor: () => assert.fail("Tutor must not open dialogs in Main"),
      confirm: () => assert.fail("Tutor must not open dialogs in Main"),
    },
  };
  extension({
    registerCommand() {},
    registerShortcut(_key: string, options: { handler: typeof shortcut }) { shortcut = options.handler; },
    on(_name: string, callback: typeof shutdown) { shutdown = callback; },
    events: { on(name: string, callback: typeof panelOpening) {
      if (name === "ui:panel:opening") panelOpening = callback;
    } },
    sendMessage() { assert.fail("Handoff must not dispatch or queue a message"); },
  } as never);
  async function until(check: () => boolean) {
    for (let i = 0; i < 100; i++) {
      if (check()) return;
      await sleep(10);
    }
    assert.fail(panel?.render(60).join("\n") ?? "Panel never opened");
  }
  shortcut!(ctx);
  await until(() => focused);
  panel.handleInput("\x07");
  assert.equal(focused, false);
  shortcut!(ctx);
  assert.equal(focused, true);
  for (const letter of "/actions") panel.handleInput(letter);
  await until(() => panel.render(60).some((line: string) => line.includes("Tutor commands")));
  panel.handleInput("\r");
  assert.match(panel.render(60).join("\n"), /Ready to teach[\s\S]+Tutor actions[\s\S]+\^G Main/);
  panel.handleInput("\x1b");
  await until(() => !panel.dialogs.active);
  branch.push(entry("post-open", "user", "Another withdrawal note"));
  for (const letter of "Explain the previous decision in @reference") panel.handleInput(letter);
  await until(() => panel.render(60).some((line: string) => line.includes("Find files")));
  assert.match(panel.render(60).join("\n"), /Ready to teach[\s\S]+Find files/);
  panel.handleInput("\r");
  assert.equal(requests.length, 0);
  assert.match(panel.render(60).join("\n"), /@"Reference File.ts"/);
  panel.handleInput("\r");
  await until(() => {
    const frame = panel.render(60).join("\n");
    return frame.includes("Explanation with reference") && frame.includes("Ready to teach");
  });
  assert.ok(frames.some((frame) => frame.includes("Reading the question")));
  assert.ok(frames.some((frame) => frame.includes("Exploring code and context")));
  assert.ok(frames.some((frame) => frame.includes("Explaining step by step")));
  assert.ok(panel.render(60).some((line: string) => line.includes("\x1b[44m") && line.includes("Explain the previous decision")));
  assert.doesNotMatch(panel.render(60).join("\n"), /│\s+(You|Tutor)\s+│/);
  const [saved] = await readdir(join(directory, ".pi", "tutor-history"));
  assert.match(await readFile(join(directory, ".pi", "tutor-history", saved), "utf8"), /Explanation with reference/);
  assert.deepEqual(await readdir(cwd), []);
  assert.match(JSON.stringify(requests[0].messages.find(({ role }: { role: string }) => role === "system")), /Always write Tutor replies and handoff summaries in English/);
  const defaultPrompt = requests[0].messages[0].content;
  assert.doesNotMatch(defaultPrompt, /When explaining a question or recommendation from another agent|zone of proximal development/);
  assert.doesNotMatch(JSON.stringify(requests[0]), /needs an approval|post-open|not automatically attached|Cancels an active enrollment/);
  assert.match(JSON.stringify(requests[0]), /Explain the previous decision in @.*Reference File\.ts/);
  assert.match(JSON.stringify(requests[1]), /needs an approval/);
  assert.match(JSON.stringify(requests[1]), /Cancels an active enrollment/);
  assert.doesNotMatch(JSON.stringify(requests[1]), /post-open|Requests payment/);
  assert.equal(editorWrites, 0);
  panel.handleInput("\x1bOS");
  await until(() => panel.dialogs.active?.title.startsWith("Review or edit"));
  assert.ok(frames.some((frame) => frame.includes("Summarizing the discussion")));
  assert.match(JSON.stringify(requests[2].messages), /for the main agent, in English/);
  assert.equal(requests[2].messages[0].content, defaultPrompt);
  panel.handleInput("\r");
  await until(() => panel.dialogs.active?.title.startsWith("Insert handoff"));
  assert.match(panel.render(60).join("\n"), /Insert draft and focus Main/);
  panel.handleInput("\r");
  await Promise.resolve();
  assert.equal(editorWrites, 0);
  assert.equal(focused, true);
  assert.equal(overlayClosed, false);
  panel.handleInput("\x1bOS");
  await until(() => panel.dialogs.active?.title.startsWith("Review or edit"));
  panel.dialogs.active.component.setText("Edited summary");
  panel.handleInput("\r");
  await until(() => panel.dialogs.active?.title.startsWith("Insert handoff"));
  assert.equal(editorWrites, 0);
  panel.handleInput("\x1b[B");
  panel.handleInput("\r");
  await until(() => overlayClosed);
  assert.equal(focused, false);
  assert.equal(editorWrites, 1);
  assert.equal(mainDraft, "Existing Main draft\n\nTutor discussion summary (approved by the user):\n\nEdited summary");
  shortcut!(ctx);
  await until(() => focused);
  for (const letter of "/te") panel.handleInput(letter);
  await until(() => panel.render(60).some((line: string) => line.includes("Use the Teach skill in chat")));
  panel.handleInput("\t");
  for (const letter of "spaced repetition") panel.handleInput(letter);
  panel.handleInput("\r");
  await until(() => requests.length === 5 && panel.render(60).join("\n").includes("Ready to teach"));
  const teachPrompt = requests[4].messages[0];
  assert.match(teachPrompt.content, /zone of proximal development/);
  assert.match(teachPrompt.content, /in chat only[\s\S]*do not create or update files[\s\S]*\/skill:teach in Main/);
  assert.ok(teachPrompt.content.includes(JSON.stringify(cwd)));
  assert.deepEqual(teachPrompt.toolsAdded.map(({ name }: { name: string }) => name), ["read", "ls", "grep", "find", "search_main_history", "domain_glossary"]);
  assert.deepEqual(await readdir(cwd), []);
  assert.equal(editorWrites, 1);
  overlayClosed = false;
  panelOpening!({ name: "context" });
  assert.equal(focused, true);
  panelOpening!({ name: "decision" });
  assert.equal(overlayClosed, true);
  assert.equal(focused, false);
  shortcut!(ctx);
  await until(() => focused);
  shutdown!();
});
