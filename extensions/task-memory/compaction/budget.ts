import { DEFAULT_COMPACTION_SETTINGS, estimateTokens, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getCurrentSystemMessage } from "@earendil-works/pi-ai";

export class HandoffBudgetError extends Error {}

export interface EffectiveCompactionSettings {
  enabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
}

export interface HandoffBudget {
  window: number;
  summaryTokens: number;
  tailTokens: number;
  availableTokens: number;
  key: string;
}

export function textTokens(text: string): number {
  return Math.ceil(estimateTokens({ role: "user", content: text, timestamp: 0 }) * 1.2);
}

export function effectiveSettings(pi: ExtensionAPI, ctx: ExtensionContext): EffectiveCompactionSettings {
  const settings = pi.getSettings().compaction;
  const tokenSetting = (value: number | undefined, fallback: number): number => {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < 0) throw new HandoffBudgetError("Compaction token settings must be non-negative safe integers.");
    return value;
  };
  const reserve = tokenSetting(settings?.reserveTokens, DEFAULT_COMPACTION_SETTINGS.reserveTokens);
  const keep = tokenSetting(settings?.keepRecentTokens, DEFAULT_COMPACTION_SETTINGS.keepRecentTokens);
  const modelKey = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
  const override = settings?.modelOverrides?.[modelKey];
  if (override !== undefined && (!override || typeof override !== "object" || Array.isArray(override))) throw new HandoffBudgetError("Invalid model compaction override.");
  return {
    enabled: settings?.enabled !== false,
    reserveTokens: tokenSetting(override?.reserveTokens, reserve),
    keepRecentTokens: tokenSetting(override?.keepRecentTokens, keep),
  };
}

export function handoffBudget(pi: ExtensionAPI, ctx: ExtensionContext, warning = 50, settings = effectiveSettings(pi, ctx)): HandoffBudget {
  const window = ctx.model?.contextWindow ?? ctx.getContextUsage()?.contextWindow;
  if (!window || !Number.isSafeInteger(window) || window <= 0) throw new HandoffBudgetError("Model context window is unknown; cannot safely budget a handoff.");
  if (settings.enabled && settings.reserveTokens >= window) throw new HandoffBudgetError(`Pi reserveTokens (${settings.reserveTokens}) must be smaller than this model's context window (${window}). Set a per-model compaction override; no compaction was performed.`);
  const projection = ctx.sessionManager.buildSessionProjection();
  const system = getCurrentSystemMessage(projection.messages ?? []);
  const active = new Set(pi.getActiveTools?.() ?? []);
  const tools = pi.getAllTools?.().filter((tool) => active.has(tool.name)).map(({ name, description, parameters }) => ({ name, description, parameters })) ?? [];
  const promptTokens = textTokens(ctx.getSystemPrompt()) + (tools.length ? textTokens(JSON.stringify(tools)) : 0);
  const fixed = Math.max(promptTokens, system ? Math.ceil(estimateTokens(system) * 1.2) : 0);
  const target = Math.floor(Math.min(window * (warning - 5) / 100, settings.enabled ? window - settings.reserveTokens : window) - window * 0.02);
  const availableTokens = target - fixed;
  if (availableTokens <= 0) throw new HandoffBudgetError("System prompt/tool definitions leave no room below the compaction target. Reduce fixed context, adjust thresholds/reserve, or use a larger model; repeated compaction cannot fix this.");
  return {
    window,
    availableTokens,
    summaryTokens: Math.min(2000, Math.floor(window * 0.04), availableTokens),
    tailTokens: Math.min(settings.keepRecentTokens, Math.floor(window * 0.05)),
    key: JSON.stringify([ctx.model?.provider, ctx.model?.id, window, warning, settings, fixed]),
  };
}
