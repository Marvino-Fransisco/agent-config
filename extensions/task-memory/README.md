# task-memory

Pi extension that keeps long-running work resumable across context compaction and new sessions.

## What it does

- **Durable state** in `<git root>/.pi/memory/` (it contains its own `.gitignore` with `*`, so nothing gets committed; a bare `.pi/` does not trigger Pi's project-trust prompt):
  - `task.json`: the active task (goal, steps with verification evidence, decisions, issues, notes, next action, latest handoff)
  - `project.json`: durable repo knowledge (decisions, conventions, verify commands, key paths)
  - `thresholds.json`: per-checkout warning and mandatory handoff settings, when set with `/task threshold`
  - `archive/`: finished or abandoned tasks
- **`task` tool** for the model: `start`, `plan`, `step`, `update`, `checkpoint`, `finish`, `show`.
  It enforces one step in progress at a time, evidence before `done`, a final verification plus a docs note at `finish`, and size caps so memory stays short. A missing `action` is inferred when the other fields make it unambiguous.
- **Handoff at compaction**: before compacting, the agent writes a checkpoint (next action, *Read now* / *Read later* / *Known* files, critical context) in its own tool call. A prioritized, model-budgeted version becomes the compaction summary; full saved state stays on disk. Required content is never silently cut to fit. Oversized required content, clipped checkpoint fields, stale state, or a checkpoint turn shared with other tools prevent custom compaction and retain the conversation.
- **Project identity**: task memory and long memory use the same canonical Git checkout root, or canonical session directory outside Git. The task panel and tool results identify the project and full path. Editing a detectable file outside the root warns without changing the target. If legacy task files would resolve to a different root, the extension reports both paths and refuses writes rather than migrating them automatically.
- **Context thresholds**
  - ≥ 50% by default: warning. The agent writes a handoff and compacts at the next step boundary, or when the run ends.
  - ≥ 75% by default: mandatory. Every tool except `task` is blocked until the handoff exists. After 3 ignored turns, the conversation is retained and the block is lifted; Pi's normal auto-compaction or a subsequent `/compact` can summarize it.
  - `/compact` also has the agent write the handoff first. If it doesn't, the conversation is retained; run `/compact` again to use Pi's default summarizer.
  - Pi's own auto-compaction stays on as a safety net. If it fires, the saved task state is re-injected afterwards and may need reconciliation with the summary.
- **Headless runs** (`pi -p`, `--mode json`): no turn is added after the final answer, so the printed answer stays intact. The end-of-run handoff and the progress reminder are skipped; if a handoff is unavailable at the mandatory threshold, the conversation is retained for Pi's normal compaction.
- **New session**: saved state is loaded with a one-line notice. The agent continues only if your request relates to it, you say "continue", or you run `/task resume`. Resume checks checkpoint Git HEAD, branch and working-tree status; dirty files require revalidation even when the status is unchanged. After `/tree`, the agent is warned to reconcile disk memory with the conversation branch.
- **Progress sync**: for an engaged active task, tracked edits and changes detected in Git since the last progress update trigger one short extra turn per batch of changes. Project-only updates do not count as task progress. Pre-existing Git changes are captured as a baseline; the Git fingerprint is the `git status` list plus the size, mtime, ctime and inode of each changed or untracked file.
- **Memory errors**: failures to read task or project memory are reported to the user and agent instead of being treated as empty memory.
- **Phase widget** (above the editor): `idle · thinking · planning · exploring · coding · verifying · handoff · compacting · resuming`, with an animated working star, blue active phases, the task title, step progress, and a context warning line.

## Commands

| Command | Effect |
| --- | --- |
| `/task` | Toggle the task and project memory notes panel |
| `/task resume` | Continue the active task |
| `/task abandon` | Archive the active task as abandoned |
| `/task clear-archive` | Permanently delete archived tasks (asks for confirmation) |
| `/task threshold` | Show the current warning and mandatory handoff percentages |
| `/task threshold warning 20` | Set the warning percentage |
| `/task threshold mandatory 65` | Set the mandatory handoff percentage |

The task panel stays open while typing and refreshes task memory from disk once per second. `/task`, `/context`, and `/memory` open independent top-right panels: opening another closes the previous panel, without cross-panel tabs or left/right navigation. Each extension works on its own. The task panel receives focus when opened. Click it in fullscreen mode or press `Ctrl+Alt+T` (`Control+Option+T` on Mac) to focus task notes. Use the mouse wheel, up/down or `j`/`k` to scroll, and `Esc` to close the panel. `/task` toggles its panel. The task panel is hidden below 80 columns or 12 rows; `/context` and `/memory` fall back to separate screens.

## Configuration

| Env var | Default |
| --- | --- |
| `TASK_MEMORY_WARN_PCT` | `50` |
| `TASK_MEMORY_MUST_PCT` | `75` |

Both values must satisfy `0 < warning < mandatory < 100`. Command settings persist per checkout and override environment variables. Without saved settings, environment variables override the defaults; an invalid ordering falls back to both defaults. After compaction, thresholds may temporarily be raised above the post-compaction baseline to avoid an immediate repeat. The warning itself requests compaction at the next step boundary, so the mandatory threshold may never be reached.

## Handoff budgets

Budgeting uses Pi's token estimates with a 20% allowance, not a provider tokenizer. Summary content is capped at `min(2000, 4% of the active context window)`. Raw recent messages are capped at `min(effective keepRecentTokens, 5% of the window)`, with no minimum tail size. Both are further constrained by fixed prompt/tool overhead and a combined target five percentage points below the configured warning, minus a 2%-of-window safety margin, and below Pi's automatic compaction threshold. For example, with sufficient room an 8K model allows up to 320 estimated summary tokens and 400 estimated tail tokens; these are ceilings, not guaranteed retained sizes.

The summary preserves the task goal, constraints, active step, next action, critical context, required reads, blockers and resume checks first. Decisions, verification evidence and other references are included only if they fit as whole items. Omitted details remain in the task/project files; the summary points to them for targeted reads. If essential content cannot fit, shorten the checkpoint or use a larger model. A raw tool-call/result group that exceeds the tail budget is omitted as a whole rather than split. Repeated compactions also consider messages retained by the previous compaction.

The same policy applies to direct checkpoints, a fresh checkpoint used by `/compact`, and automatic task/project injection on resume or after Pi's default compaction. Effective per-model `reserveTokens` and `keepRecentTokens` overrides are respected and budgets are recalculated for model changes. Automatic compaction without new work or a relevant state/model/settings change is stopped to avoid retry loops. No budget indicator is added to the UI.

If Pi's effective reserve is at least the model context window, or fixed prompts/tools already exceed the target, the extension reports the incompatible settings instead of repeatedly compacting. Configure an appropriate `compaction.modelOverrides["provider/modelId"]` in Pi settings; the extension does not rewrite those settings. Pi's default summarizer remains a fallback and its output is not hard-capped by the custom handoff summary limit. Token estimates and safety margins cannot guarantee that every provider's exact token count will fit.

## Files

- `index.ts`: Pi registration, lifecycle hooks, and shared runtime state
- `actions/`: task tool action handling
- `schema/`: task tool input schema
- `compaction/`: compaction draft and session hash lookup
- `ui/`: phase widget and sticky notes overlay
- `state/`: data model, rules, rendering, storage (no Pi imports)
- `phase/`: tool classification, phase, thresholds (no Pi imports)
- `prompts/`: text sent to the model

Each module with its own types keeps them in a corresponding `*.types.ts` file beside its implementation. The root `index.ts` remains the Pi extension entry point.

## Development

```bash
npm install
npm test            # unit + hook tests (Pi packages stubbed), no model calls
npm run typecheck   # tsconfig paths point at the installed Pi release
ln -s "$PWD/extensions/task-memory" ~/.pi/agent/extensions/task-memory   # install
```

Also link `extensions/shared/` beside the extension links, following [Installing symlinked extensions](../../README.md#installing-symlinked-extensions). Pi resolves sibling imports from the installed location, so the shared link is required.

After a Pi upgrade, update the release path in `tsconfig.json`.

## Known limits

- One active task per checkout (git worktrees each get their own). Two sessions in the same checkout: the last write wins.
- Git-based progress detection is best effort: ignored files are not detected. Shell edits are not listed as touched files individually; non-Git directories and failed Git commands cannot use this signal.
- Git status cannot prove dirty file contents are unchanged; resume asks the agent to revalidate them. Checkpoint dirty-file lists are capped at 15 entries.
- Memory lives on disk, so it does not rewind with `/tree`; navigation warns the agent but does not automatically reconcile state.
- An intercepted `/compact` may be reported as cancelled before the handoff turn runs.
- The notes panel overlays existing terminal content; it does not reserve a separate column.
