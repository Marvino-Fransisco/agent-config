import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type MainBranch = ReturnType<ExtensionContext["sessionManager"]["getBranch"]>;
export type MainExcerpt = Readonly<{ id: string; role: "user" | "assistant"; text: string }>;
export type MainSnapshot = Readonly<{ recent: string; messages: readonly MainExcerpt[] }>;

export function messageText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.flatMap((item) => item?.type === "text" && typeof item.text === "string" ? [item.text] : []).join("\n");
}

export function recentText(lines: readonly string[], budget: number, perLine: number): string {
  const result: string[] = [];
  for (let index = lines.length - 1; index >= 0 && budget > 100; index--) {
    const line = lines[index];
    const limit = Math.min(budget, perLine);
    const excerpt = line.length > limit ? `${line.slice(0, limit - 13)}… [truncated]` : line;
    result.push(excerpt);
    budget -= excerpt.length + 1;
  }
  return result.toReversed().join("\n\n");
}

export function captureMain(branch: MainBranch): MainSnapshot {
  const edits = new Map(branch.flatMap((entry) => entry.type === "context_edit" ? [[entry.targetId, entry.replacement]] as const : []));
  const messages: MainExcerpt[] = [];
  for (const entry of branch) {
    if (entry.type !== "message" || (entry.message.role !== "user" && entry.message.role !== "assistant")) continue;
    const replacement = edits.get(entry.id);
    if (replacement === null) continue;
    const text = messageText(replacement?.content ?? entry.message.content).trim();
    if (text) messages.push(Object.freeze({ id: entry.id, role: entry.message.role, text }));
  }
  const summary = branch.findLast((entry) => entry.type === "compaction" || entry.type === "branch_summary");
  const recent = [
    summary ? `Earlier summary [${summary.id}]: ${summary.summary.slice(0, 1400)}` : "",
    recentText(messages.slice(-10).map(({ id, role, text }) => `${role} [${id}]: ${text}`), 5600, 1600),
  ].filter(Boolean).join("\n\n");
  return Object.freeze({ recent, messages: Object.freeze(messages) });
}

export function searchMain(snapshot: MainSnapshot, query: string, before?: string): MainExcerpt[] {
  const needle = query.trim().toLowerCase();
  if (!needle) throw new Error("Enter a non-empty history search term");
  const end = before === undefined ? snapshot.messages.length : snapshot.messages.findIndex(({ id }) => id === before);
  if (end < 0) throw new Error("Unknown main message ID");
  const hits: MainExcerpt[] = [];
  for (let index = end - 1; index >= 0 && hits.length < 8; index--) {
    const { id, role, text } = snapshot.messages[index];
    const position = text.toLowerCase().indexOf(needle);
    if (position < 0) continue;
    const start = Math.max(0, position - 240);
    const stop = Math.min(text.length, position + needle.length + 500);
    hits.push({ id, role, text: `${start ? "…" : ""}${text.slice(start, stop)}${stop < text.length ? "…" : ""}` });
  }
  return hits;
}

export function mainSearchTool(snapshot: MainSnapshot): AgentTool {
  return {
    name: "search_main_history",
    label: "Search main history",
    description: "Find a literal term or phrase in the frozen active main conversation (user and assistant text only). Returns newest matching excerpts and entry IDs. Pass before as an entry ID to find older matches.",
    parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 200 }), before: Type.Optional(Type.String()) }),
    async execute(_id, args, signal) {
      signal?.throwIfAborted();
      const { query, before } = args as { query: string; before?: string };
      const hits = searchMain(snapshot, query, before);
      return { content: [{ type: "text", text: hits.length ? JSON.stringify(hits) : "No matching main conversation excerpts." }], details: undefined };
    },
  };
}
