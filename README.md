# agent-config

Personal configuration for coding agents.

| Folder | What it holds |
| --- | --- |
| [claude/](claude/README.md) | Claude Code config, symlinked into `~/.claude` by `claude/scripts/install.sh`. |
| [pi/](pi/README.md) | Pi extensions and skills, symlinked into `~/.pi/agent` by `pi/scripts/install.sh`. |
| shared/ | Skills and hooks used by `claude/` (reached through its `skills` and `hooks` symlinks). |

Keep the checkout at a stable location, since the installed links point into it. Keep `.env` files, transcripts and `settings.local.json` out of the repo.
