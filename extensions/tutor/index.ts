import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { resolveProject } from "../shared/project.ts";
import { captureMain, type MainSnapshot } from "./context.ts";
import { createTutorStore, type TutorHistory } from "./history.ts";
import { createTutorPanel, safeLine, safeText, tutorActions, tutorOverlay, type TutorAction, type TutorHandle, type TutorPhase } from "./panel.ts";
import { answerTutor } from "./runtime.ts";
import { splitTutor } from "./split.ts";

const errorText = (error: unknown) => safeLine(error instanceof Error ? error.message : String(error));

export default function tutorExtension(pi: ExtensionAPI) {
  let active: ReturnType<typeof controller> | undefined;

  function open(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;
    active ??= controller(pi, ctx.cwd);
    void active.open(ctx).catch((error) => ctx.ui.notify(errorText(error), "error"));
  }

  pi.registerCommand("tutor", { description: "Open or focus the read-only Tutor", handler: async (_args, ctx) => open(ctx) });
  pi.registerShortcut("ctrl+alt+u", { description: "Focus Tutor", handler: open });
  pi.on("session_shutdown", () => {
    active?.dispose();
    active = undefined;
  });
}

function controller(pi: ExtensionAPI, cwd: string) {
  let disposed = false;
  let opening = false;
  let managing = false;
  let view: { close: () => void; focusMain: () => void; render: () => void; dialogs: ReturnType<typeof createTutorPanel>["dialogs"]; handle?: TutorHandle } | undefined;
  let project: Awaited<ReturnType<typeof resolveProject>> | undefined;
  let store: ReturnType<typeof createTutorStore> | undefined;
  let history: TutorHistory | undefined;
  let run: AbortController | undefined;
  let partial = "";
  let status = "";
  let phase: TutorPhase = "ready";

  function render() { view?.render(); }

  async function generate(
    ctx: ExtensionContext, root: string, snapshot: MainSnapshot, current: TutorHistory, question: string, handoff: boolean,
  ): Promise<string> {
    const operation = new AbortController();
    let streamRender: ReturnType<typeof setTimeout> | undefined;
    run = operation;
    partial = "";
    status = "";
    phase = handoff ? "summarizing" : "understanding";
    render();
    try {
      return await answerTutor({
        ctx, root, history: current, snapshot, question, handoff,
        signal: AbortSignal.any([operation.signal, AbortSignal.timeout(180_000)]),
        onExplore: () => { if (!disposed && !handoff) { phase = "exploring"; render(); } },
        onDelta: (delta) => {
          if (disposed || handoff) return;
          const first = phase !== "teaching";
          phase = "teaching";
          partial += delta;
          if (first) render();
          else if (!streamRender) {
            streamRender = setTimeout(() => { streamRender = undefined; render(); }, 50);
          }
        },
      });
    } finally {
      clearTimeout(streamRender);
      run = undefined;
      partial = "";
      phase = "ready";
      render();
    }
  }

  function ask(ctx: ExtensionContext, snapshot: MainSnapshot, question: string): boolean {
    if (disposed || run || managing || !project || !store) return false;
    if (question.length > 8000) {
      status = "Questions are limited to 8,000 characters";
      return false;
    }
    if (!ctx.model) {
      status = "Select a model in Pi first";
      return false;
    }
    const storage = store;
    let before: TutorHistory;
    try {
      const message = { role: "user" as const, text: question };
      history = history ? storage.append(history.id, message) : storage.create(safeLine(question).slice(0, 80) || "Tutor", message);
      before = { ...history, messages: history.messages.slice(0, -1) };
    } catch (error) {
      status = errorText(error);
      return false;
    }
    void generate(ctx, project.root, snapshot, before, question, false).then((text) => {
      if (!disposed) history = storage.append(before.id, { role: "assistant", text });
    }).catch((error) => {
      status = errorText(error);
    }).finally(render);
    return true;
  }

  async function editHistory(dialogs: NonNullable<typeof view>["dialogs"], action: Exclude<TutorAction, "handoff">, storage: NonNullable<typeof store>) {
    if (action === "new") { history = undefined; status = "New session ready. Previous history is still saved."; return; }
    if (action === "history") {
      const sessions = storage.list();
      if (!sessions.length) { status = "No Tutor history in this project yet"; return; }
      const labels = sessions.map((session, index) => `${index + 1}. ${safeLine(session.title)} · ${session.updatedAt.slice(0, 10)}`);
      const selected = await dialogs.select("Tutor history for this project", labels);
      if (disposed || selected === undefined) return;
      const session = sessions[labels.indexOf(selected)];
      if (session) history = storage.load(session.id);
      return;
    }
    if (!history) { status = "No saved Tutor session"; return; }
    const current = history;
    if (action === "rename") {
      const name = safeLine((await dialogs.input("Tutor session name", safeLine(current.title))) ?? "");
      if (!disposed && name) history = storage.rename(current.id, name.slice(0, 100));
    } else if (await dialogs.select(`Delete session ${safeLine(current.title)}?`, ["Cancel", "Delete session"]) === "Delete session" && !disposed) {
      storage.remove(current.id);
      history = undefined;
    }
  }

  async function manage(ctx: ExtensionContext, snapshot: MainSnapshot, action: TutorAction | "menu") {
    if (disposed || run || managing || !view || !store || !project) return;
    managing = true;
    const panel = view;
    status = "";
    try {
      if (action === "menu") {
        const selected = await panel.dialogs.select("Tutor actions", tutorActions.map(([, , label]) => label));
        const choice = tutorActions.find(([, , label]) => label === selected);
        if (!choice || disposed || view !== panel) return;
        action = choice[1];
      }
      if (action === "handoff") {
        if (!history?.messages.some(({ role }) => role === "assistant")) { status = "No discussion to summarize yet"; return; }
        const mainId = ctx.sessionManager.getSessionId();
        const summary = await generate(ctx, project.root, snapshot, history,
          "Summarize only the Tutor discussion for the main agent, in English: findings, verified references and unresolved decisions. Keep it brief and factual; do not write instructions to execute changes.", true);
        if (disposed || view !== panel) return;
        const draft = safeText((await panel.dialogs.edit("Review or edit Tutor handoff → Main", safeText(summary))) ?? "").trim();
        if (!draft || disposed || view !== panel) return;
        const fillMain = "Insert draft and focus Main";
        const confirmed = await panel.dialogs.select("Insert handoff into Main?", ["Cancel", fillMain]);
        if (confirmed !== fillMain || disposed || view !== panel || ctx.sessionManager.getSessionId() !== mainId) return;
        const existing = ctx.ui.getEditorText();
        const handoff = `Tutor discussion summary (approved by the user):\n\n${draft}`;
        ctx.ui.setEditorText(existing ? `${existing}\n\n${handoff}` : handoff);
        status = "Handoff added to the Main draft";
        panel.focusMain();
      } else {
        await editHistory(panel.dialogs, action, store);
      }
    } catch (error) {
      status = errorText(error);
    } finally {
      managing = false;
      if (!disposed && view === panel) render();
    }
  }

  return {
    async open(ctx: ExtensionContext) {
      if (disposed || opening || managing) return;
      if (view) { view.handle?.focus(); render(); return; }
      opening = true;
      try {
        const snapshot = captureMain(ctx.sessionManager.getBranch());
        project ??= await resolveProject(cwd);
        if (disposed) return;
        const { root } = project;
        store ??= createTutorStore(root);
        const makePanel = (tui: TUI, theme: Theme, close: () => void, split = false) => createTutorPanel(tui, theme, {
          root, handle: () => view?.handle, close, split,
          ask: (question) => ask(ctx, snapshot, question),
          cancel: () => run?.abort(new Error("Tutor response stopped")),
          action: (action) => { void manage(ctx, snapshot, action); },
          read: () => ({ history, partial, status, phase }),
        });
        ctx.ui.setWidget?.("tutor-layout-probe", (tui, theme) => {
          const component = makePanel(tui, theme, () => view?.close(), true);
          const split = splitTutor(tui, theme, component);
          if (split) {
            view = {
              close: () => { component.dialogs.cancel(); split.close(); view = undefined; },
              focusMain: split.handle.unfocus, render: () => tui.requestRender(), handle: split.handle, dialogs: component.dialogs,
            };
            split.handle.focus();
          }
          return { render: () => [], invalidate() {} };
        });
        ctx.ui.setWidget?.("tutor-layout-probe", undefined);
        if (view) {
          pi.events?.emit("ui:tutor:split", undefined);
          return;
        }
        const interaction = ctx.ui.custom<void>((tui, theme, _kb, done) => {
          const component = makePanel(tui, theme, () => view?.close());
          const close = () => { component.dialogs.cancel(); view = undefined; done(); };
          const panel = { close, focusMain: close, render: () => tui.requestRender(), dialogs: component.dialogs };
          view = panel;
          if (!tutorOverlay.visible?.(tui.terminal.columns, tui.terminal.rows)) {
            panel.close();
            ctx.ui.notify("Tutor requires a terminal of at least 42 columns × 12 rows", "warning");
          }
          return component;
        }, {
          overlay: true,
          overlayOptions: tutorOverlay,
          onHandle: (handle) => { if (view) { view.handle = handle; handle.focus(); } },
        });
        void interaction.catch((error) => { view = undefined; if (!disposed) ctx.ui.notify(errorText(error), "error"); });
      } finally {
        opening = false;
      }
    },
    dispose() {
      disposed = true;
      run?.abort(new Error("Main session closed"));
      view?.close();
    },
  };
}
