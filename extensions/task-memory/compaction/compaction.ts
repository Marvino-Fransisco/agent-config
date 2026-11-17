import { estimateTokens, findCutPoint, type ExtensionAPI, type ExtensionContext, type SessionBoundaryDraft } from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import type { HashEntry } from "./compaction.types.ts";
import { handoffBudget, HandoffBudgetError, textTokens, type EffectiveCompactionSettings } from "./budget.ts";

export function compactionWorkKey(ctx: ExtensionContext, modelKey: string): string {
  const entry = ctx.sessionManager.getBranch().findLast((entry) => {
    if (entry.type !== "message") return false;
    const message = entry.message;
    if (message.role === "user") return true;
    if (message.role === "toolResult") return message.toolName !== "task";
    if (message.role !== "assistant") return false;
    const calls = message.content.filter((block) => block.type === "toolCall");
    return calls.length ? calls.some((block) => block.name !== "task") : message.content.length > 0;
  });
  return JSON.stringify([modelKey, entry?.id ?? null]);
}

export function compactionDraft(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  summary: string,
  details: Record<string, unknown>,
  warning = 50,
  settings?: EffectiveCompactionSettings,
): Extract<SessionBoundaryDraft, { type: "compaction" }> {
  const budget = handoffBudget(pi, ctx, warning, settings);
  const summaryTokens = textTokens(summary);
  if (summaryTokens > budget.summaryTokens) throw new HandoffBudgetError("Handoff exceeds the active model's summary limit; write a shorter checkpoint before compacting.");
  const branch = [...ctx.sessionManager.getBranch()];
  const last = branch.findLastIndex((entry) => entry.type === "compaction");
  const previous = branch[last];
  let start = 0;
  if (previous?.type === "compaction") {
    const kept = branch.findIndex((entry) => entry.id === previous.firstKeptEntryId);
    start = kept >= 0 && kept !== last ? kept : last + 1;
  }
  const key = createHash("sha256").update(summary).update(budget.key).digest("hex");
  const previousDetails = previous?.type === "compaction" ? previous.details as Record<string, unknown> | undefined : undefined;
  const newWork = branch.slice(last + 1).some((entry) => {
    if (entry.type !== "message") return false;
    const message = entry.message;
    if (message.role === "user") return true;
    if (message.role === "toolResult") return message.toolName !== "task";
    if (message.role !== "assistant") return false;
    const calls = message.content.filter((block) => block.type === "toolCall");
    return calls.length ? calls.some((block) => block.name !== "task") : message.content.length > 0;
  });
  if (previousDetails?.handoffKey === key && !newWork) throw new HandoffBudgetError("This handoff already compacted the same state with no new work. Context was retained; repeated compaction would not create useful space.");
  const keep = Math.max(0, Math.min(budget.tailTokens, budget.availableTokens - summaryTokens));
  let firstKeptEntryId: string | null = null;
  if (keep > 0 && start < branch.length) {
    const cutPoint = findCutPoint(branch, start, branch.length, keep);
    const candidate = branch[cutPoint.firstKeptEntryIndex];
    const indexes = new Map(branch.map((entry, index) => [entry.id, index]));
    const retained = ctx.sessionManager.buildSessionProjection().entries
      .filter((entry) => (indexes.get(entry.sourceEntry.id) ?? -1) >= cutPoint.firstKeptEntryIndex)
      .flatMap((entry) => entry.messages)
      .filter((message) => message.role !== "system" && message.role !== "compactionSummary");
    const tokens = Math.ceil(retained.reduce((sum, message) => sum + estimateTokens(message), 0) * 1.2);
    if (candidate && tokens <= keep) firstKeptEntryId = candidate.id;
  }
  return { type: "compaction", summary, firstKeptEntryId, details: { ...details, source: "task-memory", handoffKey: key } };
}

export function lastKnownHash(ctx: ExtensionContext): string | undefined {
  // SAFETY: only optional fields are read; session entries are a superset of this shape.
  const branch = ctx.sessionManager.getBranch() as unknown as HashEntry[];

  for (let i = branch.length - 1; i >= 0; i--) {
    const e = branch[i]!;
    if (e.type === "compaction") return e.details?.source === "task-memory" ? e.details.hash : undefined;
    if (e.type === "custom_message" && e.customType === "task-memory-state" && e.details?.hash) return e.details.hash;
    if (e.type === "message" && e.message?.role === "toolResult" && e.message.toolName === "task" && e.message.details?.hash) return e.message.details.hash;
  }
  return undefined;
}
