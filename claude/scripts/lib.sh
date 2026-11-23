REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${CLAUDE_DIR:-$HOME/.claude}"
DRY=0
CHECK=0

parse_flags() {
  for a in "$@"; do
    case "$a" in
      --dry-run) DRY=1 ;;
      --check) CHECK=1 ;;
      *) echo "unknown flag: $a" >&2; exit 1 ;;
    esac
  done
}

items() {
  for f in CLAUDE.md settings.json; do
    [ -e "$REPO/$f" ] && printf '%s|%s\n' "$REPO/$f" "$TARGET/$f"
  done
  for d in skills hooks; do
    [ -d "$REPO/$d" ] || continue
    for p in "$REPO/$d"/*; do
      [ -e "$p" ] && printf '%s|%s\n' "$p" "$TARGET/$d/$(basename "$p")"
    done
  done
}

run() {
  if [ "$DRY" = 1 ]; then echo "[dry-run] $*"; else "$@"; fi
}

is_linked() {
  [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]
}
