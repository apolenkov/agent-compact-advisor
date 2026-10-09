# Contributing

## Setup

```sh
npm ci            # installs tooling and the git hooks (lefthook)
npm run check     # format, typecheck, lint, repo lint, validate, tests
```

CI follows the latest Node 26 release through `.nvmrc` and installs npm 12.2.0.
For matching local checks, use Node 26.11.1 and npm 12.2.0 (verified 2026-10-09)
with a local runtime or an existing version manager.

agent-compact-advisor needs Claude Code 2.1.287+ (mods are on by default). Try it live with
`claude --plugin-dir .` from the repository root.

## Rules of the house

- TypeScript at its strictest (`tsconfig.json`), ESLint with no warnings and no
  unexplained suppressions (a second pass with inline config off refuses them).
- No mutation, no `let`, no loops, no classes. `hooks/model/` is pure and
  held to `eslint-plugin-functional`'s strict preset.
- Files ≤ 250 lines, functions ≤ 40, complexity ≤ 12.
- Every behaviour has a test under `tests/`, named for the file it covers, run by
  `claude plugin test`. No network in tests (Kev is mocked through `http.fetch`).
- [Conventional Commits](https://www.conventionalcommits.org) with a scope:
  `agent-compact-advisor`, `repo`, `deps`, `ci`, `main`. Releases are cut by release-please.
- After a Claude Code update: run `/plugin-authoring` with the pinned engine,
  then `npm run update-types` and `npm run check`. The updater requires that
  version's complete declarations, including the builtin tool tables; the
  runtime's beside-plugin copy omits them.

`npm run lint` lints the pure model in its own ESLint process: eslint-plugin-functional
caches type immutability per type, not per rule level, so linting `hooks/` (lite) and
`hooks/model/` (strict) in one process would make the result depend on file order.

## Repository layout and publication

- `hooks/` contains runtime hooks; `hooks/model/` is the pure decision model.
  `tests/` owns behavior checks and `evals/` owns live evaluation cases.
- `.claude-plugin/plugin.json` declares the plugin, `types/index.d.ts` declares
  its public types, and `engine-types/` retains the SDK declarations and their
  provenance. `scripts/` contains the existing validation and live-check tools.
- README, CONTRIBUTING and SECURITY describe usage, development and data
  boundaries. `openspec/` records requirements and their changes.
- Git source includes the tracked implementation, tests, tooling and documents.
  Release Please creates release changes and tags through the existing GitHub
  workflow. The root npm manifest is private tooling configuration; it does not
  define an npm publication or a separate compiled `dist/` product.
- `.worktrees/`, `.superpowers/`, `node_modules/`, raw `evals/results/` and local
  credentials remain outside tracked source. Ignore rules do not remove files
  already tracked: inspect the index before declaring a publication boundary
  safe. Preserve unique session handoffs outside tracked source in the owner's
  durable handoff directory.

Before changing these paths or rules, check active sessions and worktrees with
the coordinator and assign one owner to each changed file. Keep source checks,
release delivery and observed live behavior as separate results.

## Live checks

`npm run eval` runs `claude plugin eval` over `evals/`: each case is a real
headless (`claude -p`) session with only this plugin loaded, and the case sends
one of the mod's own commands. It covers what the unit tests cannot: that the
hooks module loads in the engine and registers its command, and that the
command's answer comes back. The cases need no model turns (about $0, a few
seconds).

It runs on your own Claude login, locally; CI does not run it.

It cannot see the status line (a headless session draws none).
`npm run smoke:live` does: it starts a real interactive session in tmux over a
throwaway git repository and checks the captured screen as the repository
changes: after a small turn the line says everything is recorded (git, asked by
the mod); a background wait is named and does not gate (this step needs
agent-shell-watch: `SHELL_WATCH_DIR`, else the newest installed copy, else it is
skipped and says so); a changed file gates ("uncommitted changes"); after its
commit the unpushed commit gates. It needs tmux, git and a Claude login, takes
about two minutes for a few cents (haiku), and is local only (no tmux session
with a login in CI).

## Dependency holds

- `typescript` stays on 6.x (6.0.3): `typescript-eslint` 8.71.1, its latest,
  declares the peer `typescript >=4.8.4 <6.1.0` (registry verified 2026-10-09).
  TypeScript 7.0.2 is outside that range. Take TypeScript 7 once it widens
  that range; drop the Dependabot `ignore` for `typescript` then.
