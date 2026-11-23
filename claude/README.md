# claude-config

Personal Claude Code config, symlinked into `~/.claude`.

```
scripts/install.sh [--dry-run] [--check]
scripts/uninstall.sh [--dry-run]
```

- `skills/` and `hooks/` here are symlinks to `../shared/`, which holds the real files shared with other agent configs.
- install: links CLAUDE.md, settings.json, each skill in skills/, each file in hooks/. Existing real files are moved to `~/.claude/.config-backups/<timestamp>/`. Stale symlinks are replaced.
- --check: reports items that are not linked, exit 1 if any.
- uninstall: replaces each link that points into this repo with a plain copy, so no config is lost.
- Set CLAUDE_DIR to target a directory other than ~/.claude.
- Requires jq for the hooks.
- Never put transcripts, history, .env values or settings.local.json here.
