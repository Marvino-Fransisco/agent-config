import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  function step({ model }: ExtensionContext, direction: 1 | -1) {
    if (!model?.reasoning) return;
    const levels = getSupportedThinkingLevels(model);
    if (levels.length < 2) return;
    const current = levels.indexOf(pi.getThinkingLevel());
    if (current === -1) return;
    const next = (current + direction + levels.length) % levels.length;
    pi.setThinkingLevel(levels[next]);
  }

  pi.registerShortcut("shift+up", {
    description: "Increase thinking level",
    handler: (ctx) => step(ctx, 1),
  });
  pi.registerShortcut("shift+down", {
    description: "Decrease thinking level",
    handler: (ctx) => step(ctx, -1),
  });
}
