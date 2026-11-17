import type { Checkpoint, Project, Task } from "../state/state.types.ts";
import { HandoffBudgetError, textTokens } from "./budget.ts";

export interface HandoffState {
  task: Task | null;
  project: Project;
  checkpoint?: Checkpoint;
  root: string;
}

export function renderBudgetedHandoff(state: HandoffState, maxTokens: number, warnings: string[] = []): string {
  const { task, project, root } = state;
  const cp = state.checkpoint ?? task?.checkpoint;
  const doing = task?.steps.find((step) => step.status === "doing");
  const next = cp?.next ?? task?.next ?? doing?.text ?? task?.steps.find((step) => step.status === "todo")?.text ?? "Wait for the user's next request.";
  const core = [
    "## Handoff",
    `Project: ${root}`,
    "Full state: .pi/memory/task.json and .pi/memory/project.json in this project. Read applicable project constraints before work; use targeted reads, not a full state reload.",
    "Read now, then do Next. Revalidate saved facts before edits or final claims. Stop if the latest request is already answered.",
  ];
  if (task) core.push(`Task: ${task.title}`, `Goal: ${task.goal}`);
  else core.push("No active task.");
  if (task?.constraints) core.push(`Constraints: ${task.constraints}`);
  if (doing) core.push(`Doing: ${doing.id} ${doing.text}`);
  core.push(`Next: ${next}`);
  if (cp?.head || cp?.branch) core.push(`Git: ${cp.branch ?? "unknown branch"} @ ${cp.head ?? "unknown HEAD"}`);
  if (cp?.dirty?.length) core.push(`Dirty: ${cp.dirty.join(", ")}`);
  if (cp?.context) core.push(`Critical context:\n${cp.context}`);
  if (cp?.readNow.length) core.push("Read now:", ...cp.readNow.map((file) => `${file.path}${file.lines ? ` ${file.lines}` : ""}: ${file.reason}`));
  if (task) core.push(...task.issues.filter((issue) => !issue.resolved).map((issue) => `Blocker: ${issue.text}`));
  if (warnings.length) core.push("[task-memory] Resume checks:", ...warnings);
  let summary = core.join("\n");
  if (textTokens(summary) > maxTokens) throw new HandoffBudgetError(`Required handoff content exceeds the estimated ${maxTokens}-token limit. Shorten critical context/readNow or use a larger model. No compaction was performed and existing state was not discarded.`);
  const optional = [
    ...(task?.decisions ?? []).map((decision) => `Decision: ${decision.text}${decision.why ? ` (${decision.why})` : ""}`),
    ...(task?.steps ?? []).filter((step) => step.status === "done" && step.evidence).reverse().map((step) => `Verified: ${step.text}: ${step.evidence}`),
    ...(cp?.known ?? []).map((known) => `Known: ${known.path}: ${known.fact}`),
    ...project.decisions.map((decision) => `Project decision: ${decision.text}`),
    ...project.conventions.map((convention) => `Convention: ${convention.text}`),
    ...(cp?.readLater ?? []).map((file) => `Read later${file.step ? ` step ${file.step}` : ""}: ${file.path}${file.lines ? ` ${file.lines}` : ""}`),
    ...project.verify.map((verify) => `Verify ${verify.name}: ${verify.cmd}`),
    ...(task?.notes ?? []).map((note) => `Note: ${note.text}`),
  ];
  for (const line of optional) {
    const candidate = `${summary}\n${line}`;
    if (textTokens(candidate) <= maxTokens) summary = candidate;
  }
  return summary;
}
