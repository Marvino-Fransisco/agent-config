// Minimal stand-ins for Pi's packages: just enough to load task-memory/index.ts in tests.
import { stripVTControlCharacters } from "node:util";
import { Type } from "typebox";

export const StringEnum = (values) => Type.Union(values.map((v) => Type.Literal(v)));
export const estimateTokens = (message) => Math.ceil(JSON.stringify(message.content ?? message.summary ?? "").length / 4);
export const getCurrentSystemMessage = (messages) => messages.findLast((message) => message.role === "system");
export const DEFAULT_COMPACTION_SETTINGS = { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 };
export const getMarkdownTheme = () => Object.fromEntries(
  "heading link linkUrl code codeBlock codeBlockBorder quote quoteBorder hr listBullet bold italic underline strikethrough"
    .split(" ").map((name) => [name, (text) => text]),
);

export function findCutPoint(_entries, startIndex) {
  return { firstKeptEntryIndex: startIndex, turnStartIndex: -1, isSplitTurn: false };
}

export class CustomEditor {
  constructor(tui) { this.tui = tui; }
  handleInput(data) { this.lastInput = data; }
  render() { return this.lines ?? []; }
  getText() { return this.text ?? ""; }
  getLines() { return this.getText().split("\n"); }
  getCursor() { const lines = this.getLines(); return { line: lines.length - 1, col: lines.at(-1).length }; }
  borderColor(text) { return text; }
  handleMouse(event) { this.lastMouse = event; }
  isShowingAutocomplete() { return this.autocomplete ?? false; }
}

export class Input {
  focused = false;
  value = "";
  constructor(options = {}) { this.prompt = options.prompt ?? "> "; }
  handleInput(data) { if (data === "return") this.onSubmit?.(this.value); else this.value += data; }
  getValue() { return this.value; }
  setValue(value) { this.value = value; }
  render() { return [this.prompt + this.value]; }
  invalidate() {}
}

export class Editor extends Input {
  setText(text) { this.setValue(text); }
}

export class SelectList {
  index = 0;
  constructor(items) { this.items = items; this.filtered = items; }
  setFilter(query) { this.filtered = this.items.filter(({ value }) => value.startsWith(query)); this.index = 0; }
  getSelectedItem() { return this.filtered[this.index] ?? null; }
  render() { return this.filtered.map(({ label }) => label); }
  invalidate() {}
  handleInput(data) {
    if (data === "down") this.index = Math.min(this.index + 1, this.filtered.length - 1);
    if (data === "return" && this.getSelectedItem()) this.onSelect?.(this.getSelectedItem());
  }
}

export class VStack {
  constructor(entries) {
    this.entries = entries.map((entry) => entry.component ? entry : { component: entry });
    this.children = this.entries.map((entry) => entry.component);
  }
  invalidate() {}
}
export class HStack extends VStack {}
export class ScrollView extends VStack {
  constructor(child, options) { super([child]); this.options = options; }
  scrollToEnd() {}
  scrollBy() {}
}
export const CURSOR_MARKER = "\x1b_pi:c\x07";
export const isViewportTUI = (tui) => typeof tui.setLayoutRoot === "function";

export class Text {
  constructor(text) { this.text = text; }
  render() { return [this.text]; }
  invalidate() {}
}

export const truncateToWidth = (s, width, _ellipsis, pad) => pad ? s + " ".repeat(Math.max(0, width - visibleWidth(s))) : s;
export const visibleWidth = (s) => [...stripVTControlCharacters(s)].length;
export const sliceByColumn = (s, start, length) => [...s].slice(start, start + length).join("");
export const matchesKey = (data, key) => data === key;
export const wrapTextWithAnsi = (s, width) => s.match(new RegExp(`.{1,${width}}`, "gu")) ?? [""];
export const Key = { ctrlAlt: (key) => `ctrl+alt+${key}` };
export const VERSION = "test";
