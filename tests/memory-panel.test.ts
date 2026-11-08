import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const plain = (lines: string[]) => lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("memory panels distinguish ready, loading and empty results without duplicate instructions", async () => {
  const panelUrl = new URL("../extensions/long-memory/ui/panel.ts?empty-state", import.meta.url);
  const storeUrl = new URL("../extensions/long-memory/src/store.ts", import.meta.url);
  const fixtureUrl = `data:text/javascript,${encodeURIComponent(`
    export * from ${JSON.stringify(storeUrl.href)};
    export const memoryStats = async () => ({ total: 0, trash: 0 });
    export const listMemories = async () => [];
    export const listTrash = async () => [];
    export const debugRetrieval = async () => ({ rows: [], passed: 0, total: 0, indexed: 0, minSimilarity: 0.6, elapsedMs: 1 });
    export let completeSearch;
    export const searchMemories = () => new Promise(resolve => { completeSearch = resolve; });
  `)}`;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "../src/store.ts" && context.parentURL === panelUrl.href) return { url: fixtureUrl, shortCircuit: true };
      return next(specifier, context);
    },
  });
  let panel: any;
  try {
    const { createPanel } = await import(panelUrl.href);
    const fixture = await import(fixtureUrl);
    panel = createPanel({ cwd: "/tmp" }, { terminal: { rows: 30 }, requestRender() {} }, { fg: (_color: string, text: string) => text }, () => {});
    const view = () => plain(panel.render(100));
    assert.equal((view().match(/Loading…/g) ?? []).length, 1);
    await settle();
    assert.match(view(), /╭─ ◇ No memories yet/);
    assert.match(view(), /Save one with \/memory save/);
    panel.handleInput("tab");
    assert.match(view(), /╭─ ⌕ Search · sent to Google/);
    assert.match(view(), /⌕ Ready to search/);
    assert.match(view(), /Type a query above, then press Enter/);
    assert.equal((view().match(/Google/g) ?? []).length, 1);
    assert.match(view(), /⏎ search/);
    assert.doesNotMatch(view(), /No matches|↑↓ select|⏎ open/);
    panel.handleInput("architecture");
    panel.handleInput("return");
    assert.equal((view().match(/Loading…/g) ?? []).length, 1);
    assert.doesNotMatch(view(), /Ready to search|No matches/);
    fixture.completeSearch([]);
    await settle();
    assert.match(view(), /⌕ No matches/);
    assert.match(view(), /No memories above the match threshold/);
    assert.match(view(), /Try different words or change scope/);
    assert.doesNotMatch(view(), /↑↓ select|⏎ open/);
    panel.handleInput("different query");
    assert.match(view(), /⌕ Ready to search/);
    panel.handleInput("tab");
    await settle();
    assert.match(view(), /☰ No memories to list/);
    assert.match(view(), /⏎ filter/);
    panel.handleInput("tab");
    await settle();
    assert.match(view(), /⌫ Trash is empty/);
    assert.match(view(), /⏎ refresh/);
    panel.handleInput("tab");
    assert.match(view(), /◎ Explain a search/);
    panel.handleInput("why");
    panel.handleInput("return");
    await settle();
    assert.match(view(), /◎ No matches/);
    assert.match(view(), /No indexed memories to rank/);
    panel.handleInput("tab");
    assert.match(view(), /Inspect saved memories without changing data/);
    assert.match(view(), /Enter a SELECT query above/);
    assert.match(view(), /⏎ run/);
    assert.doesNotMatch(view(), /↑↓ select|⏎ open|pan|↑↓ scroll/);
  } finally {
    panel?.dispose();
    hooks.deregister();
  }
});
