import { expect, test } from "claude-code/testing";

import { sumOf, unrecordedIn } from "../../hooks/model/unrecorded.ts";

test("aggregate keeps known files while any repository's commits are unknown", () => {
  const state = { status: [], ahead: undefined };
  expect(unrecordedIn("/w", state, []).commits).toBeUndefined();
  expect(
    sumOf([
      { files: 1, commits: 2 },
      { files: 0, commits: undefined },
    ]),
  ).toEqual({ files: 1, commits: undefined });
});
