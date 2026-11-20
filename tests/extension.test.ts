// Drives the extension's hooks with a fake Pi API: no model calls.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import extension from "../extensions/task-memory/index.ts";
import { registerContextCommand } from "../extensions/ui/context.ts";
import memoryExtension from "../extensions/long-memory/index.ts";

type Handler = (event: unknown, ctx: unknown) => unknown;
type Entry = { type: string; customType?: string; details?: Record<string, unknown> };
type Result = { entries?: Entry[]; continue?: boolean; block?: boolean; message?: { content: string } } | undefined;
type ToolResult = { content: Array<{ text: string }>; terminate?: boolean };
type Tool = {
  prepareArguments: (args: unknown) => Record<string, unknown>;
  execute: (id: string, params: unknown, signal: unknown, onUpdate: unknown, ctx: unknown) => Promise<ToolResult>;
};

const dirs: string[] = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

function harness(mode: "tui" | "print") {
  const handlers = new Map<string, Handler[]>();
  let tool: Tool | undefined;
  let widget: { render: (width: number) => string[] } | undefined;
  let command: { handler: (args: string, ctx: unknown) => Promise<void> } | undefined;
  let panel: { render: (width: number) => string[]; handleInput: (data: string) => void; handleMouse: (event: { type: string; button: string; wheelDelta?: number }) => { handled?: boolean; focus?: boolean } | undefined } | undefined;
  let shortcut: { handler: (ctx: unknown) => Promise<void> } | undefined;
  let focused = false;
  let visible: ((width: number, height: number) => boolean) | undefined;
  const terminal = { columns: 120, rows: 30 };
  const tui = {
    terminal,
    requestRender: () => {},
    showOverlay: (component: typeof panel, options: { visible: typeof visible }) => {
      panel = component;
      visible = options.visible;
      return {
        hide: () => { panel = undefined; focused = false; },
        focus: () => { focused = true; },
        unfocus: () => { focused = false; },
        isFocused: () => focused,
      };
    },
  };
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tm-ext-"));
  dirs.push(cwd);
  fs.mkdirSync(path.join(cwd, ".git"));
  const usage = { percent: 5 as number | null };
  const notifications: string[] = [];
  const listeners = new Map<string, Array<(data: any) => void>>();
  const events = {
    on: (name: string, handler: (data: any) => void) => { listeners.set(name, [...(listeners.get(name) ?? []), handler]); return () => {}; },
    emit: (name: string, data: unknown) => { for (const handler of listeners.get(name) ?? []) handler(data); },
  };
  const git = { head: "abc123", branch: "main", status: "", diff: "" };
  const messages: Array<{ content: string }> = [];
  const userMessages: string[] = [];
  const branch: any[] = [];
  const settings: any = {};
  const pi = {
    events,
    on: (name: string, h: Handler) => { handlers.set(name, [...(handlers.get(name) ?? []), h]); return () => {}; },
    registerTool: (t: Tool) => { tool = t; },
    registerMessageRenderer: () => {},
    registerCommand: (name: string, c: typeof command) => { assert.notEqual(name, "close"); if (name === "task") command = c; },
    registerShortcut: (_key: string, s: typeof shortcut) => { shortcut = s; },
    exec: async (_cmd: string, args: string[]) => ({ code: 0, stdout: args.includes("rev-parse") ? git.head : args.includes("branch") ? git.branch : args.includes("diff") ? git.diff : git.status, stderr: "", killed: false }),
    getSettings: () => settings,
    appendEntry: (customType: string, data: unknown) => { branch.push({ type: "custom", id: `entry-${branch.length}`, customType, data }); },
    sendMessage: (message: { content: string }) => { messages.push(message); },
    sendUserMessage: (text: string) => { userMessages.push(text); },
  };
  const ctx = {
    cwd, mode, hasUI: mode === "tui",
    ui: { notify: (message: string) => { notifications.push(message); }, setWidget: (name: string, factory: (tui: unknown, theme: unknown) => { render: (width: number) => string[] }, options?: { placement: string }) => {
      if (name === "task-memory") assert.equal(options?.placement, "aboveEditor");
      const plain = (_color: string, text: string) => text;
      widget = factory(tui, { fg: plain, bg: plain });
    }, confirm: async () => true },
    isIdle: () => true,
    sessionManager: {
      getBranch: () => branch,
      getLeafId: () => branch.at(-1)?.id ?? null,
      buildSessionProjection: () => ({ messages: branch.flatMap((entry) => entry.message ? [entry.message] : []), entries: branch.map((entry) => ({ sourceEntry: entry, messages: entry.message ? [entry.message] : [] })) }),
    },
    getSystemPrompt: () => "system",
    getContextUsage: () => ({ tokens: null, contextWindow: 200000, percent: usage.percent }),
    model: { provider: "test", id: "test-model", reasoning: true, contextWindow: 200000 },
    thinkingLevel: "medium",
  };
  extension(pi as never);
  const emit = async (name: string, event: Record<string, unknown> = {}): Promise<Result> => {
    let r: unknown;
    for (const h of handlers.get(name) ?? []) r = await h({ type: name, ...event }, ctx);
    return r as Result;
  };
  const call = (args: Record<string, unknown>) => tool!.execute("id", tool!.prepareArguments(args), undefined, undefined, ctx);
  return { api: pi, emit, call, usage, settings, branch, cwd, terminal, notifications, git, messages, userMessages, events, ctx, widgetLines: () => widget!.render(120), command: (args: string) => command!.handler(args, ctx), panel: () => panel, focus: () => shortcut!.handler(ctx), isFocused: () => focused, visible: (width: number, height: number) => visible!(width, height) };
}

test("task widget separates the abort and undo-send prompts from its status", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  const idle = h.widgetLines()[0];
  assert.match(idle, /idle/);
  const prompt = { render: (width: number) => [`Abort current run? (${width})`], handled: false };
  h.events.emit("ui:abort-prompt", prompt);
  assert.equal(prompt.handled, true);
  assert.deepEqual(h.widgetLines().slice(0, 3), ["Abort current run? (120)", "", idle]);
  h.events.emit("ui:abort-prompt", { render: undefined, handled: false });
  assert.deepEqual(h.widgetLines(), [idle]);

  const pending = { text: "draft", indicator: "Esc to edit", handled: false };
  h.events.emit("undo-send:pending", pending);
  assert.equal(pending.handled, true);
  assert.deepEqual(h.widgetLines().slice(-3), ["Esc to edit", "", idle]);
  h.events.emit("undo-send:pending", { text: undefined, indicator: "", handled: false });
  assert.deepEqual(h.widgetLines(), [idle]);
});

test("widget reflects task changes made outside this session", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "External task", goal: "G" });
  assert.match(h.widgetLines()[0]!, /External task/);
  fs.rmSync(path.join(h.cwd, ".pi", "memory", "task.json"));
  assert.doesNotMatch(h.widgetLines()[0]!, /External task/);
  assert.match(h.widgetLines()[0]!, /no active task/i);
});

test("task notes update from disk, scroll and close on escape", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "Panel task", goal: "G", steps: Array.from({ length: 14 }, (_, i) => `step ${i}`) });
  await h.command("");
  const rows = h.panel()!.render(50);
  assert.match(rows.join("\n"), /Panel task/);
  const plainRows = rows.map((row) => row.replace(/\x1b\[[\d;]*m/g, ""));
  assert.ok(plainRows.every((row) => [...row].length === 50));
  assert.ok(plainRows.slice(1, -1).every((row) => (row.startsWith("┃") && row.endsWith("┃")) || (row.startsWith("┣") && row.endsWith("┫"))));
  assert.ok(rows.every((row) => row.startsWith("\x1b[38;2;90;175;255m")));
  assert.deepEqual(h.panel()!.handleMouse({ type: "press", button: "left" }), { handled: true, focus: true });
  assert.equal(h.isFocused(), true);
  assert.equal(h.visible(79, 30), false);
  assert.equal(h.visible(120, 11), false);
  assert.equal(h.visible(120, 30), true);
  await h.focus();
  assert.equal(h.isFocused(), true);
  h.panel()!.render(50);
  assert.deepEqual(h.panel()!.handleMouse({ type: "wheel", button: "none", wheelDelta: 1 }), { handled: true });
  assert.match(h.panel()!.render(50).join("\n"), /↕ 2–17/);
  h.panel()!.handleInput("escape");
  assert.equal(h.panel(), undefined);
  await h.command("");
  fs.rmSync(path.join(h.cwd, ".pi", "memory", "task.json"));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.match(h.panel()!.render(50).join("\n"), /No active task/);
  await h.command("");
  assert.equal(h.panel(), undefined);
  await h.emit("session_shutdown");
});

test("task panel has no cross-panel arrow navigation", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.command("");
  for (const key of ["h", "l", "left", "right", "ctrl+left", "ctrl+right"]) h.panel()!.handleInput(key);
  const text = h.panel()!.render(50).join("\n");
  assert.match(text, /\[task\]/);
  assert.doesNotMatch(text, /context|memory\]|←|→/);
  h.events.emit("ui:panel:opening", { name: "memory" });
  assert.equal(h.panel(), undefined);
  await h.emit("session_shutdown");
});

test("independent memory panel replaces task and preserves text editing keys", async () => {
  const h = harness("tui");
  let command: any;
  let contextCommand: any;
  registerContextCommand({ ...h.api, registerCommand: (_name: string, value: unknown) => { contextCommand = value; } } as never);
  memoryExtension({ ...h.api, registerTool() {}, registerCommand: (_name: string, value: unknown) => { command = value; } } as never);
  await h.emit("session_start");
  await h.command("");
  assert.match(h.panel()!.render(80).join("\n"), /\[task\]/);
  await command.handler("", h.ctx);
  assert.match(h.panel()!.render(80).join("\n"), /\[memory\]/);
  assert.doesNotMatch(h.panel()!.render(80).join("\n"), /\[task\]|context/);
  h.panel()!.handleInput("tab");
  assert.match(h.panel()!.render(80).join("\n"), /48;2;90;175;255m ⌕ SEARCH /);
  h.panel()!.handleInput("hello");
  assert.match(h.panel()!.render(80).join("\n"), /hello/);
  h.panel()!.handleInput("ctrl+left");
  assert.match(h.panel()!.render(80).join("\n"), /\[memory\]/);
  h.panel()!.handleInput("right");
  assert.match(h.panel()!.render(80).join("\n"), /hello/);
  h.panel()!.handleInput("escape");
  assert.equal(h.panel(), undefined);
  await command.handler("", h.ctx);
  assert.equal(h.isFocused(), true);
  await h.command("");
  assert.match(h.panel()!.render(80).join("\n"), /\[task\]/);
  await command.handler("", h.ctx);
  h.panel()!.handleInput("escape");
  assert.equal(h.panel(), undefined);
  await command.handler("", h.ctx);
  await contextCommand.handler("", h.ctx);
  assert.match(h.panel()!.render(80).join("\n"), /\[context\]/);
  await command.handler("", h.ctx);
  assert.match(h.panel()!.render(80).join("\n"), /\[memory\]/);
  await h.emit("session_shutdown");
  assert.equal(h.panel(), undefined);
});

test("context command opens its own panel and replaces task", async () => {
  const h = harness("tui");
  let command: any;
  registerContextCommand({ ...h.api, registerCommand: (_name: string, value: unknown) => { command = value; } } as never);
  await h.emit("session_start");
  await command.handler("", h.ctx);
  assert.match(h.panel()!.render(50).join("\n"), /Context grid unavailable/);
  assert.equal(h.isFocused(), true);
  await command.handler("", h.ctx);
  assert.equal(h.panel(), undefined);
  await h.command("");
  assert.match(h.panel()!.render(50).join("\n"), /No active task/);
  h.panel()!.handleInput("escape");
  assert.equal(h.panel(), undefined);
  await command.handler("", h.ctx);
  assert.match(h.panel()!.render(50).join("\n"), /Context grid unavailable/);
  assert.equal(h.isFocused(), true);
  h.panel()!.handleInput("escape");
  assert.equal(h.panel(), undefined);
  await h.emit("session_shutdown");
});

test("task phase row does not show the model", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  const row = h.widgetLines()[0]!.replace(/\x1b\[[\d;]*m/g, "");
  assert.match(row, /idle/);
  assert.doesNotMatch(row, /test-model/);
  const request = { available: false };
  h.events.emit("task-memory:footer:available", request);
  assert.equal(request.available, true);
  await h.emit("session_shutdown");
});

test("task tool persists and archives a completed task", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "Lifecycle", goal: "G", steps: ["work"] });
  await h.call({ action: "step", id: 1, status: "doing" });
  await h.call({ action: "step", id: 1, status: "done", evidence: "manual: verified" });
  assert.match((await h.call({ action: "finish", evidence: "manual: verified", docs: "none: internal" })).content[0]!.text, /archived/);
  assert.match((await h.call({ action: "show" })).content[0]!.text, /No active task/);
  assert.match(h.widgetLines()[0]!, /no active task/i);
});

const busy = { entries: [], toolResults: [{}], outcome: "completed" };
const ending = { entries: [], toolResults: [], outcome: "completed" };

test("75%: ignored handoff retains conversation and releases tools until Pi compacts", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G", steps: ["a", "b"] });
  h.usage.percent = 80;
  const r1 = await h.emit("turn_end", busy);
  assert.equal(r1?.entries?.[0]?.customType, "task-memory-must");
  assert.equal(r1?.continue, true);
  assert.equal((await h.emit("tool_call", { toolName: "read" }))?.block, true);
  assert.equal(await h.emit("tool_call", { toolName: "task" }), undefined);
  assert.equal(await h.emit("turn_end", busy), undefined);
  assert.equal(await h.emit("turn_end", busy), undefined);
  const r4 = await h.emit("turn_end", busy);
  assert.equal(r4, undefined);
  assert.equal(await h.emit("tool_call", { toolName: "read" }), undefined);
  assert.equal(await h.emit("turn_end", busy), undefined);
  assert.equal(await h.emit("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
  assert.equal(await h.emit("session_before_compact", { reason: "manual", preparation: {} }), undefined);
  await h.emit("session_compact");
  h.usage.percent = 5;
  await h.emit("turn_end", busy);
  h.usage.percent = 80;
  assert.equal((await h.emit("turn_end", busy))?.entries?.[0]?.customType, "task-memory-must");
});

test("checkpoint without `action` is inferred; mandatory handoff compacts mid-run", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G", steps: ["a"] });
  h.usage.percent = 80;
  await h.emit("turn_end", busy);
  const res = await h.call({ next: "do a", readNow: [{ path: "x.ts", reason: "r" }], compact: true });
  assert.equal(res.terminate, false);
  assert.match(res.content[0]!.text, /Handoff #1 saved/);
  const r = await h.emit("turn_end", busy);
  assert.equal(r?.entries?.[0]?.type, "compaction");
  assert.equal(r?.entries?.[0]?.details?.checkpoint, 1);
});

test("TUI: warning at the end of a run asks for a handoff; the checkpoint stops the run; no task is created", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  h.usage.percent = 55;
  assert.equal(await h.emit("turn_end", ending), undefined);
  const s = await h.emit("agent_before_settle", { entries: [], outcome: "completed" });
  assert.equal(s?.entries?.[0]?.customType, "task-memory-handoff");
  assert.equal(s?.continue, true);
  const res = await h.call({ action: "checkpoint", next: "nothing left" });
  assert.equal(res.terminate, true);
  assert.equal(fs.existsSync(path.join(h.cwd, ".pi", "memory", "task.json")), false);
});

test("resume detects changed Git state and conversation branch navigation", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  h.git.status = " M a.ts\n";
  await h.call({ action: "checkpoint", next: "continue" });
  h.git.head = "def456";
  h.git.branch = "feature";
  await h.command("resume");
  assert.match(h.messages.at(-1)!.content, /HEAD changed: abc123 -> def456/);
  assert.match(h.messages.at(-1)!.content, /branch changed: main -> feature/);
  assert.match(h.messages.at(-1)!.content, /Dirty file contents can change/);
  await h.emit("session_tree");
  assert.match((await h.emit("before_agent_start"))!.message!.content, /Conversation branch changed/);
});

test("progress sync detects Git changes and ignores project-only updates", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  const file = path.join(h.cwd, "existing.ts");
  fs.writeFileSync(file, "original");
  fs.utimesSync(file, 1000, 1000);
  h.git.status = " M existing.ts\0?? new.ts\0";
  await h.emit("agent_start");
  assert.equal(await h.emit("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
  fs.writeFileSync(file, "changed!");
  fs.utimesSync(file, 1000, 1000);
  await h.call({ action: "update", project: { notes: ["a convention"] } });
  const result = await h.emit("agent_before_settle", { entries: [], outcome: "completed" });
  assert.equal(result?.entries?.[0]?.customType, "task-memory-sync");
});

test("clear-archive deletes archived tasks and keeps the active task", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "Old", goal: "G" });
  await h.call({ action: "finish", evidence: "manual: ok", docs: "none: x" });
  await h.call({ action: "start", title: "Current", goal: "G" });
  const archive = path.join(h.cwd, ".pi", "memory", "archive");
  fs.writeFileSync(path.join(archive, "keep.txt"), "x");
  await h.command("clear-archive");
  assert.match(h.notifications.at(-1)!, /Deleted 1 archived task/);
  assert.deepEqual(fs.readdirSync(archive), ["keep.txt"]);
  assert.match((await h.call({ action: "show" })).content[0]!.text, /Task: Current/);
});

test("progress sync is requested once per batch of edits", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  await h.emit("agent_start");
  await h.emit("tool_execution_start", { toolName: "edit", toolCallId: "edit1", args: { path: "a.ts" } });
  await h.emit("tool_execution_end", { toolName: "edit", toolCallId: "edit1", isError: false });
  assert.equal((await h.emit("agent_before_settle", { entries: [], outcome: "completed" }))?.entries?.[0]?.customType, "task-memory-sync");
  await h.emit("agent_settled");
  await h.emit("agent_start");
  assert.equal(await h.emit("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
});

test("task changes after a checkpoint invalidate its compaction summary", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G", steps: ["a"] });
  await h.call({ action: "checkpoint", next: "do a" });
  await h.call({ action: "show" });
  const compact = { reason: "threshold", preparation: { firstKeptEntryId: "x", tokensBefore: 1 } };
  assert.ok((await h.emit("session_before_compact", compact) as { compaction?: unknown } | undefined)?.compaction);
  await h.emit("session_compact_failed");
  await h.call({ action: "step", id: 1, status: "done", evidence: "manual: ok" });
  assert.equal(await h.emit("session_before_compact", compact), undefined);
});

test("project-only updates do not acknowledge tracked edits", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  await h.emit("agent_start");
  await h.emit("tool_execution_start", { toolName: "edit", toolCallId: "edit1", args: { path: "a.ts" } });
  await h.emit("tool_execution_end", { toolName: "edit", toolCallId: "edit1", isError: false });
  await h.call({ action: "update", project: { notes: ["project fact"] } });
  assert.equal((await h.emit("agent_before_settle", { entries: [], outcome: "completed" }))?.entries?.[0]?.customType, "task-memory-sync");
});

test("unreadable memory is reported rather than treated as empty", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  fs.writeFileSync(path.join(h.cwd, ".pi", "memory", "task.json"), "{");
  await h.emit("session_start");
  assert.match((await h.emit("before_agent_start"))!.message!.content, /failed to load memory/);
  await h.command("resume");
  assert.match(h.notifications.at(-1)!, /failed to load memory/);
  await h.emit("session_compact");
  assert.match(h.messages.at(-1)!.content, /failed to load memory after compaction/);
});

test("working star animates beside the current phase and stops when settled", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.emit("agent_start");
  const first = h.widgetLines()[0]!;
  assert.match(first.replace(/\x1b\[[\d;]*m/g, ""), /· thinking/);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const second = h.widgetLines()[0]!;
  assert.notEqual(first.split("\x1b[39m")[0], second.split("\x1b[39m")[0]);
  await h.emit("tool_execution_start", { toolName: "edit", toolCallId: "icon-edit", args: { path: "a.ts" } });
  assert.match(h.widgetLines()[0]!.replace(/\x1b\[[\d;]*m/g, ""), /coding/);
  await h.emit("agent_settled");
  assert.match(h.widgetLines()[0]!.replace(/\x1b\[[\d;]*m/g, ""), /○ idle/);
});

test("threshold command validates, persists and applies independent values", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.command("threshold");
  assert.match(h.notifications.at(-1)!, /warning 50%, mandatory 75%/);
  await h.command("threshold warning 20");
  await h.command("threshold mandatory 65");
  await h.command("threshold warning 70");
  assert.match(h.notifications.at(-1)!, /lower than mandatory/);
  await h.command("threshold must nope");
  assert.match(h.notifications.at(-1)!, /Usage/);
  await h.emit("session_start");
  await h.command("threshold");
  assert.match(h.notifications.at(-1)!, /warning 20%, mandatory 65%/);
  h.usage.percent = 20;
  assert.equal((await h.emit("turn_end", busy))?.entries?.[0]?.customType, "task-memory-warn");
  h.usage.percent = 65;
  assert.equal((await h.emit("turn_end", busy))?.entries?.[0]?.customType, "task-memory-must");
});

test("oversized required handoffs do not overwrite the saved checkpoint", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  h.ctx.model.contextWindow = 8000;
  h.settings.compaction = { reserveTokens: 512 };
  await h.call({ action: "start", title: "T", goal: "G" });
  await h.call({ action: "checkpoint", next: "saved next" });
  const file = path.join(h.cwd, ".pi", "memory", "task.json");
  const before = fs.readFileSync(file, "utf8");
  await assert.rejects(h.call({ action: "checkpoint", next: "unsafe next", context: "critical ".repeat(130), compact: true }), /Required handoff content/);
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("compaction rejects clipped checkpoint fields without saving partial critical context", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  const file = path.join(h.cwd, ".pi", "memory", "task.json");
  const before = fs.readFileSync(file, "utf8");
  await assert.rejects(h.call({ action: "checkpoint", next: "continue", context: "x".repeat(1300), compact: true }), /storage limits/);
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("compaction preserves context when state changes or other tools share the checkpoint turn", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  await h.call({ action: "checkpoint", next: "continue", compact: true });
  await h.call({ action: "update", notes: ["state changed"] });
  assert.equal(await h.emit("turn_end", busy), undefined);
  assert.match(h.notifications.at(-1)!, /state changed after/);
  await h.call({ action: "checkpoint", next: "continue", compact: true });
  assert.equal(await h.emit("turn_end", { ...busy, toolResults: [{ toolName: "read" }, { toolName: "task" }] }), undefined);
  assert.match(h.notifications.at(-1)!, /shared a turn/);
});

test("manual fresh handoffs use a budgeted retain-none marker instead of Pi's large cutoff", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  await h.call({ action: "checkpoint", next: "continue" });
  const result = await h.emit("session_before_compact", { reason: "manual", preparation: { firstKeptEntryId: "unsafe-old-cut", tokensBefore: 100, settings: { enabled: true, reserveTokens: 16384, keepRecentTokens: 0 } } }) as { compaction?: { firstKeptEntryId: string; summary: string } };
  assert.equal(h.branch.at(-1)?.customType, "task-memory-retain-none");
  assert.equal(result.compaction?.firstKeptEntryId, h.branch.at(-1)?.id);
  assert.match(result.compaction!.summary, /Next: continue/);
});

test("automatic compaction does not repeat without new work and invalid reserves fail clearly", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  const event = { reason: "threshold", preparation: {} };
  assert.equal(await h.emit("session_before_compact", event), undefined);
  assert.equal((await h.emit("session_before_compact", event) as { cancel?: boolean })?.cancel, true);
  h.branch.push({ type: "message", id: "new-request", message: { role: "user", content: "continue" } });
  assert.equal(await h.emit("session_before_compact", event), undefined);
  h.ctx.model.contextWindow = 8000;
  assert.equal((await h.emit("session_before_compact", event) as { cancel?: boolean })?.cancel, true);
  assert.match(h.notifications.at(-1)!, /reserveTokens/);
});

test("saved-state injection is bounded and recalculated when the model changes", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "T", goal: "G" });
  await h.call({ action: "update", project: { notes: Array.from({ length: 10 }, (_, i) => `${i}: ${"optional ".repeat(30)}`) } });
  await h.call({ action: "checkpoint", next: "Review project notes" });
  h.ctx.model.contextWindow = 16000;
  h.settings.compaction = { reserveTokens: 512 };
  await h.emit("session_start");
  const first = (await h.emit("before_agent_start"))?.message?.content ?? "";
  assert.ok(first.length > 0);
  assert.ok(Math.ceil((first.length + 2) / 4) * 1.2 <= 640);
  const full = fs.readFileSync(path.join(h.cwd, ".pi", "memory", "project.json"), "utf8");
  assert.ok(full.includes("optional"));
  h.ctx.model.contextWindow = 8000;
  await h.emit("model_select");
  const small = (await h.emit("before_agent_start"))?.message?.content ?? "";
  assert.match(small, /Next: Review project notes/);
  assert.ok(Math.ceil((small.length + 2) / 4) * 1.2 <= 320);
  assert.equal(fs.readFileSync(path.join(h.cwd, ".pi", "memory", "project.json"), "utf8"), full);
});

test("resume budgets projected message content without counting tool metadata", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "Resume with tool metadata", goal: "G" });
  await h.call({ action: "checkpoint", next: "Continue" });
  h.ctx.model.contextWindow = 8000;
  h.settings.compaction = { reserveTokens: 512 };
  h.branch.push({ type: "message", id: "tool", message: {
    role: "toolResult", content: [{ type: "text", text: "Short tool output" }], details: { largeMetadata: "x".repeat(100_000) },
  } });
  await h.emit("model_select");
  assert.match((await h.emit("before_agent_start"))?.message?.content ?? "", /Task: Resume with tool metadata/);
});

test("crowded branches skip automatic injection without a warning or changing saved state", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.call({ action: "start", title: "Resume after compaction", goal: "G" });
  const file = path.join(h.cwd, ".pi", "memory", "task.json");
  const saved = fs.readFileSync(file, "utf8");
  h.ctx.model.contextWindow = 8000;
  h.settings.compaction = { reserveTokens: 512 };
  h.branch.push({ type: "message", id: "large", message: { role: "user", content: "x".repeat(20_000) } });
  const noticeCount = h.notifications.length;
  await h.emit("session_tree");
  assert.equal(await h.emit("before_agent_start"), undefined);
  h.branch[0].message.content = "x".repeat(11_300);
  await h.emit("model_select");
  assert.equal(await h.emit("before_agent_start"), undefined);
  await h.emit("session_compact");
  assert.equal(h.messages.length, 0);
  assert.equal(h.notifications.length, noticeCount);
  await h.command("resume");
  assert.match(h.notifications.at(-1) ?? "", /does not fit the current context budget/);
  assert.equal(h.messages.length, 0);
  assert.equal(h.userMessages.length, 0);
  assert.equal(fs.readFileSync(file, "utf8"), saved);
  h.branch.length = 0;
  await h.emit("session_compact");
  assert.match(h.messages.at(-1)?.content ?? "", /Task: Resume after compaction/);
  assert.equal(fs.readFileSync(file, "utf8"), saved);
});

test("external edits warn without switching projects and legacy task state is not migrated", async () => {
  const h = harness("tui");
  await h.emit("session_start");
  await h.emit("tool_execution_start", { toolName: "edit", toolCallId: "outside", args: { path: path.join(h.cwd, "..", "outside.ts") } });
  await h.emit("tool_execution_end", { toolName: "edit", toolCallId: "outside", isError: false });
  assert.ok(h.notifications.some((message) => message.includes("Memory still belongs to")));
  await h.call({ action: "start", title: "Original task", goal: "G" });
  const original = fs.readFileSync(path.join(h.cwd, ".pi", "memory", "task.json"), "utf8");
  const nested = path.join(h.cwd, "nested");
  fs.mkdirSync(nested);
  h.ctx.cwd = nested;
  await h.emit("session_start");
  assert.match(h.notifications.at(-1)!, /No files were moved/);
  await assert.rejects(h.call({ action: "show" }), /existing state belongs to/);
  assert.equal(fs.readFileSync(path.join(h.cwd, ".pi", "memory", "task.json"), "utf8"), original);
  assert.equal(fs.existsSync(path.join(nested, ".pi", "memory", "task.json")), false);
});

test("print mode: no extra turn or lossy compaction after the final answer", async () => {
  const h = harness("print");
  await h.emit("session_start");
  h.usage.percent = 55;
  assert.equal(await h.emit("turn_end", ending), undefined);
  assert.equal(await h.emit("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
  await h.emit("agent_settled");
  h.usage.percent = 80;
  const r = await h.emit("turn_end", ending);
  assert.equal(r, undefined);
  assert.equal(await h.emit("agent_before_settle", { entries: [], outcome: "completed" }), undefined);
});
