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
for name in $skill_names; do
  unlink_owned "$repo/skills/$name" "$agent_dir/skills/$name"
done
exit "$status"
