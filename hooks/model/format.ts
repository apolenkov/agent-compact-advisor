/**
 * The score in plain words: the status line, the toasts and
 * `/compact-advisor`'s answer, in the configured language.
 */
import type { AdvisorFacts } from "../../types";
import type { Config } from "./config.ts";
import { type Gate, kOf, type Verdict } from "./score.ts";
import { formOf, type Phrase, say } from "./words.ts";

const DECIMALS = 2;
const PERCENT = 100;

/** What the status line is drawn from. */
export interface Drawn {
  readonly verdict: Verdict;
  readonly facts: AdvisorFacts;
  readonly isCacheWarm: boolean;
  readonly isBackgroundKnown: boolean;
  /** Whether git said anything of the touched repositories. */
  readonly isRecordKnown: boolean;
  /** Live background waiters: polls that lose nothing to a compaction. */
  readonly watchers: number;
  readonly config: Config;
}

const gateWords = (language: Config["language"], gate: Gate): string => {
  const count = "count" in gate ? gate.count : 0;
  const form = formOf(language, count);
  const phrases: Readonly<Record<Gate["kind"], string>> = {
    unread: say(language, "unread"),
    small: say(language, "small", {
      k: kOf(gate.kind === "small" ? gate.tokens : 0),
    }),
    agents: say(language, `agents${form}`, { n: count }),
    calls: say(language, count === 1 ? "callsSingle" : `calls${form}`, {
      n: count,
    }),
    stale: say(language, "stale", { n: count }),
    runner: say(language, "runner", { n: count }),
    edits: say(language, "edits", { n: count }),
    unpushed: say(language, "unpushed", { n: count }),
    leftovers: say(language, "leftovers", {
      text: gate.kind === "leftovers" ? gate.text : "",
    }),
  };
  return phrases[gate.kind];
};

const sizeOf = (
  language: Config["language"],
  facts: AdvisorFacts,
): readonly string[] =>
  facts.tokens === undefined
    ? []
    : [
        say(language, "size", { k: kOf(facts.tokens) }) +
          (facts.percent === undefined
            ? ""
            : say(language, "share", { n: facts.percent })),
      ];

const leftoversOf = (
  language: Config["language"],
  drawn: Drawn,
): readonly string[] => {
  const { kind } = drawn.facts.leftovers;
  const phrase: Phrase = kind === "none" ? "leftoversNone" : "leftoversUnknown";
  return kind === "listed" || drawn.config.ignoreLeftovers
    ? []
    : [say(language, phrase)];
};

// What a compaction can carry and what does not stand in its way.
const carriedOf = (
  language: Config["language"],
  drawn: Drawn,
): readonly string[] => {
  const { leftovers, ownerAsk } = drawn.facts;
  return [
    ...(drawn.isRecordKnown ? [say(language, "allRecorded")] : []),
    ...(ownerAsk !== undefined &&
    leftovers.kind === "listed" &&
    leftovers.isOwner === true
      ? [say(language, "ownerAsk", { text: leftovers.text })]
      : []),
    ...(drawn.watchers > 0
      ? [say(language, "watchers", { n: drawn.watchers })]
      : []),
  ];
};

const goalOf = (
  language: Config["language"],
  facts: AdvisorFacts,
): readonly string[] => {
  const { p1 } = facts;
  return p1.kind === "na"
    ? []
    : [
        p1.kind === "pending"
          ? say(language, "goalPending")
          : say(language, "goal", { n: Math.round(p1.value * PERCENT) }),
      ];
};

/**
 * Whether the context share has reached the alert percent.
 * @param facts the last context reading
 * @param config the alert percent, 0 for off
 * @returns true at or above it, never when off or unread
 */
export const isAlertOf = (
  facts: AdvisorFacts,
  config: Pick<Config, "alertPercent">,
): boolean =>
  config.alertPercent > 0 &&
  facts.percent !== undefined &&
  facts.percent >= config.alertPercent;

/**
 * A toast's text.
 * @param kind the good moment for a /compact, or the size alert
 * @param drawn the verdict and the facts it came from
 * @returns one line in the configured language
 */
export const toastOf = (kind: "good" | "alert", drawn: Drawn): string =>
  kind === "good"
    ? say(drawn.config.language, "toastGood", { n: drawn.verdict.score })
    : say(drawn.config.language, "alert", { n: drawn.facts.percent ?? 0 });

const headOf = (drawn: Drawn): readonly string[] => {
  const { verdict, facts, config } = drawn;
  const { language } = config;
  const { gate } = verdict;
  const lead = say(
    language,
    verdict.score >= config.threshold ? "good" : "wait",
  );
  return gate === undefined
    ? [
        `${lead}: ${say(language, "score", { n: verdict.score })}`,
        ...sizeOf(language, facts),
        ...carriedOf(language, drawn),
        ...leftoversOf(language, drawn),
        ...goalOf(language, facts),
        say(language, drawn.isCacheWarm ? "cacheWarm" : "cacheCold"),
        ...(drawn.isBackgroundKnown
          ? []
          : [say(language, "backgroundUnknown")]),
      ]
    : [
        `${say(language, "early")}: ${gateWords(language, gate)}`,
        // The size is the reason itself for these two.
        ...(gate.kind === "unread" || gate.kind === "small"
          ? []
          : sizeOf(language, facts)),
      ];
};

/**
 * The status line, in plain words: the size alert if any, then the gate or
 * the score with its signals.
 * @param drawn the verdict, the facts and the config
 * @returns `хороший момент для /compact: оценка 82 из 100 · контекст 312k (62%) · …`
 */
export const statusLineOf = (drawn: Drawn): string =>
  [
    ...(isAlertOf(drawn.facts, drawn.config) ? [toastOf("alert", drawn)] : []),
    ...headOf(drawn),
  ].join(" · ");

const PART_PHRASES: Readonly<Record<Verdict["parts"][number]["name"], Phrase>> =
  {
    fill: "partFill",
    leftovers: "partLeftovers",
    P1: "partP1",
    cache: "partCache",
  };

const noteOf = (drawn: Drawn): readonly string[] => {
  const { verdict, facts, config } = drawn;
  const { language } = config;
  return verdict.gate === undefined
    ? [
        ...verdict.parts.map(
          ({ name, value, weight }) =>
            `- ${say(language, PART_PHRASES[name])}: ${value.toFixed(DECIMALS)} × ${String(weight)}`,
        ),
        ...(config.ignoreLeftovers ? [say(language, "leftoversIgnored")] : []),
        ...(facts.p1.kind === "na" ? [say(language, "goalNotCounted")] : []),
        ...verdict.caps.map((cap) =>
          say(
            language,
            cap === "background" ? "capBackground" : "capLeftovers",
          ),
        ),
      ]
    : [`${say(language, "gate")}: ${gateWords(language, verdict.gate)}`];
};

/**
 * `/compact-advisor`'s answer: the status line, every part with its weight,
 * the gate or the caps, the size alert, and whether compactions get the
 * template.
 * @param drawn the verdict, the facts and the config
 * @param isGuarded whether the compaction guard is on
 * @returns a few lines of text
 */
export const explanationOf = (drawn: Drawn, isGuarded: boolean): string => {
  const { language, alertPercent } = drawn.config;
  return [
    statusLineOf(drawn),
    ...noteOf(drawn),
    ...(isAlertOf(drawn.facts, drawn.config)
      ? [
          say(language, "alertNote", {
            n: drawn.facts.percent ?? 0,
            limit: alertPercent,
          }),
        ]
      : []),
    say(language, isGuarded ? "guardOn" : "guardOff"),
    say(language, "disclaimer"),
  ].join("\n");
};
