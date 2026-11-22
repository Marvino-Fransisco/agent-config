import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import extension from "../extensions/thinking-shortcuts/index.ts";

test("thinking shortcuts wrap in both directions and skip unsupported levels", () => {
  const shortcuts = new Map<string, Parameters<ExtensionAPI["registerShortcut"]>[1]["handler"]>();
  let level: ReturnType<ExtensionAPI["getThinkingLevel"]> = "low";
  const changes: string[] = [];
  extension({
    registerShortcut: (key, { handler }) => { shortcuts.set(key, handler); },
    getThinkingLevel: () => level,
    setThinkingLevel: (next) => { level = next; changes.push(next); },
  } satisfies Pick<ExtensionAPI, "registerShortcut" | "getThinkingLevel" | "setThinkingLevel"> as ExtensionAPI);
  const ctx = { model: { reasoning: true, thinkingLevelMap: { off: null, minimal: null, medium: null, xhigh: "xhigh" } } } as ExtensionContext;
  const up = shortcuts.get("shift+up")!;
  const down = shortcuts.get("shift+down")!;
  down(ctx);
  up(ctx);
  up(ctx);
  up(ctx);
  down(ctx);
  down(ctx);
  up({ model: { reasoning: false } } as ExtensionContext);
  up({} as ExtensionContext);
  assert.deepEqual(changes, ["xhigh", "low", "high", "xhigh", "high", "low"]);
});
