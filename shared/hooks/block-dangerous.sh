#!/bin/bash
set -e
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
block() { echo "Blocked by block-dangerous hook: $1" >&2; exit 2; }

is_env_path() {
  local b
  b=$(basename -- "$1")
  case "$b" in
    .env.example|.env.sample|.env.template|.env.dist) return 1 ;;
    .env|.env.*) return 0 ;;
  esac
  return 1
}

if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  if printf '%s' "$cmd" | grep -Eq '(^|[^[:alnum:]_./-])rm[[:space:]]+(-[[:alnum:]-]+[[:space:]]+)*-[[:alnum:]]*[rR]|(^|[^[:alnum:]_./-])rm[[:space:]]+.*(--recursive|[[:space:]]-[[:alnum:]]*[rR])'; then
    block "recursive rm is not allowed"
  fi
  if printf '%s' "$cmd" | grep -Eq 'find[[:space:]].*(-delete|-exec[[:space:]]+rm)'; then
    block "find with delete/rm is not allowed"
  fi
  if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+(-[^[:space:]]+[[:space:]]+([^[:space:]-][^[:space:]]*[[:space:]]+)?)*reset[[:space:]].*--hard'; then
    block "git reset --hard is not allowed"
  fi
  for tok in $(printf '%s' "$cmd" | tr -s '[:space:]<>|;&()"'"'"'' '\n'); do
    if is_env_path "$tok"; then block ".env access via shell is not allowed"; fi
  done
fi

if [ "$tool" = "Read" ] || [ "$tool" = "Edit" ] || [ "$tool" = "Write" ] || [ "$tool" = "NotebookEdit" ]; then
  f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
  if [ -n "$f" ] && is_env_path "$f"; then block ".env file access is not allowed"; fi
fi
exit 0
