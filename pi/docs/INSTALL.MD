# Install Pi configuration

This guide installs the extensions globally for your user on macOS or Linux. If an agent is helping you, have it check the existing Pi installation and destination paths first. Do not replace existing links, change global Pi settings, or set up the optional database without the user's approval.

## 1. Check prerequisites

You need Git, Node.js 22.19 or newer, Pi, and `jq` for the shared tool guard. This repository has been verified with Pi 1.6.0.

```sh
git --version
node --version
pi --version
jq --version
```

If Pi is missing and you have npm, install the tested release:

```sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.6.0
```

If Pi is already installed, do not replace it just to follow this guide. Check that the extensions load on your version before treating the setup as complete.

## 2. Link the core extensions, skills, and tool guard

This configuration lives in the `pi/` folder of the `agent-config` repository. Open that folder in a terminal. If you do not already have a checkout, clone the repository first:

```sh
git clone https://github.com/Marvino-Fransisco/agent-config.git
cd agent-config/pi
```

Keep the checkout at a stable location: Pi loads directly from these links. The core extensions do not need a database or a separate `npm install`.

Run [scripts/install.sh](../scripts/install.sh) from the `pi/` folder. It leaves correct links alone and stops at a conflicting path, including a broken symlink. Inspect a conflict before moving or replacing anything; rerunning the script is safe after resolving it.

```sh
./scripts/install.sh
```

`shared` is not a standalone extension; keep it alongside the extension links so relative imports resolve. `pi/skills` and `claude/skills` both point to `shared/skills`, the only place to edit skill instructions and templates. The installer discovers all shared skill directories with a `SKILL.md`; existing Pi links from this checkout remain valid. Rerun the installer to pick up new skill directories and the `shared-hook` extension. The extension invokes `shared/hooks/block-dangerous.sh` for Pi tool calls to `bash`, `read`, `edit`, and `write`. Run `/skill:teach <topic>` from the directory where you want to keep your lessons and learning records.

## 3. Reload and verify

Start `pi` from the workspace you want to use, or run `/reload` in an existing Pi session. Check for extension load errors, then try:

| Check | Expected result |
| --- | --- |
| `/context` and `/task` | The context report and task panel open in turn. |
| `/tutor` | Tutor opens. In fullscreen at 76 columns or wider (and at least 12 rows), it appears beside Main. Otherwise it uses an overlay if there is enough space. |
| `/prompt` | The last sent Main prompt opens, or Pi reports that none is saved for this workspace yet. |
| `/skill:brainstorm`, `/skill:debugging`, `/skill:domain-modeling`, `/skill:spec`, and `/skill:teach` autocomplete | All five shared skills are listed. You do not need to run them to verify discovery. |
| `/decision` | Opens the brainstorming panel; on a new session it shows that no brainstorm has started. |
| `/glossary` | Lists terms from the project's `GLOSSARY.md`, or reports that no glossary exists. See the [format and lookup guide](../README.md#brainstorming-and-project-glossary). |

To send a message, select a configured model with `/model`. If needed, use `/login` to connect a supported provider. Do not paste credentials into an agent conversation. Sending a Tutor question uses the selected provider; the checks above do not require a model call.

If Pi reports a missing `../shared/...` module, verify that all links point to the same `pi/` folder and that `shared` is present under the active agent directory. If commands are missing, check that `PI_CODING_AGENT_DIR` was the same for installation and launch, then reload.

## Optional extras

- **Long-term memory:** Follow the [long-memory setup guide](../extensions/long-memory/README.md#setup) for npm dependencies, PostgreSQL with pgvector, and Gemini credentials. After setup, `/memory` should open its dashboard. None of this is required for Tutor or task-memory.
- **tmux wheel fallback:** If you use tmux with `set -g mouse on`, you can load `tmux-scroll.conf` to map wheel events to Page Up/Down in fullscreen apps that do not report mouse input. From this checkout, run `tmux source-file "$PWD/tmux-scroll.conf"` in a running tmux session. To keep it across restarts, add `source-file /absolute/path/to/agent-config/pi/tmux-scroll.conf` after plugins in `~/.tmux.conf`. Do not restart or kill the tmux server just to reload it.

## Uninstall

Follow [UNINSTALL.md](UNINSTALL.md) to remove the Pi configuration links without deleting your checkout or data.
