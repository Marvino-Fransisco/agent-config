import type { Theme } from "@earendil-works/pi-coding-agent";
import { HStack, ScrollView, VStack, isViewportTUI, truncateToWidth, type Component, type TUI, type ViewportTUI } from "@earendil-works/pi-tui";
import { ruleText } from "../shared/autocomplete-widget.ts";

export function measureViewportHeight(tui: TUI): () => string[] {
  let rows: string[] = [];
  return () => {
    if (rows.length !== tui.terminal.rows) rows = Array<string>(tui.terminal.rows).fill("");
    return rows;
  };
}

export const canSplit = (width: number, height: number) => width >= 76 && height >= 12;

type LayoutHost = ViewportTUI & {
  layoutRoot: Component;
  getFocusedComponent(): Component | null;
};

class SplitColumns extends HStack {
  resize(width: number) {
    const left = Math.floor((width - 1) / 2);
    this.entries[0].basis = left;
    this.entries[1].basis = width - 1 - left;
  }
}

export function splitTutor(tui: TUI, theme: Theme, tutor: Component) {
  if (!isViewportTUI(tui) || !canSplit(tui.terminal.columns, tui.terminal.rows)) return;
  const host = tui as Partial<LayoutHost> & ViewportTUI;
  const main = host.layoutRoot;
  const editor = host.getFocusedComponent?.() as (Component & { isInputRule?: (row: number) => boolean }) | null | undefined;
  if (!main || !editor || typeof main.render !== "function" || typeof editor.handleInput !== "function") return;
  const eligible = () => canSplit(tui.terminal.columns, tui.terminal.rows);
  const frame = (text: string) => theme.fg(host.getFocusedComponent?.() === editor ? "accent" : "border", text);
  const cell = (render: Component["render"]): Component => ({ render, invalidate() {} });
  const leftRail = cell(() => Array<string>(tui.terminal.rows).fill(`${frame("│")} `));
  const rightRail = cell(() => Array<string>(tui.terminal.rows).fill(` ${frame("│")}`));
  function framedViewport(component: Component) {
    const center = new VStack([{ component, basis: 0, grow: 1 }]);
    center.render = measureViewportHeight(tui);
    return new HStack([{ component: leftRail, basis: 2 }, { component: center, basis: 0, grow: 1 }, { component: rightRail, basis: 2 }]);
  }
  function framedDock(dock: VStack) {
    return new VStack(dock.children.map((component) => {
      const editorHost = "children" in component && Array.isArray(component.children) && component.children.includes(editor) ? component : undefined;
      return {
        shrink: 1, minSize: editorHost ? 3 : 0,
        component: {
          render(width: number) {
            const inner = Math.max(1, width - 4);
            const editorVisible = Array.isArray(editorHost?.children) && editorHost.children[0] === editor;
            return component.render(inner).map((line, row) => {
              const content = truncateToWidth(line, inner, "", true);
              return editorVisible && editor?.isInputRule?.(row)
                ? `${frame("├─")}${content}${frame("─┤")}`
                : `${frame("│")} ${content} ${frame("│")}`;
            });
          },
          invalidate() { component.invalidate(); },
          handleMouse(event) {
            if (event.x < 2 || event.x >= event.width - 2) return;
            return component.handleMouse?.({ ...event, x: event.x - 2, width: event.width - 4 });
          },
        } satisfies Component,
      };
    }));
  }
  const [transcript, dock] = main instanceof VStack ? main.children : [];
  const body = editor.isInputRule && main instanceof VStack && main.children.length === 2 && transcript instanceof ScrollView && dock instanceof VStack
    ? new VStack([
      { component: framedViewport(transcript), basis: 0, grow: 1, shrink: 1, minSize: 1 },
      { component: framedDock(dock), shrink: 1, minSize: 1 },
    ])
    : framedViewport(main);
  const header = cell((width) => [frame(`╭${ruleText(width - 2, "Main")}╮`)]);
  const bottom = cell((width) => [frame(`╰${"─".repeat(Math.max(0, width - 2))}╯`)]);
  const left = new VStack([{ component: header, basis: 1 }, { component: body, basis: 0, grow: 1 }, { component: bottom, basis: 1 }]);
  left.render = measureViewportHeight(tui);
  const focusMain = () => { tui.setFocus(editor); tui.requestRender(); };
  left.handleMouse = (event) => {
    if (event.type === "click" && event.button === "left" && host.getFocusedComponent?.() === tutor) focusMain();
    return undefined;
  };
  const columns = new SplitColumns([left, tutor], { gap: 1 });
  const root = new VStack([
    { component: columns, basis: 0, grow: 1, visible: () => {
      if (eligible()) {
        columns.resize(tui.terminal.columns);
        return true;
      }
      if (host.getFocusedComponent?.() === tutor) queueMicrotask(() => {
        if (host.layoutRoot === root && !eligible() && host.getFocusedComponent?.() === tutor) focusMain();
      });
      return false;
    } },
    { component: main, basis: 0, grow: 1, visible: () => !eligible() },
  ]);
  tui.setLayoutRoot(root);
  return {
    handle: {
      focus() { if (eligible()) { tui.setFocus(tutor); tui.requestRender(); } },
      unfocus() { if (host.getFocusedComponent?.() === tutor) focusMain(); },
      isFocused: () => host.getFocusedComponent?.() === tutor,
    },
    close() {
      if (host.layoutRoot !== root) return;
      tui.setLayoutRoot(main);
      if (host.getFocusedComponent?.() === tutor) focusMain();
    },
  };
}
