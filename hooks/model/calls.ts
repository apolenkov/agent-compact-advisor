/**
 * Background calls in classes: what a compaction would lose with each.
 * A waiter polls an external event and loses nothing; work is a result the
 * context still needs; stale is work that went silent; a runner that ended
 * with its verdict unread is a result nobody has seen.
 */
import type { WatchedCall } from "../../types";

/** What a live call is to a compaction. */
export type CallClass = "waiter" | "work" | "stale" | "unread";

const LIVE = new Set(["running", "quiet", "hung"]);
const LABEL_MAX = 60;

// A line of a loop body names these commands only when it merely looks.
const READ_ONLY = new Set([
  "sleep",
  "test",
  "[",
  "[[",
  "grep",
  "echo",
  "printf",
  "break",
  "continue",
  "true",
  "false",
  ":",
  "date",
  "seq",
  "wc",
  "jq",
  "head",
  "tail",
  "tr",
  "cut",
  "awk",
  "exit",
  "return",
  "cat",
]);
const GH_READ = new Set(["view", "checks", "status", "list", "watch"]);
const GH_AREAS = new Set(["pr", "run", "issue", "release", "repo"]);
const WRITE_FLAG = /^(?:-[XfFdo]|--(?:method|field|raw-field|data))/u;
const SEPARATORS = /\$\(|&&|[`)|;{}\n]/gu;
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;
const LOOPS = /\b(?:until|while|for)\b|\bsleep\b|\bgh\s+run\s+watch\b/u;
// `do`, `then`, `else`, `while` and the like lead a line that still has a
// command after them; `for` heads a line of loop syntax only.
const LEADERS = new Set(["do", "then", "else", "elif", "while", "until", "if"]);
const BARE = new Set(["for", "done", "fi", "in"]);

const wordsOf = (line: string): readonly string[] =>
  line
    .trim()
    .split(/\s+/u)
    .filter((word) => word !== "");

const isReadOnlyFlags = (words: readonly string[]): boolean =>
  words.every((word) => !WRITE_FLAG.test(word));

// A gh call is a poll only for the read subcommands and a get-only api.
const isGhRead = (words: readonly string[]): boolean => {
  const [, area = "", action = ""] = words;
  return area === "api"
    ? isReadOnlyFlags(words)
    : GH_AREAS.has(area) && GH_READ.has(action);
};

const CHECKS: ReadonlyMap<string, (words: readonly string[]) => boolean> =
  new Map([
    ["gh", isGhRead],
    ["curl", isReadOnlyFlags],
  ]);

const isReadOnlyLine = (line: string): boolean => {
  const words = wordsOf(line).filter((word) => !ASSIGNMENT.test(word));
  const [first = ""] = words;
  const body = LEADERS.has(first) ? words.slice(1) : words;
  const [head = ""] = body;
  const isSyntax = body.length === 0 || BARE.has(first) || BARE.has(head);
  return (
    isSyntax ||
    (CHECKS.get(head) ?? ((all) => READ_ONLY.has(all[0] ?? "")))(body)
  );
};

/**
 * Whether a command only polls: every command of its loop body is read-only
 * and it loops, sleeps or watches.
 * @param command a background command line
 * @returns true for `for …; do gh pr view …; sleep 20; done`, false for a
 *   loop whose body runs anything that does work
 */
export const isWaiter = (command: string): boolean =>
  LOOPS.test(command) &&
  command
    .replaceAll(SEPARATORS, "\n")
    .split("\n")
    .filter((line) => !isReadOnlyLine(line)).length === 0;

/**
 * The class of one live call.
 * @param call a call from agent-shell-watch's list
 * @returns undefined for a settled call that is nothing to a compaction;
 *   `unread` for a runner that ended with its verdict unread; for a live call
 *   waiter, stale (work that hung) or work (including every unknown command)
 */
export const classOf = (call: WatchedCall): CallClass | undefined => {
  const isLive = LIVE.has(call.status);
  const isPoll = call.runner === undefined && isWaiter(call.command ?? "");
  const steps: readonly (readonly [boolean, CallClass | undefined])[] = [
    [call.needsTail === true, "unread"],
    [!isLive, undefined],
    [isPoll, "waiter"],
    [call.status === "hung", "stale"],
  ];
  const found = steps.find(([isMet]) => isMet);
  return found === undefined ? "work" : found[1];
};

/** The classes of a session's calls, with the waiters' purposes. */
export interface Calls {
  readonly work: number;
  readonly stale: number;
  readonly unread: number;
  /** What each live waiter waits for: its label, else the head of its command. */
  readonly waiters: readonly string[];
}

const purposeOf = (call: WatchedCall): string => {
  const text = (call.label ?? call.command ?? "").trim();
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text;
};

/**
 * Sorts every call into its class.
 * @param calls agent-shell-watch's call list
 * @returns the counts of work, stale and unread, and the waiters' purposes
 */
export const callsOf = (calls: readonly WatchedCall[]): Calls => {
  const classed = calls.map((call) => ({ call, kind: classOf(call) }));
  const count = (kind: CallClass): number =>
    classed.filter((one) => one.kind === kind).length;
  return {
    work: count("work"),
    stale: count("stale"),
    unread: count("unread"),
    waiters: classed
      .filter((one) => one.kind === "waiter")
      .map((one) => purposeOf(one.call)),
  };
};
