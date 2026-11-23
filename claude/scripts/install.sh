#!/bin/bash
set -eu
. "$(dirname "$0")/lib.sh"
parse_flags "$@"

STAMP=$(date +%Y%m%d%H%M%S)
BACKUP="$TARGET/.config-backups/$STAMP"
STATUS=0

while IFS='|' read -r src dst; do
  if is_linked "$src" "$dst"; then
    echo "ok       $dst"
    continue
  fi
  if [ "$CHECK" = 1 ]; then
    echo "NOT LINKED $dst"
    STATUS=1
    continue
  fi
  run mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ]; then
    run rm "$dst"
    echo "relink   $dst (replaced stale symlink)"
  elif [ -e "$dst" ]; then
    rel="${dst#"$TARGET"/}"
    run mkdir -p "$BACKUP/$(dirname "$rel")"
    run mv "$dst" "$BACKUP/$rel"
    echo "backup   $dst -> $BACKUP/$rel"
  fi
  run ln -s "$src" "$dst"
  echo "linked   $dst -> $src"
done < <(items)

exit $STATUS
