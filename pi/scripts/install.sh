#!/bin/sh
set -eu

. "$(dirname "$0")/links.sh"
test -f "$repo/extensions/ui/index.ts"
test -f "$repo/extensions/brainstorming/index.ts"
test -d "$repo/skills"
test -f "$repo/extensions/shared-hook/index.ts"
test -x "$repo/../shared/hooks/block-dangerous.sh"
if ! command -v jq >/dev/null 2>&1; then
  printf 'Install jq to use the shared block-dangerous hook.\n' >&2
  exit 1
fi
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
skill_sources | while IFS= read -r src; do
  link "$src" "$agent_dir/skills/${src##*/}"
done
