# agent-compact-advisor design (2026-10-04)

A Claude Code mod (function hooks, Claude Code 2.1.287+, mods on by default) that tells the owner how good a
moment it is to run `/compact` now, why, and offers a ready `/compact <instructions>` that keeps what matters.
It never compacts by itself.

Sources: backlog TASK-270 (owner choices of 2026-10-04: "go" on doc-306 recommendations), doc-306 (arena
synthesis of Devin, Pi, Codex, Fable). API facts are checked against `engine-types/claude-code.d.ts`
(Claude Code 2.1.288, copied from claude-shell-flow).

## Owner-approved choices

1. The preservation template is added to **every** compaction of the main conversation, manual and auto; the
   owner's own `/compact` text is kept and the template goes after it. The hook never cancels a compaction.
2. Readiness = the owner's leftover lines ("Хвосты для агента: нет", "Хвосты для владельца: нет") in the last
   answer, plus Kev P1 when Kev answers.
3. The number is a **score 0–100**, never called a probability (nothing is calibrated).

## Not in v1

Auto-compaction or any veto; `model.fork`; a pane; an own background-Bash tracker; calibration logging to
`$.store`; touching `precompute` or subagent compactions; keeping the last answer verbatim by rewriting the
result (doc-306 §3.4, gated on a live check); `usage({ breakdown })`; `prompt.fill`.

## Signals

| Signal          | Source (d.ts)                                                                                              | Values                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Window fill     | `session.measure` hook, `e.context.tokens` / `e.context.window` (SessionMeasureInput, SessionContextUsage) | tokens, percent                                                                        |
| Running agents  | `$.agent.list()` → `AgentInfo.status === "running"`                                                        | count                                                                                  |
| Background Bash | `$.state.get({ plugin: "agent-shell-watch", key: "calls" })`, live = status `running`/`quiet`/`hung`       | count, or **unknown** when the value was never written (version 0: shell-watch absent) |
| Leftovers       | `turn.complete` (main loop: no `agentId`), `e.answer`, regex over its lines                                | `none` / `listed: <text>` / `unknown`                                                  |
| Kev P1          | `$.http.fetch` POST `{systemOneUrl}/v1/systemone`, `kev-latest`, one `noul` question over the last answer  | 0..1, `pending`, or `n/a` (down, timeout, bad answer, off)                             |
| Cache           | `$.clock.now()` − time of the last main turn's end vs `cacheTtlMin`                                        | warm / cold                                                                            |

### Leftovers parsing (pure)

The answer's lines are scanned for each configured prefix (`leftoverPrefixes`, `|`-separated, default
`Хвосты для агента:|Хвосты для владельца:`), tolerating leading list marks, `>` and backticks. For
each prefix the **last** matching line counts. Its value is stripped of backticks, `*`, trailing `.` and
spaces, lower-cased, and compared with the none words (`noneWords`, default `нет|none`).

- no prefix found → `unknown`;
- every found prefix says none → `none`;
- any found prefix says something else → `listed`, carrying the first such value (cut to 40 chars).

The defaults are the owner's convention only (Fable review: YAGNI); an English convention such as
`Leftovers:` / `none` is one userConfig edit away and goes through the same strict rule.

### Kev P1

After a main turn ends with `reason === "answer"` and the leftovers are not `listed`, a timer (`$.clock.after(0)`,
never awaited inside the hook) posts `{ model, state, questions: { done: { type: "noul", instructions } } }`
with `state` = the last 8000 characters of the answer and `instructions` = "Is the task this answer reports
on finished, with nothing left for the agent or the owner to do?", and reads `answers.done.noul`. Kev judges
the last answer alone (no goal digest): P1 is a done-signal by the agent's own report, not the calibrated
decision-006 claims↔evidence gate, and is not presented as calibrated. A race with
`$.clock.sleep(kevTimeoutMs)` (default 20 s) bounds it; `http.fetch` has no timeout of its own. The result is
kept only if it is still for the latest turn (`turnId`). Any failure → `n/a`.

Privacy: the answer is sent only to a loopback host (`127.0.0.1`, `localhost`, `[::1]`); any other host or
an empty `systemOneUrl` turns P1 off (`n/a`) without a request. No key is sent.

## Score

Pure `scoreOf(facts, config) → { score, reasons[] }`.

Gates, checked in order; the first that holds sets the score and its one reason:

1. tokens unknown (no measurement yet, e.g. right after a compaction) → 0, `no context reading yet`;
   tokens `< minTokens` (default 100k) → 0, `small context <N>k`;
2. running agents > 0 → 0, `too early: N agents running`;
3. live background calls > 0 → 0, `too early: N background calls`;
4. leftovers `listed` → 0, `leftovers: <text>`.

Otherwise a weighted sum, each part 0..1:

| Part      | Weight | Value                                                                                                                                                                                   |
| --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fill      | 40     | `(tokens − minTokens) / (full − minTokens)` clamped, `full = min(fullTokens, 0.9·window)` (default 300k), at least `minTokens + 1`                                                      |
| leftovers | 30     | `none` → 1, `unknown` → 0                                                                                                                                                               |
| P1        | 20     | Kev's value; `pending` → 0 with the weight kept (no early suggestion a late low P1 would contradict: a suggestion cannot be withdrawn); `n/a` → weight removed, the sum rescaled to 100 |
| cache     | 10     | warm → 1 (the compaction request reads the cached prefix), cold → 0                                                                                                                     |

`score = round(100 · Σ wᵢ·vᵢ / Σ wᵢ)`, then caps: background `unknown` → at most 60; leftovers `unknown` → at
most 60. With the default threshold of 70 the mod therefore only suggests when it **knows** there are no
leftovers and no background work.

## UI

- **Status line** (`$.ui.status`), redrawn on measure, turn end, P1 result and every 30 s (agents, background
  calls and the cache change between turns):
  `compact 82 · 312k 62% · leftovers none · P1 .91 · cache warm`; gated: `compact 0 · too early: 2 agents running`.
  `statusLine: false` clears it.
- **Suggestion**: when score ≥ `threshold` (default 70), `$.prompt.suggest` a one-line command:
  `/compact Keep the goal and task id, decisions with reasons, open leftovers verbatim, absolute file paths,
verification commands and results, and what not to do.` One line, because a multi-line slash argument in the
  box is a risk (Fable review); the guard adds the full template on top.
  The engine shows it only in an empty box between turns (PromptSuggestResult); Tab takes it for editing. The
  mod never calls `prompt.fill` and never `session.compact`.
- **Toast**: once when the score crosses `threshold` upwards: `good moment to /compact (82): Tab takes it`.
- **`/compact-advisor`** (`immediate`): answers the current score, every signal with its value and weight,
  the gate or caps applied, and whether the guard is on. Changes nothing.

## Compaction guard

`on("session.compact", hook)`: when `guardCompactions` (default true), `e.agentId` is absent and
`e.trigger` is `manual` or `auto`, call `next({ ...e, instructions })` with

- `instructions` absent/blank → the template;
- otherwise → the owner's text (the taken suggestion included), a blank line, the template.

Every other case `next(e)` unchanged. It never returns `{ skip }` and never rewrites `messages`.
d.ts: "`next({ ...e, instructions })` changes what the summarizer is told"; trigger is pinned.

### Template

```
Preserve for continuing this work after compaction:
- Goal and the backlog task id, as the owner stated them; the owner's constraints.
- Decisions made, each with its reason; what was rejected and why.
- Open leftovers verbatim, including the last answer's "Хвосты для агента/владельца" lines.
- Absolute file paths touched or relevant, the branch and uncommitted changes.
- Verification commands run and their results (pass/fail, counts).
- What not to do: approaches that failed, actions the owner forbade.
- The next step.
Mark what is confirmed versus assumed. Drop file contents already read and intermediate tool output.
```

## Config (`userConfig`)

`threshold` 70, `minTokens` 100000, `fullTokens` 300000, `cacheTtlMin` 5, `systemOneUrl`
`http://127.0.0.1:8010`, `kevModel` `kev-latest`, `leftoverPrefixes`, `noneWords`,
`guardCompactions` true, `statusLine` true. Invalid numbers fall back to defaults.

## Layout

```
hooks/register.ts        wiring: session.start (command), session.measure, turn.complete, session.compact, command.run
hooks/kev.ts             the P1 request (impure)
hooks/model/config.ts    options → Config
hooks/model/leftovers.ts parse leftovers
hooks/model/score.ts     scoreOf (gates, parts, caps)
hooks/model/format.ts    statusLineOf, explanationOf
hooks/model/template.ts  the template, the one-line suggestion, withTemplate(instructions)
types/index.d.ts         PluginState contract (facts atom) + the slice of agent-shell-watch's it reads
tests/                   one test file per module; engine tests mock http.fetch, agent.list, the clock
```

Facts live in one `$.state` atom (`{ tokens?, window?, percent?, leftovers, p1, turnId?, lastTurnAt?, wasAbove }`)
so a hot reload keeps them; module variables hold nothing. A reload cancels pending timers (d.ts: clock), so
`session.start` turns a stranded `pending` P1 into `n/a`. A compaction that stands sets `tokens` to its
`tokensAfter` (or clears it), so a stale high score does not outlive it. The Kev timeout is a 20 s constant.

## Risks and live checks

1. A suggestion taken by Tab runs as the `/compact` command: observed as `trigger: "manual"` with our text.
2. The template reaches the summarizer and the summary keeps goal/decisions/leftovers/paths.
3. Status line ordering with agent-shell-watch's own status entry (both set `$.ui.status`; each plugin owns its
   own entry).
4. Kev cold start (first request ~2–20 s): bounded by the timeout; the status shows `P1 …` meanwhile.
5. Leftover lines written by the model are a claim, not a fact: the score says "ready by the agent's report".
6. `precompute`: if the engine reuses a summary precomputed without the template for a later `auto`/`manual`
   compaction (SessionCompacted.usage: "core reused a summary already computed"), the guard's instructions do not
   reach it. Check live; if so, v1.1 guards `precompute` too.

Review: fable-reviewer, APPROVE WITH CHANGES (2026-10-04); findings 1–8 applied (P1 pending, one-line
suggestion, fixed Kev question, reload reset, precompute check, no-measurement reason, window-bound fill,
owner-only default prefixes).

## Code review (codex exec review, 2026-10-04)

1. Redirects: `$.http.fetch` follows 307/308 with the body, so a loopback service could forward the answer.
   Not changed: whatever listens on loopback already receives the text and can forward it by any means;
   SECURITY.md says the loopback service is trusted with it.
2. Markup hid leftover lines (`+`, `1.`, `**prefix**:`): bold/code marks are dropped from the whole line and
   bullets, quotes, italics and a list number are skipped before the prefix. Fixed, tested.
3. A hot reload dropped the cache-expiry timer; 4. agents and background calls ending between turns were not
   redrawn. Both fixed by one redraw every 30 s, started in `session.start` (so a reload restarts it). The
   suggestion is offered at a turn's end or when the score first crosses the threshold, never re-offered by
   the timer.
