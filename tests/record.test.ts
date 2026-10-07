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

test("a denied agent transcript and a fresh start restore nothing", async ($, on) => {
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
