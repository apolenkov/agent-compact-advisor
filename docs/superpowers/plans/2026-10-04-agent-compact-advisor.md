# agent-compact-advisor v1 plan (2026-10-04)

Spec: `docs/superpowers/specs/2026-10-04-agent-compact-advisor-design.md` (fable-reviewer: APPROVE WITH
CHANGES, findings applied). Each task: failing test first, then the code, then `npm run check`.

1. **Repo.** Tooling copied from claude-shell-flow (tsc strict, split ESLint, suppression guard, prettier,
   knip, ls-lint, lefthook, commitlint scopes, CI/CodeQL/Scorecard, release-please 0.0.0 → 0.1.0, dependabot),
   `engine-types/` copied (2.1.288). No shell-flow code.
2. **Model, pure** (`hooks/model/`, functional strict): `leftovers.ts` (strict line parser), `config.ts`
   (defaults, loopback-only Kev URL), `template.ts` (template, one-line suggestion, `withTemplate`), `kev.ts`
   (request body, `noulOf`), `score.ts` (gates, parts, caps, window-bound fill, pending P1 = 0),
   `format.ts` (status line, explanation). Tests: `tests/model/*.test.ts`.
3. **Hooks** (`hooks/register.ts`): `session.start` (command, pending→n/a after reload, draw),
   `session.measure` (size), `turn.complete` (main only: leftovers, P1 pending, timers out of the dispatch),
   Kev over `$.http.fetch` raced with a 20 s `$.clock.sleep`, `session.compact` guard (manual/auto, main,
   never skip) and size reset, `command.run` `/compact-advisor`. Tests: `tests/register.test.ts` against
   the engine with `http.fetch`, `agent.list`, agent-shell-watch's `state.get` and the clock mocked.
4. **Verify.** `npm run check`; 10× `claude plugin test .` under load (two `yes`); `codex exec review`;
   live `claude --plugin-dir . -p "/compact-advisor"` and an interactive tmux session.
