#!/bin/sh
set -eu

. "$(dirname "$0")/links.sh"

status=0
unlink_owned() {
  if [ -L "$2" ] && [ "$(readlink -n "$2" && printf '.')" = "$1." ]; then
    if [ "$1" = "$repo/extensions/shared" ] && [ -e "$agent_dir/extensions/long-memory" ]; then
      printf 'Kept %s (needed by the separately installed long-memory extension)\n' "$2"
    elif rm "$2"; then
      printf 'Removed %s\n' "$2"
    else
      status=1
    fi
  elif [ -e "$2" ] || [ -L "$2" ]; then
    printf 'Left unchanged (not a link installed from this checkout): %s\n' "$2" >&2
    status=1
  fi
}

for name in $extension_names; do
  unlink_owned "$repo/extensions/$name" "$agent_dir/extensions/$name"
done
for dst in "$agent_dir/skills/"*; do
  name=${dst##*/}
  src="$repo/skills/$name"
  if [ -f "$src/SKILL.md" ] || { [ -L "$dst" ] && [ "$(readlink -n "$dst" && printf '.')" = "$src." ]; }; then
    unlink_owned "$src" "$dst"
  fi
done
exit "$status"
