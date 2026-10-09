/**
 * The steps the advisor's facts take, pure: the hooks only run them.
 */
import type {
  SessionCompactInput,
  SessionCompactTrigger,
  TurnCompleteInput,
} from "claude-code";

import type { AdvisorFacts, Checked, P1, Recorded } from "../../types";
import type { Calls } from "./calls.ts";
import type { Config } from "./config.ts";
import type { Drawn } from "./format.ts";
import { leftoversOf, ownerAskOf } from "./leftovers.ts";
import type { Offer } from "./offer.ts";
import { isAsked, isCheckable } from "./promise.ts";

/**
 * A reload drops the timers: a pending priority verdict can never settle
 * from the dead request, so it stays pending and holds until the next turn
 * asks Kev again. A pending model check is per-answer noise: it still
 * lapses, its late label sorts itself by turn.
 * @param facts the facts held
 * @returns the facts with a pending P1 kept and a pending check given up
 */
export const restarted = (facts: AdvisorFacts): AdvisorFacts => ({
  ...facts,
  ...(facts.promise?.state === "pending" && {
    promise: { turnId: facts.promise.turnId, state: "na" },
  }),
});

/**
 * Independent crossing and completed-turn effects, claimed by the SDK CAS.
 * @param facts the current facts held, refreshed after each CAS miss
 * @param offer the offer recomputed from current facts and the external reads
 * @param claim the nonce and the source turn carried by this draw
 * @returns the facts with admitted effects' serializable receipts
 */
export const offered = (
  facts: AdvisorFacts,
  offer: Offer,
  claim: Readonly<{ nonce: string; turnId: string | undefined }>,
): AdvisorFacts => {
  const isSuggested =
    offer.isSuggested &&
    facts.isTurnComplete !== false &&
    claim.turnId !== undefined &&
    facts.suggestedTurnId !== claim.turnId;
  return claim.turnId === facts.turnId
    ? {
        ...facts,
        wasAbove: offer.isAbove,
        wasAlerted: offer.isAlerted,
        ...(offer.toast !== "" && {
          crossing: { nonce: claim.nonce, toast: offer.toast },
        }),
        ...(isSuggested && {
          suggestedTurnId: claim.turnId,
          suggestionClaimer: claim.nonce,
        }),
      }
    : facts;
};

/**
 * A main turn starts: any delayed effect still belongs to its older source.
 * @param facts the held facts
 * @param turnId the engine's new turn identity
 * @returns the facts holding proposals until that turn completes
 */
export const begun = (facts: AdvisorFacts, turnId: string): AdvisorFacts => ({
  ...facts,
  turnId,
  isTurnComplete: false,
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
      isTurnComplete: true,
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
 * Tiny turns skip the paid check; only a checkable, ready answer is asked.
 * @param drawn the current facts, verdict and settings
 * @param e the main turn's completed answer
 * @returns whether this answer should be checked
 */
export const isReadyToCheck = (
  drawn: Drawn,
  e: Readonly<TurnCompleteInput>,
): boolean =>
  (drawn.facts.tokens ?? drawn.config.minTokens) >= drawn.config.minTokens &&
  isCheckable(drawn.config, e.reason, e.answer) &&
  isAsked(drawn.verdict.gate);

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
  (state === "pending" && facts.turnId === id) ||
  (facts.promise?.turnId === id && facts.promise.state === "pending")
    ? { ...facts, promise: { turnId: id, state } }
    : facts;

// The triggers that guard the main thread; precompute is not the user's ask.
const GUARDED_TRIGGERS: ReadonlySet<SessionCompactTrigger> = new Set([
  "manual",
  "auto",
  "plugin",
]);

/**
 * Whether a compaction is the main conversation's own, to carry the template.
 * @param config the settings
 * @param e the compaction
 * @returns true for a manual, auto or plugin compaction of the main thread
 */
export const isGuarded = (
  config: Config,
  e: Readonly<SessionCompactInput>,
): boolean =>
  config.guardCompactions &&
  e.agentId === undefined &&
  GUARDED_TRIGGERS.has(e.trigger);

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
