import { expect, test } from "claude-code/testing";

import { configOf } from "../hooks/model/config.ts";
import type { Drawn } from "../hooks/model/format.ts";
import { offerOf } from "../hooks/model/offer.ts";
import { isCacheWarm, scoreOf, type Signals } from "../hooks/model/score.ts";
import type { Leftovers } from "../types";
import { SLICES } from "./fixtures/slices.ts";

// 56 moments of 9 real sessions plus 6 corpus rows (`C-`), reduced to kinds
// of events (no text, no paths: the sessions hold other projects), labelled
// blind by two labellers. A
// disagreement is resolved by the coordinator's rule for the 12 reports of the
// weeklyreport session ("can": an owner question is carried by the template)
// and otherwise by the cost model ("early": a false "can" costs more).
interface Slice {
  readonly id: string;
  readonly edited: boolean;
  readonly unpushed: number;
  readonly live: readonly string[];
  readonly tailAgent: string;
  readonly tailOwner: string;
  readonly labelA: string;
  readonly labelB: string;
  readonly label: string;
}

const SIZE = 9;

const sliceOf = (line: string): Slice => {
  const [
    id = "",
    edited = "0",
    unpushed = "0",
    live = "",
    tailAgent = "",
    tailOwner = "",
    labelA = "",
    labelB = "",
    label = "",
  ] = line.split("|", SIZE);
  return {
    id,
    edited: edited === "1",
    unpushed: Number(unpushed),
    live: live.split(",").filter((kind) => kind !== ""),
    tailAgent,
    tailOwner,
    labelA,
    labelB,
    label,
  };
};

const CONFIG = configOf({ alertPercent: 0 });

const drawnOf = (signals: Signals): Drawn => ({
  facts: signals.facts,
  verdict: scoreOf(signals, CONFIG),
  config: CONFIG,
  isBackgroundKnown: signals.liveCalls !== undefined,
  isRecordKnown: signals.unrecorded !== undefined,
  isCacheWarm: isCacheWarm(signals, CONFIG),
  watchers: 0,
});

const LEFTOVERS: Readonly<Record<string, Leftovers>> = {
  agentListed: { kind: "listed", text: "x" },
  ownerListed: { kind: "listed", text: "x", isOwner: true },
  none: { kind: "none" },
  unknown: { kind: "unknown" },
};

const keyOf = (slice: Slice): string => {
  const both = `${slice.tailAgent}/${slice.tailOwner}`;
  const keys: readonly (readonly [boolean, string])[] = [
    [slice.tailAgent === "listed", "agentListed"],
    [slice.tailOwner === "listed", "ownerListed"],
    [both === "none/none", "none"],
  ];
  return keys.find(([isMet]) => isMet)?.[1] ?? "unknown";
};

const leftoversOf = (slice: Slice): Leftovers =>
  LEFTOVERS[keyOf(slice)] ?? { kind: "unknown" };

// The slices have no git state: an edit since the last commit counts as an
// unrecorded file, which is stricter than git would be.
const verdictOf = (slice: Slice): "can" | "early" => {
  const signals: Signals = {
    facts: {
      tokens: 400_000,
      percent: 40,
      leftovers: leftoversOf(slice),
      p1: { kind: "na" },
      wasAbove: false,
      wasAlerted: false,
    },
    runningAgents: 0,
    liveCalls: slice.live.filter(
      (kind) => kind === "work" || kind === "unknown",
    ).length,
    unreadRunners: slice.live.filter((kind) => kind === "unread").length,
    staleCalls: slice.live.filter((kind) => kind === "stale").length,
    unrecorded: { files: slice.edited ? 1 : 0, commits: slice.unpushed },
    now: 0,
  };
  const offer = offerOf(drawnOf(signals), true);
  return offer.isAbove && offer.isSuggested ? "can" : "early";
};

const slices: readonly Slice[] = SLICES.trim()
  .split("\n")
  .map((line) => sliceOf(line));

test("no false can: where both labellers said early the advisor says early", () => {
  const wrong = slices.filter(
    (slice) =>
      slice.labelA === "early" &&
      slice.labelB === "early" &&
      verdictOf(slice) === "can",
  );
  expect(wrong.map((slice) => slice.id)).toEqual([]);
});

test("no false can against the resolved labels either", () => {
  const wrong = slices.filter(
    (slice) => slice.label === "early" && verdictOf(slice) === "can",
  );
  expect(wrong.map((slice) => slice.id)).toEqual([]);
});

// Thirteen slices omit the git receipts which held the labellers' recorded
// reports; S4-92 omits explicit none tails and is therefore capped below 70.
const INCOMPLETE_GIT = [
  "S2-963",
  "S2-965",
  "S2-966",
  "S2-968",
  "S2-969",
  "S2-971",
  "S2-973",
  "S2-974",
  "S2-975",
  "S2-976",
  "S2-977",
  "S2-1003",
  "S2-1006",
];
const ALLOWED_FALSE_EARLY = new Set([...INCOMPLETE_GIT, "S4-92"]);

test("threshold 70 misses only the explained incomplete-git and unknown-tail IDs", () => {
  const missed = slices.filter(
    (slice) => slice.label === "can" && verdictOf(slice) === "early",
  );
  expect(missed.filter((slice) => !ALLOWED_FALSE_EARLY.has(slice.id))).toEqual(
    [],
  );
  expect(missed.length).toBeLessThanOrEqual(14);
});

// All safety signals are complete; alert is disabled so this is the score policy.
for (const [tokens, score, isOffered] of [
  [176_000, 69, false],
  [180_000, 70, true],
  [184_000, 71, true],
] as const) {
  test(`complete inputs score ${String(score)} and ${isOffered ? "offer" : "withhold"} at threshold 70`, () => {
    const drawn = drawnOf({
      facts: {
        tokens,
        percent: 18,
        leftovers: { kind: "none" },
        p1: { kind: "na" },
        lastTurnAt: 0,
        wasAbove: false,
        wasAlerted: false,
      },
      runningAgents: 0,
      liveCalls: 0,
      unrecorded: { files: 0, commits: 0 },
      now: 0,
    });
    expect(drawn.verdict.gate).toBeUndefined();
    expect(drawn.verdict.caps).toEqual([]);
    expect(drawn.verdict.score).toBe(score);
    expect(offerOf(drawn, true)).toMatchObject({
      isAbove: isOffered,
      isSuggested: isOffered,
    });
  });
}
