import type { SessionMessage } from "claude-code";
import type { Engine } from "claude-code/testing";
import { expect, mock, test } from "claude-code/testing";

import { TEMPLATE } from "../hooks/model/template.ts";
import { advance } from "./fixtures/advance.ts";
import { world } from "./fixtures/world.ts";

const START = { cwd: "/w", surface: "terminal", isInteractive: true } as const;
const MESSAGES: SessionMessage[] = [
  { role: "user", text: "build it", toolUses: [] },
];
const RUN = {
  command: "compact-advisor",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const;
const DONE = "Shipped.\nХвосты для агента: нет\nХвосты для владельца: нет";

const measure = async ($: Engine, tokens: number): Promise<void> => {
  await $.session.measure({
    context: {
      tokens,
      window: 1_000_000,
      percent: Math.round(tokens / 10_000),
    },
    rateLimits: [],
    changed: ["context"],
  });
};

const turn = async ($: Engine, answer: string): Promise<void> => {
  await $.turn.complete({
    answer,
    durationMs: 1000,
    isAborted: false,
    turnId: "t1",
    reason: "answer",
  });
};

test("a big, finished session scores high, suggests /compact once-toasted", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 });
  const seen = world(on);
  seen.calls = [{ status: "done" }];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "score 98 · 400k 40% · leftovers none · P1 .90 · cache warm",
  );
  expect(seen.suggested.at(-1)).toMatch(/^\/compact Keep the goal/u);
  expect(seen.toasts).toHaveLength(1);
  expect(JSON.parse(seen.posts[0] ?? "{}")).toMatchObject({
    model: "kev-latest",
    state: DONE,
  });
  await measure($, 410_000);
  expect(seen.toasts).toHaveLength(1);
});

test("running agents gate the score to 0 and nothing is suggested", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.agents = [
    { id: "a1", description: "review", type: "Explore", status: "running" },
  ];
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "score 0 · too early: 1 agent running · 400k 40%",
  );
  expect(seen.suggested).toEqual([]);
});

test("without agent-shell-watch and with Kev down the score stays capped", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.kev = undefined;
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "score 60 · 400k 40% · leftovers none · P1 n/a · cache warm · bg ?",
  );
  expect(seen.suggested).toEqual([]);
});

test("listed leftovers are a gate and Kev is not asked", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, "Хвосты для агента: нет\nХвосты для владельца: push");
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe("score 0 · leftovers: push · 400k 40%");
  expect(seen.posts).toEqual([]);
});

test("the cache going cold redraws without its part", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  await advance(clock, 301_000);
  expect(seen.statuses.at(-1)).toBe(
    "score 88 · 400k 40% · leftovers none · P1 .90 · cache cold",
  );
});

test("every main compaction gets the template; others pass untouched", async ($, on) => {
  mock.clock(on);
  const seen = world(on);
  await $.session.start(START);
  await $.session.compact({ messages: MESSAGES, trigger: "manual" });
  await $.session.compact({
    messages: MESSAGES,
    trigger: "manual",
    instructions: "keep API notes",
  });
  await $.session.compact({ messages: MESSAGES, trigger: "auto" });
  await $.session.compact({ messages: MESSAGES, trigger: "precompute" });
  expect(seen.compactions).toEqual([
    TEMPLATE,
    `keep API notes\n\n${TEMPLATE}`,
    TEMPLATE,
    undefined,
  ]);
});

test("a compaction resets the size so a stale score does not stay", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  await $.session.compact({ messages: MESSAGES, trigger: "manual" });
  const answer = await $.command.run(RUN);
  expect(answer.text).toContain("score 0 · small context 20k");
  expect(seen.compactions).toHaveLength(1);
});

test("/compact-advisor explains the score", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  const answer = await $.command.run(RUN);
  expect(answer.text).toContain("- P1: 0.90 × 20");
  expect(answer.text).toContain("preservation template");
});

test(
  "a guard switched off leaves compactions as typed",
  { options: { guardCompactions: false } },
  async ($, on) => {
    mock.clock(on);
    const seen = world(on);
    await $.session.start(START);
    await $.session.compact({ messages: MESSAGES, trigger: "manual" });
    expect(seen.compactions).toEqual([undefined]);
  },
);

test("a Kev that never answers times out to P1 n/a", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.kev = "hang";
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("P1 …");
  await advance(clock, 20_000);
  expect(seen.statuses.at(-1)).toBe(
    "score 100 · 400k 40% · leftovers none · P1 n/a · cache warm",
  );
});

test("a reload turns a P1 left pending into n/a", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.kev = "hang";
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  await $.session.start(START);
  expect(seen.statuses.at(-1)).toContain("P1 n/a");
});
