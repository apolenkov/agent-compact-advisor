/**
 * agent-compact-advisor: a status-line score for how good a moment it is to
 * `/compact`, a ready one-line `/compact` suggested past the threshold, and
 * the preservation template added to every compaction of the main
 * conversation. It never compacts and never cancels a compaction.
 */
import type {
  Register,
  SessionCompactInput,
  TurnCompleteInput,
} from "claude-code";
import { atom, read, update } from "claude-code";

import type { AdvisorFacts, Checked, Recorded } from "../types";
import { type Calls, heldCallsOf } from "./model/calls.ts";
import { type Config, configOf } from "./model/config.ts";
import { drawnFrom, type Read } from "./model/drawn.ts";
import { type Drawn, explanationOf, statusLineOf } from "./model/format.ts";
import { kevBodyOf, noulOf } from "./model/kev.ts";
import { offerOf } from "./model/offer.ts";
import { labelOf, requestOf } from "./model/promise.ts";
import {
  begun,
  carryOf,
  checked,
  isGuarded,
  isReadyToCheck,
  offered,
  p1Settled,
  restarted,
  turned,
} from "./model/steps.ts";
import { SUGGESTION, withTemplate } from "./model/template.ts";
import { orElse, quietly } from "./quietly.ts";
import { recordHooks } from "./record.ts";
import type { AdvisorOn, Engine } from "./registrar.ts";

const COMMAND = "compact-advisor";
const factsAtom = atom(
  { plugin: "agent-compact-advisor", key: "facts" } as const,
  {
    leftovers: { kind: "unknown" },
    p1: { kind: "na" },
    wasAbove: false,
    wasAlerted: false,
  } satisfies AdvisorFacts,
);
// What the session wrote and what git says of it: hooks/record.ts keeps it.
// The engine's scan lists state a file reads, so the atom is declared again —
// one key, one cell, two declaration sites the engine can see.
const recordedAtom = atom(
  { plugin: "agent-compact-advisor", key: "recorded" } as const,
  {
    at: Number.MIN_SAFE_INTEGER,
    value: undefined,
    touched: [],
  } satisfies Recorded,
);
const watchCalls = { plugin: "agent-shell-watch", key: "calls" } as const;
// Agents and background calls end between turns, and the cache goes cold:
// a slow redraw sees it; it outlives no reload, as session.start starts it.
const REDRAW_MS = 30_000;
// $.http.fetch has no timeout of its own; Kev's cold start takes seconds.
const KEV_TIMEOUT_MS = 20_000;

const timedOut = async ($: Engine): Promise<undefined> => {
  await $.clock.sleep(KEV_TIMEOUT_MS);
  return undefined;
};

// P1 for the answer, or undefined when Kev is off, down, slow or unclear.
const askKev = async (
  $: Engine,
  config: Config,
  answer: string,
): Promise<number | undefined> => {
  const { kevUrl } = config;
  if (kevUrl === undefined) {
    return undefined;
  }
  const fetched = async (): Promise<number | undefined> => {
    const response = await $.http.fetch(`${kevUrl}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: kevBodyOf(config.kevModel, answer),
    });
    return response.ok ? noulOf(JSON.parse(response.text)) : undefined;
  };
  return orElse(Promise.race([fetched(), timedOut($)]), undefined);
};

// The model's label for the answer: "na" for a failure, a timeout, a reply
// that is not exactly a label, or a model that cannot be reached.
const askModel = async (
  $: Engine,
  answer: string,
): Promise<Checked["state"]> => {
  const reply = await orElse($.model.complete(requestOf(answer)), undefined);
  return reply?.isAnswered === true ? (labelOf(reply.text) ?? "na") : "na";
};

const settleCheck = async (
  $: Engine,
  config: Config,
  turn: Readonly<{ id: string; answer: string }>,
): Promise<void> => {
  await quietly(draw($, config, turn.id));
  const state = await askModel($, turn.answer);
  await update($, factsAtom, (facts) => checked(facts, turn.id, state));
};

// agent-shell-watch writes its calls at every session start: a value never
// written means it is not installed, so background work is unknown.
const callsStateOf = async ($: Engine): Promise<Calls | undefined> =>
  orElse((async () => heldCallsOf(await $.state.get(watchCalls)))(), undefined);

const runningAgentsOf = async ($: Engine): Promise<number> => {
  const agents = await orElse($.agent.list(), []);
  return agents.filter((agent) => agent.status === "running").length;
};

const readOf = async ($: Engine): Promise<Read> => ({
  facts: await read($, factsAtom),
  calls: await callsStateOf($),
  recorded: await read($, recordedAtom),
  runningAgents: await runningAgentsOf($),
  now: await $.clock.now(),
});

const drawnOf = async ($: Engine, config: Config): Promise<Drawn> =>
  drawnFrom(await readOf($), config);

const draw = async (
  $: Engine,
  config: Config,
  sourceTurnId?: string,
): Promise<void> => {
  const snapshot = await readOf($);
  const nonce = crypto.randomUUID();
  // SDK update refreshes facts after each CAS miss. The source identity stays
  // with the event, and each independent effect returns its own claim receipt.
  const claimed = await update($, factsAtom, (facts) =>
    offered(
      facts,
      offerOf(
        drawnFrom({ ...snapshot, facts }, config),
        sourceTurnId !== undefined,
      ),
      { nonce, turnId: sourceTurnId ?? snapshot.facts.turnId },
    ),
  );
  const drawn = drawnFrom({ ...snapshot, facts: claimed }, config);
  $.ui.status(config.statusLine ? statusLineOf(drawn) : undefined);
  if (claimed.suggestionClaimer === nonce) {
    await $.prompt.suggest({ text: SUGGESTION });
  }
  if (claimed.crossing?.nonce === nonce) {
    $.ui.toast(claimed.crossing.toast);
  }
};

const settleP1 = async (
  $: Engine,
  config: Config,
  turn: Readonly<{ id: string; answer: string }>,
): Promise<void> => {
  await draw($, config, turn.id);
  const value = await askKev($, config, turn.answer);
  await update($, factsAtom, (facts) => p1Settled(facts, turn.id, value));
  await draw($, config, turn.id);
};

const onCompact = async (
  $: Engine,
  config: Config,
  e: Readonly<SessionCompactInput>,
): Promise<SessionCompactInput> => {
  const carry = carryOf(
    await read($, factsAtom),
    await callsStateOf($),
    await read($, recordedAtom),
  );
  return isGuarded(config, e)
    ? { ...e, instructions: withTemplate(e.instructions, carry) }
    : e;
};

// session.start fires again on a hot reload, which dropped the timers: the
// redraw starts again, and a P1 still pending would never settle.
const start = async ($: Engine, config: Config): Promise<void> => {
  await $.command.register({
    name: COMMAND,
    description: "Explain the current /compact score and its signals",
    immediate: true,
  });
  await update($, factsAtom, restarted);
  $.clock.every(REDRAW_MS, () => {
    void quietly(draw($, config));
  });
  await draw($, config);
};

// A new reading of the size, from the engine or from a compaction that stands
// (which resets it, so a stale score does not stay).
const noteSize = async (
  $: Engine,
  config: Config,
  size: Pick<AdvisorFacts, "percent" | "tokens" | "window">,
): Promise<void> => {
  await update($, factsAtom, (facts) => ({ ...facts, ...size }));
  await draw($, config);
};

// The model reads only an answer the rules already call ready: it can add a
// gate, never lift one. Pending holds the "can" until it answers.
const shouldCheck = async (
  $: Engine,
  config: Config,
  e: Readonly<TurnCompleteInput>,
): Promise<boolean> => {
  const drawn = await drawnOf($, config);
  const isReady = isReadyToCheck(drawn, e);
  if (isReady) {
    await update($, factsAtom, (facts) => checked(facts, e.turnId, "pending"));
  }
  return isReady;
};

const noteTurn = async (
  $: Engine,
  config: Config,
  e: Readonly<TurnCompleteInput>,
): Promise<void> => {
  const now = await $.clock.now();
  await update($, factsAtom, turned(config, e, now));
  const { p1 } = await read($, factsAtom);
  // A failure of the optional check leaves the rules' verdict, never the turn.
  const isChecked = await orElse(shouldCheck($, config, e), false);
  // The render and the settling run out of the turn's dispatch: the answer
  // shows at once, and the box is free by the time a suggestion comes.
  $.clock.after(0, () => {
    void quietly(
      (async (): Promise<void> => {
        if (isChecked) {
          await quietly(
            settleCheck($, config, { id: e.turnId, answer: e.answer }),
          );
        }
        await (p1.kind === "pending"
          ? settleP1($, config, { id: e.turnId, answer: e.answer })
          : draw($, config, e.turnId));
      })(),
    );
  });
};

/**
 * Wires agent-compact-advisor's hooks.
 * @param on the registrar
 * @param options the `userConfig` values
 */
export const register: Register = (on: AdvisorOn, options) => {
  const config = configOf(options);
  recordHooks(on);
  on("session.start", async ($, e, next) => {
    const started = await next(e);
    await start($, config);
    return started;
  });
  on("session.measure", async ($, e, next) => {
    const measured = await next(e);
    await noteSize($, config, e.context);
    return measured;
  });
  on("turn.start", { turnId: /.*/u }, async ($, e, next) => {
    await update($, factsAtom, (facts) => begun(facts, e.turnId));
    return next(e);
  });
  on("turn.complete", async ($, e, next) => {
    const completed = await next(e);
    if (e.agentId === undefined) {
      await noteTurn($, config, e);
    }
    return completed;
  });
  on("session.compact", async ($, e, next) => {
    const compacted = await next(await onCompact($, config, e));
    const isMain = e.agentId === undefined && e.trigger !== "precompute";
    if (isMain && compacted.skip === undefined) {
      await noteSize($, config, {
        tokens: compacted.tokensAfter,
        percent: undefined,
      });
    }
    return compacted;
  });
  on("command.run", { command: COMMAND }, async ($) => ({
    text: explanationOf(await drawnOf($, config), config.guardCompactions),
  }));
};
