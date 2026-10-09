import { expect, test } from "claude-code/testing";

import { configOf } from "../../hooks/model/config.ts";
import { scoreOf, type Signals } from "../../hooks/model/score.ts";
import type { AdvisorFacts } from "../../types";

const CONFIG = configOf({});
const NOW = 1_000_000;
const DONE: AdvisorFacts = {
  tokens: 300_000,
  percent: 30,
  leftovers: { kind: "none" },
  p1: { kind: "value", value: 1 },
  lastTurnAt: NOW - 1000,
  wasAbove: false,
  wasAlerted: false,
};
const signals = (over: Partial<Signals> = {}): Signals => ({
  facts: DONE,
  runningAgents: 0,
  liveCalls: 0,
  now: NOW,
  ...over,
});
const facts = (over: Partial<AdvisorFacts>): Signals =>
  signals({ facts: { ...DONE, ...over } });

test("a full, finished, warm session scores 100", () => {
  expect(scoreOf(signals(), CONFIG).score).toBe(100);
});

test("each gate sets 0 and names itself, in order", () => {
  expect(scoreOf(facts({ tokens: undefined }), CONFIG)).toMatchObject({
    score: 0,
    gate: { kind: "unread" },
  });
  expect(scoreOf(signals({ runningAgents: 2 }), CONFIG).gate).toEqual({
    kind: "agents",
    count: 2,
  });
  expect(scoreOf(signals({ liveCalls: 1 }), CONFIG).gate).toEqual({
    kind: "calls",
    count: 1,
  });
  expect(
    scoreOf(facts({ leftovers: { kind: "listed", text: "push" } }), CONFIG)
      .gate,
  ).toEqual({ kind: "leftovers", text: "push" });
  // git could not say what is unpushed: that is a gate, not a clean answer.
  expect(
    scoreOf(signals({ unrecorded: { files: 0, commits: undefined } }), CONFIG)
      .gate,
  ).toEqual({ kind: "unpushed", count: undefined });
});

test("a small context is not worthwhile, not early", () => {
  // Size never blocks: 50k and everything recorded is can at 0.
  const verdict = scoreOf(facts({ tokens: 50_000, percent: 5 }), CONFIG);
  expect(verdict.gate).toBeUndefined();
  expect(verdict.score).toBe(0);
});

test("a debt outlives its turn until a checked answer clears it", () => {
  // Turn N+1 after an aborted one: no fresh answer, the owes still holds.
  const verdict = scoreOf(
    facts({
      turnId: "N+1",
      promise: { turnId: "N", state: "owes" },
    }),
    CONFIG,
  );
  expect(verdict.score).toBe(0);
  expect(verdict.gate).toEqual({ kind: "owes" });
});

test("P1 not available caps nothing", () => {
  // fill 1×40 + leftovers 1×30 + cache 0×10 over 80 → 88
  const verdict = scoreOf(
    facts({ p1: { kind: "na" }, lastTurnAt: NOW - 600_000 }),
    CONFIG,
  );
  expect(verdict.score).toBe(88);
  expect(verdict.parts.map((part) => part.name)).toEqual([
    "fill",
    "leftovers",
    "cache",
  ]);
});

test("P1 pending blocks: the priority verdict has not arrived", () => {
  // Unfinished work is a gate, not 0 points: no fill compensates it.
  expect(scoreOf(facts({ p1: { kind: "pending" } }), CONFIG)).toMatchObject({
    score: 0,
    gate: { kind: "p1" },
  });
});

test("doubt caps, never adds: Kev's 0.55 bounds the score at 55", () => {
  // No fill compensates it; 0.9 still suggests at 90.
  const capped = scoreOf(facts({ p1: { kind: "value", value: 0.55 } }), CONFIG);
  expect(capped.score).toBe(55);
  expect(capped.gate).toBeUndefined();
  expect(
    scoreOf(facts({ p1: { kind: "value", value: 0.9 } }), CONFIG).score,
  ).toBe(90);
});

test("fill is complete at 90% of a window smaller than fullTokens", () => {
  // window 200k → full 180k; 140k is half way: 20 + 30 + 10 over 80 = 75
  expect(
    scoreOf(facts({ tokens: 140_000, window: 200_000 }), CONFIG).score,
  ).toBe(75);
});

test("fill grows from minTokens to fullTokens", () => {
  // fill .5×40 + 30 + 10 over 80 = 75
  expect(scoreOf(facts({ tokens: 200_000 }), CONFIG).score).toBe(75);
});

test("unknown background or leftovers cap the score at 60", () => {
  const unknownBg = scoreOf(signals({ liveCalls: undefined }), CONFIG);
  expect(unknownBg.score).toBe(60);
  expect(unknownBg.caps).toEqual(["background"]);
  expect(scoreOf(facts({ leftovers: { kind: "unknown" } }), CONFIG).score).toBe(
    60,
  );
});

test("the unseen cap stays below every threshold", () => {
  // Magic 60 must never read as "can" under a low threshold.
  const low = configOf({ threshold: 50 });
  const verdict = scoreOf(signals({ liveCalls: undefined }), low);
  expect(verdict.caps).toEqual(["background"]);
  expect(verdict.score).toBeLessThan(low.threshold);
});

test("with defaults, a suggestion needs known none leftovers", () => {
  // Best case without the leftover lines stays under the threshold of 70.
  const verdict = scoreOf(facts({ leftovers: { kind: "unknown" } }), CONFIG);
  expect(verdict.score).toBeLessThan(CONFIG.threshold);
});

const LISTED = { kind: "listed", text: "wait for results" } as const;
const IGNORING = configOf({ ignoreLeftovers: true });

test("ignored leftovers do not gate, cap or count, and the sum rescales", () => {
  const verdict = scoreOf(facts({ leftovers: LISTED }), IGNORING);
  expect(verdict.gate).toBeUndefined();
  // fill 1×40 + cache 1×10 over 50 → 100
  expect(verdict.score).toBe(100);
  expect(verdict.parts.map((part) => part.name)).toEqual(["fill", "cache"]);
  const unknown = scoreOf(facts({ leftovers: { kind: "unknown" } }), IGNORING);
  expect(unknown.score).toBe(100);
  expect(unknown.caps).toEqual([]);
});

test("without the setting listed leftovers still gate", () => {
  expect(scoreOf(facts({ leftovers: LISTED }), CONFIG).score).toBe(0);
});
