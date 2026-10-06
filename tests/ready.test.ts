import type { ToolCallArgs } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import type { WatchedCall } from "../types";
import { advance } from "./fixtures/advance.ts";
import { DONE, measure, MESSAGES, START, turn } from "./fixtures/session.ts";
import { type Repository, world } from "./fixtures/world.ts";

const POLL = "until gh pr view 9 | grep -q MERGED; do sleep 10; done";
const waiter = (label: string): WatchedCall => ({
  status: "running",
  command: POLL,
  label,
});

test("seven waiters do not stand in the way, and the compaction carries their purpose", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = Array.from({ length: 7 }, (_, n) =>
    waiter(`PR ${String(n)} merged`),
  );
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).not.toContain("рано");
  expect(seen.statuses.at(-1)).toContain("идут ожидания: 7 (не мешают)");
  await $.session.compact({ trigger: "manual", messages: MESSAGES });
  expect(seen.compactions.at(-1)).toContain("PR 0 merged; PR 1 merged");
});

test("real work in the background still gates, a hung one says to stop it", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [
    { status: "running", command: "npm run build", label: "build" },
  ];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "рано: идёт фоновая задача · контекст 400k (40%)",
  );
  seen.calls = [{ status: "hung", command: "npm run build", label: "build" }];
  await advance(clock, 31_000);
  expect(seen.statuses.at(-1)).toBe(
    "рано: зависло фоновых задач: 1, их надо прервать · контекст 400k (40%)",
  );
});

test("a runner that ended with its verdict unread gates", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [
    { status: "done", command: "pi -p x", runner: "pi", needsTail: true },
  ];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "рано: результат раннера не прочитан (1) · контекст 400k (40%)",
  );
});

// Git is asked at each turn start: a new turn is how a change between turns shows.
const begin = async ($: Parameters<typeof turn>[0]): Promise<void> => {
  await $.turn.start({ text: "go", turnId: "t2" });
};

const edit = async (
  $: Parameters<typeof turn>[0],
  file: string,
): Promise<void> => {
  await $.tool.call({ tool: "Edit", file_path: file } as ToolCallArgs);
};

test("an edit in a repository gates until git says it is recorded", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.repos["/w"] = { status: [" M a.ts"], ahead: 0 };
  await $.session.start(START);
  await measure($, 400_000);
  await edit($, "/w/a.ts");
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "рано: правки не записаны: файлов 1 · контекст 400k (40%)",
  );
  seen.repos["/w"] = { status: [], ahead: 2 };
  await begin($);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "рано: коммиты не отправлены: 2 · контекст 400k (40%)",
  );
  seen.repos["/w"] = { status: [], ahead: 0 };
  await begin($);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("всё зафиксировано");
  expect(seen.statuses.at(-1)).not.toContain("рано");
});

test("an untracked file counts only when the session wrote it", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.repos["/w"] = { status: ["?? node_modules", "?? new.ts"], ahead: 0 };
  await $.session.start(START);
  await measure($, 400_000);
  await begin($);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("всё зафиксировано");
  await edit($, "/w/new.ts");
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toBe(
    "рано: правки не записаны: файлов 1 · контекст 400k (40%)",
  );
});

test("git saying nothing never claims that all is recorded", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).not.toContain("всё зафиксировано");
});

const AHEAD = "рано: коммиты не отправлены: 2 · контекст 400k (40%)";

const branches: readonly (readonly [
  string,
  NonNullable<Repository["branch"]>,
  boolean,
])[] = [
  [
    "upstream gone, content in origin",
    { upstream: "gone", trunkDiff: "" },
    true,
  ],
  [
    "upstream gone, not merged",
    { upstream: "gone", trunkDiff: "a.ts\n" },
    false,
  ],
  ["no upstream ever", { upstream: "none", trunkDiff: "" }, false],
];

for (const [name, branch, isRecorded] of branches) {
  test(`a branch: ${name}`, async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.calls = [];
    seen.repos["/w"] = { status: [], ahead: 2, branch };
    await $.session.start(START);
    await measure($, 400_000);
    await begin($);
    await turn($, DONE);
    await advance(clock, 0);
    const last = seen.statuses.at(-1) ?? "";
    expect(last.includes("всё зафиксировано")).toBe(isRecorded);
    expect(last === AHEAD).toBe(!isRecorded);
  });
}
