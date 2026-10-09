import type { MatchedHook, Registration } from "claude-code";
import type { Engine } from "claude-code/testing";
import { expect, mock, test } from "claude-code/testing";

import { advance } from "./fixtures/advance.ts";
import { DONE, measure, START } from "./fixtures/session.ts";
import { world } from "./fixtures/world.ts";

const OPTIONS = { systemOneUrl: "", modelCheck: false };
const FACTS = { plugin: "agent-compact-advisor", key: "facts" } as const;
type FactsHook = MatchedHook<"state.set", typeof FACTS>;
type Observe = (
  pattern: "state.set",
  matcher: typeof FACTS,
  hook: FactsHook,
) => Registration<FactsHook>;
const complete = async (
  $: Engine,
  turnId: string,
  answer = DONE,
): Promise<void> => {
  await $.turn.complete({
    answer,
    durationMs: 1000,
    isAborted: false,
    turnId,
    reason: "answer",
  });
};
const latch = (): Readonly<{ wait: Promise<void>; release: () => void }> => {
  const held = {
    release: (): void => {
      throw new Error("latch not initialized");
    },
  };
  const wait = new Promise<void>((resolve) => {
    held.release = resolve;
  });
  return {
    wait,
    release: () => {
      held.release();
    },
  };
};

test(
  "unknown-background size alert offers each completed turn once and keeps its cap",
  { options: OPTIONS },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    await $.session.start(START);
    await measure($, 610_000);
    expect(seen.toasts).toEqual(["контекст 61% — пора компактить"]);
    expect(seen.suggested).toEqual([]);
    await complete($, "one");
    await advance(clock, 0);
    expect(seen.statuses.at(-1)).toContain("оценка 60 из 100");
    expect(seen.statuses.at(-1)).toContain("фоновые задачи неизвестны");
    expect(seen.suggested).toHaveLength(1);
    await advance(clock, 30_000);
    expect(seen.suggested).toHaveLength(1);
    await $.turn.start({ text: "continue", turnId: "two" });
    await complete($, "two");
    await advance(clock, 0);
    expect(seen.suggested).toHaveLength(2);
    expect(seen.toasts).toHaveLength(1);
  },
);

test(
  "concurrent crossing draws use real SDK CAS and emit one toast",
  { options: OPTIONS },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    const external = latch();
    const writes = latch();
    const readVisits: number[] = [];
    const versions: (number | undefined)[] = [];
    const receipts: boolean[] = [];
    const observe: Observe = on;
    observe("state.set", FACTS, async (_$, e, next) => {
      if (e.value.wasAlerted && versions.length < 2) {
        versions.push(e.ifVersion);
        if (versions.length === 2) {
          writes.release();
        }
        await writes.wait;
        const receipt = await next(e);
        if (receipt.value !== undefined) {
          receipts.push(receipt.value.isSet);
        }
        return receipt;
      }
      return next(e);
    });
    await $.session.start(START);
    seen.callsRead = async () => {
      readVisits.push(1);
      await external.wait;
    };
    const draws = Promise.all([measure($, 610_000), measure($, 610_000)]);
    await advance(clock, 0);
    expect(readVisits).toHaveLength(2);
    external.release();
    await draws;
    expect(versions).toHaveLength(2);
    expect(versions.every((version) => typeof version === "number")).toBe(true);
    expect(receipts.toSorted((a, b) => Number(a) - Number(b))).toEqual([
      false,
      true,
    ]);
    expect(seen.toasts).toEqual(["контекст 61% — пора компактить"]);
    expect(seen.suggested).toEqual([]);
  },
);

test(
  "two concurrent completions of one turn suggest once after its earlier size toast",
  { options: OPTIONS },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    await $.session.start(START);
    await measure($, 610_000);
    await Promise.all([complete($, "same"), complete($, "same")]);
    const external = latch();
    const visits: number[] = [];
    seen.callsRead = async () => {
      visits.push(1);
      await external.wait;
    };
    await advance(clock, 0);
    expect(visits).toHaveLength(2);
    external.release();
    await advance(clock, 0);
    expect(seen.suggested).toHaveLength(1);
    expect(seen.toasts).toHaveLength(1);
    seen.callsRead = undefined;
    await complete($, "same");
    await advance(clock, 0);
    expect(seen.suggested).toHaveLength(1);
  },
);

for (const isCompleted of [false, true]) {
  test(
    `a delayed old draw cannot suggest after a newer turn ${isCompleted ? "completed with a gate" : "started"}`,
    { options: OPTIONS },
    async ($, on) => {
      const clock = mock.clock(on);
      const seen = world(on);
      seen.calls = [];
      await $.session.start(START);
      await measure($, 400_000);
      await complete($, "old");
      const external = latch();
      const visits: number[] = [];
      seen.callsRead = async () => {
        visits.push(1);
        await external.wait;
      };
      await advance(clock, 0);
      expect(visits).toHaveLength(1);
      seen.callsRead = undefined;
      await $.turn.start({ text: "new work", turnId: "new" });
      if (isCompleted) {
        await complete(
          $,
          "new",
          "Хвосты для агента: finish it\nХвосты для владельца: нет",
        );
        await advance(clock, 0);
      }
      external.release();
      await advance(clock, 0);
      expect(seen.suggested).toEqual([]);
      if (isCompleted) {
        expect(seen.statuses.at(-1)).toContain("хвосты — finish it");
      }
      await complete($, "new");
      await advance(clock, 0);
      expect(seen.suggested).toHaveLength(1);
      await complete($, "new");
      await advance(clock, 0);
      expect(seen.suggested).toHaveLength(1);
    },
  );
}

test(
  "crossings re-arm below the threshold; timers and same-turn completions keep a dismissed suggestion away",
  { options: { ...OPTIONS, alertPercent: 0 } },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.calls = [];
    await $.session.start(START);
    await measure($, 400_000);
    await complete($, "one");
    await advance(clock, 0);
    expect(seen.toasts).toHaveLength(1);
    expect(seen.suggested).toHaveLength(1);
    await measure($, 100_000);
    await measure($, 400_000);
    expect(seen.toasts).toHaveLength(2);
    expect(seen.suggested).toHaveLength(1);
    await complete($, "one");
    await advance(clock, 30_000);
    expect(seen.suggested).toHaveLength(1);
    await complete($, "two");
    await advance(clock, 0);
    expect(seen.suggested).toHaveLength(2);
  },
);

test(
  "a known gate holds an unknown-background size offer, then the eligible turn can offer",
  { options: OPTIONS },
  async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.agents = [
      { id: "a1", description: "work", type: "Explore", status: "running" },
    ];
    await $.session.start(START);
    await measure($, 610_000);
    await complete($, "one");
    await advance(clock, 0);
    expect(seen.suggested).toEqual([]);
    expect(seen.statuses.at(-1)).toContain("работает 1 агент");
    seen.agents = [];
    await complete($, "one");
    await advance(clock, 0);
    expect(seen.suggested).toHaveLength(1);
    expect(seen.statuses.at(-1)).toContain("фоновые задачи неизвестны");
    expect(seen.toasts).toHaveLength(1);
  },
);
