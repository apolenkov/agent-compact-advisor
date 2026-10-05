# Records demo/demo.gif: `vhs demo/demo.tape` from the repository root.
# Needs Claude Code 2.1.287+ with agent-compact-advisor and agent-shell-watch
# installed from the agent-watch marketplace (shell-watch reports background
# calls; without it the score is capped at 60). Runs in an empty project at
# /tmp/demo-cca without user settings (no personal hooks, status line or other
# mods) or personal instructions (agents-md managed-only). The thresholds are
# lowered so one turn scores high: minTokens 5k, fullTokens 20k, Kev's P1 off,
# leftover lines read as "Leftovers:". Two Haiku calls: the turn and the
# /compact it suggests.

Output demo/demo.gif

Require claude

Set Shell "zsh"
Set FontSize 15
Set Width 1280
Set Height 560
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 25ms

Hide
Type `unset CLAUDE_CODE_CHILD_SESSION CLAUDECODE; mkdir -p /tmp/demo-cca; cd /tmp/demo-cca; clear`
Enter
Type `claude --model haiku --setting-sources project,local --settings '{"enabledPlugins":{"agent-compact-advisor@agent-watch":true,"agent-shell-watch@agent-watch":true},"pluginConfigs":{"agents-md@builtin":{"options":{"instructionFiles":"managed-only"}},"agent-compact-advisor@agent-watch":{"options":{"minTokens":5000,"fullTokens":20000,"systemOneUrl":"","leftoverPrefixes":"Leftovers:"}}}}'`
Enter
Sleep 6s
# Trusts the folder on a first run; an empty prompt box ignores both keys.
Down
Enter
Sleep 3s
# Clears the launch command off the screen.
Ctrl+L
Sleep 1s
Show

Sleep 1s
Type "Keep npm, not pnpm: CI caches npm. Confirm in one short line, then a new line: Leftovers: none"
Sleep 500ms
Enter
Sleep 4s
# Cuts the rest of the model's wait: on until the score is ready.
Hide
Wait+Screen@60s /good moment to \/compact/
Show
Sleep 3s

# The suggestion is in the empty box: Tab takes it, Enter runs it.
Tab
Sleep 2s
Enter
Sleep 3s
# Cuts most of the compaction's wait.
Hide
Wait+Screen@90s /small context/
Show
Sleep 3s

# Explains the score; the size gate is back after the compaction.
Type "/compact-advisor"
Sleep 300ms
Enter
Sleep 7s
