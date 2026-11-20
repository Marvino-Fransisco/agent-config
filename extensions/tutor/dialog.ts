import type { Theme } from "@earendil-works/pi-coding-agent";
import { Editor, Input, SelectList, type Component, type Focusable, type SelectItem, type TUI } from "@earendil-works/pi-tui";

type Dialog = {
  title: string;
  hint: string;
  component: Component & Partial<Focusable>;
  finish: (value?: string) => void;
};

export function getListTheme(theme: Theme) {
  return {
    selectedPrefix: (text: string) => theme.fg("accent", text),
    selectedText: (text: string) => theme.fg("accent", text),
    description: (text: string) => theme.fg("muted", text),
    scrollInfo: (text: string) => theme.fg("dim", text),
    noMatch: (text: string) => theme.fg("dim", text),
  };
}

export function createTutorList(theme: Theme, items: SelectItem[], maxVisible: number) {
  return new SelectList(items, maxVisible, getListTheme(theme));
}

export function createTutorDialogs(tui: TUI, theme: Theme, focused: () => boolean, maxVisible: () => number) {
  let active: Dialog | undefined;
  function show(title: string, hint: string, component: Dialog["component"], submit: (finish: Dialog["finish"]) => void) {
    active?.finish();
    return new Promise<string | undefined>((resolve) => {
      const dialog: Dialog = { title, hint, component, finish(value) {
        if (active !== dialog) return;
        active = undefined;
        tui.requestRender();
        resolve(value);
      } };
      active = dialog;
      if ("focused" in component) component.focused = focused();
      submit(dialog.finish);
      tui.requestRender();
    });
  }
  return {
    get active() { return active; },
    cancel() { active?.finish(); },
    select(title: string, choices: readonly string[]) {
      const list = createTutorList(theme, choices.map((label) => ({ value: label, label })), maxVisible());
      return show(title, "↑↓ Select · Enter Continue · Esc Cancel", list, (finish) => {
        list.onSelect = ({ value }) => finish(value);
        list.onCancel = () => finish();
      });
    },
    input(title: string, value: string) {
      const input = new Input();
      input.setValue(value);
      return show(title, "Enter Save · Esc Cancel", input, (finish) => { input.onSubmit = finish; });
    },
    edit(title: string, value: string) {
      const editor = new Editor(tui, { borderColor: (text) => theme.fg("border", text), selectList: getListTheme(theme) });
      editor.setText(value);
      return show(title, "Enter Continue · Shift+Enter New line · Esc Cancel", editor, (finish) => { editor.onSubmit = finish; });
    },
  };
}
