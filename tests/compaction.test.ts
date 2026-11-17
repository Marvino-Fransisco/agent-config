import { test } from "node:test";
import assert from "node:assert/strict";
import { compactionDraft, lastKnownHash } from "../extensions/task-memory/compaction/compaction.ts";
import { effectiveSettings, handoffBudget, textTokens } from "../extensions/task-memory/compaction/budget.ts";
import { renderBudgetedHandoff } from "../extensions/task-memory/compaction/handoff.ts";
import * as S from "../extensions/task-memory/state/state.ts";

function fixture(window = 200000, settings: any = {}) {
  const branch: any[] = [];
  const pi = { getSettings: () => ({ compaction: settings }) };
  const ctx = {
    sessionManager: {
      getBranch: () => branch,
      buildSessionProjection: () => ({ messages: branch.flatMap((entry) => entry.message ? [entry.message] : []), entries: branch.map((entry) => ({ sourceEntry: entry, messages: entry.message ? [entry.message] : [] })) }),
    },
    getSystemPrompt: () => "system",
    getContextUsage: () => ({ contextWindow: window }),
    model: { provider: "test", id: "model", contextWindow: window },
  };
  return { pi, ctx, branch, settings };
}

test("compaction retains a budgeted complete tail and identifies its source", () => {
  const { pi, ctx, branch } = fixture();
  branch.push({ type: "message", id: "first", message: { role: "user", content: "old" } }, { type: "compaction", id: "previous" }, { type: "message", id: "tail", message: { role: "user", content: "recent" } });
  const draft = compactionDraft(pi as never, ctx as never, "summary", { hash: "abc" });
  assert.equal(draft.firstKeptEntryId, "tail");
  assert.equal(draft.details?.source, "task-memory");
  assert.equal(draft.details?.hash, "abc");
});

test("summary and tail caps scale down to small windows and obey model overrides", () => {
  for (const window of [8000, 16000, 32000, 128000]) {
    const { pi, ctx } = fixture(window, { reserveTokens: 512 });
    const budget = handoffBudget(pi as never, ctx as never, 30);
    assert.equal(budget.summaryTokens, Math.min(2000, window * 0.04));
    assert.equal(budget.tailTokens, window * 0.05);
  }
  const { pi, ctx } = fixture(8000, { reserveTokens: 16384, modelOverrides: { "test/model": { reserveTokens: 512, keepRecentTokens: 100 } } });
  assert.equal(effectiveSettings(pi as never, ctx as never).reserveTokens, 512);
  assert.equal(handoffBudget(pi as never, ctx as never).tailTokens, 100);
});

test("invalid reserve, unknown windows and excessive fixed context are rejected", () => {
  const f = fixture(8000);
  assert.throws(() => handoffBudget(f.pi as never, f.ctx as never), /reserveTokens/);
  f.settings.enabled = false;
  f.ctx.getSystemPrompt = () => "x".repeat(40000);
  assert.throws(() => handoffBudget(f.pi as never, f.ctx as never), /System prompt\/tool definitions/);
  f.ctx.model.contextWindow = 0;
  assert.throws(() => handoffBudget(f.pi as never, f.ctx as never), /unknown/);
  const invalid = fixture(32000, { keepRecentTokens: -1, modelOverrides: { "test/model": { keepRecentTokens: 100 } } });
  assert.throws(() => effectiveSettings(invalid.pi as never, invalid.ctx as never), /non-negative/);
});

test("oversized indivisible tool tails and zero keep settings retain none", () => {
  const { pi, ctx, branch } = fixture(8000, { reserveTokens: 512 });
  branch.push({ type: "message", id: "call", message: { role: "assistant", content: [{ type: "toolCall", name: "read", arguments: {} }] } }, { type: "message", id: "result", message: { role: "toolResult", toolName: "read", content: "x".repeat(16000) } });
  assert.equal(compactionDraft(pi as never, ctx as never, "summary", {}).firstKeptEntryId, null);
  assert.equal(compactionDraft(pi as never, ctx as never, "summary", {}, 30, { enabled: true, reserveTokens: 512, keepRecentTokens: 0 }).firstKeptEntryId, null);
  assert.throws(() => compactionDraft(pi as never, ctx as never, "x".repeat(4000), {}), /summary limit/);
});

test("identical handoffs without new work do not compact repeatedly", () => {
  const { pi, ctx, branch } = fixture();
  const first = compactionDraft(pi as never, ctx as never, "summary", {});
  branch.push({ ...first, id: "compacted" });
  branch.push({ type: "message", id: "checkpoint", message: { role: "toolResult", toolName: "task", content: "saved" } });
  assert.throws(() => compactionDraft(pi as never, ctx as never, "summary", {}), /no new work/);
  branch.push({ type: "message", id: "user", message: { role: "user", content: "continue" } });
  assert.doesNotThrow(() => compactionDraft(pi as never, ctx as never, "summary", {}));
});

test("bounded handoffs preserve required content and leave full disk state untouched", () => {
  const file = { version: 1 as const, task: null as any };
  const project = S.emptyProject();
  const task = S.startTask(file, { title: "T", goal: "Finish task", constraints: "Do not run E2E" }, "now");
  S.planSteps(task, ["verify"], "replace");
  S.checkpoint(task, { next: "Run unit tests", context: "Exact error: E123", readNow: [{ path: "a.ts", lines: "L1-5", reason: "fix" }] }, "now", {});
  for (let i = 0; i < 10; i++) task.notes.push({ id: i, text: "optional ".repeat(20) });
  const original = JSON.stringify({ task, project });
  const summary = renderBudgetedHandoff({ task, project, root: "/repo" }, 320);
  assert.ok(textTokens(summary) <= 320);
  assert.match(summary, /Do not run E2E/);
  assert.match(summary, /Exact error: E123/);
  assert.match(summary, /Next: Run unit tests/);
  assert.match(summary, /a.ts L1-5/);
  assert.equal(JSON.stringify({ task, project }), original);
  assert.throws(() => renderBudgetedHandoff({ task, project, root: "/repo" }, 10), /Required handoff content/);
});

test("latest external compaction invalidates the previous task hash", () => {
  const branch: unknown[] = [{ type: "custom_message", customType: "task-memory-state", details: { hash: "old" } }];
  const ctx = { sessionManager: { getBranch: () => branch } };
  assert.equal(lastKnownHash(ctx as never), "old");
  branch.push({ type: "compaction", details: { source: "other", hash: "other" } });
  assert.equal(lastKnownHash(ctx as never), undefined);
  branch.push({ type: "message", message: { role: "toolResult", toolName: "task", details: { hash: "new" } } });
  assert.equal(lastKnownHash(ctx as never), "new");
});
