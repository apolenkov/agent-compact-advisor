/**
 * The paths a session's tools wrote to, read from the tool calls: what a
 * compaction must not lose track of, and where to ask git what is unrecorded.
 */

/** The most paths kept: the newest. */
export const TOUCHED_MAX = 40;

const WRITERS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.startsWith("/") ? value : undefined;

const fieldOf = (record: unknown, name: string): unknown =>
  typeof record === "object" && record !== null
    ? (record as Record<string, unknown>)[name]
    : undefined;

const changedOf = (outcome: unknown): readonly string[] => {
  const edit = fieldOf(fieldOf(outcome, "result"), "bashEditDiff");
  const changed = fieldOf(edit, "changedFiles");
  return Array.isArray(changed)
    ? (changed as readonly unknown[]).flatMap((path) => stringOf(path) ?? [])
    : [];
};

const namedOf = (tool: string, input: unknown): readonly string[] =>
  WRITERS.has(tool)
    ? [
        stringOf(
          fieldOf(input, "file_path") ?? fieldOf(input, "notebook_path"),
        ),
      ].flatMap((path) => path ?? [])
    : [];

/**
 * The absolute paths one tool call wrote to.
 * @param tool the tool's name
 * @param input the call's input, anything
 * @param outcome what the call returned, anything: for Bash the engine lists
 *   the files the command changed
 * @returns the paths: the file an editing tool names, or the changed files of a
 *   Bash call; none for a read
 */
export const pathsOf = (
  tool: string,
  input: unknown,
  outcome: unknown,
): readonly string[] =>
  [tool === "Bash" ? changedOf(outcome) : namedOf(tool, input)].flat();

/**
 * The touched list with new paths added: each path once, the newest last.
 * @param touched the paths so far
 * @param added paths just written
 * @returns at most TOUCHED_MAX paths
 */
export const withTouched = (
  touched: readonly string[],
  added: readonly string[],
): readonly string[] =>
  [...new Set([...touched, ...added].toReversed())]
    .toReversed()
    .slice(-TOUCHED_MAX);
