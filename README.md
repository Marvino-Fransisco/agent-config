# Pi configuration

`extensions/ui/index.ts` registers the custom editor and path/model widget. `extensions/task-memory/` provides separate context handoff warnings. Run `/context` to toggle the top-right context panel with a colored usage grid, category legend and ranking of retained tool results; `/task`, `/context`, and `/memory` each open an independent top-right panel, replacing the previously open panel. Panel titles are bold blue with distinct icons: `◆` memory, `☷` context, and `☑` task. Horizontal rules separate panel headers, content and footers, joining the outer borders edge-to-edge. Memory statistics show four bordered summary cards in one row, stacking into a 2×2 layout on narrower panels, plus separate cards for search coverage, scope, kinds and retrieval settings. Charts use compact thin bars with blank rows between them. The memory panel bounds its content viewport to the terminal height and keeps its header, query input and compact footer pinned; arrows, Page Up/Down and the wheel over content scroll the body without moving the controls. Query inputs have labeled card borders on taller terminals. Ready, loading and empty-result states use explanatory cards instead of a blank content strip; empty modes show search/filter/refresh actions rather than select/open controls. Search and debug query labels identify Google as the query destination. Scrollable panels show the visible row range. There are no cross-panel tabs or left/right navigation. Panels receive focus when opened; scroll with up/down or `j`/`k` and press Escape to close the active panel. `Ctrl+Alt+T` focuses task notes only. Context data refreshes once per second while open. The report shows a 20×10 grid beside the model and category legend when the panel is wide enough, and stacks them on narrower terminals. It uses Pi's character-based token estimates, not exact per-category provider counts. Each non-zero category gets at least one grid symbol, so tiny values are visible but may be visually overstated. The grid separately marks Pi's configured auto-compaction reserve; task-memory can trigger compaction earlier. The report does not independently measure tool schemas or skills, or recover tool results discarded by compaction. The current path and branch appear below the editor, with the model and thinking level aligned to the right. The task-memory phase row above the editor shows the animated working star and current phase; Pi's normal working indicator is retained if the task-memory widget is unavailable. Reload Pi with `/reload` after changing extensions.

In the TUI, a fresh session (startup or `/new` with no messages yet) shows a blue dashboard centered over the empty transcript in place of Pi's startup header: logo, version, model, working directory and branch, the active task when task-memory is loaded, and actions. Click a quick action (resume task, task notes, context, memory) to run its command; actions whose command is not registered are hidden. The first submitted message slides the dashboard up and away over about 300 ms. Set `"quietStartup": true` in `~/.pi/agent/settings.json` to hide Pi's loaded-resource listing below it.

The separate [long-memory extension](extensions/long-memory/README.md) provides explicit global and project memories with PostgreSQL, pgvector, Gemini embeddings, and a management TUI with statistics, scoped search/list filters, retrieval debug, and details. Writes require confirmation; exact duplicates are reused and content replacements retain revision history. See its README for the additive migration required by existing databases.

Task and long memory share a canonical project target: the session's Git checkout root, or the session directory outside Git. Panels and tool results label that target; `/memory project` and write confirmations show the full path. Editing another repository does not silently change scope. Task handoffs and automatic resume injection use model-scaled estimated-token budgets, preserving essential state and keeping full records on disk. Incompatible reserves, oversized required handoffs and no-progress compaction repeats are reported instead of silently discarding critical context. See [task-memory](extensions/task-memory/README.md#handoff-budgets) for the budget policy and limitations.

## Installing symlinked extensions

The extensions import sibling modules from `extensions/shared/`. When linking individual extensions into `~/.pi/agent/extensions/`, link the shared directory too; otherwise Pi's loader can fail with `Cannot find module '../shared/project.ts'` or a shared-panel import error.

From this repository root, create the link if it is not already present:

```sh
mkdir -p ~/.pi/agent/extensions
if [ ! -e ~/.pi/agent/extensions/shared ] && [ ! -L ~/.pi/agent/extensions/shared ]; then
  ln -s "$PWD/extensions/shared" ~/.pi/agent/extensions/shared
fi
```

If `shared` already exists, verify its target instead of overwriting it. Restart Pi or run `/reload` after fixing the link.

## Scrolling inside tmux

`tmux-scroll.conf` adds wheel routing for fullscreen applications without mouse reporting. With `set -g mouse on`, scrolling over such a pane sends Page Up/Down (one page per wheel event). Applications that request mouse input and tmux copy mode retain native mouse handling. Normal shell panes use tmux scrollback.

Load it after plugins in `~/.tmux.conf`:

```tmux
source-file ~/Documents/work/tools/pi-config/tmux-scroll.conf
```

Apply without restarting sessions:

```sh
tmux source-file ~/Documents/work/tools/pi-config/tmux-scroll.conf
```

In Pi, Page Up/Down scroll the fullscreen transcript; Home/End jump to its beginning/end. These actions must remain enabled in Pi keybindings. On a Mac keyboard, Fn+Up/Down commonly sends Page Up/Down.

To remove the fallback, remove the source line and restart tmux when your sessions are finished. Do not kill a running tmux server just to reload configuration.
