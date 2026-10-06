#!/bin/sh
# Copies the API declarations the local Claude Code engine wrote into engine-types/.
# The engine writes them when the plugin-authoring skill loads (run /plugin-authoring
# in any session first) and beside a mod loaded with --plugin-dir.
set -eu
cd "$(dirname "$0")/.."
dst=engine-types/claude-code.d.ts
# /tmp is shared: take the newest candidate that is a regular file, not a symlink,
# and really lives where the engine writes (/private/tmp resolves to /tmp on macOS).
src=
candidates=$(ls -t /private/tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts \
  /tmp/claude-*/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts \
  .claude-plugin/types/claude-code/index.d.ts 2>/dev/null || true)
IFS='
'
for f in $candidates; do
  r=$(realpath "$f" 2>/dev/null) || continue
  case $r in
    /private/tmp/claude-*/bundled-skills/*/plugin-authoring/types/claude-code.d.ts | /tmp/claude-*/bundled-skills/*/plugin-authoring/types/claude-code.d.ts | "$PWD"/.claude-plugin/types/claude-code/index.d.ts) ;;
    *) continue ;;
  esac
  [ -f "$f" ] && [ ! -L "$f" ] && { src=$f; break; }
done
unset IFS
[ -n "$src" ] || { echo "no declarations found: run /plugin-authoring in a Claude Code session first" >&2; exit 1; }
if [ -n "$(git status --porcelain -- "$dst" 2>/dev/null)" ]; then
  echo "warning: $dst has uncommitted changes, overwriting" >&2
fi
cp "$src" "$dst"
echo "copied $src -> $dst"
head -n 1 "$dst"
