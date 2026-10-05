import { expect, mock, test } from "claude-code/testing";

import { advance } from "./fixtures/advance.ts";
import { DONE, measure, MESSAGES, START, turn } from "./fixtures/session.ts";
import { world } from "./fixtures/world.ts";

const COORDINATOR =
  "Идёт работа.\nХвосты для агента: ждать итоги субагентов\nХвосты для владельца: нет";

test("a listed leftover scores 0 for a plain session, with the size shown", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  await $.session.start(START);
  await measure($, 240_000);
  await turn($, COORDINATOR);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "рано: хвосты — ждать итоги субагентов · контекст 240k (24%)",
  );
});

test(
  "ignoreLeftovers keeps a coordinator's score alive",
  { options: { ignoreLeftovers: true } },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.calls = [];
    await $.session.start(START);
    await measure($, 400_000);
    await turn($, COORDINATOR);
    await advance(clock, 0);
    expect(seen.statuses.at(-1)).toBe(
      "хороший момент для /compact: оценка 97 из 100 · контекст 400k (40%) · цель достигнута с вероятностью 90% · кэш тёплый",
    );
    expect(seen.suggested.at(-1)).toMatch(/^\/compact/u);
  },
);

test(
  "the status line speaks English when asked",
  { options: { language: "en" } },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.calls = [{ status: "running" }];
    await $.session.start(START);
    await measure($, 400_000);
    await turn($, DONE);
    await advance(clock, 0);
    expect(seen.statuses.at(-1)).toBe(
      "too early: a background task is running · context 400k (40%)",
    );
  },
);

test("the size alert fires past 60% whatever the leftovers, once per crossing", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  await $.session.start(START);
  await measure($, 650_000);
  await turn($, COORDINATOR);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "контекст 65% — пора компактить · рано: хвосты — ждать итоги субагентов · контекст 650k (65%)",
  );
  expect(seen.suggested).toHaveLength(1);
  expect(seen.toasts).toEqual(["контекст 65% — пора компактить"]);
  await measure($, 700_000);
  expect(seen.toasts).toHaveLength(1);
  await $.session.compact({ messages: MESSAGES, trigger: "manual" });
  await measure($, 650_000);
  expect(seen.toasts).toHaveLength(2);
});

test(
  "alertPercent 0 turns the alert off",
  { options: { alertPercent: 0 } },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.calls = [];
    await $.session.start(START);
    await measure($, 650_000);
    await turn($, COORDINATOR);
    await advance(clock, 0);
    expect(seen.statuses.at(-1)).not.toContain("пора компактить");
    expect(seen.suggested).toEqual([]);
    expect(seen.toasts).toEqual([]);
  },
);

test("the size alert shows but offers no /compact while background work runs", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [{ status: "running" }];
  await $.session.start(START);
  await measure($, 650_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "контекст 65% — пора компактить · рано: идёт фоновая задача · контекст 650k (65%)",
  );
  expect(seen.toasts).toHaveLength(1);
  expect(seen.suggested).toHaveLength(0);
});
