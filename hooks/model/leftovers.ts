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
// Bold and code marks, dropped anywhere in a line.
const MARKS = /[*`]/gu;
// What a report line may open with: bullets, quotes, italics, then a number.
const BULLETS = /^[\s>+_-]+/u;
const NUMBER = /^\d+[.)]\s*/u;
// An italics mark or a full stop a value may end with.
const TRAIL = /[._]$/u;

const valueAfter = (line: string, prefix: string): string | undefined => {
  const bare = line
    .replaceAll(MARKS, "")
    .replace(BULLETS, "")
    .replace(NUMBER, "")
    .replace(BULLETS, "");
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

const ASK_MAX = 600;

const valuesOf = (
  answer: string,
  rule: LeftoverRule,
): readonly (string | undefined)[] => {
  const lines = answer.split("\n");
  return rule.prefixes.map((prefix) => {
    const value = lastValue(lines, prefix);
    return value?.replace(BULLETS, "").trim().replace(TRAIL, "");
  });
};

const isNone = (value: string, rule: LeftoverRule): boolean =>
  rule.noneWords.includes(value.toLowerCase());

/**
 * Reads the answer's leftover lines: the last line of each prefix counts.
 * The first prefix is the agent's own (unfinished work); the others address
 * the owner (a question, which a compaction can carry).
 * @param answer the assistant's final text
 * @param rule the prefixes and the words that mean none
 * @returns none when every line found says none, listed with the first other
 *   value (`isOwner` when only owner lines list something), unknown when no
 *   line was found
 */
export const leftoversOf = (answer: string, rule: LeftoverRule): Leftovers => {
  const values = valuesOf(answer, rule);
  const listed = values
    .map((value, index) => ({ value, index }))
    .find(({ value }) => value !== undefined && !isNone(value, rule));
  const kinds: readonly (readonly [boolean, Leftovers])[] = [
    [values.every((value) => value === undefined), { kind: "unknown" }],
    [
      listed?.value !== undefined,
      {
        kind: "listed",
        text: cut(listed?.value ?? ""),
        ...((listed?.index ?? 0) > 0 && { isOwner: true }),
      },
    ],
  ];
  return kinds.find(([isMet]) => isMet)?.[1] ?? { kind: "none" };
};

/**
 * What the answer asks the owner: the owner's leftover line, when it lists
 * something, so a compaction can be told to carry it.
 * @param answer the assistant's final text
 * @param rule the prefixes and the words that mean none
 * @returns the line's text, cut to a sane length, or undefined
 */
export const ownerAskOf = (
  answer: string,
  rule: LeftoverRule,
): string | undefined => {
  const ask = valuesOf(answer, rule)
    .slice(1)
    .find((value) => value !== undefined && !isNone(value, rule));
  return ask === undefined || ask === "" ? undefined : ask.slice(0, ASK_MAX);
};
