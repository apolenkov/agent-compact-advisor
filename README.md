# agent-compact-advisor

[![ci](https://github.com/apolenkov/agent-compact-advisor/actions/workflows/ci.yml/badge.svg)](https://github.com/apolenkov/agent-compact-advisor/actions/workflows/ci.yml)
[![codeql](https://github.com/apolenkov/agent-compact-advisor/actions/workflows/codeql.yml/badge.svg)](https://github.com/apolenkov/agent-compact-advisor/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/apolenkov/agent-compact-advisor/badge)](https://scorecard.dev/viewer/?uri=github.com/apolenkov/agent-compact-advisor)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Claude Code mod that tells you how good a moment it is to `/compact` now,
and why, and makes compaction safer. It never compacts by itself.

- **Status line** after every main turn: a score 0–100 and its signals.
- **Suggestion** past the threshold (70): a ready one-line `/compact …` in the
  empty prompt box, Tab takes it; one toast when the score first crosses.
- **Guard**: every `/compact` and auto-compaction of the main conversation gets
  a preservation template added after your own text (goal, decisions, open
  leftovers verbatim, absolute file paths, verification results, what not to
  do). It never cancels a compaction.
- **`/compact-advisor`**: explains the current score part by part.

```
agent-compact-advisor: score 98 · 400k 40% · leftovers none · P1 .90 · cache warm
agent-compact-advisor: score 0 · too early: 2 agents running · 400k 40%
agent-compact-advisor: score 60 · 400k 40% · leftovers unknown · P1 .72 · cache cold
```

## The score

A score, not a probability: nothing is calibrated.

Gates set it to 0: no context reading yet, context under `minTokens` (100k),
running agents, live background calls, or leftovers listed in the last answer.
Otherwise it is a weighted sum:

| Part      | Weight | Value                                                                            |
| --------- | ------ | -------------------------------------------------------------------------------- |
| fill      | 40     | from `minTokens` to `min(fullTokens, 90% of the window)`                         |
| leftovers | 30     | 1 when the last answer's leftover lines all say none                             |
| P1        | 20     | Kev's done-signal; 0 while asked; weight removed when Kev is off or down         |
| cache     | 10     | 1 within `cacheTtlMin` of the last turn (the compaction reads the cached prefix) |

It is capped at 60 while background work is unknown (agent-shell-watch not
loaded) or the last answer has no leftover lines, so a suggestion needs both
known.

**Leftovers** are read from lines starting with `Хвосты для агента:` and
`Хвосты для владельца:` (the last of each counts; list marks, quotes, bold and
code are tolerated). Both prefixes and the words meaning none (`нет`, `none`)
are settings: for an English convention set `leftoverPrefixes` to `Leftovers:`.

**P1** asks Kev (System One, `kev-latest`) one question over the last answer's
final 8000 characters, on loopback only, with a 20 s timeout.

**Background calls** come from
[agent-shell-watch](https://github.com/apolenkov/agent-shell-watch)'s call list.

## Install

Claude Code 2.1.287+ (mods are on by default).

```sh
claude plugin marketplace add apolenkov/agent-compact-advisor
claude plugin install agent-compact-advisor@agent-compact-advisor
```

Or try a checkout: `claude --plugin-dir /path/to/agent-compact-advisor`.

## Settings

| Setting            | Default                                     |                                                                    |
| ------------------ | ------------------------------------------- | ------------------------------------------------------------------ |
| `threshold`        | 70                                          | score from which the `/compact` is suggested                       |
| `minTokens`        | 100000                                      | below it the score is 0                                            |
| `fullTokens`       | 300000                                      | context at which the fill part is complete                         |
| `cacheTtlMin`      | 5                                           | minutes the prompt cache counts as warm (60 with the 1-hour cache) |
| `systemOneUrl`     | `http://127.0.0.1:8010`                     | Kev for P1; loopback only, empty turns it off                      |
| `kevModel`         | `kev-latest`                                | System One model                                                   |
| `leftoverPrefixes` | `Хвосты для агента:\|Хвосты для владельца:` | `\|`-separated                                                     |
| `noneWords`        | `нет\|none`                                 | `\|`-separated                                                     |
| `guardCompactions` | true                                        | add the template to every compaction                               |
| `statusLine`       | true                                        | show the score                                                     |

See [SECURITY.md](SECURITY.md) for what it reads and sends, and
[CONTRIBUTING.md](CONTRIBUTING.md) to work on it.
