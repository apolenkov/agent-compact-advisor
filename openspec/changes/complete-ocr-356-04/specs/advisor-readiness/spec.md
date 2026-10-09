## ADDED Requirements

### Requirement: Polling and file-write classification

The advisor SHALL distinguish read-only polling from data transfer and local file output using each command's flag semantics.

#### Scenario: Curl fail flags poll safely

- **WHEN** a polling loop uses curl `-f`, `-fsS` or `-sf` without write flags
- **THEN** it is classified as a waiter

#### Scenario: Data or output flags remain work

- **WHEN** a loop uses curl upload, JSON body, remote-name or output flags, or gh api input-body flags
- **THEN** it remains work rather than a waiter

### Requirement: Recently touched work remains represented

The advisor SHALL keep at most 40 unique touched paths in order of their last occurrence.

#### Scenario: A repeated recent path survives overflow

- **WHEN** added paths contain one path, 40 other unique paths and that first path again
- **THEN** the final occurrence is retained and the list contains 40 unique paths

### Requirement: Leftover uncertainty is explicit

The advisor SHALL treat an empty leftover-prefix line as unknown and SHALL give actual listed agent work priority over empty or explicit-none lines.

#### Scenario: Blank tail does not claim completion

- **WHEN** the answer contains only an empty agent-tail line
- **THEN** it produces unknown without an empty listed-work gate or explicit-none points

#### Scenario: Actual listed work remains a blocker

- **WHEN** a blank tail and actual listed agent work occur together
- **THEN** the listed work remains the effective signal

### Requirement: Raw Git status preserves owned work

The advisor SHALL consume NUL-delimited porcelain status without display-path decoding and SHALL count owned touched files in untracked directories.

#### Scenario: Unusual filenames match exactly

- **WHEN** a touched path contains Unicode, a tab, a backslash or a literal arrow sequence
- **THEN** raw status matches the exact filename and reports owned unrecorded work

#### Scenario: Rename framing leaves following records intact

- **WHEN** a rename or copy includes a second source-path record followed by another status
- **THEN** the source is consumed as framing and the following status is still processed

### Requirement: Relevant repository failures retain uncertainty

The advisor SHALL NOT infer all work is recorded from a clean repository while another relevant repository cannot be inspected.

#### Scenario: One clean and one failed repository

- **WHEN** one relevant root is clean and another relevant status or ahead query fails
- **THEN** the aggregate preserves an unknown blocking state rather than clean zero

### Requirement: Effects are claimed independently

The advisor SHALL claim crossing notifications separately from suggestions for a completed main turn using engine CAS and serializable state.

#### Scenario: Later turns remain eligible without another crossing

- **WHEN** an eligible main turn ends after the size warning was already shown
- **THEN** it can receive one suggestion, while a timer cannot repeat that suggestion
- **AND** a distinct eligible later turn can receive its own suggestion

#### Scenario: Concurrent draws do not duplicate effects

- **WHEN** two draws race for the same crossing or the same completed turn
- **THEN** each effect is emitted at most once

#### Scenario: A delayed old turn cannot claim a new turn

- **WHEN** an old draw finishes after a newer main turn has started
- **THEN** it neither emits a suggestion for the newer turn nor acquires its claim

### Requirement: Main compaction preserves context

The advisor SHALL add its preservation template to manual, automatic and plugin-triggered main-thread compactions while leaving precompute and subagent compactions unaffected.

#### Scenario: A plugin compacts the main thread

- **WHEN** main-thread compaction uses the plugin trigger
- **THEN** the preservation template is present

### Requirement: Size warnings respect explicit policy

The advisor SHALL allow a size-triggered main-turn suggestion while background state is unknown, retain the unknown score cap and SHALL NOT bypass known hard gates.

#### Scenario: Unknown background and large context

- **WHEN** context exceeds the configured size alert at an eligible main-turn end and background is unknown
- **THEN** a size-triggered suggestion is allowed while status still reports uncertainty and readiness stays below its threshold

#### Scenario: Known unfinished work blocks suggestion

- **WHEN** a known work, agent, unread-result, unrecorded-work or unresolved-check gate is active
- **THEN** a size warning does not authorize a suggestion

### Requirement: Score threshold has measured regression limits

The advisor SHALL evaluate score-threshold readiness at 70 separately from size-triggered suggestions and SHALL enforce meaningful corpus limits.

#### Scenario: Resolved slice labels are checked

- **WHEN** the 62 fixed slices are evaluated at threshold 70
- **THEN** false-can is zero and false-early is limited to the 14 explicitly documented incomplete-information cases
- **AND** a new false-early ID is rejected instead of being permitted by corpus size

#### Scenario: Complete information crosses the exact boundary

- **WHEN** fully known, unblocked inputs yield scores 69, 70 and 71
- **THEN** only 70 and 71 satisfy the score-threshold readiness condition

### Requirement: Failed delivery creates an escalation reason

The workflow SHALL retain an explicit failure reason after unsuccessful push unless remote inspection successfully proves that the branch moved.

#### Scenario: Push and remote inspection both fail

- **WHEN** push fails and the subsequent remote-head query also fails
- **THEN** the step records a nonempty reason and the escalation path is eligible

### Requirement: Completion evidence matches final code

The delivery SHALL account for all 30 original findings, preserve explicit coverage exclusions and contain current checks, independent review and CI matching the final PR head.

#### Scenario: Historical test output precedes recovered changes

- **WHEN** a successful test run occurred before a later recovered code change
- **THEN** that result is historical evidence and does not prove final completion
