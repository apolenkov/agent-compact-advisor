# Agent guidance

This Claude Code mod advises when to compact; it never compacts automatically.
Read [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md) before changing the decision or data boundaries.

- Preserve the logical gates for unfinished work and live agents. A score or
  context-size alert cannot override a gate; the model check can only add a hold.
- `hooks/model/` is pure and has its own strict lint pass. Runtime hooks live in
  `hooks/`; behavior tests live in `tests/`. Keep session-derived corpus material
  private and preserve the documented limits on text sent to model services.
- Use `npm ci` and `npm run check`; read runtime pins from `.nvmrc` and
  `package.json`. Update engine declarations with `npm run update-types`, retaining
  `engine-types/NOTICE.md` provenance.
- Follow CONTRIBUTING for live `eval` and `smoke:live` checks. They use a Claude
  login and are separate from unit tests and plugin validation.
- Use an allowed Conventional Commit scope, such as `docs(repo): ...`, and the
  existing hooks. Release and factory automation follow CONTRIBUTING and its ADRs;
  a review finding alone does not authorize extending the change or merging it.
- Before editing, check active sessions and worktrees with the coordinator and
  agree file ownership. Preserve another session's changes and check snapshots.
- Follow CONTRIBUTING's repository layout and publication boundaries. Keep
  worktrees, process notes, raw eval results and credentials out of tracked
  source; retain unique handoffs in the owner's durable handoff directory.
