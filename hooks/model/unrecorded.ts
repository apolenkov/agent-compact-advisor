/**
 * What git says is unrecorded in the repositories a session touched:
 * the pure reading of its answers.
 */
import type { Unrecorded } from "./score.ts";

/** One repository's state as git reported it. */
export interface RepositoryState {
  /** Raw `XY path` records of `git status --porcelain -z`, without rename/copy source fields. */
  readonly status: readonly string[];
  /** Commits not on the upstream, or not on any remote; undefined when git failed. */
  readonly ahead: number | undefined;
}

/**
 * The raw porcelain records, excluding each rename/copy source field.
 * @param status NUL-delimited git stdout
 * @returns status records with literal destination paths
 */
export const recordsOf = (status: string): readonly string[] =>
  Array.from(
    status.matchAll(
      /(?<=^|\0)(?:((?:[RC].|.[RC]) [^\0]*)\0[^\0]*\0|(.. [^\0]*)\0)/gu,
    ),
    (match) => match[1] ?? match[2] ?? "",
  );

/**
 * The containing directory of an absolute session path.
 * @param path an absolute path
 * @returns the directory Git should be asked about
 */
export const directoryOf = (path: string): string =>
  path.slice(0, path.lastIndexOf("/"));

/**
 * Repository roots found for the directories inspected, with missing coverage.
 * @param found each inspected directory and its discovered Git root
 * @param touched the session's written paths
 * @param limit how many distinct roots can be inspected
 * @returns distinct roots and whether relevant work falls outside the probe set
 */
export const rootsOf = (
  found: readonly Readonly<[string, string | undefined]>[],
  touched: readonly string[],
  limit: number,
): Readonly<{ roots: readonly string[]; isIncomplete: boolean }> => {
  const roots = [...new Set(found.flatMap(([, root]) => root ?? []))];
  return {
    roots,
    isIncomplete:
      roots.length > limit ||
      found.some(
        ([directory, root]) =>
          root === undefined &&
          touched.some((path) => directoryOf(path) === directory),
      ),
  };
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
 * Whether a tool may change files or commits and needs a fresh Git reading.
 * @param tool the engine's tool name
 * @returns whether the recorded state needs refreshing after the tool
 */
export const canChangeFiles = (tool: string): boolean => CHANGERS.has(tool);

const UNTRACKED = "?? ";
const NAME_FROM = 3;
// With -z, names are literal and the destination is first for rename/copy.
const pathOf = (line: string, root: string): string =>
  `${root}/${line.slice(NAME_FROM)}`;

// A wholly untracked directory is one `?? dir/` line: it is the session's
// when any written path sits beneath it.
const wasWritten = (
  line: string,
  root: string,
  touched: readonly string[],
): boolean => {
  const path = pathOf(line, root);
  return (
    touched.includes(path) ||
    (path.endsWith("/") && touched.some((one) => one.startsWith(path)))
  );
};

/**
 * What one repository holds that nothing records.
 * @param root the repository's top directory
 * @param state what git said
 * @param touched the paths the session wrote to
 * @returns changed tracked files, plus untracked files the session wrote
 *   itself (another untracked file is not the session's), and commits ahead
 */
export const unrecordedIn = (
  root: string,
  state: RepositoryState | undefined,
  touched: readonly string[],
): Unrecorded => ({
  files: (state?.status ?? []).filter(
    (line) => !line.startsWith(UNTRACKED) || wasWritten(line, root, touched),
  ).length,
  commits: state?.ahead,
});

/**
 * The sum over repositories.
 * @param parts each repository's unrecorded work
 * @param isIncomplete whether any relevant repository could not be inspected
 * @returns files and commits added up
 */
export const sumOf = (
  parts: readonly Unrecorded[],
  isIncomplete = false,
): Unrecorded => ({
  files: parts.reduce((sum, part) => sum + part.files, 0),
  // One repository that cannot say means the sum cannot say either.
  commits:
    isIncomplete || parts.some((part) => part.commits === undefined)
      ? undefined
      : parts.reduce((sum, part) => sum + (part.commits ?? 0), 0),
});
