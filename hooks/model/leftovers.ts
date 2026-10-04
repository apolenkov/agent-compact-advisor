/**
 * The leftover lines ("Хвосты для агента: нет") of an answer, read strictly.
 */
import type { Leftovers } from "../../types";

/** Which lines name leftovers and which values mean "none". */
export interface LeftoverRule {
  readonly prefixes: readonly string[];
  readonly noneWords: readonly string[];
}

const TEXT_MAX = 40;
// Markup a report line may open with: list marks, quotes, bold, code.
const LEAD = /^[\s*>`_-]+/u;
// Bold and code marks a value may carry.
const MARKS = /[*`]/gu;

const valueAfter = (line: string, prefix: string): string | undefined => {
  const bare = line.replace(LEAD, "");
  return bare.startsWith(prefix) ? bare.slice(prefix.length) : undefined;
};

const lastValue = (
  lines: readonly string[],
  prefix: string,
): string | undefined =>
  lines
    .map((line) => valueAfter(line, prefix))
    .findLast((value) => value !== undefined);

const cut = (text: string): string =>
  text.length > TEXT_MAX ? `${text.slice(0, TEXT_MAX - 1)}…` : text;

/**
 * Reads the answer's leftover lines: the last line of each prefix counts.
 * @param answer the assistant's final text
 * @param rule the prefixes and the words that mean none
 * @returns none when every line found says none, listed with the first other
 *   value, unknown when no line was found
 */
export const leftoversOf = (answer: string, rule: LeftoverRule): Leftovers => {
  const lines = answer.split("\n");
  const values = rule.prefixes
    .map((prefix) => lastValue(lines, prefix))
    .filter((value) => value !== undefined)
    .map((value) => value.replaceAll(MARKS, "").trim().replace(/\.$/u, ""));
  const listed = values.find(
    (value) => !rule.noneWords.includes(value.toLowerCase()),
  );
  const found: Leftovers =
    listed === undefined
      ? { kind: "none" }
      : { kind: "listed", text: cut(listed) };
  return values.length === 0 ? { kind: "unknown" } : found;
};
