import { expect, test } from "claude-code/testing";

import { leftoversOf, ownerAskOf } from "../../hooks/model/leftovers.ts";

const RULE = {
  prefixes: ["Хвосты для агента:", "Хвосты для владельца:", "Leftovers:"],
  noneWords: ["нет", "none"],
} as const;

test("both owner lines saying нет are none, in any markup", () => {
  const answer = [
    "Done.",
    "- `Хвосты для агента: нет`",
    "> **Хвосты для владельца:** нет.",
  ].join("\n");
  expect(leftoversOf(answer, RULE)).toEqual({ kind: "none" });
});

test("a listed leftover wins and is carried, cut short", () => {
  const answer =
    "Хвосты для агента: нет\nХвосты для владельца: создать репозиторий на GitHub и подключить раннер к нему";
  expect(leftoversOf(answer, RULE)).toEqual({
    kind: "listed",
    text: "создать репозиторий на GitHub и подключ…",
    isOwner: true,
  });
});

test("the agent's own listed leftover is not an owner question", () => {
  const answer = "Хвосты для агента: слить PR 51\nХвосты для владельца: нет";
  expect(leftoversOf(answer, RULE)).toEqual({
    kind: "listed",
    text: "слить PR 51",
  });
  expect(ownerAskOf(answer, RULE)).toBeUndefined();
});

test("the owner's line is what the answer asks, whole up to a limit", () => {
  const ask = "решить, убирать ли шаг eval в четырёх репозиториях";
  const answer = `Хвосты для агента: нет\nХвосты для владельца: ${ask}.`;
  expect(ownerAskOf(answer, RULE)).toBe(ask);
  expect(ownerAskOf("Хвосты для владельца: нет", RULE)).toBeUndefined();
  expect(ownerAskOf("nothing", RULE)).toBeUndefined();
});

test("no line is unknown; the last line per prefix counts", () => {
  expect(leftoversOf("All done, tests pass.", RULE)).toEqual({
    kind: "unknown",
  });
  expect(
    leftoversOf("Leftovers: rerun CI\n...\nLeftovers: none", RULE),
  ).toEqual({ kind: "none" });
});

test("a none word inside a longer value is not none", () => {
  expect(leftoversOf("Хвосты для агента: нет, кроме CI", RULE)).toEqual({
    kind: "listed",
    text: "нет, кроме CI",
  });
});

test("a blank leftover value is unknown, even alongside explicit none", () => {
  for (const answer of [
    "Хвосты для агента:",
    "Хвосты для агента:   ",
    "Хвосты для агента:\nХвосты для владельца: нет",
    "Хвосты для агента: нет\nХвосты для владельца:",
  ]) {
    expect(leftoversOf(answer, RULE)).toEqual({ kind: "unknown" });
    expect(ownerAskOf(answer, RULE)).toBeUndefined();
  }
});

test("a listed leftover wins over blank values", () => {
  expect(
    leftoversOf("Хвосты для агента:\nХвосты для владельца: выбрать план", RULE),
  ).toEqual({ kind: "listed", text: "выбрать план", isOwner: true });
  expect(
    leftoversOf("Хвосты для агента: push\nХвосты для владельца:", RULE),
  ).toEqual({ kind: "listed", text: "push" });
});

test("a prefix mid-sentence does not count", () => {
  expect(
    leftoversOf("I will end with Хвосты для агента: нет as usual", RULE),
  ).toEqual({ kind: "unknown" });
});

test("list marks and bold around the prefix still count", () => {
  for (const owner of [
    "+ Хвосты для владельца: push",
    "1. Хвосты для владельца: push",
    "2) Хвосты для владельца: push",
    "**Хвосты для владельца**: push",
    "- _Хвосты для владельца:_ push",
  ]) {
    expect(leftoversOf(`Хвосты для агента: нет\n${owner}`, RULE)).toEqual({
      kind: "listed",
      text: "push",
      isOwner: true,
    });
  }
});
