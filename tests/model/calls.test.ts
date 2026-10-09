import { expect, test } from "claude-code/testing";

import { callsOf, classOf, isWaiter } from "../../hooks/model/calls.ts";
import type { WatchedCall } from "../../types";

const call = (
  command: string,
  over: Partial<WatchedCall> = {},
): WatchedCall => ({
  status: "running",
  command,
  label: "wait",
  ...over,
});

test("a poll of an external event is a waiter, by the body of its loop", () => {
  expect(
    isWaiter(
      'for i in $(seq 1 360); do s=$(gh pr view 51 --json state --jq .state); [ "$s" != OPEN ] && break; sleep 20; done; echo $s',
    ),
  ).toBe(true);
  expect(
    isWaiter(
      "until gh pr checks 3 --json state | grep -q SUCCESS; do sleep 15; done",
    ),
  ).toBe(true);
  expect(isWaiter("gh run watch 123")).toBe(true);
});

test("a loop whose body does work is not a waiter", () => {
  expect(
    isWaiter("while read f; do codex exec review $f; done < files.txt"),
  ).toBe(false);
  expect(isWaiter("for i in 1 2 3; do npm test; sleep 5; done")).toBe(false);
  expect(
    isWaiter("until gh api -X POST repos/x/y/dispatches; do sleep 5; done"),
  ).toBe(false);
  expect(isWaiter("sleep 600 && rm -rf build")).toBe(false);
});

test("curl health polls wait; uploads and output files are work", () => {
  const cases = [
    ["-f", true],
    ["-fsS", true],
    ["-sf", true],
    ["--json @payload.json", false],
    ["-sT artifact.tar", false],
    ["--upload-file artifact.tar", false],
    ["-s -X POST", false],
    ["-O", false],
    ["-sO", false],
    ["--remote-name", false],
    ["--remote-name-all", false],
    ["--output file", false],
    ["--output=file", false],
  ] as const;
  for (const [flags, waits] of cases) {
    const command = `until curl ${flags} localhost:8010/health; do sleep 5; done`;
    expect(isWaiter(command)).toBe(waits);
    expect(classOf(call(command))).toBe(waits ? "waiter" : "work");
  }
  // gh keeps its own flags: -f field means a write for gh api.
  expect(
    isWaiter("until gh api -f title=x repos/o/r/issues; do sleep 5; done"),
  ).toBe(false);
  expect(
    isWaiter(
      "until gh api --input payload.json repos/o/r/issues; do sleep 5; done",
    ),
  ).toBe(false);
});

test("pipelines and OR controls keep polling read-only only", () => {
  expect(
    isWaiter("until curl -f localhost/health | grep -q OK; do sleep 5; done"),
  ).toBe(true);
  expect(
    isWaiter("until curl -f localhost/health || true; do sleep 5; done"),
  ).toBe(true);
  expect(
    isWaiter(
      "until curl -f localhost/health || npm run build; do sleep 5; done",
    ),
  ).toBe(false);
});

test("a command that does not loop, sleep or watch is not a waiter", () => {
  expect(isWaiter("gh pr view 51")).toBe(false);
  expect(isWaiter("")).toBe(false);
});

test("classes: waiter, work, stale, unread, settled", () => {
  const poll = "until gh pr view 9 | grep -q MERGED; do sleep 10; done";
  expect(classOf(call(poll))).toBe("waiter");
  expect(classOf(call(poll, { status: "hung" }))).toBe("waiter");
  expect(classOf(call("npm run build"))).toBe("work");
  expect(classOf(call("npm run build", { status: "quiet" }))).toBe("work");
  expect(classOf(call("npm run build", { status: "hung" }))).toBe("stale");
  expect(classOf(call("codex exec review", { runner: "codex" }))).toBe("work");
  expect(classOf(call(poll, { runner: "codex" }))).toBe("work");
  expect(classOf(call("x", { status: "done" }))).toBeUndefined();
  expect(classOf(call("x", { status: "stopped" }))).toBeUndefined();
  expect(
    classOf(call("pi -p x", { status: "done", runner: "pi", needsTail: true })),
  ).toBe("unread");
});

test("a call that says nothing of itself is work", () => {
  expect(classOf({ status: "running" })).toBe("work");
});

test("seven waiters and one build: the count is the build, the purposes the waiters", () => {
  const poll = "until gh pr view 9 | grep -q MERGED; do sleep 10; done";
  const calls = [
    ...Array.from({ length: 7 }, (_, n) =>
      call(poll, { label: `PR ${String(n)} merged` }),
    ),
    call("npm run build"),
    call("npm test", { status: "done" }),
  ];
  const sorted = callsOf(calls);
  expect(sorted).toMatchObject({ work: 1, stale: 0, unread: 0 });
  expect(sorted.waiters).toHaveLength(7);
  expect(sorted.waiters[0]).toBe("PR 0 merged");
});
