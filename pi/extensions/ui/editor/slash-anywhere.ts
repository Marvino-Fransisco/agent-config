import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

type Editor = { onSubmit?: (text: string) => void | Promise<void> };

export function slashToken(lines: string[], line: number, col: number) {
  const current = lines[line] ?? "";
  const prefix = current.slice(0, col).match(/(?:^|\s)(\/[\w:-]*)$/)?.[1];
  if (!prefix) return;
  const start = col - prefix.length;
  const end = col + (current.slice(col).match(/^[\w:-]*/)?.[0].length ?? 0);
  if (current[end] === "/" || current[end] === ".") return;
  const before = current.slice(0, start);
  const after = current.slice(end);
  const inline = line > 0 || Boolean(before.trim() || after.trim() || lines.slice(1).some((value) => value.trim()));
  return { prefix, before, after, inline };
}

export function createSlashAnywhere(pi: ExtensionAPI, ctx: ExtensionContext) {
  let native: AutocompleteProvider | undefined;
  let running = false;
  const ui = ctx.ui;
  const sourceOf = (name: string) => pi.getCommands().find((command) => command.name === name)?.source;
  const usesDraft = (name: string) => name.startsWith("skill:") || sourceOf(name) === "prompt";
  const readDraft = () => ui.getEditorText();

  async function run(name: string, editor: Editor) {
    if (running) return;
    if (name === "quit" && readDraft().trim()) { ui.notify("Send or clear your draft before quitting Pi.", "warning"); return; }
    running = true;
    try {
      if (sourceOf(name) === "extension") {
        pi.sendUserMessage(`/${name}`, { expandPromptTemplates: true });
        return;
      }
      if (!editor.onSubmit) throw new Error("Main editor cannot submit commands yet.");
      const draft = readDraft();
      try {
        await editor.onSubmit(`/${name}`);
      } finally {
        const current = readDraft();
        if (draft && current !== draft) ui.setEditorText(current ? `${draft}\n\n${current}` : draft);
      }
    } catch (error) {
      ui.notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      running = false;
    }
  }

  function wrap(provider: AutocompleteProvider, editor: Editor): AutocompleteProvider {
    native = provider;
    const slashItems = new WeakSet<AutocompleteItem>();
    return {
      triggerCharacters: provider.triggerCharacters,
      async getSuggestions(lines, line, col, options) {
        const token = slashToken(lines, line, col);
        if (!token) return provider.getSuggestions(lines, line, col, options);
        const matches = await provider.getSuggestions([token.prefix], 0, token.prefix.length, { ...options, force: false });
        if (!matches || matches.prefix !== token.prefix) return provider.getSuggestions(lines, line, col, options);
        const items = matches.items.map((item) => ({ ...item }));
        for (const item of items) slashItems.add(item);
        return { items, prefix: token.prefix.slice(1) };
      },
      applyCompletion(lines, line, col, item, prefix) {
        const token = slashToken(lines, line, col);
        if (!token || !slashItems.has(item)) return provider.applyCompletion(lines, line, col, item, prefix);
        const result = [...lines];
        const stageOnly = usesDraft(item.value);
        if (stageOnly && !token.inline) {
          result[line] = `${token.before}/${item.value} ${token.after}`;
          return { lines: result, cursorLine: line, cursorCol: token.before.length + item.value.length + 2 };
        }
        const after = !token.before || /\s$/.test(token.before) ? token.after.replace(/^[ \t]/, "") : token.after;
        result[line] = token.before + after;
        let cursorCol = token.before.length;
        if (stageOnly) {
          const invocation = `/${item.value} `;
          result[0] = invocation + result[0];
          if (line === 0) cursorCol += invocation.length;
        } else {
          queueMicrotask(() => { void run(item.value, editor); });
        }
        return { lines: result, cursorLine: line, cursorCol };
      },
      shouldTriggerFileCompletion(lines, line, col) {
        return Boolean(slashToken(lines, line, col)) || (provider.shouldTriggerFileCompletion?.(lines, line, col) ?? true);
      },
    };
  }

  async function pick(editor: Editor) {
    if (!native) return;
    try {
      const matches = await native.getSuggestions(["/"], 0, 1, { force: false, signal: new AbortController().signal });
      const choices = new Map(matches?.items.map((item) => [item.description ? `/${item.value} — ${item.description}` : `/${item.value}`, item.value]));
      if (!choices.size) return;
      const selection = await ui.select("Slash Anywhere", [...choices.keys()]);
      const name = selection ? choices.get(selection) : undefined;
      if (!name) return;
      if (usesDraft(name)) ui.setEditorText(`/${name} ${readDraft()}`);
      else await run(name, editor);
    } catch (error) {
      ui.notify(error instanceof Error ? error.message : String(error), "error");
    }
  }

  return { wrap, pick };
}
