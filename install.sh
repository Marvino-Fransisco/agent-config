#!/bin/sh
set -eu

repo=$(pwd -P)
agent_dir=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
test -f "$repo/extensions/ui/index.ts"
test -f "$repo/extensions/brainstorming/index.ts"
test -f "$repo/skills/brainstorm/SKILL.md"
test -f "$repo/skills/domain-modeling/SKILL.md"
test -f "$repo/skills/teach/SKILL.md"
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

for name in shared ui task-memory prompt tutor undo-send brainstorming; do
  link "$repo/extensions/$name" "$agent_dir/extensions/$name"
done
for name in brainstorm domain-modeling teach; do
  link "$repo/skills/$name" "$agent_dir/skills/$name"
done
