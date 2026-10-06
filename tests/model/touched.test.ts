import { expect, test } from "claude-code/testing";

import {
  pathsOf,
  TOUCHED_MAX,
  withTouched,
} from "../../hooks/model/touched.ts";

test("an editing tool names its file", () => {
  expect(pathsOf("Edit", { file_path: "/w/a.ts" }, undefined)).toEqual([
    "/w/a.ts",
  ]);
  expect(pathsOf("Write", { file_path: "/w/b.ts" }, {})).toEqual(["/w/b.ts"]);
  expect(pathsOf("NotebookEdit", { notebook_path: "/w/n.ipynb" }, {})).toEqual([
    "/w/n.ipynb",
  ]);
});

test("a read or a relative path writes nothing", () => {
  expect(pathsOf("Read", { file_path: "/w/a.ts" }, {})).toEqual([]);
  expect(pathsOf("Edit", { file_path: "a.ts" }, {})).toEqual([]);
  expect(pathsOf("Edit", undefined, undefined)).toEqual([]);
});

test("a Bash call writes the files the engine says it changed", () => {
  const outcome = {
    result: { bashEditDiff: { changedFiles: ["/w/x.ts", "/w/y.ts", 3] } },
  };
  expect(pathsOf("Bash", { command: "sed -i" }, outcome)).toEqual([
    "/w/x.ts",
    "/w/y.ts",
  ]);
  expect(pathsOf("Bash", { command: "ls" }, { result: {} })).toEqual([]);
});

test("each path once, the newest last, the oldest dropped past the limit", () => {
  expect(withTouched(["/a", "/b"], ["/a", "/c"])).toEqual(["/b", "/a", "/c"]);
  const many = Array.from(
    { length: TOUCHED_MAX + 5 },
    (_, n) => `/p${String(n)}`,
  );
  const kept = withTouched([], many);
  expect(kept).toHaveLength(TOUCHED_MAX);
  expect(kept.at(-1)).toBe(`/p${String(TOUCHED_MAX + 4)}`);
});
