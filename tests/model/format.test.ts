import { expect, test } from "claude-code/testing";

import { explanationOf, statusLineOf } from "../../hooks/model/format.ts";
import type { AdvisorFacts } from "../../types";

const FACTS: AdvisorFacts = {
  tokens: 312_400,
  percent: 62,
  leftovers: { kind: "none" },
  p1: { kind: "value", value: 0.912 },
  wasAbove: false,
};
const PARTS = [
  { name: "fill", weight: 40, value: 1 },
  { name: "leftovers", weight: 30, value: 1 },
  { name: "P1", weight: 20, value: 0.91 },
  { name: "cache", weight: 10, value: 1 },
];

test("the status line names the score and the signals", () => {
  expect(
    statusLineOf({
      verdict: { score: 98, parts: PARTS, caps: [] },
      facts: FACTS,
      isCacheWarm: true,
      isBackgroundKnown: true,
    }),
  ).toBe("score 98 · 312k 62% · leftovers none · P1 .91 · cache warm");
  expect(
    statusLineOf({
      verdict: { score: 60, parts: PARTS, caps: ["background unknown"] },
      facts: { ...FACTS, p1: { kind: "pending" } },
      isCacheWarm: false,
      isBackgroundKnown: false,
    }),
  ).toBe("score 60 · 312k 62% · leftovers none · P1 … · cache cold · bg ?");
});

test("a gate replaces the signals", () => {
  expect(
    statusLineOf({
      verdict: {
        score: 0,
        gate: "too early: 1 agent running",
        parts: [],
        caps: [],
      },
      facts: FACTS,
      isCacheWarm: true,
      isBackgroundKnown: true,
    }),
  ).toBe("score 0 · too early: 1 agent running · 312k 62%");
});

test("the explanation lists parts, caps and the guard", () => {
  const text = explanationOf(
    {
      verdict: {
        score: 60,
        parts: PARTS.filter((part) => part.name !== "P1"),
        caps: ["leftovers unknown"],
      },
      facts: { ...FACTS, p1: { kind: "na" } },
      isCacheWarm: true,
      isBackgroundKnown: true,
    },
    true,
  );
  expect(text).toContain("- fill: 1.00 × 40");
  expect(text).toContain("- P1: not counted");
  expect(text).toContain("- capped at 60: leftovers unknown");
  expect(text).toContain("preservation template");
  expect(text).toContain("not a probability");
});
