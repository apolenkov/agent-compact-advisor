import { expect, test } from "claude-code/testing";

import { configOf } from "../../hooks/model/config.ts";

test("no options give the defaults, Kev on loopback", () => {
  expect(configOf({})).toEqual({
    threshold: 70,
    minTokens: 100_000,
    fullTokens: 300_000,
    cacheTtlMs: 300_000,
    kevUrl: "http://127.0.0.1:8010",
    kevModel: "kev-latest",
    leftovers: {
      prefixes: ["Хвосты для агента:", "Хвосты для владельца:"],
      noneWords: ["нет", "none"],
    },
    guardCompactions: true,
    statusLine: true,
  });
});

test("options are read, bad numbers defaulted, lists split on |", () => {
  const config = configOf({
    threshold: 500,
    minTokens: -1,
    fullTokens: 50_000,
    cacheTtlMin: 60,
    systemOneUrl: "http://localhost:9000/",
    leftoverPrefixes: " Done: | ",
    noneWords: "NOTHING",
    guardCompactions: false,
    statusLine: false,
  });
  expect(config.threshold).toBe(100);
  expect(config.minTokens).toBe(100_000);
  expect(config.fullTokens).toBe(100_001);
  expect(config.cacheTtlMs).toBe(3_600_000);
  expect(config.kevUrl).toBe("http://localhost:9000");
  expect(config.leftovers).toEqual({
    prefixes: ["Done:"],
    noneWords: ["nothing"],
  });
  expect(config.guardCompactions).toBe(false);
  expect(config.statusLine).toBe(false);
});

test("P1 is off for an empty or a non-loopback URL", () => {
  expect(configOf({ systemOneUrl: "" }).kevUrl).toBeUndefined();
  expect(
    configOf({ systemOneUrl: "https://api.example.com" }).kevUrl,
  ).toBeUndefined();
  expect(
    configOf({ systemOneUrl: "https://127.0.0.1.evil.com" }).kevUrl,
  ).toBeUndefined();
});
