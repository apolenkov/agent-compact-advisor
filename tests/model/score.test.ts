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
    gate: "no context reading yet",
  });
  expect(scoreOf(facts({ tokens: 99_000 }), CONFIG).gate).toBe(
    "small context 99k",
  );
  expect(scoreOf(signals({ runningAgents: 2 }), CONFIG).gate).toBe(
    "too early: 2 agents running",
  );
  expect(scoreOf(signals({ liveCalls: 1 }), CONFIG).gate).toBe(
    "too early: 1 background call",
  );
  expect(
    scoreOf(facts({ leftovers: { kind: "listed", text: "push" } }), CONFIG)
      .gate,
  ).toBe("leftovers: push");
});

test("P1 not available removes its weight and rescales", () => {
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

test("P1 pending counts 0 with its weight kept", () => {
  // 40 + 30 + 0 + 10 = 80
  expect(scoreOf(facts({ p1: { kind: "pending" } }), CONFIG).score).toBe(80);
});

test("fill is complete at 90% of a window smaller than fullTokens", () => {
  // window 200k → full 180k; 140k is half way: 20 + 30 + 20 + 10 = 80
  expect(
    scoreOf(facts({ tokens: 140_000, window: 200_000 }), CONFIG).score,
  ).toBe(80);
});

test("fill grows from minTokens to fullTokens", () => {
  // fill .5×40 + 30 + 20 + 10 = 80
  expect(scoreOf(facts({ tokens: 200_000 }), CONFIG).score).toBe(80);
});

test("unknown background or leftovers cap the score at 60", () => {
  const unknownBg = scoreOf(signals({ liveCalls: undefined }), CONFIG);
  expect(unknownBg.score).toBe(60);
  expect(unknownBg.caps).toEqual(["background unknown"]);
  expect(scoreOf(facts({ leftovers: { kind: "unknown" } }), CONFIG).score).toBe(
    60,
  );
});

test("with defaults, a suggestion needs known none leftovers", () => {
  // Best case without the leftover lines stays under the threshold of 70.
  const verdict = scoreOf(facts({ leftovers: { kind: "unknown" } }), CONFIG);
  expect(verdict.score).toBeLessThan(CONFIG.threshold);
});
