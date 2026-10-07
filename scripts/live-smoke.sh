#!/bin/sh
# Live smoke of what a headless run cannot show: a real interactive session in
# tmux over a throwaway git repository, checked on the captured screen: after a
# first turn the status line says everything is recorded (git, asked by the
# mod); a background wait is named and does not stand in the way; a changed
# file gates ("uncommitted changes"); after its commit the unpushed commit
# gates; an answer that promises more work is lowered to early by the model
# check. Needs tmux, git and a Claude login; costs a few cents (haiku, four
# small turns). Run: npm run smoke:live
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
session=ccasmoke$$
project=$(mktemp -d /tmp/cca-smoke.XXXXXX)
home=$(mktemp -d /tmp/cca-smoke-home.XXXXXX)

screen() { tmux capture-pane -t "$session" -p -J; }

# wait_for <pattern> <seconds>: poll the screen until the pattern shows.
wait_for() {
  i=0
  while [ "$i" -lt "$2" ]; do
    screen | grep -q -- "$1" && return 0
    sleep 1
    i=$((i + 1))
  done
  echo "FAIL: '$1' did not show in $2 s. Screen:" >&2
  screen >&2
  exit 1
}

cleanup() {
  tmux kill-session -t "$session" 2>/dev/null || true
  rm -rf "$project" "$project-remote" "$home"
}
trap cleanup EXIT

# agent-shell-watch reports the background calls; use SHELL_WATCH_DIR, else the
# newest installed copy. Without one the background step is skipped, said aloud.
watch=${SHELL_WATCH_DIR:-$(ls -d "$HOME"/.claude/plugins/cache/agent-mods/agent-shell-watch/*/ 2>/dev/null | sort -V | tail -n 1)}
watch=${watch%/}
watch_flag=""
[ -n "$watch" ] && watch_flag="--plugin-dir '$watch'"

# A throwaway project and HOME; the only link to the real home is the login
# keychain, so the session can reach Claude.
rm -rf "$project" "$project-remote" "$home"
mkdir -p "$project" "$home/Library"
git -C "$project" init -q
echo one > "$project/file.txt"
git -C "$project" add file.txt
git -C "$project" -c user.email=smoke@example.com -c user.name=smoke commit -q -m base
# A remote of its own: without one every commit counts as unpushed.
git init -q --bare "$project-remote"
git -C "$project" remote add origin "$project-remote"
git -C "$project" push -q -u origin HEAD
ln -s "$HOME/Library/Keychains" "$home/Library/Keychains"
printf '%s\n' "{\"hasCompletedOnboarding\":true,\"theme\":\"dark\",\"projects\":{\"$project\":{\"hasTrustDialogAccepted\":true},\"/private$project\":{\"hasTrustDialogAccepted\":true}}}" > "$home/.claude.json"

tmux new-session -d -s "$session" -x 150 -y 45 \
  "unset CLAUDE_CODE_CHILD_SESSION CLAUDECODE; export HOME=$home; cd $project; claude --model haiku --plugin-dir '$repo' $watch_flag --setting-sources project,local --settings '{\"pluginConfigs\":{\"agents-md@builtin\":{\"options\":{\"instructionFiles\":\"managed-only\"}},\"agent-compact-advisor@inline\":{\"options\":{\"language\":\"en\",\"minTokens\":1000}}},\"permissions\":{\"allow\":[\"Bash\"]}}'"

# The status line is the one line that names "everything recorded"; the prompt
# box can echo what is typed, so each check looks for the words only the mod says.
send() {
  tmux send-keys -t "$session" "$1"
  sleep 1
  tmux send-keys -t "$session" C-m
}

wait_for '❯' 60
send "Reply: OK, ready. Then a new line: Leftovers: none"
wait_for 'everything recorded' 120
if screen | grep -q 'too early'; then
  echo "FAIL: a clean repository and a small turn read too early. Screen:" >&2
  screen >&2
  exit 1
fi
echo "ok: git says everything is recorded, and the line is not too early"

send "Reply with exactly this and nothing else: I will now refactor the parser next. Leftovers: none"
wait_for 'promises more work' 120
echo "ok: haiku reads the answer and lowers it to early when it promises more work"

if [ -n "$watch" ]; then
  send "Run one Bash call in the background (run_in_background): sleep 300. Only run it, then reply exactly: Background wait started, nothing else to do."
  wait_for 'watchers running' 120
  echo "ok: the background wait is named and does not gate"
else
  echo "skipped: no agent-shell-watch (set SHELL_WATCH_DIR), so no background step"
fi

send "Run: echo two >> file.txt (Bash, foreground). Then say done."
wait_for 'uncommitted changes: 1 files' 120
echo "ok: a changed file gates"

send "Run: git -c user.email=a@b.c -c user.name=s commit -qam change (Bash, foreground). Then say committed."
wait_for 'unpushed commits: 1' 120
echo "ok: the commit gates until it is pushed"
