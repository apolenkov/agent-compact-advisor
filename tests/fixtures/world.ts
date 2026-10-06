import type { AgentInfo, On, ProcessRunResult } from "claude-code";

// A promise that never settles: Boolean is a non-empty executor that ignores it.
const NEVER = new Promise<never>(Boolean);

/** What the mocked world beneath the plugin saw, and what it answers. */
export interface World {
  readonly statuses: (string | undefined)[];
  readonly toasts: string[];
  readonly suggested: string[];
  /** The instructions each compaction reached the engine with. */
  readonly compactions: (string | undefined)[];
  /** The bodies posted to System One. */
  readonly posts: string[];
  /** Kev's P1 answer, undefined for Kev down, "hang" for no answer ever. */
  kev: number | "hang" | undefined;
  agents: AgentInfo[];
  /** agent-shell-watch's calls, undefined when it is not installed. */
  calls:
    | {
        status: string;
        command?: string;
        label?: string;
        runner?: string;
        needsTail?: boolean;
      }[]
    | undefined;
  /**
   * What git says per repository root (its `status --porcelain` lines and the
   * commits ahead); no entry for a directory means it is no repository.
   */
  repos: Record<string, Repository>;
  /** What haiku says of an answer: a reply text, "fail", or "hang"; `clean` by default. */
  model: string;
  /** The prompts the model was asked, one per call. */
  asked: string[];
}

/**
 * One repository as git answers it. `branch` is set when the checked-out
 * branch has left its upstream: `gone` (tracked, upstream deleted) or `none`
 * (never tracked); `trunkDiff` is what `git diff --name-only origin/HEAD HEAD`
 * lists over the branch's own paths, empty when origin has them all.
 */
export interface Repository {
  status: string[];
  ahead: number;
  branch?: { upstream: "gone" | "none"; trunkDiff: string };
}

const done = (exitCode: number, stdout: string): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr: exitCode === 0 ? "" : "not a git repository",
  isStdoutTruncated: false,
  isStderrTruncated: false,
});

// What git prints for the three questions the advisor asks.
const kindOf = (argv: readonly string[]): string => {
  const [, verb = "", first = "", second = ""] = argv;
  if (argv.includes("@{u}..HEAD")) {
    return "noUpstream";
  }
  if (verb === "diff") {
    return second === "abc" ? "ownPaths" : "trunkDiff";
  }
  return first === "--abbrev-ref" ? "trunk" : verb;
};

const branchAnswer = (
  branch: NonNullable<Repository["branch"]>,
  argv: readonly string[],
): ProcessRunResult | undefined => {
  const answers: Readonly<Record<string, ProcessRunResult>> = {
    noUpstream: done(128, ""),
    "symbolic-ref": done(0, "feature\n"),
    config:
      branch.upstream === "gone"
        ? done(0, "refs/heads/feature\n")
        : done(1, ""),
    trunk: done(0, "origin/main\n"),
    "merge-base": done(0, "abc\n"),
    ownPaths: done(0, "a.ts\n"),
    trunkDiff: done(0, branch.trunkDiff),
  };
  return answers[kindOf(argv)];
};

const plainAnswer = (
  root: string,
  repository: Repository | undefined,
  verb: string,
): ProcessRunResult => {
  const answers: Readonly<Record<string, string>> = {
    "rev-parse": `${root}\n`,
    status: (repository?.status ?? []).map((line) => `${line}\n`).join(""),
    "rev-list": `${String(repository?.ahead ?? 0)}\n`,
  };
  return repository === undefined
    ? done(128, "")
    : done(0, answers[verb] ?? "");
};

const processAnswer = (
  root = "",
  repository: Repository | undefined,
  argv: readonly string[] = [],
): { value: ProcessRunResult } => {
  const plain = plainAnswer(root, repository, argv[1] ?? "");
  const branched = repository?.branch && branchAnswer(repository.branch, argv);
  return { value: branched ?? plain };
};

/**
 * Answers every engine call agent-compact-advisor makes besides the clock.
 * @param on the test's registrar
 * @returns the world, to assert on and to steer
 */
export const world = (on: On): World => {
  const seen: World = {
    statuses: [],
    toasts: [],
    suggested: [],
    compactions: [],
    posts: [],
    kev: 0.9,
    agents: [],
    calls: undefined,
    repos: {},
    model: "clean",
    asked: [],
  };
  on("state.get", { plugin: "agent-shell-watch" }, () => ({
    value:
      seen.calls === undefined
        ? { value: undefined, version: 0 }
        : { value: seen.calls, version: 1 },
  }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.root", () => ({ value: "/w" }));
  on("turn.start", (_$, e) => ({ turnId: e.turnId }));
  on("tool.call", () => ({ result: {}, text: "ok" }));
  on("process.run", (_$, e) => {
    const cwd = e.init?.cwd ?? "/w";
    const root = Object.keys(seen.repos).find(
      (one) => cwd === one || cwd.startsWith(`${one}/`),
    );
    const repository = root === undefined ? undefined : seen.repos[root];
    return processAnswer(root, repository, e.argv);
  });
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("ui.status", (_$, e) => {
    seen.statuses.push(e.text);
    return { value: undefined };
  });
  on("ui.toast", (_$, e) => {
    seen.toasts.push(e.text);
    return { value: undefined };
  });
  on("prompt.suggest", (_$, e) => {
    seen.suggested.push(e.text);
    return { isShown: true };
  });
  on("agent.list", () => ({ value: seen.agents }));
  on("http.fetch", async (_$, e) => {
    seen.posts.push(e.init?.body ?? "");
    if (seen.kev === "hang") {
      await NEVER;
    } else if (seen.kev === undefined) {
      throw new Error("ECONNREFUSED");
    }
    return {
      value: {
        status: 200,
        ok: true,
        headers: {},
        text: JSON.stringify({
          answers: { done: { type: "noul", noul: seen.kev } },
        }),
      },
    };
  });
  on("model.complete", async (_$, e) => {
    seen.asked.push(e.prompt);
    if (seen.model === "hang") {
      await NEVER;
    } else if (seen.model === "fail") {
      throw new Error("blocked model");
    }
    const usage = {
      input_tokens: 1500,
      output_tokens: 2,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
    return { value: { isAnswered: true as const, text: seen.model, usage } };
  });
  on("session.measure", (_$, e) => ({ changed: e.changed }));
  on("turn.complete", (_$, e) => ({ text: e.answer }));
  on("session.compact", (_$, e) => {
    seen.compactions.push(e.instructions);
    return {
      messages: [{ role: "assistant", text: "summary", toolUses: [] }],
      tokensBefore: 300_000,
      tokensAfter: 20_000,
    };
  });
  return seen;
};
