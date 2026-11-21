#!/bin/sh
set -eu

. "$(dirname "$0")/links.sh"
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

for name in $extension_names; do
  link "$repo/extensions/$name" "$agent_dir/extensions/$name"
done
for name in $skill_names; do
  link "$repo/skills/$name" "$agent_dir/skills/$name"
done
