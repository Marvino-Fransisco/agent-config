import type { ToolKind } from "./phase/phase.types.ts";

import type { HandoffState } from "./compaction/handoff.ts";

export interface Saved extends HandoffState {
  hash: string;
  seq: number;
}

export interface PendingInjection {
  content: string;
  hash: string;
}

export interface ActiveTool {
  kind: ToolKind;
  args: unknown;
}
