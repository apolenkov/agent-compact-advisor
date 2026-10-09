## Context

The branch contains recovered WIP from Devin cloud-wall at base d2f0f7b. A stable 29-file snapshot preserves the original content. The initial OCR selected 54 of 91 files and produced 30 findings; its exclusions and corrected finding outcomes must remain explicit. Owner-approved program doc-383 authorizes implementation and includes TASK-360 in this PR.

## Goals / Non-Goals

Goals are correct work detection, explicit uncertainty, per-turn suggestions without duplicate effects, successful SDK loading and evidence tied to the final tree. This change does not replace the financial score, add a mutex outside the SDK, collect private transcripts, change global machine settings or automatically merge the delivery PR.

## Decisions

### Functional model and last occurrence

Keep the existing pure interfaces. Deduplicate paths by their last occurrence before applying the existing maximum; repeated recent paths remain recent. A blank tail is unknown, not an empty listed item or explicit completion. Real listed work retains priority.

### Git machine protocol

The status producer runs `git status --porcelain -z`. Its consumer reads raw status records and consumes the separate source record for a rename/copy. It never trims or decodes display-quoted paths. Directory status can match a touched descendant; unrelated untracked paths do not become owned work. Failure of a relevant status, ahead query or root limit remains uncertainty and cannot be erased by another clean root.

### Crossing and turn identities

Use engine CAS with JSON-serializable facts. Notification crossing ownership and main-turn suggestion ownership are separate. An unchanged crossing does not suppress a valid turn-end suggestion. Concurrent events for the same effect claim once. The draw carries its source turn identity; an obsolete asynchronous result cannot suggest for or claim a newer turn. Timers do not restore a dismissed suggestion. Retain local recordedAtom declarations in each reader module because the engine scanner requires a local declaration.

### Unknown score and size exception

Unknown background/leftovers cap readiness below its threshold and remain visible. Owner explicitly chose a separate size-triggered suggestion despite unknown background. This exception does not raise readiness score or bypass known hard gates. Test score classification and size-triggered behavior separately.

### Evidence and delivery

Each confirmed regression gets a RED at its owning boundary and GREEN after repair. Baseline and recovered-snapshot failures are identified separately. Tests use the real SDK CAS; no test-only production hooks. Failure probes execute the actual workflow shell branch against controlled Git outcomes. The corpus uses synthetic records for regression tests. Compatible dependencies and complete SDK declarations are verified together.

## Risks / Trade-offs

- NUL framing and rename source records can skip or misattribute paths; exercise raw bytes and following records at process-to-hook boundary.
- Async drawing can claim the wrong turn; exercise delayed old events and concurrent completion through registered hooks.
- A size suggestion under unknown background is an explicit owner-selected trade-off; status must not claim verified readiness.
- Version changes can invalidate SDK scanner/CAS assumptions; revalidate against the final pinned engine.

## Migration Plan

No persisted-data migration is required. Add compatible optional serializable effect identities only if needed; missing identities retain safe defaults. Preserve recovered evidence, complete scoped packages, run final checks and independent branch review, then commit/push one PR with ordinary hooks. Update Backlog only for directly verified criteria. Roll back through the branch commits without deleting recovery evidence.

## Open Questions

None. Blank tails, unknown size behavior and PR delivery boundaries are owner-approved.
