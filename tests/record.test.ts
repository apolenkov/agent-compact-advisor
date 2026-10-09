import type { SessionMessage } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import { advance } from "./fixtures/advance.ts";
import { DONE, measure, START, turn } from "./fixtures/session.ts";
import { world } from "./fixtures/world.ts";

const WROTE = {
  role: "assistant" as const,
  text: "",
  toolUses: [
    {
      tool_use_id: "t1",
      tool: "Write",
      input: { file_path: "/w/src/x.ts" },
      result: { kind: "ok" },
      text: "ok",
    },
    {
      tool_use_id: "t2",
      tool: "Edit",
      input: { file_path: "/w/src/y.ts" },
      isError: true as const,
      text: "oldString not found",
    },
    {
      tool_use_id: "t3",
      tool: "Agent",
      input: {},
      agentId: "a1",
      result: {},
      text: "done",
    },
  ],
};

// After a resume the in-memory list of written paths is gone; the transcript
// is what restores it. Without it an untracked file the session itself wrote
// would not count, and the gate would stay silent over unrecorded work.
test("the paths the session wrote before a resume still gate", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.messages = [WROTE];
  seen.agentMessages = {
    a1: [
      {
        role: "assistant",
        text: "",
        toolUses: [
          {
            tool_use_id: "t4",
            tool: "Write",
            input: { file_path: "/w/lib/z.ts" },
            text: "ok",
          },
        ],
      },
    ],
  };
  seen.repos["/w"] = {
    status: ["?? src/x.ts", "?? src/y.ts", "?? lib/z.ts"],
    ahead: 0,
  };
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  // x.ts and the subagent's z.ts count; the failed Edit of y.ts does not.
  expect(seen.statuses.at(-1)).toContain("правки не записаны: файлов 2");
  expect(seen.suggested).toHaveLength(0);
});

test("git silent over the session's own writes still holds", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.messages = [WROTE];
  // No seen.repos entries: git answers nothing anywhere.
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  // The Write of x.ts counts; the failed Edit does not; git's silence
  // never reads as recorded.
  expect(seen.statuses.at(-1)).toContain("правки не записаны: файлов 1");
  expect(seen.suggested).toHaveLength(0);
});

test("a denied agent transcript leaves main-session writes restored", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.messages = [WROTE];
  seen.agentMessages = { a1: { deny: "transcript is not readable" } };
  seen.repos["/w"] = { status: ["?? src/x.ts"], ahead: 0 };
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  // The denied subagent's writes are out of reach; the main row's still count.
  expect(seen.statuses.at(-1)).toContain("правки не записаны: файлов 1");
});

const writes = (paths: readonly string[]): SessionMessage[] => [
  {
    role: "assistant" as const,
    text: "",
    toolUses: paths.map((file_path, index) => ({
      tool_use_id: `w${String(index)}`,
      tool: "Write",
      input: { file_path },
      text: "ok",
    })),
  },
];

test("raw NUL names and an owned untracked directory survive a resume", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  const names = [
    "юникод.ts",
    "tab\t.ts",
    String.raw`back\slash.ts`,
    "literal -> arrow.ts",
    " space .ts ",
    'quote".ts',
    "line\n.ts",
  ];
  seen.messages = writes([...names.map((name) => `/w/${name}`), "/w/lib/z.ts"]);
  seen.repos["/w"] = {
    status: [],
    ahead: 0,
    statusRaw: `${[
      ...names.map((name) => `?? ${name}`),
      "?? lib/",
      "?? foreign.ts",
      "?? foreign-dir/",
    ].join("\0")}\0`,
  };
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("правки не записаны: файлов 8");
  expect(seen.suggested).toHaveLength(0);
});

test("rename and copy source fields do not swallow following untracked records", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.messages = writes(["/w/owned.ts"]);
  seen.repos["/w"] = {
    status: [],
    ahead: 0,
    statusRaw:
      "R  new -> name.ts\0 M source.ts\0C  copy.ts\0 M copy source.ts\0?? owned.ts\0?? foreign.ts\0",
  };
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("правки не записаны: файлов 3");
});

for (const failure of ["exit", "timeout"] as const) {
  test(`another discovered root's status ${failure} cannot become clean`, async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.calls = [];
    seen.messages = writes(["/other/x.ts"]);
    seen.repos["/w"] = { status: [], ahead: 0 };
    seen.repos["/other"] = { status: [], ahead: 0 };
    await $.session.start(START);
    seen.repos["/other"].statusFailure = failure;
    await $.turn.start({ text: "go", turnId: "t2" });
    await measure($, 400_000);
    await turn($, DONE);
    await advance(clock, 0);
    expect(seen.statuses.at(-1)).toContain("коммиты не отправлены");
    expect(seen.suggested).toHaveLength(0);
  });
}

for (const failure of ["missing", "limit"]) {
  test(`a relevant root outside the probe set stays unknown: ${failure}`, async ($, on) => {
    const clock = mock.clock(on);
    const seen = world(on);
    seen.calls = [];
    const roots =
      failure === "missing" ? ["/other"] : ["/a", "/b", "/c", "/d", "/e", "/f"];
    seen.messages = writes(roots.map((root) => `${root}/x.ts`));
    seen.repos["/w"] = { status: [], ahead: 0 };
    if (failure === "limit") {
      for (const root of roots) {
        seen.repos[root] = { status: [], ahead: 0 };
      }
    }
    await $.session.start(START);
    await measure($, 400_000);
    await turn($, DONE);
    await advance(clock, 0);
    expect(seen.statuses.at(-1)).toContain("коммиты не отправлены");
    expect(seen.suggested).toHaveLength(0);
    if (failure === "limit") {
      expect(seen.runs.filter((run) => run.argv[1] === "status")).toHaveLength(
        6,
      );
    }
  });
}

test("an untouched non-Git cwd and foreign arrow name leave recorded writes unheld", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.messages = writes(["/other/owned.ts"]);
  seen.repos["/other"] = { status: ["?? foreign -> owned.ts"], ahead: 0 };
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("хороший момент");
});

test("rev-list silent keeps the commits unknown, never pushed", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  // status answers, rev-list fails: git cannot say what is unpushed.
  seen.repos["/w"] = { status: [] };
  await $.session.start(START);
  await $.turn.start({ text: "go", turnId: "t2" });
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("коммиты не отправлены");
});

test("one rev-parse per directory, however many files it holds", async ($, on) => {
  const seen = world(on);
  seen.calls = [];
  seen.messages = writes(["/w/src/x.ts", "/w/src/y.ts"]);
  seen.repos["/w"] = { status: ["?? src/x.ts", "?? src/y.ts"], ahead: 0 };
  await $.session.start(START);
  const revParses = seen.runs.filter(
    (run) => run.argv[0] === "git" && run.argv[1] === "rev-parse",
  );
  // /w (the session root) and /w/src: two directories, two asks — not three.
  expect(
    revParses
      .map((run) => run.cwd)
      .toSorted((left, right) => left.localeCompare(right)),
  ).toEqual(["/w", "/w/src"]);
});

test("an empty transcript and clean git leave a start unheld", async ($, on) => {
  const clock = mock.clock(on);
  const seen = world(on);
  seen.calls = [];
  seen.repos["/w"] = { status: [], ahead: 0 };
  await $.session.start(START);
  await measure($, 400_000);
  await turn($, DONE);
  await advance(clock, 0);
  expect(seen.statuses.at(-1)).toContain("хороший момент");
});
