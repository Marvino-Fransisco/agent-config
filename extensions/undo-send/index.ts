import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    if (ctx.mode !== "tui" || event.source !== "interactive" || event.streamingBehavior || event.images?.length) return;

    const pending = { text: event.text as string | undefined, handled: false };
    pi.events.emit("undo-send:pending", pending);
    if (!pending.handled) {
      ctx.ui.setWidget("undo-send", event.text.split("\n").map((line) => ctx.ui.theme.bg("userMessageBg", line)));
    }

    let requestRender = () => {};
    let cancelled: boolean;
    try {
      cancelled = await ctx.ui.custom<boolean>((tui, _theme, keybindings, done) => {
        requestRender = () => tui.requestRender();
        const timer = setTimeout(() => done(false), 1500);
        return {
          render: (width) => ["Sending in 1.5 seconds · Esc to edit".slice(0, width)],
          invalidate() {},
          handleInput(data) {
            if (keybindings.matches(data, "tui.select.cancel")) done(true);
          },
          dispose() {
            clearTimeout(timer);
          },
        };
      });
    } finally {
      if (pending.handled) pi.events.emit("undo-send:pending", { text: undefined, handled: false });
      else ctx.ui.setWidget("undo-send", undefined);
    }

    if (!cancelled) return;
    const draft = ctx.ui.getEditorText();
    ctx.ui.setEditorText([event.text, draft].filter(Boolean).join("\n\n"));
    requestRender();
    return { action: "handled" };
  });
}
