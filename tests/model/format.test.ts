import { expect, test } from "claude-code/testing";

import { configOf } from "../../hooks/model/config.ts";
import {
  type Drawn,
  explanationOf,
  isAlertOf,
  statusLineOf,
  toastOf,
} from "../../hooks/model/format.ts";
import type { Gate, Verdict } from "../../hooks/model/score.ts";
import type { AdvisorFacts } from "../../types";

const FACTS: AdvisorFacts = {
  tokens: 312_400,
  percent: 62,
  leftovers: { kind: "none" },
  p1: { kind: "value", value: 0.912 },
  wasAbove: false,
  wasAlerted: false,
};
const PARTS: Verdict["parts"] = [
  { name: "fill", weight: 40, value: 1 },
  { name: "leftovers", weight: 30, value: 1 },
  { name: "cache", weight: 10, value: 1 },
];
const RU = configOf({ alertPercent: 0 });
const EN = configOf({ language: "en", alertPercent: 0 });
const drawn = (over: Partial<Drawn> = {}): Drawn => ({
  verdict: { score: 82, parts: PARTS, caps: [] },
  facts: FACTS,
  isCacheWarm: true,
  isBackgroundKnown: true,
  isRecordKnown: false,
  watchers: 0,
  config: RU,
  ...over,
});
const gated = (gate: Gate, over: Partial<Drawn> = {}): Drawn =>
  drawn({ verdict: { score: 0, gate, parts: [], caps: [] }, ...over });
const SMALL: AdvisorFacts = { ...FACTS, tokens: 243_000, percent: 24 };

test("ready: the good moment, the score and every signal in words", () => {
  expect(statusLineOf(drawn())).toBe(
    "хороший момент для /compact: оценка 82 из 100 · контекст 312k (62%) · хвостов нет · цель достигнута с вероятностью 91% · кэш тёплый",
  );
  expect(statusLineOf(drawn({ config: EN }))).toBe(
    "good moment to /compact: score 82 of 100 · context 312k (62%) · no leftovers · goal reached with 91% probability · cache warm",
  );
});

test("below the threshold without a gate: can wait; unknowns in words", () => {
  expect(
    statusLineOf(
      drawn({
        verdict: { score: 55, parts: PARTS, caps: ["background"] },
        facts: { ...FACTS, p1: { kind: "pending" } },
        isCacheWarm: false,
        isBackgroundKnown: false,
      }),
    ),
  ).toBe(
    "можно подождать: оценка 55 из 100 · контекст 312k (62%) · хвостов нет · проверяю, достигнута ли цель · кэш остыл · фоновые задачи неизвестны",
  );
});

test("a gate says why it is early, with the size where it is not the reason", () => {
  expect(
    statusLineOf(gated({ kind: "calls", count: 1 }, { facts: SMALL })),
  ).toBe("рано: идёт фоновая задача · контекст 243k (24%)");
  expect(statusLineOf(gated({ kind: "agents", count: 2 }))).toBe(
    "рано: работает 2 агента · контекст 312k (62%)",
  );
  expect(
    statusLineOf(gated({ kind: "leftovers", text: "push" }, { facts: SMALL })),
  ).toBe("рано: хвосты — push · контекст 243k (24%)");
  expect(statusLineOf(gated({ kind: "unread" }))).toBe(
    "рано: размер контекста ещё неизвестен",
  );
  expect(statusLineOf(gated({ kind: "agents", count: 5 }))).toContain(
    "работают 5 агентов",
  );
  expect(statusLineOf(gated({ kind: "calls", count: 3 }, { config: EN }))).toBe(
    "too early: 3 background tasks are running · context 312k (62%)",
  );
});

test("ignored leftovers say nothing about leftovers", () => {
  const line = statusLineOf(
    drawn({
      facts: { ...FACTS, leftovers: { kind: "listed", text: "wait" } },
      config: configOf({ ignoreLeftovers: true, alertPercent: 0 }),
    }),
  );
  expect(line).not.toContain("хвост");
});

test("past the alert percent the line opens with the alert", () => {
  const alerting = configOf({ alertPercent: 60 });
  expect(statusLineOf(drawn({ config: alerting }))).toMatch(
    /^контекст 62% — пора компактить · хороший момент/u,
  );
  const english = configOf({ language: "en" });
  expect(statusLineOf(drawn({ config: english }))).toMatch(
    /^context 62% — time to compact · /u,
  );
  expect(isAlertOf(FACTS, alerting)).toBe(true);
  expect(isAlertOf({ ...FACTS, percent: 59 }, alerting)).toBe(false);
  expect(isAlertOf({ ...FACTS, percent: undefined }, alerting)).toBe(false);
  expect(isAlertOf(FACTS, RU)).toBe(false);
});

test("toasts are worded in the language", () => {
  expect(toastOf("good", drawn())).toBe(
    "хороший момент для /compact (82): Tab принимает",
  );
  expect(toastOf("alert", drawn({ config: EN }))).toBe(
    "context 62% — time to compact",
  );
});

test("the explanation lists parts, caps and the guard, in the language", () => {
  const capped = drawn({
    verdict: {
      score: 60,
      parts: PARTS,
      caps: ["leftovers"],
    },
    facts: { ...FACTS, p1: { kind: "na" } },
  });
  const ru = explanationOf(capped, true);
  expect(ru).toContain("- заполнение: 1.00 × 40");
  expect(ru).not.toContain("цель достигнута");
  expect(ru).toContain("- потолок 60: в последнем ответе нет строк о хвостах");
  expect(ru).toContain("шаблон сохранения");
  const en = explanationOf({ ...capped, config: EN }, true);
  expect(en).toContain("- context fill: 1.00 × 40");
  expect(en).toContain("- capped at 60: the last answer has no leftover lines");
  expect(en).toContain("not a probability");
  expect(explanationOf(gated({ kind: "agents", count: 1 }), false)).toContain(
    "- рано: работает 1 агент",
  );
});

test("the explanation notes ignored leftovers and the alert", () => {
  const text = explanationOf(
    drawn({ config: configOf({ ignoreLeftovers: true, alertPercent: 60 }) }),
    true,
  );
  expect(text).toContain("- хвосты: не учитываются по настройке");
  expect(text).toContain("- потолок 91: цель достигнута с вероятностью 91%");
  expect(text).toContain("- тревога: контекст 62% не ниже порога 60%");
});
