# agent-config

Personal configuration for coding agents.

| Folder | What it holds |
| --- | --- |
| [claude/](claude/README.md) | Claude Code config, symlinked into `~/.claude` by `claude/scripts/install.sh`. |
| [pi/](pi/README.md) | Pi extensions and links into the shared skill tree, installed by `pi/scripts/install.sh`. |
| shared/ | Canonical skills, templates, and the `block-dangerous` hook used by both agents. |

The workflows in [`shared/skills/`](shared/skills) do not require agent-specific tools or extensions. Keep tool names and integration instructions in the agent-specific folders, not in the shared skills.

Keep the checkout at a stable location, since the installed links point into it. Keep `.env` files, transcripts and `settings.local.json` out of the repo.
