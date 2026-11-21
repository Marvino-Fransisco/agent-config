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

## 2. Link the core extensions and skills

Open the root of this repository in a terminal. If you do not already have a checkout, clone it first:

```sh
git clone https://github.com/Marvino-Fransisco/pi-config.git
cd pi-config
```

Keep the checkout at a stable location: Pi loads directly from these links. The core extensions do not need a database or a separate `npm install`.

Run [install.sh](install.sh) from the repository root. It leaves correct links alone and stops at a conflicting path, including a broken symlink. Inspect a conflict before moving or replacing anything; rerunning the script is safe after resolving it.

```sh
./install.sh
```

`shared` is not a standalone extension; keep it alongside the extension links so relative imports resolve. The skill links make `/skill:brainstorm`, `/skill:domain-modeling`, and `/skill:teach` available in Main. Run `/skill:teach <topic>` from the directory where you want to keep your lessons and learning records.

## 3. Reload and verify

Start `pi` from the workspace you want to use, or run `/reload` in an existing Pi session. Check for extension load errors, then try:

| Check | Expected result |
| --- | --- |
| `/context` and `/task` | The context report and task panel open in turn. |
| `/tutor` | Tutor opens. In fullscreen at 76 columns or wider (and at least 12 rows), it appears beside Main. Otherwise it uses an overlay if there is enough space. |
| `/prompt` | The last sent Main prompt opens, or Pi reports that none is saved for this workspace yet. |
| `/skill:brainstorm`, `/skill:domain-modeling`, and `/skill:teach` autocomplete | All three skills are listed. You do not need to run them to verify discovery. |
| `/decision` | Opens the brainstorming panel; on a new session it shows that no brainstorm has started. |
| `/glossary` | Lists terms from the project's `GLOSSARY.md`, or reports that no glossary exists. See the [format and lookup guide](README.md#brainstorming-and-project-glossary). |

To send a message, select a configured model with `/model`. If needed, use `/login` to connect a supported provider. Do not paste credentials into an agent conversation. Sending a Tutor question uses the selected provider; the checks above do not require a model call.

If Pi reports a missing `../shared/...` module, verify that all links point to the same checkout and that `shared` is present under the active agent directory. If commands are missing, check that `PI_CODING_AGENT_DIR` was the same for installation and launch, then reload.

## Optional extras

- **Long-term memory:** Follow the [long-memory setup guide](extensions/long-memory/README.md#setup) for npm dependencies, PostgreSQL with pgvector, and Gemini credentials. After setup, `/memory` should open its dashboard. None of this is required for Tutor or task-memory.
- **tmux wheel fallback:** If you use tmux with `set -g mouse on`, you can load `tmux-scroll.conf` to map wheel events to Page Up/Down in fullscreen apps that do not report mouse input. From this checkout, run `tmux source-file "$PWD/tmux-scroll.conf"` in a running tmux session. To keep it across restarts, add `source-file /absolute/path/to/pi-config/tmux-scroll.conf` after plugins in `~/.tmux.conf`. Do not restart or kill the tmux server just to reload it.

## Uninstall

Remove only the symlinks you installed after checking their targets, then run `/reload`. Do not remove `shared` if another installed extension still uses it. The repository, project history, and any optional PostgreSQL data are separate and are not removed by unlinking.
