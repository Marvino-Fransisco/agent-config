import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

const UNDO_WINDOW_MS = 1500;

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    if (ctx.mode !== "tui" || event.source !== "interactive" || event.streamingBehavior || event.images?.length) return;

    const deadline = performance.now() + UNDO_WINDOW_MS;
    const pending = { text: event.text as string | undefined, indicator: "", handled: false };
    const update = () => {
      const remaining = Math.max(0, deadline - performance.now());
      const filled = Math.ceil((remaining / UNDO_WINDOW_MS) * 12);
      const bar = "━".repeat(filled) + "─".repeat(12 - filled);
      pending.indicator = `${ctx.ui.theme.fg("accent", "Esc")} ${ctx.ui.theme.fg("muted", "to edit · sending")} ${ctx.ui.theme.fg("accent", bar)} ${ctx.ui.theme.fg("muted", `${(remaining / 1000).toFixed(1)}s`)}`;
      pi.events.emit("undo-send:pending", pending);
      if (!pending.handled) {
        ctx.ui.setWidget("undo-send", [
          ...event.text.split("\n").map((line) => ctx.ui.theme.bg("userMessageBg", line)),
          pending.indicator,
        ]);
      }
    };

    update();
    const interval = setInterval(update, 100);
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setTimeout>;
    try {
      const cancelled = await new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), UNDO_WINDOW_MS);
        unsubscribe = ctx.ui.onTerminalInput((data) => {
          if (!matchesKey(data, "escape")) return;
          resolve(true);
          return { consume: true };
        });
      });
      if (!cancelled) return;
      const draft = ctx.ui.getEditorText();
      ctx.ui.setEditorText([event.text, draft].filter(Boolean).join("\n\n"));
      return { action: "handled" };
    } finally {
      clearTimeout(timer!);
      clearInterval(interval);
      unsubscribe();
      if (pending.handled) pi.events.emit("undo-send:pending", { text: undefined, indicator: "", handled: false });
      else ctx.ui.setWidget("undo-send", undefined);
    }
  });
}
