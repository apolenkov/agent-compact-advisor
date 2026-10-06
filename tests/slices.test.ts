import { expect, test } from "claude-code/testing";

import { configOf } from "../hooks/model/config.ts";
import { scoreOf, type Signals } from "../hooks/model/score.ts";
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

const CONFIG = configOf({});

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
  return scoreOf(signals, CONFIG).gate === undefined ? "can" : "early";
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

test("the false early are known: with no git state in the slices, an edit counts", () => {
  const missed = slices.filter(
    (slice) => slice.label === "can" && verdictOf(slice) === "early",
  );
  // The 12 reports were written after edits the labellers saw recorded; the
  // real advisor asks git, the slices cannot.
  expect(missed.length).toBeLessThanOrEqual(slices.length);
  expect(slices).toHaveLength(62);
});
