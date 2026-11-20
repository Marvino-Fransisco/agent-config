import { stripVTControlCharacters } from "node:util";
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, Editor, HStack, Markdown, ScrollView, VStack, matchesKey, truncateToWidth, type Focusable, type Component, type OverlayHandle, type OverlayOptions, type TUI } from "@earendil-works/pi-tui";
import type { TutorHistory } from "./history.ts";
import { autocompleteHint, autocompleteTitle, ruleText } from "../shared/autocomplete-widget.ts";
import { tutorAutocomplete } from "./autocomplete.ts";
import { createTutorDialogs, getListTheme } from "./dialog.ts";
import { measureViewportHeight } from "./split.ts";

export const tutorActions = [
  ["f2", "rename", "F2 · Rename session"], ["f3", "history", "F3 · Open history"],
  ["f4", "handoff", "F4 · Prepare handoff"], ["f6", "new", "F6 · New session"], ["f8", "delete", "F8 · Delete session"],
] as const;
export type TutorAction = (typeof tutorActions)[number][1];
export type TutorHandle = Pick<OverlayHandle, "focus" | "unfocus" | "isFocused">;
export type TutorPhase = "ready" | "understanding" | "exploring" | "teaching" | "summarizing";
const phaseLabel: Record<TutorPhase, string> = {
  ready: "○ Ready to teach",
  understanding: "◉ Reading the question",
  exploring: "◉ Exploring code and context",
  teaching: "◉ Explaining step by step",
  summarizing: "◉ Summarizing the discussion",
};
export const safeText = (text: string) => stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
export const safeLine = (text: string) => safeText(text).replace(/[\n\t]+/g, " ").trim();

export const tutorOverlay: OverlayOptions = {
  anchor: "top-right", width: "50%", minWidth: 38, margin: { right: 1 },
  visible: (width, height) => width >= 42 && height >= 12, nonCapturing: true,
};

const editorBottom = "\0";

class TutorEditor extends Editor {
  protected renderBottomBorder(width: number, hidden: number) {
    return editorBottom + super.renderBottomBorder(width, hidden);
  }
}

export function createTutorPanel(tui: TUI, theme: Theme, callbacks: {
  root: string;
  handle: () => TutorHandle | undefined;
  split?: boolean;
  close: () => void;
  ask: (question: string) => boolean;
  cancel: () => void;
  action: (action: TutorAction | "menu") => void;
  read: () => { history?: TutorHistory; partial: string; status: string; phase: TutorPhase };
}): Component & Focusable & { dialogs: ReturnType<typeof createTutorDialogs> } {
  let focused = false;
  let searchError = "";
  const height = () => callbacks.split ? tui.terminal.rows : Math.max(12, tui.terminal.rows - 5);
  const maxChoices = () => Math.max(1, Math.min(5, height() - 11));
  const dialogs = createTutorDialogs(tui, theme, () => focused, maxChoices);
  const input = new TutorEditor(tui, { borderColor: (text) => frame(text), selectList: getListTheme(theme) });
  input.setAutocompleteMaxVisible(3);
  input.onChange = () => { searchError = ""; };
  input.setAutocompleteProvider(tutorAutocomplete(callbacks.root, [
    ...tutorActions.map(([, name, label]) => ({ name, description: label.split(" · ")[1] })),
    { name: "actions", description: "Open action menu" },
  ], (error) => { searchError = `File search failed: ${error instanceof Error ? error.message : String(error)}`; }));
  let scroll = 0;
  let page = 1;
  let hit = { dock: 0, input: 0, inputOffset: 0, inputRows: 0, dialog: 0, dialogRows: 0, widgetOffset: 0 };
  let cached: { width: number; history?: TutorHistory; lines: string[] } | undefined;

  const frame = (value: string) => theme.fg(focused ? "accent" : "border", value);
  const row = (value: string, width: number) => `${frame("│")} ${truncateToWidth(value, Math.max(1, width - 4), "…", true)} ${frame("│")}`;
  function rule(width: number, left: string, right: string, label = "") {
    return frame(`${left}${ruleText(Math.max(1, width - 2), label)}${right}`);
  }

  const header = (width: number) => [rule(width, "╭", "╮", "Tutor")];
  const markdownTheme = getMarkdownTheme();
  const userStyle = { color: (text: string) => theme.fg("userMessageText", text), bgColor: (text: string) => theme.bg("userMessageBg", text) };
  const partialMessage = new Markdown("", 1, 0, markdownTheme);

  function transcript(width: number): string[] {
    const { history, partial } = callbacks.read();
    if (!cached || cached.width !== width || cached.history !== history) {
      if (cached?.history?.id !== history?.id) {
        scroll = 0;
        scrollView?.scrollToEnd();
      }
      cached = {
        width, history,
        lines: [truncateToWidth(theme.fg("accent", safeLine(history?.title ?? "New session")), width), "",
          ...(history?.messages ?? []).flatMap(({ role, text }) => {
            const user = role === "user";
            return [...new Markdown(safeText(text), 1, user ? 1 : 0, markdownTheme, user ? userStyle : undefined,
              user ? { preserveOrderedListMarkers: true, preserveBackslashEscapes: true } : undefined).render(width), ""];
          })],
      };
    }
    if (!partial) return cached.lines;
    partialMessage.setText(safeText(partial));
    return [...cached.lines, ...partialMessage.render(width)];
  }

  const cell = (render: Component["render"]): Component => ({ render, invalidate() {} });
  const scrollView = callbacks.split ? new ScrollView(cell(transcript), { follow: "end", overscroll: "contain", scrollbar: "hidden" }) : undefined;

  function moveScroll(delta: number) {
    if (scrollView) scrollView.scrollBy(delta);
    else scroll = Math.max(0, scroll - delta);
    tui.requestRender();
  }

  function dock(width: number) {
    const { status, phase } = callbacks.read();
    const inner = Math.max(1, width - 4);
    const footer = theme.fg("dim", "^G Main · ^C Stop · Esc Close");
    const dialog = dialogs.active;
    input.focused = focused && !dialog;
    const rendered = input.render(inner);
    const bottom = rendered.findLastIndex((line) => line.startsWith(editorBottom));
    const suggestions = dialog ? [] : rendered.slice(bottom + 1);
    const content = dialog?.component.render(inner) ?? suggestions;
    const widget: string[] = [];
    const capacity = Math.max(1, height() - 9);
    const cursorRow = content.findIndex((line) => line.includes(CURSOR_MARKER));
    const offset = Math.max(0, cursorRow - capacity + 1);
    let shown = 0;
    if (content.length) {
      const { line, col } = input.getCursor();
      const commands = line === 0 && /^\/[a-z-]*$/i.test(input.getLines()[0]?.slice(0, col) ?? "");
      const visible = content.slice(offset, offset + capacity);
      shown = visible.length;
      widget.push(rule(width, "├", "┤", dialog?.title ?? autocompleteTitle("Tutor", commands)),
        ...visible.map((line) => row(line, width)), row(theme.fg("dim", dialog?.hint ?? autocompleteHint("Tutor", commands)), width));
    }
    const editorCapacity = Math.max(1, height() - widget.length - 7);
    const editorCursor = rendered.findIndex((line) => line.includes(CURSOR_MARKER));
    const inputOffset = Math.max(0, editorCursor - editorCapacity);
    const editorLines = rendered.slice(1 + inputOffset, Math.min(bottom, 1 + inputOffset + editorCapacity));
    const lines = [
      row(theme.fg(phase === "ready" ? "muted" : "accent", [phaseLabel[phase], safeLine(searchError || status)].filter(Boolean).join(" · ")), width),
      ...widget,
      rule(width, "├", "┤"),
      ...editorLines.map((line) => row(line, width)),
      rule(width, "├", "┤"),
      row(footer, width),
      rule(width, "╰", "╯"),
    ];
    const top = height() - lines.length;
    page = Math.max(0, top - 1);
    hit = { dock: top, input: height() - 3 - editorLines.length, inputOffset, inputRows: editorLines.length,
      dialog: top + 2, dialogRows: shown, widgetOffset: dialog ? offset : bottom + 1 };
    return lines;
  }

  const panel: Component & Focusable & { dialogs: typeof dialogs } = {
    dialogs,
    capturesViewportInput: true,
    get focused() { return focused; },
    set focused(value) {
      focused = value;
      const component = dialogs.active?.component;
      input.focused = value && !component;
      if (component && "focused" in component) component.focused = value;
      if (value) return;
      const handle = callbacks.handle();
      if (handle) queueMicrotask(() => { if (!handle.isFocused()) handle.unfocus(); });
    },
    invalidate() { cached = undefined; partialMessage.invalidate(); input.invalidate(); dialogs.active?.component.invalidate(); },
    handleInput(data) {
      const dialog = dialogs.active;
      if (matchesKey(data, "ctrl+g")) callbacks.handle()?.unfocus();
      else if (dialog) {
        if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) dialogs.cancel();
        else dialog.component.handleInput?.(data);
      } else if (input.isShowingAutocomplete() && (matchesKey(data, "escape") || matchesKey(data, "pageUp") || matchesKey(data, "pageDown"))) {
        input.handleInput(data);
      } else if (matchesKey(data, "escape")) callbacks.close();
      else if (matchesKey(data, "ctrl+c")) callbacks.cancel();
      else if (matchesKey(data, "pageUp")) moveScroll(-Math.max(1, page));
      else if (matchesKey(data, "pageDown")) moveScroll(Math.max(1, page));
      else {
        const command = tutorActions.find(([key]) => matchesKey(data, key));
        if (command) callbacks.action(command[1]);
        else input.handleInput(data);
      }
      tui.requestRender();
    },
    handleMouse(event) {
      const handle = callbacks.handle();
      const dialog = dialogs.active;
      const inContent = event.x >= 2 && event.x < event.width - 2;
      const innerEvent = { ...event, x: event.x - 2, width: Math.max(1, event.width - 4) };
      if (inContent && event.y >= hit.dialog && event.y < hit.dialog + hit.dialogRows) {
        const widget = dialog?.component ?? input;
        const result = widget.handleMouse?.({ ...innerEvent, y: event.y - hit.dialog + hit.widgetOffset, height: hit.dialogRows });
        if (result) return { ...result, handled: true, focus: event.button === "left" };
      }
      if (event.type === "wheel") {
        if (scrollView && inContent && event.y >= 1 && event.y < hit.dock) return;
        moveScroll(event.wheelDelta ?? 0);
        return { handled: true };
      }
      if (event.button !== "left") return;
      if (scrollView && event.type === "press" && (event.y === 0 || !inContent)) return { handled: true };
      if (event.type !== "click") return;
      if (!dialog && inContent && event.y >= hit.input && event.y < hit.input + hit.inputRows) {
        input.handleMouse({ ...innerEvent, y: event.y - hit.input + 1 + hit.inputOffset, height: hit.inputRows + 2 });
      }
      handle?.focus();
      return { handled: true, focus: true };
    },
    render(width) {
      const footer = dock(width);
      const lines = transcript(width - 4);
      scroll = Math.min(scroll, Math.max(0, lines.length - page));
      const end = lines.length - scroll;
      const visible = lines.slice(Math.max(0, end - page), end);
      return [
        ...header(width), ...visible.map((line) => row(line, width)),
        ...Array.from({ length: page - visible.length }, () => row("", width)), ...footer,
      ];
    },
  };
  input.onSubmit = (question) => {
    const action = tutorActions.find(([, name]) => question === `/${name}`);
    if (question === "/actions" || action) callbacks.action(action?.[1] ?? "menu");
    else if (question && !/^\/[a-z-]*$/i.test(question)) {
      if (!callbacks.ask(question)) { input.setText(question); return; }
      scroll = 0;
      scrollView?.scrollToEnd();
    }
  };
  if (!scrollView) return panel;
  const left = cell(() => Array.from({ length: height() }, () => `${frame("│")} `));
  const right = cell(() => Array.from({ length: height() }, () => ` ${frame("│")}`));
  const body = new HStack([{ component: left, basis: 2 }, { component: scrollView, basis: 0, grow: 1 }, { component: right, basis: 2 }]);
  const layout = new VStack([{ component: cell(header), basis: 1 }, { component: body, basis: 0, grow: 1 }, cell(dock)]);
  const viewport = Object.defineProperties(layout as VStack & typeof panel, Object.getOwnPropertyDescriptors(panel));
  viewport.render = measureViewportHeight(tui);
  return viewport;
}
