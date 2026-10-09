/**
 * What the session wrote and what git says of it. Its own file: the engine
 * follows `$` only inside the file that holds it, and the advisor's main
 * module reads these two states instead.
 */
import type {
  EngineInterface,
  HookFor,
  MatchedHook,
  Registration,
  SessionMessage,
} from "claude-code";
import { atom, read, update } from "claude-code";

import type { Recorded } from "../types";
import { pathsOf, withTouched } from "./model/touched.ts";
import {
  canChangeFiles,
  directoryOf,
  recordsOf,
  type RepositoryState,
  rootsOf,
  sumOf,
  unrecordedIn,
} from "./model/unrecorded.ts";
import { orElse, quietly } from "./quietly.ts";

type Engine = Readonly<EngineInterface>;

type StartMatcher = Readonly<{ cwd: RegExp }>;
type StartHook = MatchedHook<"session.start", StartMatcher>;
interface RecordOn {
  (
    ...args: Readonly<["session.start", StartMatcher, StartHook]>
  ): Registration<StartHook>;
  <P extends "tool.call" | "turn.start">(
    pattern: P,
    hook: HookFor<P>,
  ): Registration<HookFor<P>>;
}

const GIT = { rootsMax: 6, timeoutMs: 5000 } as const;

const recordedAtom = atom(
  { plugin: "agent-compact-advisor", key: "recorded" } as const,
  {
    at: Number.MIN_SAFE_INTEGER,
    value: undefined,
    touched: [],
  } satisfies Recorded,
);

const gitIn = async (
  $: Engine,
  cwd: string,
  args: readonly string[],
): Promise<string | undefined> => {
  try {
    const ran = await $.process.run(["git", ...args], {
      cwd,
      timeoutMs: GIT.timeoutMs,
    });
    return ran.exitCode === 0 ? ran.stdout : undefined;
  } catch {
    return undefined;
  }
};

const lineOf = async (
  $: Engine,
  root: string,
  args: readonly string[],
): Promise<string | undefined> => {
  const out = await gitIn($, root, args);
  return out?.trim();
};

const rootOf = async ($: Engine, path: string): Promise<string | undefined> =>
  lineOf($, directoryOf(path), ["rev-parse", "--show-toplevel"]);

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
  const status = await gitIn($, root, ["status", "--porcelain", "-z"]);
  return status === undefined
    ? undefined
    : {
        status: recordsOf(status),
        ahead: await aheadOf($, root),
      };
};

// The repositories of the touched paths and of the session's own directory.
const unrecordedOf = async (
  $: Engine,
  cwd: string,
  touched: readonly string[],
): Promise<Recorded["value"]> => {
  // Git is asked once per directory, not once per written path.
  const found = await Promise.all(
    [...new Set(Array.from([`${cwd}/.`, ...touched], directoryOf))].map(
      async (directory) =>
        [directory, await rootOf($, `${directory}/.`)] as const,
    ),
  );
  const { roots, isIncomplete } = rootsOf(found, touched, GIT.rootsMax);
  const parts = await Promise.all(
    roots
      .slice(0, GIT.rootsMax)
      .map(async (root) => unrecordedIn(root, await stateOf($, root), touched)),
  );
  return parts.length === 0 ? undefined : sumOf(parts, isIncomplete);
};

const refresh = async ($: Engine): Promise<void> => {
  const { touched } = await read($, recordedAtom);
  const cwd = await $.session.root();
  const value = await unrecordedOf($, cwd, touched);
  const at = await $.clock.now();
  await update($, recordedAtom, (held): Recorded => ({ ...held, at, value }));
};

// One conversation's rows as `$.session.messages` reports them: an agent's
// transcript is denied ({ deny }) rather than a list, that reads as empty.
const rowsOf = async (
  $: Engine,
  agentId?: string,
): Promise<readonly SessionMessage[]> => {
  const rows = await orElse(
    (async () =>
      agentId === undefined
        ? await $.session.messages()
        : await $.session.messages({ agentId }))(),
    [],
  );
  return Array.isArray(rows) ? rows : [];
};

const AGENTS_MAX = 16;

const agentIdsOf = (
  rows: readonly SessionMessage[],
  seen: ReadonlySet<string>,
): readonly string[] => [
  ...new Set(
    rows.flatMap((row) =>
      row.toolUses
        .map((use) => use.agentId)
        .filter((id): id is string => id !== undefined && !seen.has(id)),
    ),
  ),
];

// One level deeper into the transcripts: an agent's own Agent calls name
// grandchildren. `seen` is the visited set and the fuel: it grows by at least
// one id a level and the walk stops once it holds AGENTS_MAX.
const rowsDeep = async (
  $: Engine,
  ids: readonly (string | undefined)[],
  seen: ReadonlySet<string>,
): Promise<readonly SessionMessage[]> => {
  const conversations = await Promise.all(ids.map((id) => rowsOf($, id)));
  const rows = conversations.flat();
  const found = agentIdsOf(rows, seen);
  const next = found.slice(0, AGENTS_MAX - seen.size);
  if (next.length === 0) {
    return rows;
  }
  const deeper = await rowsDeep($, next, new Set([...seen, ...next]));
  return [...rows, ...deeper];
};

// The paths the transcript's answered tool calls wrote to: the main loop's
// and each agent's an Agent call names. On a resume this restores what the
// in-memory list lost; on a fresh start it is empty; a hot reload adds nothing.
const transcriptPaths = async ($: Engine): Promise<readonly string[]> => {
  const rows = await rowsDeep($, [undefined], new Set());
  return rows.flatMap((row) =>
    row.toolUses.flatMap((use) =>
      use.isError === true ? [] : pathsOf(use.tool, use.input, use),
    ),
  );
};

// Restores the touched list from the transcript and refreshes git once. Its
// own session.start: `$` stays inside the file that registers it, and the
// matcher keeps the two registrations distinct — a session's cwd is always
// absolute, so this still fires on every start, resume or not. Before the
// rest of the chain runs: the restored list and a fresh reading are what the
// first draw of a resumed session scores by. A transcript it cannot read
// leaves nothing and stops nothing.
const restoreTouched = async ($: Engine): Promise<void> => {
  const paths = await orElse(transcriptPaths($), []);
  if (paths.length === 0) {
    return;
  }
  await quietly(
    update($, recordedAtom, (held): Recorded => ({
      ...held,
      touched: withTouched(held.touched, paths),
    })),
  );
  await quietly(refresh($));
};

/**
 * Wires the touched-paths and git hooks; the main module calls it. Git is
 * asked at each turn start and after each tool that can change files, so the
 * state is fresh when a turn ends; a change made by a process of its own
 * between turns shows at the next turn.
 * @param on the registrar
 */
export const recordHooks = (on: RecordOn): void => {
  on("session.start", { cwd: /.+/u }, async ($, e, next) => {
    await restoreTouched($);
    return next(e);
  });
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
    await quietly(canChangeFiles(e.tool) ? refresh($) : Promise.resolve());
    return outcome;
  });
  on("turn.start", async ($, e, next) => {
    await quietly(refresh($));
    return next(e);
  });
};
