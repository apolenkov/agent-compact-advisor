## Why

The recovered OCR work contains confirmed defects and new regressions. Its last check was interrupted; historical test results predate the final concurrency changes. Finish the review with current evidence and preserve work that the advisor cannot verify.

## What Changes

- Restore correct curl polling/write classification and newest-last touched paths.
- Treat blank leftovers as unknown; align the Python corpus and documented readiness.
- Read raw NUL-delimited Git status, preserving unusual filenames, rename records and uncertainty across repositories.
- Separate crossing notifications from per-turn suggestions using engine CAS and serializable state.
- Preserve main-thread manual/auto/plugin compaction context; retain SDK-required local atom declarations.
- Make failed push delivery produce an escalation reason, including remote inspection failures.
- Explicitly allow size-triggered suggestions with unknown background while preserving known blocking gates and the score cap.
- Verify threshold 70, finish scoped hygiene, update compatible tooling and deliver one reviewed PR.

## Capabilities

### New Capabilities

- `advisor-readiness`: observable readiness, work preservation, suggestion ownership and verified delivery contracts.

### Modified Capabilities

None. This repository has no previously recorded OpenSpec capability baseline.

## Impact

Changes affect the existing pure model, record/register hook boundaries, serializable facts, corpus script, repository metadata and workflows. Existing command entry points remain compatible. Source journals and private recovery evidence stay outside the product repository. The branch is delivered by one PR without automatic merge.
