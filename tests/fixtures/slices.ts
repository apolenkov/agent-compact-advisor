/**
 * Fixtures of slices.test.ts: 56 moments of real sessions plus 6 corpus
 * loss-incident signatures (`C-` ids) as kinds of events
 * only (no text, no paths: the sessions hold other projects). One per line:
 * id | edited since the last commit | commits unpushed | live background
 * classes | agent leftovers | owner leftovers | label A | label B | resolved
 * label | how it was resolved.
 */
// Rows with a `C-` id are the four loss incidents of the October corpus
// (scripts/corpus.py), kept at event-kind level; `unread` is a runner that
// ended with its verdict unread, `stale` is a live call that went silent.
export const SLICES = `
S1-3|1|0|unknown,waiter|unknown|unknown|early|early|early|both
S1-607|1|0|waiter,unknown,unknown,unknown,waiter,waiter,waiter,waiter,work,work|listed|none|early|early|early|both
S1-111|1|0|unknown,waiter,waiter|listed|unknown|early|early|early|both
S1-637|1|1|waiter,unknown,unknown,unknown,waiter,waiter,waiter,waiter|none|listed|early|early|early|both
S2-48|1|0||listed|unknown|early|early|early|both
S2-481|1|0||unknown|unknown|early|early|early|both
S2-519|1|4||listed|unknown|early|early|early|both
S2-711|1|1||unknown|unknown|early|early|early|both
S3-142|1|2|waiter,unknown|listed|unknown|early|early|early|both
S3-158|1|0|waiter|unknown|unknown|early|early|early|both
S3-2|1|0|unknown,unknown|unknown|unknown|early|early|early|both
S3-24|1|0||unknown|unknown|early|early|early|both
S4-300|1|0||listed|listed|early|early|early|both
S4-303|1|0||unknown|unknown|early|early|early|both
S4-92|0|0||unknown|unknown|can|can|can|both
S4-578|1|1||listed|none|early|early|early|both
S5-140|1|9||listed|unknown|early|early|early|both
S5-13|1|1|waiter,unknown|listed|unknown|early|early|early|both
S5-58|1|0||listed|unknown|early|early|early|both
S5-79|0|0||listed|unknown|early|early|early|both
S6-125|0|7|work|none|unknown|early|can|early|conservative
S6-115|1|1|work,waiter|listed|unknown|early|early|early|both
S6-96|1|0|work,waiter|unknown|unknown|early|early|early|both
S6-74|1|0|work|listed|unknown|early|early|early|both
S7-23|1|0|unknown|unknown|unknown|early|early|early|both
S7-15|1|3|unknown|listed|listed|early|early|early|both
S7-5|1|2|unknown|unknown|unknown|early|early|early|both
S7-20|0|0|unknown|unknown|unknown|early|early|early|both
S8-28|0|0|waiter,waiter|listed|none|early|early|early|both
S8-23|0|5|waiter|unknown|unknown|early|early|early|both
S8-17|0|3||listed|listed|early|early|early|both
S8-48|1|0|waiter|unknown|unknown|early|early|early|both
S9-37|1|0|waiter|listed|listed|early|early|early|both
S9-28|1|1|waiter|listed|none|early|early|early|both
S9-10|1|0|waiter|unknown|unknown|early|early|early|both
S9-16|1|1|unknown|unknown|unknown|early|early|early|both
S2-963|1|0||none|none|early|can|can|tiebreak
S2-965|1|0||none|none|can|can|can|both
S2-966|1|0||none|none|early|can|can|tiebreak
S2-968|1|0||none|none|early|can|can|tiebreak
S2-969|1|0||none|none|early|can|can|tiebreak
S2-971|1|0||none|none|early|can|can|tiebreak
S2-973|1|0||none|none|early|can|can|tiebreak
S2-974|1|0||none|none|early|can|can|tiebreak
S2-975|1|0||none|none|early|can|can|tiebreak
S2-976|1|0||none|none|early|can|can|tiebreak
S2-977|1|0||none|none|early|can|can|tiebreak
S2-1003|1|1||none|none|early|can|can|tiebreak
S2-1006|1|1||none|none|early|can|can|tiebreak
S2-1013|1|1||none|none|early|early|early|both
S4-254|1|0||none|none|early|early|early|both
S4-255|1|0||none|none|early|early|early|both
S4-256|1|0||none|none|early|early|early|both
S4-257|1|0||none|none|early|early|early|both
S7-3|0|2|unknown|none|none|early|early|early|both
S8-0|0|0||none|none|can|can|can|both
C-1|0|0|work|listed|unknown|early|early|early|both
C-2|0|4|work|listed|unknown|early|early|early|both
C-3|0|2|work|listed|unknown|early|early|early|both
C-4|0|0||listed|unknown|early|early|early|both
C-5|0|0|unread|unknown|unknown|early|early|early|both
C-6|0|0|stale|unknown|unknown|early|early|early|both
`;
