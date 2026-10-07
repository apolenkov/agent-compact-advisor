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
  readonly recorded: Recorded;
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
  // Git silent over the session's own writes reads as unrecorded, never
  // as recorded: what nothing holds back counts file by file.
  const unrecorded =
    recorded.value ??
    (recorded.touched.length > 0
      ? { files: recorded.touched.length, commits: 0 }
      : undefined);
  const signals: Signals = {
    facts: read.facts,
    runningAgents: read.runningAgents,
    liveCalls: calls?.work,
    ...(calls !== undefined && {
      staleCalls: calls.stale,
      unreadRunners: calls.unread,
    }),
    ...(unrecorded !== undefined && { unrecorded }),
    now: read.now,
  };
  return {
    verdict: scoreOf(signals, config),
    facts: read.facts,
    isCacheWarm: isCacheWarm(signals, config),
    isBackgroundKnown: calls !== undefined,
    isRecordKnown: recorded.value !== undefined,
    watchers: calls?.waiters.length ?? 0,
    config,
  };
};
