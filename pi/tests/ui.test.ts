import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import assert from "node:assert/strict";
import extension from "../extensions/ui/index.ts";
import { PipeCursorEditor } from "../extensions/ui/editor/pipe-cursor-editor.ts";
import { contextReport, registerContextCommand } from "../extensions/ui/context.ts";
import { registerDashboard } from "../extensions/ui/dashboard.ts";
import { createNotes } from "../extensions/task-memory/ui/notes.ts";

test("installs the editor, footer and topbar with shared branch data", () => {
  const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
  let editor: any;
  let footer: any;
  let widget: any;
  let widgetPlacement: string | undefined;
  let placeAbortPrompt: ((prompt: { render?: (width: number) => string[]; handled: boolean }) => void) | undefined;
  const footerData = { getGitBranch: () => "main", onBranchChange: () => () => {} };
  const ctx = {
    mode: "tui",
    ui: {
      setWorkingIndicator: () => {},
      setEditorComponent: (factory: (...args: unknown[]) => unknown) => { editor = factory({ requestRender() {} }, {}, { matches: (data: string) => data === "escape" }); },
      setFooter: (factory: (...args: unknown[]) => unknown) => { footer = factory({}, {}, footerData); },
      setWidget: (_name: string, factory: (...args: unknown[]) => unknown, options: { placement: string }) => { widget = factory({ requestRender() {} }, {}); widgetPlacement = options.placement; },
      setHeader: () => {},
    },
    getContextUsage: () => ({ percent: 30 }),
    isIdle: () => false,
    sessionManager: { getCwd: () => "/project", getBranch: () => [] },
    model: { id: "test-model", reasoning: true },
    thinkingLevel: "medium",
  };
  extension({
    registerCommand: () => {}, registerShortcut: () => {}, getCommands: () => [],
    on: (name: string, handler: (event: unknown, ctx: unknown) => void) => { handlers.set(name, handler); },
    events: {
      on: () => () => {},
      emit: (name: string, data: any) => { if (name === "ui:abort-prompt") placeAbortPrompt?.(data); },
    },
  } as never);
  handlers.get("session_start")!({}, ctx);
  editor.lines = ["───", "input", "───", "suggestion"];
  editor.autocomplete = true;
  editor.text = "read @";
  assert.match(editor.render(80).join("\n"), /^ Find files .*\nsuggestion\n↑↓ Select · Enter Insert · Tab Complete · Esc Close\n───/);
  editor.handleMouse({ y: 1 });
  assert.equal(editor.lastMouse.y, 3);
  editor.text = "/";
  assert.match(editor.render(80).join("\n"), /^ Main commands .*\nsuggestion\n↑↓ Select · Enter\/Tab: run command or stage skill · Esc Close\n───/);
  editor.text = "explain /te";
  assert.match(editor.render(80).join("\n"), /^ Main commands /);
  assert.deepEqual([0, 1, 2, 3, 4, 5].filter((row) => editor.isInputRule(row)), [3, 5]);
  editor.handleMouse({ y: 1 });
  assert.equal(editor.lastMouse.y, 3);
  editor.handleMouse({ y: 4 });
  assert.equal(editor.lastMouse.y, 1);
  assert.deepEqual(footer.render(100), []);
  const row = stripVTControlCharacters(widget.render(100)[0]);
  assert.match(row, /^\/project \(main\) +test-model • medium$/);
  assert.equal(row.length, 100);
  assert.equal(widgetPlacement, "belowEditor");
  editor.autocomplete = false;
  editor.handleInput("escape");
  assert.match(editor.render(80)[0], /Abort current run/);
  handlers.get("agent_settled")!({}, ctx);
  assert.doesNotMatch(editor.render(80).join("\n"), /Abort current run/);

  let taskPrompt: ((width: number) => string[]) | undefined;
  placeAbortPrompt = (prompt) => { taskPrompt = prompt.render; prompt.handled = true; };
  editor.handleInput("escape");
  assert.match(taskPrompt?.(80)[0] ?? "", /Abort current run/);
  assert.doesNotMatch(editor.render(80).join("\n"), /Abort current run/);
  handlers.get("agent_settled")!({}, ctx);
  assert.equal(taskPrompt, undefined);
});

test("only Enter confirms abort; dismissing or typing keeps the run and draft intact", () => {
  let idle = false;
  let aborts = 0;
  const editor = new PipeCursorEditor(
    { isIdle: () => idle, abort: () => { aborts++; } },
    { requestRender() {} } as never,
    {} as never,
    { matches: (data: string) => data === "escape" } as never,
  );
  editor.handleInput("escape");
  assert.equal(aborts, 0);
  assert.match(editor.render(80).join("\n"), /Enter to abort · Esc to keep running/);
  editor.handleInput("escape");
  assert.deepEqual(editor.render(80), []);
  editor.handleInput("escape");
  editor.handleInput("x");
  assert.equal((editor as any).lastInput, "x");
  assert.deepEqual(editor.render(80), []);
  editor.handleInput("enter");
  assert.equal(aborts, 0);
  editor.handleInput("escape");
  editor.handleInput("enter");
  assert.equal(aborts, 1);
  assert.deepEqual(editor.render(80), []);

  editor.handleInput("escape");
  idle = true;
  editor.handleInput("enter");
  assert.equal(aborts, 1);
  assert.equal((editor as any).lastInput, "enter");
  editor.handleInput("escape");
  assert.equal((editor as any).lastInput, "escape");
  assert.deepEqual(editor.render(80), []);
});

test("fresh session dashboard shows a blue cat and session details, then slides away on the first message", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const handlers = new Map<string, (event: unknown, ctx: unknown) => void>();
  let header: any;
  let overlay: any;
  let options: any;
  let branch: Array<{ type: string }> = [];
  const tui = {
    terminal: { rows: 40, columns: 100 },
    requestRender() {},
    showOverlay: (component: unknown, opts: unknown) => { overlay = component; options = opts; return { hide: () => { overlay = undefined; } }; },
  };
  const ctx = {
    mode: "tui",
    ui: { setHeader: (factory: any) => { header?.dispose?.(); header = factory?.(tui, {}); } },
    sessionManager: { getCwd: () => "/project", getBranch: () => branch },
    model: { id: "test-model", reasoning: true },
    thinkingLevel: "high",
  };
  const listeners = new Map<string, () => void>();
  registerDashboard({
    on: (name: string, handler: (event: unknown, ctx: unknown) => void) => { handlers.set(name, handler); },
    events: { on: (name: string, handler: () => void) => listeners.set(name, handler) },
  } as never, () => ({ getGitBranch: () => "main" }) as never);

  handlers.get("session_start")!({ reason: "startup" }, ctx);
  assert.deepEqual(header.render(100), []);
  const lines: string[] = overlay.render(100);
  assert.equal(options.nonCapturing, true);
  assert.equal(options.row, Math.floor((40 - 6 - lines.length) / 2));
  assert.ok(lines[0]!.includes("\x1b[38;2;90;175;255m▟▙"));
  assert.deepEqual(lines.map((line) => stripVTControlCharacters(line).trimStart()), [
    "▟▙        ▟▙",
    "████████████   pi coding agent vtest",
    "█▄   ▄▄   ▄█   test-model • high",
    "▀████████▀    /project (main)",
  ]);
  assert.deepEqual(overlay.render(24).slice(-3).map((line: string) => stripVTControlCharacters(line).trim()), [
    "pi coding agent vtest",
    "test-model • high",
    "/project (main)",
  ]);
  overlay.render(100);

  const start = options.row;
  handlers.get("input")!({ text: "hi" }, ctx);
  t.mock.timers.tick(150);
  overlay.render(100);
  assert.ok(options.row < start);
  t.mock.timers.tick(300);
  assert.equal(overlay, undefined);

  handlers.get("session_start")!({ reason: "new" }, ctx);
  assert.ok(overlay);
  listeners.get("ui:tutor:split")?.();
  assert.equal(overlay, undefined);

  branch = [{ type: "message" }];
  handlers.get("session_start")!({ reason: "new" }, ctx);
  assert.equal(header, undefined);
  assert.equal(overlay, undefined);
});

test("context report ranks only projected tool results and labels estimates", () => {
  const entries = [
    { messages: [{ role: "toolResult", toolName: "read", content: [{ type: "text", text: "a".repeat(80) }] }] },
    { messages: [{ role: "toolResult", toolName: "bash", content: [{ type: "text", text: "a".repeat(400) }] }] },
    { messages: [{ role: "compactionSummary", summary: "previous work" }] },
    { messages: [] },
  ];
  const ctx = { model: { id: "model", contextWindow: 1000 }, getContextUsage: () => ({ tokens: 100, contextWindow: 1000, percent: 10 }), getSystemPrompt: () => "abcd", sessionManager: { buildSessionProjection: () => ({ entries }) } };
  const lines = contextReport(ctx as never, 100, 100);
  const report = lines.join("\n");
  const grid = lines.slice(0, 10).map((line) => line.split("  ")[0]).join("");
  assert.equal((grid.match(/[⛀⛁]/g) ?? []).length, 20);
  assert.equal((grid.match(/⛝/g) ?? []).length, 20);
  assert.match(lines[0]!, /model/);
  assert.match(report, /100 \/ 1,000 tokens \(10.0%\)/);
  assert.match(report, /Summaries:/);
  assert.doesNotMatch(report, /Context usage|Legend: at least one symbol|Grid is approximate/);
  assert.ok(report.includes("\x1b[38;2;"));
  assert.match(report, /Unattributed/);
  assert.match(report, /Free space/);
  assert.match(report, /Configured Pi reserve: 100/);
  assert.ok(report.indexOf(" bash:") < report.indexOf(" read:"));
  assert.ok(report.includes("\x1b[38;2;105;180;255m◆\x1b[39m bash:"));
  assert.ok(report.includes("\x1b[38;2;95;225;220m◆\x1b[39m read:"));
});

test("context grid gives small non-zero categories visible dots", () => {
  const ctx = {
    model: { id: "model", contextWindow: 1_000_000 },
    getContextUsage: () => ({ tokens: 23, contextWindow: 1_000_000, percent: 0.0023 }),
    getSystemPrompt: () => "x".repeat(18_816),
    sessionManager: { buildSessionProjection: () => ({ entries: [{ messages: [{ role: "user", content: "hello" }] }] }) },
  };
  const lines = contextReport(ctx as never);
  const grid = lines.slice(0, 10).map((line) => line.split("  ")[0]).join("");
  assert.ok(grid.includes("\x1b[38;2;105;180;255m⛀"));
  assert.ok(grid.includes("\x1b[38;2;95;225;220m⛁"));
  assert.equal((grid.match(/[⛀⛁]/g) ?? []).length, 2);
  assert.equal((grid.match(/⛶/g) ?? []).length, 198);
  assert.doesNotMatch(lines.join("\n"), /at least one symbol per non-zero category/);
  const narrow = contextReport(ctx as never, 70);
  assert.doesNotMatch(narrow[0]!, /model/);
  assert.ok(narrow.slice(0, 10).every((row) => row.split("⛶").length > 1));
});

test("context report resolves model-specific and disabled compaction reserves", () => {
  let onRead: (request: any) => void = () => {};
  let settings: any = { compaction: { reserveTokens: 100, modelOverrides: { "provider/model": { reserveTokens: 200 } } } };
  const pi = { events: { on: (_name: string, handler: typeof onRead) => { onRead = handler; } }, getSettings: () => settings, registerCommand() {} };
  registerContextCommand(pi as never);
  const ctx = { model: { provider: "provider", id: "model", contextWindow: 1000 }, getContextUsage: () => ({ tokens: 100, contextWindow: 1000, percent: 10 }), getSystemPrompt: () => "", sessionManager: { buildSessionProjection: () => ({ entries: [] }) } };
  const read = () => { const request: { ctx: typeof ctx; width: number; lines?: string[] } = { ctx, width: 100 }; onRead(request); return request.lines!.join("\n"); };
  assert.match(read(), /Configured Pi reserve: 200/);
  settings = { compaction: { enabled: false } };
  assert.match(read(), /Auto-compaction reserve: disabled/);
  settings = {};
  assert.match(read(), /Configured Pi reserve: 16,384/);
  const unknown = contextReport({ ...ctx, getContextUsage: () => undefined } as never).join("\n");
  assert.match(unknown, /Context grid unavailable until usage is known/);
  assert.match(unknown, /Free space: unknown/);
});

test("context panel recomputes layout when its width changes", () => {
  let panel: any;
  const widths: number[] = [];
  let overlayWidth: string | undefined;
  let focused = false;
  let hidden = false;
  const tui = { terminal: { columns: 120, rows: 30 }, requestRender() {}, showOverlay(component: unknown, options: { width: string }) { panel = component; overlayWidth = options.width; return { hide() { hidden = true; focused = false; }, focus() { focused = true; }, unfocus() { focused = false; }, isFocused: () => focused }; } };
  const notes = createNotes(tui as never, { fg: (_color: string, text: string) => text } as never, (width) => { widths.push(width); return `width ${width}`; }, () => {}, "context");
  notes.open();
  assert.equal(overlayWidth, "65%");
  panel.render(100);
  panel.render(80);
  panel.render(80);
  assert.deepEqual(widths.slice(-2), [96, 76]);
  panel.handleInput("escape");
  assert.equal(focused, false);
  assert.equal(hidden, true);
  notes.open();
  assert.equal(focused, true);
  notes.close();
});

test("shared panels show blue icon headings and update the scroll position", () => {
  for (const [title, icon] of [["task", "☑"], ["context", "☷"], ["usage", "▣"]]) {
    let panel: any;
    const tui = {
      terminal: { columns: 120, rows: 12 }, requestRender() {},
      showOverlay(component: unknown) { panel = component; return { hide() {}, focus() {}, isFocused: () => true }; },
    };
    const notes = createNotes(tui as never, { fg: (_color: string, text: string) => text } as never,
      () => Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n"), () => {}, title);
    try {
      notes.open();
      const lines: string[] = panel.render(80);
      assert.match(lines[0]!, new RegExp(`\\x1b\\[38;2;90;175;255m\\x1b\\[1m ${icon} \\[${title}\\]`));
      assert.ok(lines.length <= tui.terminal.rows);
      const separators = lines.map(stripVTControlCharacters).filter((row) => row.startsWith("┣"));
      assert.deepEqual(separators, Array(2).fill(`┣${"━".repeat(78)}┫`));
      assert.match(lines.join("\n"), /↕ 1–4 \/ 30/);
      panel.handleInput("down");
      assert.match(panel.render(80).join("\n"), /↕ 2–5 \/ 30/);
      panel.handleMouse({ type: "wheel", wheelDelta: 3 });
      assert.match(panel.render(80).join("\n"), /↕ 5–8 \/ 30/);
    } finally { notes.close(); }
  }
});

test("context command opens a scrollable TUI and closes without starting an agent turn", async () => {
  let command: any;
  let closed = false;
  const ctx = {
    mode: "tui", model: undefined, getContextUsage: () => undefined, getSystemPrompt: () => "",
    sessionManager: { buildSessionProjection: () => ({ entries: [] }) },
    ui: { custom: async (factory: any) => {
      const component = factory({ terminal: { rows: 10 }, requestRender() {} }, { fg: (_color: string, text: string) => text }, {}, () => { closed = true; });
      assert.match(component.render(100).join("\n"), /Context grid unavailable/);
      component.handleInput("down");
      component.handleInput("q");
    } },
  };
  registerContextCommand({ registerCommand: (_name: string, value: unknown) => { command = value; } } as never);
  await command.handler("", ctx);
  assert.equal(closed, true);
});

test("context fallback announces replacement without depending on task-memory", async () => {
  let command: any;
  let opening = "";
  const events = { on() {}, emit(name: string, request: { name: string }) { if (name === "ui:panel:opening") opening = request.name; } };
  registerContextCommand({ events, registerCommand: (_name: string, value: unknown) => { command = value; } } as never);
  await command.handler("", { mode: "tui", model: undefined, getContextUsage: () => undefined, getSystemPrompt: () => "", sessionManager: { buildSessionProjection: () => ({ entries: [] }) }, ui: { custom() {} } });
  assert.equal(opening, "context");
});

test("working indicator is hidden only when the task widget is available", () => {
  const handlers = new Map<string, (event: unknown, ctx: any) => void>();
  const visibility: boolean[] = [];
  let available = true;
  const ctx = { mode: "tui", ui: {
    setWorkingVisible: (value: boolean) => { visibility.push(value); },
    setEditorComponent: () => {}, setFooter: () => {}, setWidget: () => {},
  } };
  const events = { on() {}, emit(name: string, request: { available: boolean }) { if (name === "task-memory:footer:available") request.available = available; } };
  extension({ events, registerCommand: () => {}, registerShortcut: () => {}, on: (name: string, handler: (event: unknown, ctx: any) => void) => { handlers.set(name, handler); } } as never);
  handlers.get("agent_start")!({}, ctx);
  available = false;
  handlers.get("agent_start")!({}, ctx);
  handlers.get("session_shutdown")!({}, ctx);
  assert.deepEqual(visibility, [false, true, true]);
});
