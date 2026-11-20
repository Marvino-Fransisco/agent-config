# Install Pi configuration

This guide installs the extensions globally for your user on macOS or Linux. If an agent is helping you, have it check the existing Pi installation and destination paths first. Do not replace existing links, change global Pi settings, or set up the optional database without the user's approval.

## 1. Check prerequisites

You need Git, Node.js 22.19 or newer, and Pi. This repository has been verified with Pi 1.6.0.

```sh
git --version
node --version
pi --version
```

If Pi is missing and you have npm, install the tested release:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.6.0
```

If Pi is already installed, do not replace it just to follow this guide. Check that the extensions load on your version before treating the setup as complete.

## 2. Link the core extensions and skill

Open the root of this repository in a terminal. If you do not already have a checkout, clone it first:

```sh
git clone https://github.com/Marvino-Fransisco/pi-config.git
cd pi-config
```

Keep the checkout at a stable location: Pi loads directly from these links. The core extensions do not need a database or a separate `npm install`.

Run this from the repository root. It leaves correct links alone and stops at a conflicting path, including a broken symlink. Inspect a conflict before moving or replacing anything; rerunning the block is safe after resolving it.

```sh
(
  set -eu
  repo=$(pwd -P)
  agent_dir=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
  test -f "$repo/extensions/ui/index.ts"
  test -f "$repo/skills/teaching/SKILL.md"
  mkdir -p "$agent_dir/extensions" "$agent_dir/skills"

  link() {
    test -d "$1"
    if [ -L "$2" ] && [ "$1" -ef "$2" ]; then
      return
    fi
    if [ -e "$2" ] || [ -L "$2" ]; then
      printf 'Existing path; inspect before replacing: %s\n' "$2" >&2
      return 1
    fi
    ln -s "$1" "$2"
  }

  for name in shared ui task-memory prompt tutor undo-send; do
    link "$repo/extensions/$name" "$agent_dir/extensions/$name"
  done
  link "$repo/skills/teaching" "$agent_dir/skills/teaching"
)
```

`shared` is not a standalone extension; keep it alongside the extension links so relative imports resolve. The skill link makes `/skill:teaching` available in Main. Tutor reads the same skill from this checkout.

## 3. Reload and verify

Start `pi` from the workspace you want to use, or run `/reload` in an existing Pi session. Check for extension load errors, then try:

| Check | Expected result |
| --- | --- |
| `/context` and `/task` | The context report and task panel open in turn. |
| `/tutor` | Tutor opens. In fullscreen at 76 columns or wider (and at least 12 rows), it appears beside Main. Otherwise it uses an overlay if there is enough space. |
| `/prompt` | The last sent Main prompt opens, or Pi reports that none is saved for this workspace yet. |
| `/skill:teaching` autocomplete | The teaching skill is listed. You do not need to run it to verify discovery. |

To send a message, select a configured model with `/model`. If needed, use `/login` to connect a supported provider. Do not paste credentials into an agent conversation. Sending a Tutor question uses the selected provider; the checks above do not require a model call.

If Pi reports a missing `../shared/...` module, verify that all links point to the same checkout and that `shared` is present under the active agent directory. If commands are missing, check that `PI_CODING_AGENT_DIR` was the same for installation and launch, then reload.

## Optional extras

- **Long-term memory:** Follow the [long-memory setup guide](extensions/long-memory/README.md#setup) for npm dependencies, PostgreSQL with pgvector, and Gemini credentials. After setup, `/memory` should open its dashboard. None of this is required for Tutor or task-memory.
- **tmux wheel fallback:** If you use tmux with `set -g mouse on`, you can load `tmux-scroll.conf` to map wheel events to Page Up/Down in fullscreen apps that do not report mouse input. From this checkout, run `tmux source-file "$PWD/tmux-scroll.conf"` in a running tmux session. To keep it across restarts, add `source-file /absolute/path/to/pi-config/tmux-scroll.conf` after plugins in `~/.tmux.conf`. Do not restart or kill the tmux server just to reload it.

## Uninstall

Remove only the symlinks you installed after checking their targets, then run `/reload`. Do not remove `shared` if another installed extension still uses it. The repository, project history, and any optional PostgreSQL data are separate and are not removed by unlinking.
