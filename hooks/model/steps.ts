/**
 * The steps the advisor's facts take, pure: the hooks only run them.
 */
import type { SessionCompactInput, TurnCompleteInput } from "claude-code";

import type { AdvisorFacts, Checked, P1, Recorded } from "../../types";
import type { Calls } from "./calls.ts";
import type { Config } from "./config.ts";
import { leftoversOf, ownerAskOf } from "./leftovers.ts";
import type { Offer } from "./offer.ts";

/**
 * A reload drops the timers: what was pending can never settle.
 * @param facts the facts held
 * @returns the facts with a pending P1 and a pending check given up
 */
export const restarted = (facts: AdvisorFacts): AdvisorFacts => ({
  ...facts,
  ...(facts.p1.kind === "pending" && { p1: { kind: "na" } }),
  ...(facts.promise?.state === "pending" && {
    promise: { turnId: facts.promise.turnId, state: "na" },
  }),
});

/**
 * The crossings a redraw has seen, remembered.
 * @param facts the facts held
 * @param offer what the redraw offered
 * @returns the facts
 */
export const offered = (
  facts: AdvisorFacts,
  offer: Pick<Offer, "isAbove" | "isAlerted">,
): AdvisorFacts => ({
  ...facts,
  wasAbove: offer.isAbove,
  wasAlerted: offer.isAlerted,
});

/**
 * A turn's end: its leftover lines, the owner's line, whether Kev is asked.
 * @param config the settings
 * @param e the turn's end
 * @param now the time
 * @returns the step from the facts held to the facts of the new turn
 */
export const turned =
  (
    config: Config,
    e: Readonly<TurnCompleteInput>,
    now: number,
  ): ((facts: AdvisorFacts) => AdvisorFacts) =>
  (facts) => {
    const leftovers = leftoversOf(e.answer, config.leftovers);
    const isKevAsked =
      config.kevUrl !== undefined &&
      e.reason === "answer" &&
      (config.ignoreLeftovers || leftovers.kind !== "listed");
    return {
      ...facts,
      leftovers,
      ownerAsk: ownerAskOf(e.answer, config.leftovers),
      p1: { kind: isKevAsked ? "pending" : "na" },
      turnId: e.turnId,
      lastTurnAt: now,
    };
  };

/**
 * Kev's answer for a turn; another turn's answer changes nothing.
 * @param facts the facts held
 * @param id the turn Kev was asked for
 * @param value P1, undefined for none
 * @returns the facts
 */
export const p1Settled = (
  facts: AdvisorFacts,
  id: string,
  value: number | undefined,
): AdvisorFacts => {
  const p1: P1 =
    value === undefined ? { kind: "na" } : { kind: "value", value };
  return facts.turnId === id ? { ...facts, p1 } : facts;
};

/**
 * The model's check starts, or ends with its label; only a pending check of
 * that turn takes a label.
 * @param facts the facts held
 * @param id the turn
 * @param state pending to start, else the label
 * @returns the facts
 */
export const checked = (
  facts: AdvisorFacts,
  id: string,
  state: Checked["state"],
): AdvisorFacts =>
  state === "pending" ||
  (facts.promise?.turnId === id && facts.promise.state === "pending")
    ? { ...facts, promise: { turnId: id, state } }
    : facts;

/**
 * Whether a compaction is the main conversation's own, to carry the template.
 * @param config the settings
 * @param e the compaction
 * @returns true for a manual or auto compaction of the main thread
 */
export const isGuarded = (
  config: Config,
  e: Readonly<SessionCompactInput>,
): boolean =>
  config.guardCompactions &&
  e.agentId === undefined &&
  (e.trigger === "manual" || e.trigger === "auto");

/**
 * What the compaction template carries.
 * @param facts the facts held
 * @param calls the watched calls, undefined when unknown
 * @param recorded what the session wrote
 * @returns the owner's line, the waiters and the written paths
 */
export const carryOf = (
  facts: AdvisorFacts,
  calls: Calls | undefined,
  recorded: Recorded,
): Readonly<{
  ownerAsk: string | undefined;
  waiters: Calls["waiters"];
  touched: readonly string[];
}> => ({
  ownerAsk: facts.ownerAsk,
  waiters: calls?.waiters ?? [],
  touched: recorded.touched,
});
