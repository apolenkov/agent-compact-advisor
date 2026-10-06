/**
 * The preservation template every guarded compaction is told to follow.
 */

/** The instructions a compaction is given so the work can go on after it. */
export const TEMPLATE = [
  "Preserve for continuing this work after compaction:",
  "- Goal and the backlog task id, as the owner stated them; the owner's constraints.",
  "- Decisions made, each with its reason; what was rejected and why.",
  '- Open leftovers verbatim, including the last answer\'s "Хвосты для агента/владельца" lines.',
  "- Absolute file paths touched or relevant, the branch and uncommitted changes.",
  "- Verification commands run and their results (pass/fail, counts).",
  "- What not to do: approaches that failed, actions the owner forbade.",
  "- The next step.",
  "Mark what is confirmed versus assumed. Drop file contents already read and intermediate tool output.",
].join("\n");

/** The one-line `/compact` offered in the prompt box: one line, so it runs as typed. */
export const SUGGESTION =
  "/compact Keep the goal and task id, decisions with reasons, open leftovers verbatim, absolute file paths, verification commands and results, and what not to do.";

/** What this session has that a summary could drop, named for the template. */
export interface Carry {
  /** The owner's leftover line of the last answer: a question the summary must keep. */
  readonly ownerAsk?: string | undefined;
  /** What each running background wait waits for. */
  readonly waiters: readonly string[];
  /** Paths the session wrote to. */
  readonly touched: readonly string[];
}

const PATHS_MAX = 15;
const WAITERS_MAX = 10;

const carriedOf = (carry: Carry): readonly string[] => [
  ...(carry.ownerAsk === undefined
    ? []
    : [
        `- Open questions to the owner, verbatim from the last answer: ${carry.ownerAsk}`,
      ]),
  ...(carry.waiters.length === 0
    ? []
    : [
        `- Background waits still running (what each waits for; its notification arrives after the compaction): ${carry.waiters.slice(0, WAITERS_MAX).join("; ")}`,
      ]),
  ...(carry.touched.length === 0
    ? []
    : [
        `- Paths written this session: ${carry.touched.slice(-PATHS_MAX).join(", ")}`,
      ]),
];

/**
 * The compaction's instructions with the template added after the owner's own.
 * @param instructions what was typed after `/compact`, if anything
 * @param carry the session's open question, running waits and written paths
 * @returns the template (with what must be carried) alone, or the owner's text
 *   and then the template
 */
export const withTemplate = (
  instructions: string | undefined,
  carry?: Carry,
): string => {
  const own = instructions?.trim() ?? "";
  const template = [
    TEMPLATE,
    ...(carry === undefined ? [] : carriedOf(carry)),
  ].join("\n");
  return own === "" ? template : `${own}\n\n${template}`;
};
