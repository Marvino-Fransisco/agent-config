import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { createNotes } from "../shared/panel.ts";
import { glossaryResult, glossaryTool, lookupGlossary } from "../shared/glossary.ts";

const entryType = "brainstorming-state";
const coverageItem = Type.Object({
  status: Type.Union([Type.Literal("pending"), Type.Literal("discussed"), Type.Literal("not_relevant")]),
  note: Type.String({ minLength: 1, maxLength: 240 }),
});
const coverageSchema = Type.Object({
  goal_and_scope: coverageItem,
  requirements: coverageItem,
  business_rules: coverageItem,
  edge_cases: coverageItem,
  impact: coverageItem,
  acceptance: coverageItem,
}, { additionalProperties: false });
type Coverage = Static<typeof coverageSchema>;
type State = { topic: string; coverage: Partial<Coverage>; decisions: string[]; brief?: string };

function readState(ctx: ExtensionContext): State | undefined {
  const entry = ctx.sessionManager.getBranch().findLast((entry) => entry.type === "custom" && entry.customType === entryType);
  return entry?.type === "custom" ? entry.data as State : undefined;
}

function clean(text: string): string {
  return stripVTControlCharacters(text).replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f]/g, "").trim();
}

function requiredText(text: string | undefined, label: string): string {
  const value = clean(text ?? "");
  if (!value) throw new Error(`${label} cannot be blank.`);
  return value;
}

function formatDecisions(decisions: string[]): string {
  return decisions.length ? decisions.map((decision, index) => `D${index + 1}. ${decision}`).join("\n") : "No confirmed decisions yet.";
}

function formatState(state: State | undefined): string {
  if (!state) return "No brainstorm on this branch. Start with /skill:brainstorm <prompt>.";
  return [
    state.topic,
    state.brief ? "Shared understanding: confirmed" : "Shared understanding: pending",
    "",
    "Confirmed decisions",
    formatDecisions(state.decisions),
    "",
    "Coverage",
    ...Object.keys(coverageSchema.properties).map((key) => {
      const item = state.coverage[key as keyof Coverage];
      return `${key.replaceAll("_", " ")}: ${item?.status.replaceAll("_", " ") ?? "pending"}${item ? ` — ${item.note}` : ""}`;
    }),
    ...(state.brief ? ["", "Approved brief", state.brief] : []),
  ].join("\n");
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("glossary", {
    description: "Search this project's glossary by term or alias; no argument lists term names",
    async handler(args, ctx) {
      pi.events.emit("ui:dashboard:dismiss", undefined);
      ctx.ui.notify(await lookupGlossary(ctx.cwd, args.trim()), "info");
    },
  });
  pi.registerTool({
    ...glossaryTool,
    promptSnippet: "Look up relevant project terms and aliases on demand",
    execute: async (_id, { query }, signal, _onUpdate, ctx) => glossaryResult(ctx.cwd, query, signal),
  });

  let panel: ReturnType<typeof createNotes> | undefined;
  pi.events.on("ui:panel:opening", (data) => { if ((data as { name: string }).name !== "decision") panel?.close(); });
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget("decision-overlay", (tui, theme) => {
      panel?.close();
      panel = createNotes(tui, theme, () => formatState(readState(ctx)), (message) => ctx.ui.notify(message, "error"),
        "decision", () => pi.events.emit("ui:panel:opening", { name: "decision" }));
      return { invalidate() {}, render: () => [] };
    });
  });
  pi.on("session_shutdown", () => { panel?.close(); panel = undefined; });
  pi.registerCommand("decision", {
    description: "Show confirmed brainstorming decisions, coverage, and the approved brief",
    async handler(_args, ctx) {
      if (panel?.canShow()) { panel.toggle(); return; }
      pi.events.emit("ui:dashboard:dismiss", undefined);
      ctx.ui.notify(formatState(readState(ctx)), "info");
    },
  });

  pi.registerTool({
    name: "brainstorming",
    label: "Brainstorming",
    description: "For the brainstorming skill: read the current branch, start a new topic, update coverage or the complete confirmed decision list, or confirm the final shared-understanding brief. Decisions and the brief require user approval.",
    executionMode: "sequential",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("read"), Type.Literal("start"), Type.Literal("update"), Type.Literal("confirm")]),
      topic: Type.Optional(Type.String({ maxLength: 160, description: "Short topic for start." })),
      coverage: Type.Optional(Type.Partial(coverageSchema)),
      decisions: Type.Optional(Type.Array(Type.String({ maxLength: 240 }), { maxItems: 12, description: "Full replacement list for update. Omit to keep existing decisions." })),
      brief: Type.Optional(Type.String({ maxLength: 2000, description: "Final spec for confirm." })),
    }, { additionalProperties: false }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const result = (text: string) => ({ content: [{ type: "text" as const, text }], details: undefined });
      const save = (state: State) => {
        pi.appendEntry(entryType, state);
        return result(formatState(state));
      };
      const state = readState(ctx);
      if (params.action === "read") return result(formatState(state));
      if (params.action === "start") return save({ topic: requiredText(params.topic, "Topic"), coverage: {}, decisions: [] });
      if (!state) throw new Error("Start a brainstorm first.");

      if (params.action === "update") {
        const coverage = { ...state.coverage };
        for (const key of Object.keys(coverageSchema.properties) as (keyof Coverage)[]) {
          const item = params.coverage?.[key];
          if (item) coverage[key] = { ...item, note: requiredText(item.note, "Coverage note") };
        }
        const decisions = params.decisions?.map((decision) => requiredText(decision, "Decision")) ?? state.decisions;
        const changesDecisions = JSON.stringify(decisions) !== JSON.stringify(state.decisions);
        if (!changesDecisions && JSON.stringify(coverage) === JSON.stringify(state.coverage)) return result(formatState(state));
        if (changesDecisions) {
          if (!ctx.hasUI) throw new Error("An interactive user must approve decision changes.");
          panel?.close();
          const approved = await ctx.ui.confirm("Replace confirmed brainstorming decisions?",
            `Current:\n${formatDecisions(state.decisions)}\n\nProposed:\n${formatDecisions(decisions)}`, { signal });
          if (!approved || signal?.aborted) return result("Decision changes not approved. No changes saved.");
        }
        return save({ topic: state.topic, coverage, decisions });
      }

      const pending = Object.keys(coverageSchema.properties).filter((key) => {
        const item = state.coverage[key as keyof Coverage];
        return !item || item.status === "pending";
      });
      if (pending.length) throw new Error(`Resolve pending coverage before confirming: ${pending.join(", ")}.`);
      if (!ctx.hasUI) throw new Error("An interactive user must approve the shared-understanding brief.");
      const brief = requiredText(params.brief, "Brief");
      panel?.close();
      const approved = await ctx.ui.confirm("Does this brief match our shared understanding?", `${state.topic}\n\n${brief}\n\nConfirmed decisions:\n${formatDecisions(state.decisions)}`, { signal });
      if (!approved || signal?.aborted) return result("Brief not approved. Ask what needs to change before implementing.");
      return save({ ...state, brief });
    },
  });
}
