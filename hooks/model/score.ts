/**
 * The compaction score 0–100: gates, a weighted sum, caps, and its words.
 */
import type { AdvisorFacts, P1 } from "../../types";
import type { Config } from "./config.ts";

/** Everything a score is computed from at one moment. */
export interface Signals {
  readonly facts: AdvisorFacts;
  readonly runningAgents: number;
  /** Live background calls, undefined when agent-shell-watch says nothing. */
  readonly liveCalls: number | undefined;
  readonly now: number;
}

/** One weighted part of the score, its value 0..1. */
interface Part {
  readonly name: string;
  readonly weight: number;
  readonly value: number;
}

/** A score and why it stands where it does. */
export interface Verdict {
  readonly score: number;
  /** The gate that set the score to 0, if one did. */
  readonly gate?: string;
  readonly parts: readonly Part[];
  readonly caps: readonly string[];
}

const PERCENT = 100;
const KILO = 1000;
const UNKNOWN_CAP = 60;
// The fill part is complete at this share of the window at most.
const FULL_SHARE = 0.9;
const WEIGHTS = { fill: 40, leftovers: 30, p1: 20, cache: 10 } as const;

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? "" : "s"}`;

const gateOf = (signals: Signals, config: Config): string | undefined => {
  const { facts, runningAgents, liveCalls = 0 } = signals;
  const { tokens = 0 } = facts;
  const gates: readonly (string | false)[] = [
    facts.tokens === undefined && "no context reading yet",
    tokens < config.minTokens && `small context ${kOf(tokens)}`,
    runningAgents > 0 && `too early: ${plural(runningAgents, "agent")} running`,
    liveCalls > 0 && `too early: ${plural(liveCalls, "background call")}`,
    facts.leftovers.kind === "listed" && `leftovers: ${facts.leftovers.text}`,
  ];
  return gates.find((gate) => gate !== false);
};

/**
 * Whether the prompt cache still holds the conversation's prefix.
 * @param signals the facts and the time now
 * @param config the cache's time to live
 * @returns true within the TTL of the last main turn's end
 */
export const isCacheWarm = (signals: Signals, config: Config): boolean =>
  signals.facts.lastTurnAt !== undefined &&
  signals.now - signals.facts.lastTurnAt < config.cacheTtlMs;

// Pending counts as 0: a suggestion cannot be taken back once a low P1 lands.
const p1Part = (p1: P1): readonly Part[] =>
  p1.kind === "na"
    ? []
    : [
        {
          name: "P1",
          weight: WEIGHTS.p1,
          value: p1.kind === "value" ? p1.value : 0,
        },
      ];

const fullOf = (signals: Signals, config: Config): number => {
  const { window } = signals.facts;
  const bound =
    window === undefined ? config.fullTokens : Math.floor(window * FULL_SHARE);
  return Math.max(Math.min(config.fullTokens, bound), config.minTokens + 1);
};

const partsOf = (
  signals: Signals,
  config: Config,
  tokens: number,
): readonly Part[] => {
  const fill =
    (tokens - config.minTokens) / (fullOf(signals, config) - config.minTokens);
  return [
    { name: "fill", weight: WEIGHTS.fill, value: Math.min(1, fill) },
    {
      name: "leftovers",
      weight: WEIGHTS.leftovers,
      value: signals.facts.leftovers.kind === "none" ? 1 : 0,
    },
    ...p1Part(signals.facts.p1),
    {
      name: "cache",
      weight: WEIGHTS.cache,
      value: isCacheWarm(signals, config) ? 1 : 0,
    },
  ];
};

const capsOf = (signals: Signals): readonly string[] => [
  ...(signals.liveCalls === undefined ? ["background unknown"] : []),
  ...(signals.facts.leftovers.kind === "unknown" ? ["leftovers unknown"] : []),
];

const weighed = (signals: Signals, config: Config): Verdict => {
  const parts = partsOf(signals, config, signals.facts.tokens ?? 0);
  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  const sum = parts.reduce(
    (summed, part) => summed + part.weight * part.value,
    0,
  );
  const caps = capsOf(signals);
  const raw = Math.round((PERCENT * sum) / total);
  return {
    score: caps.length > 0 ? Math.min(raw, UNKNOWN_CAP) : raw,
    parts,
    caps,
  };
};

/**
 * Scores this moment for a compaction.
 * @param signals the facts, agents, background calls and time
 * @param config thresholds and weights' bounds
 * @returns 0 with the gate that holds, else the weighted sum, capped at 60
 *   while background or leftovers are unknown
 */
export const scoreOf = (signals: Signals, config: Config): Verdict => {
  const gate = gateOf(signals, config);
  return gate === undefined
    ? weighed(signals, config)
    : { score: 0, gate, parts: [], caps: [] };
};

/**
 * Tokens as thousands.
 * @param tokens a token count
 * @returns `312k`
 */
export const kOf = (tokens: number): string =>
  `${String(Math.round(tokens / KILO))}k`;
