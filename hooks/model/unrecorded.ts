/**
 * What git says is unrecorded in the repositories a session touched:
 * the pure reading of its answers.
 */
import type { Unrecorded } from "./score.ts";

/** One repository's state as git reported it. */
export interface RepositoryState {
  /** Lines of `git status --porcelain`. */
  readonly status: readonly string[];
  /** Commits not on the upstream, or not on any remote; undefined when git failed. */
  readonly ahead: number | undefined;
}

const UNTRACKED = "?? ";
const NAME_FROM = 3;
const ARROW = " -> ";

// A porcelain line is `XY path`, a rename `XY old -> new`.
const pathOf = (line: string, root: string): string => {
  const rest = line.slice(NAME_FROM);
  const name = rest.includes(ARROW)
    ? rest.slice(rest.indexOf(ARROW) + ARROW.length)
    : rest;
  return `${root}/${name.replaceAll('"', "")}`;
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
  state: RepositoryState,
  touched: readonly string[],
): Unrecorded => ({
  files: state.status.filter(
    (line) =>
      !line.startsWith(UNTRACKED) || touched.includes(pathOf(line, root)),
  ).length,
  commits: state.ahead ?? 0,
});

/**
 * The sum over repositories.
 * @param parts each repository's unrecorded work
 * @returns files and commits added up
 */
export const sumOf = (parts: readonly Unrecorded[]): Unrecorded => ({
  files: parts.reduce((sum, part) => sum + part.files, 0),
  commits: parts.reduce((sum, part) => sum + part.commits, 0),
});
