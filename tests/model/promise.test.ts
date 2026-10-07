import { expect, test } from "claude-code/testing";

import { isAsked, labelOf, requestOf } from "../../hooks/model/promise.ts";

test("a label with punctuation or case is still the label, anything else is none", () => {
  expect(labelOf("owes")).toBe("owes");
  expect(labelOf(" `Owes`. ")).toBe("owes");
  expect(labelOf("clean!")).toBe("clean");
  expect(labelOf("owes: it will refactor")).toBe("owes");
  expect(labelOf("maybe, owes or clean")).toBeUndefined();
  expect(labelOf("")).toBeUndefined();
  expect(labelOf("Я не уверен")).toBeUndefined();
});

test("only gates that hold until the next turn skip the model", () => {
  expect(isAsked(undefined)).toBe(true);
  expect(isAsked({ kind: "agents", count: 1 })).toBe(true);
  expect(isAsked({ kind: "calls", count: 2 })).toBe(true);
  expect(isAsked({ kind: "edits", count: 1 })).toBe(false);
  expect(isAsked({ kind: "unpushed", count: 1 })).toBe(false);
  expect(isAsked({ kind: "leftovers", text: "x" })).toBe(false);
  // A debt outlives its turn, so the next answer re-asks and can clear it.
  expect(isAsked({ kind: "owes" })).toBe(true);
});

test("the request is cheap and bounded, the answer a clipped tail in markers", () => {
  const request = requestOf(`${"a".repeat(7000)}END`);
  expect(request).toMatchObject({
    model: "haiku",
    effort: "low",
    maxTokens: 8,
    timeoutMs: 15_000,
  });
  expect(request.prompt).toMatch(/^<<<ANSWER\n/u);
  expect(request.prompt).toMatch(/END\nANSWER>>>$/u);
  expect(request.prompt.length).toBeLessThan(6100);
});
