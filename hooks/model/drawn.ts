/**
 * What the status line is drawn from, put together from what the hooks read.
 */
import type { AdvisorFacts, Recorded } from "../../types";
import type { Calls } from "./calls.ts";
import type { Config } from "./config.ts";
import type { Drawn } from "./format.ts";
import { isCacheWarm, scoreOf, type Signals } from "./score.ts";

/** Everything one redraw reads from the engine. */
export interface Read {
  readonly facts: AdvisorFacts;
  /** agent-shell-watch's calls in classes, undefined when it is not installed. */
  readonly calls: Calls | undefined;
  readonly recorded: Recorded["value"];
  readonly runningAgents: number;
  readonly now: number;
}

/**
 * The verdict and everything the words need, from one read.
 * @param read what the hooks read
 * @param config the settings
 * @returns the drawn state
 */
export const drawnFrom = (read: Read, config: Config): Drawn => {
  const { calls, recorded } = read;
  const signals: Signals = {
    facts: read.facts,
    runningAgents: read.runningAgents,
    liveCalls: calls?.work,
    ...(calls !== undefined && {
      staleCalls: calls.stale,
      unreadRunners: calls.unread,
    }),
    ...(recorded !== undefined && { unrecorded: recorded }),
    now: read.now,
  };
  return {
    verdict: scoreOf(signals, config),
    facts: read.facts,
    isCacheWarm: isCacheWarm(signals, config),
    isBackgroundKnown: calls !== undefined,
    isRecordKnown: recorded !== undefined,
    watchers: calls?.waiters.length ?? 0,
    config,
  };
};
