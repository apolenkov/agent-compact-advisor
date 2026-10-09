import type {
  EngineInterface,
  HookFor,
  MatchedHook,
  Registration,
} from "claude-code";

export type Engine = Readonly<EngineInterface>;

// Only the registrar signatures consumed by register/record. Keeping the SDK's
// full generic Register parameter here forces lint to compare every engine op.
type AdvisorEvent =
  | "session.start"
  | "session.measure"
  | "turn.start"
  | "turn.complete"
  | "session.compact"
  | "tool.call";
type TurnMatcher = Readonly<{ turnId: RegExp }>;
type RootMatcher = Readonly<{ cwd: RegExp }>;
type CommandMatcher = Readonly<{ command: "compact-advisor" }>;

/** SDK-derived signatures of the hooks this plugin actually wires. */
export interface AdvisorOn {
  <P extends AdvisorEvent>(
    pattern: P,
    hook: HookFor<P>,
  ): Registration<HookFor<P>>;
  (
    ...args: Readonly<
      ["session.start", RootMatcher, MatchedHook<"session.start", RootMatcher>]
    >
  ): Registration<MatchedHook<"session.start", RootMatcher>>;
  (
    ...args: Readonly<
      ["turn.start", TurnMatcher, MatchedHook<"turn.start", TurnMatcher>]
    >
  ): Registration<MatchedHook<"turn.start", TurnMatcher>>;
  (
    ...args: Readonly<
      [
        "command.run",
        CommandMatcher,
        MatchedHook<"command.run", CommandMatcher>,
      ]
    >
  ): Registration<MatchedHook<"command.run", CommandMatcher>>;
}
