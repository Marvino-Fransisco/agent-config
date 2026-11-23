#!/bin/bash
set -eu
. "$(dirname "$0")/lib.sh"
parse_flags "$@"

while IFS='|' read -r src dst; do
  if ! is_linked "$src" "$dst"; then
    if [ -L "$dst" ]; then echo "skip     $dst (link points elsewhere)"; fi
    continue
  fi
  run rm "$dst"
  run cp -R "$src" "$dst"
  echo "unlinked $dst (replaced with a copy)"
done < <(items)
