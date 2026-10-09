/** What the last answer's leftover lines say. */
export type Leftovers =
  | { readonly kind: "none" }
  | { readonly kind: "unknown" }
  | {
      readonly kind: "listed";
      readonly text: string;
      /** True when only the owner's line lists something: a question, not unfinished work. */
      readonly isOwner?: boolean;
    };

/** Kev's P1 for the last answer: a value, being asked, or not available. */
export type P1 =
  | { readonly kind: "value"; readonly value: number }
  | { readonly kind: "pending" }
  | { readonly kind: "na" };

/** What the advisor knows of the session, kept across a hot reload. */
export interface AdvisorFacts {
  readonly tokens?: number | undefined;
  readonly window?: number | undefined;
  readonly percent?: number | undefined;
  readonly leftovers: Leftovers;
  readonly p1: P1;
  /** The owner's leftover line of the last answer, kept for the compaction template. */
  readonly ownerAsk?: string | undefined;
  /** The model's check of the last answer; it only ever adds a gate. */
  readonly promise?: Checked;
  readonly turnId?: string;
  /** A started main turn holds proposals until that same turn completes. */
  readonly isTurnComplete?: boolean;
  readonly lastTurnAt?: number;
  /** Whether the last score drawn stood at the threshold or above. */
  readonly wasAbove: boolean;
  /** Whether the context share stood at the alert percent or above. */
  readonly wasAlerted: boolean;
  /** The most recent crossing receipt, independent of turn suggestions. */
  readonly crossing?: Readonly<{ nonce: string; toast: string }>;
  /** The completed turn whose suggestion was last admitted, including after reload. */
  readonly suggestedTurnId?: string;
  /** The nonce of the draw which admitted that turn's suggestion. */
  readonly suggestionClaimer?: string;
}

/** The model's check of one turn's answer: pending until it answers, `na` when it could not. */
export interface Checked {
  readonly turnId: string;
  readonly state: "pending" | "owes" | "clean" | "na";
}

/** The slice of an agent-shell-watch call the advisor reads. */
export interface WatchedCall {
  readonly status: string;
  readonly command?: string;
  readonly label?: string;
  readonly runner?: string;
  /** A runner ended in the background and its verdict is still unread. */
  readonly needsTail?: boolean;
}

/** What the session wrote and what git said of it, and when. */
export interface Recorded {
  readonly at: number;
  readonly value:
    | {
        readonly files: number;
        /** Commits made, not pushed; undefined when git could not say. */
        readonly commits: number | undefined;
      }
    | undefined;
  /** Absolute paths the session's tools wrote to, newest last. */
  readonly touched: readonly string[];
}

declare module "claude-code" {
  interface PluginState {
    "agent-compact-advisor": {
      facts: AdvisorFacts;
      recorded: Recorded;
    };
    "agent-shell-watch": {
      calls: readonly WatchedCall[];
    };
  }
}
