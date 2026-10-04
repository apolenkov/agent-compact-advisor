/**
 * The score in words: the status line and `/compact-advisor`'s answer.
 */
import type { AdvisorFacts, Leftovers, P1 } from "../../types";
import { kOf, type Verdict } from "./score.ts";

const DECIMALS = 2;

const P1_WORDS: Readonly<Record<"pending" | "na", string>> = {
  pending: "P1 …",
  na: "P1 n/a",
};

const p1Of = (p1: P1): string =>
  p1.kind === "value"
    ? `P1 ${p1.value.toFixed(DECIMALS).replace(/^0/u, "")}`
    : P1_WORDS[p1.kind];

const leftoversWord = (leftovers: Leftovers): string =>
  leftovers.kind === "listed"
    ? `leftovers: ${leftovers.text}`
    : `leftovers ${leftovers.kind}`;

const sizeOf = (facts: AdvisorFacts): string => {
  const percent =
    facts.percent === undefined ? "" : ` ${String(facts.percent)}%`;
  return facts.tokens === undefined ? "size ?" : kOf(facts.tokens) + percent;
};

/** What the status line is drawn from. */
export interface Drawn {
  readonly verdict: Verdict;
  readonly facts: AdvisorFacts;
  readonly isCacheWarm: boolean;
  readonly isBackgroundKnown: boolean;
}

/**
 * The status line: the score, then the gate or the signals.
 * @param drawn the verdict and the facts it came from
 * @returns `score 82 · 312k 62% · leftovers none · P1 .91 · cache warm`
 */
export const statusLineOf = (drawn: Drawn): string => {
  const { verdict, facts } = drawn;
  const head = `score ${String(verdict.score)}`;
  const signals = [
    sizeOf(facts),
    leftoversWord(facts.leftovers),
    p1Of(facts.p1),
    drawn.isCacheWarm ? "cache warm" : "cache cold",
    ...(drawn.isBackgroundKnown ? [] : ["bg ?"]),
  ];
  return (
    verdict.gate === undefined
      ? [head, ...signals]
      : [head, verdict.gate, sizeOf(facts)]
  ).join(" · ");
};

/**
 * `/compact-advisor`'s answer: the score, every part with its weight, the
 * gate or the caps, and whether compactions get the template.
 * @param drawn the verdict and the facts it came from
 * @param isGuarded whether the compaction guard is on
 * @returns a few lines of text
 */
export const explanationOf = (drawn: Drawn, isGuarded: boolean): string => {
  const { verdict } = drawn;
  const why =
    verdict.gate === undefined
      ? [
          ...verdict.parts.map(
            ({ name, value, weight }) =>
              `- ${name}: ${value.toFixed(DECIMALS)} × ${String(weight)}`,
          ),
          ...(verdict.parts.some((part) => part.name === "P1")
            ? []
            : ["- P1: not counted (weight removed, the rest rescaled)"]),
          ...verdict.caps.map((cap) => `- capped at 60: ${cap}`),
        ]
      : [`- gate: ${verdict.gate}`];
  return [
    statusLineOf(drawn),
    ...why,
    isGuarded
      ? "Every /compact and auto-compaction gets the preservation template."
      : "Compaction guard off: /compact runs as typed.",
    "A score, not a probability: nothing here is calibrated.",
  ].join("\n");
};
