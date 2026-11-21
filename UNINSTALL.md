# Uninstall Pi configuration

From the same checkout you used to install, run:

```sh
./scripts/uninstall.sh
```

If you set `PI_CODING_AGENT_DIR` at install time, use the same value. Then run `/reload` in any open Pi session, or restart Pi.

## What the script removes

[`scripts/install.sh`](scripts/install.sh) creates symlinks under `~/.pi/agent/extensions/` and `~/.pi/agent/skills/` (or the corresponding folders under `PI_CODING_AGENT_DIR`). Pi loads the extensions and skills directly from the linked directories in this checkout; the installer doesn't copy their source or register an npm package.

[`scripts/uninstall.sh`](scripts/uninstall.sh) removes only the known installer links whose targets match this checkout. It skips missing links and reports conflicting files, directories, or links without removing them. It keeps the `shared` link if a separately installed `long-memory` extension still uses it. If you moved the checkout after installing, inspect the reported stale links and remove them manually only after verifying their targets.

The script leaves Pi, this checkout, third-party packages, settings, sessions, project history, and database data intact. It also leaves optional setup such as the long-memory extension and tmux configuration in place.
