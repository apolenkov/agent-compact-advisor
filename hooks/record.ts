/**
 * What the session wrote and what git says of it. Its own file: the engine
 * follows `$` only inside the file that holds it, and the advisor's main
 * module reads these two states instead.
 */
import type { EngineInterface, On } from "claude-code";
import { atom, read, update } from "claude-code";

import type { Recorded } from "../types";
import type { Unrecorded } from "./model/score.ts";
import { pathsOf, withTouched } from "./model/touched.ts";
import {
  type RepositoryState,
  sumOf,
  unrecordedIn,
} from "./model/unrecorded.ts";
import { quietly } from "./quietly.ts";

type Engine = Readonly<EngineInterface>;

const ROOTS_MAX = 6;
const GIT_TIMEOUT_MS = 5000;

const recordedAtom = atom(
  { plugin: "agent-compact-advisor", key: "recorded" } as const,
  {
    at: Number.MIN_SAFE_INTEGER,
    value: undefined,
    touched: [],
  } satisfies Recorded,
);

const directoryOf = (path: string): string =>
  path.slice(0, path.lastIndexOf("/"));

const gitIn = async (
  $: Engine,
  cwd: string,
  args: readonly string[],
): Promise<string | undefined> => {
  try {
    const ran = await $.process.run(["git", ...args], {
      cwd,
      timeoutMs: GIT_TIMEOUT_MS,
    });
    return ran.exitCode === 0 ? ran.stdout : undefined;
  } catch {
    return undefined;
  }
};

const rootOf = async ($: Engine, path: string): Promise<string | undefined> => {
  const top = await gitIn($, directoryOf(path), [
    "rev-parse",
    "--show-toplevel",
  ]);
  return top?.trim();
};

const lineOf = async (
  $: Engine,
  root: string,
  args: readonly string[],
): Promise<string | undefined> => {
  const out = await gitIn($, root, args);
  return out?.trim();
};

// The trunk of origin and the merge-base with it, when the branch has left
// its upstream (tracked once, now gone).
const forkOf = async (
  $: Engine,
  root: string,
): Promise<{ trunk: string; base: string } | undefined> => {
  const branch = await lineOf($, root, ["symbolic-ref", "--short", "HEAD"]);
  const tracked =
    branch === undefined
      ? undefined
      : await gitIn($, root, ["config", `branch.${branch}.merge`]);
  const trunk = await lineOf($, root, [
    "rev-parse",
    "--abbrev-ref",
    "origin/HEAD",
  ]);
  const base =
    trunk === undefined
      ? undefined
      : await lineOf($, root, ["merge-base", trunk, "HEAD"]);
  return tracked === undefined || trunk === undefined || base === undefined
    ? undefined
    : { trunk, base };
};

// A branch whose upstream is gone and whose every change is in origin's
// default branch as it is now: squash-merged, nothing is lost. Offline.
const isSquashMerged = async ($: Engine, root: string): Promise<boolean> => {
  const fork = await forkOf($, root);
  const changed =
    fork === undefined
      ? undefined
      : await gitIn($, root, ["diff", "--name-only", fork.base, "HEAD"]);
  const paths = (changed ?? "").split("\n").filter((line) => line !== "");
  const differs =
    fork === undefined || paths.length === 0
      ? undefined
      : await lineOf($, root, [
          "diff",
          "--name-only",
          fork.trunk,
          "HEAD",
          "--",
          ...paths,
        ]);
  return differs === "";
};

// Commits not on the upstream, else not on any remote (a branch with none);
// none when the branch is squash-merged and only its upstream is gone.
const aheadOf = async (
  $: Engine,
  root: string,
): Promise<number | undefined> => {
  const upstream = await gitIn($, root, ["rev-list", "--count", "@{u}..HEAD"]);
  const counted =
    upstream ??
    (await gitIn($, root, [
      "rev-list",
      "--count",
      "HEAD",
      "--not",
      "--remotes",
    ]));
  const count = counted === undefined ? undefined : Number(counted.trim());
  const isLeft = upstream === undefined && count !== undefined && count > 0;
  return isLeft && (await isSquashMerged($, root)) ? 0 : count;
};

const stateOf = async (
  $: Engine,
  root: string,
): Promise<RepositoryState | undefined> => {
  const status = await gitIn($, root, ["status", "--porcelain"]);
  return status === undefined
    ? undefined
    : {
        status: status.split("\n").filter((line) => line !== ""),
        ahead: await aheadOf($, root),
      };
};

// The repositories of the touched paths and of the session's own directory.
const unrecordedOf = async (
  $: Engine,
  cwd: string,
  touched: readonly string[],
): Promise<Unrecorded | undefined> => {
  const found = await Promise.all(
    [`${cwd}/.`, ...touched].map((path) => rootOf($, path)),
  );
  const roots = [...new Set(found.filter((root) => root !== undefined))].slice(
    0,
    ROOTS_MAX,
  );
  const states = await Promise.all(
    roots.map(async (root) => ({ root, state: await stateOf($, root) })),
  );
  const known = states.filter(
    (one): one is { root: string; state: RepositoryState } =>
      one.state !== undefined,
  );
  return known.length === 0
    ? undefined
    : sumOf(known.map(({ root, state }) => unrecordedIn(root, state, touched)));
};

const refresh = async ($: Engine): Promise<void> => {
  const { touched } = await read($, recordedAtom);
  const cwd = await $.session.root();
  const value = await unrecordedOf($, cwd, touched);
  const at = await $.clock.now();
  await update($, recordedAtom, (held): Recorded => ({ ...held, at, value }));
};

// A tool that can change files or commit: git is asked after it.
const CHANGERS = new Set([
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "MultiEdit",
]);

/**
 * Wires the touched-paths and git hooks; the main module calls it. Git is
 * asked at each turn start and after each tool that can change files, so the
 * state is fresh when a turn ends; a change made by a process of its own
 * between turns shows at the next turn.
 * @param on the registrar
 */
export const recordHooks = (on: On): void => {
  on("tool.call", async ($, e, next) => {
    const outcome = await next(e);
    const paths = pathsOf(e.tool, e, outcome);
    await quietly(
      paths.length === 0
        ? Promise.resolve()
        : update($, recordedAtom, (held): Recorded => ({
            ...held,
            touched: withTouched(held.touched, paths),
          })),
    );
    await quietly(CHANGERS.has(e.tool) ? refresh($) : Promise.resolve());
    return outcome;
  });
  on("turn.start", async ($, e, next) => {
    await quietly(refresh($));
    return next(e);
  });
};
