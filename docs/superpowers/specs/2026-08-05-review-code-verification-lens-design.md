# review-code Verification Lens — Measure the Property, Not the Proxy

**Date:** 2026-08-05 · **Status:** Approved design (ready for implementation plan)
**Approach:** Shared-reference extraction + review-code lens/schema rewrite; test-audit trimmed to the extraction only.
**Companion work order:** `/home/umut/projects/tune/tmp/prompts/2026-08-05-ai-dev-tools-review-code-verification-lens-prompt.md` (mined from `github.com/bmad-code-org/BMAD-METHOD`, 2026-08-05).
**Predecessor:** ai-dev-tools 2.8.0–2.8.2, the five `titus-ai` practices. That change set is landed, reviewed over three rounds, and is a prerequisite: this spec builds on the `## Validation` block it introduced.
**Ships as:** 2.9.0 (enum rename + new required schema field + new terminal status = minor at minimum).

## Decisions taken

- ① **One definition, two consumers.** The "what counts as verification" definition is extracted to a shared reference rather than written into review-code's prompt. `test-audit` already owns concrete, per-stack weak-assertion patterns; applying the work order literally would create a second, prose-only, stack-blind copy that starts drifting immediately.
- ② **The per-stack patterns move, they are not copied.** `test-audit/references/dimension-heuristics.md` loses its inline Node/Python/.NET weak-assertion lists and points at the shared reference. Copying would reintroduce the drift ① exists to prevent.
- ③ **`test-audit` gets the extraction and nothing else.** No demonstration requirement, no Change 2, no removed-verification detection. Rationale in Scope §3.
- ④ **No auto/standard divergence — the divergence was the defect.** An earlier draft kept auto mode's fail-open (`stage-iii-code-review.md`: *"Missing or malformed → treat as 'no criticals' and advance"*) and scoped Incomplete to standard mode. That was wrong on two counts. `advanced-as-clean` is a silent false green — the exact failure the 2.8.x practices were written to eliminate, institutionalised in this plugin's own pipeline while it enforced the opposite on users. And it is not a safety net: it **overrides** failure machinery that already exists and is non-destructive (`retry-semantics.md` retry-once → `crash-code-review.md` soft-reset, stash, `skipped-crash-code-review`, continue to next spec). The override is deleted so the built path runs. Malformed output fails closed in both modes.
- ⑤ **Four corrections to the source work order** are folded in — see Scope §4. One of them (`additionalProperties`) is the difference between the change working and aborting every run.
- ⑥ **Acceptance criteria are verified empirically** via a throwaway fixture repo in the session scratchpad. `review-code` reads diffs and never executes tests, so the fixture is text files and commits, not a working project.
- ⑦ **Validation is a machine check, and the duty sits with the writer.** Today neither side is real: the reviewer is never asked to check its own output, and the orchestrator's VALIDATION step is the orchestrating LLM reading the file. A single dependency-free Node validator is shipped and invoked by both — the reviewer before `Write` (duty), the orchestrator at VALIDATION (verification) — with retry-once and then failure in between. Parse-only checking was rejected as a proxy: it catches fences and trailing commas but not invented fields or out-of-enum values, which is most of what actually goes wrong.

## Problem & goal

Three defects in `review-code`, all one failure: **a gate that measures a proxy rather than the property.**

**Defect A — the test lens is itself the proxy.** `skills/review-code/prompts/reviewer.md` defines a whole review category in one line: `- **test-gap**: risky logic without meaningful test coverage`. "Coverage" is the proxy; the property is *"if this broke, would verification fail?"* — which a test can have coverage of and still not answer. A test that runs the code and asserts nothing has coverage. Nothing in the prompt says what fails to *count* as a test, and nothing looks for verification that was removed or weakened.

**Defect B — severity is derived from confidence.** The prompt maps `>= 80 = critical, 60-79 = high, 40-59 = medium`, conflating two independent axes. A finding can be certain and cosmetic, or uncertain and catastrophic; under the current mapping the first is reported critical and the second medium — precisely backwards. `critical_count` drives the loop's terminal status, so the loop currently gates on *self-assessed certainty* rather than *consequence*.

**Defect C — coverage holes are invisible in the verdict.** The reviewer is told to `Read` files shown as stat-only because they exceeded the 3000-line diff budget. Nothing verifies it did. A run can terminate "Approved" over files that were never opened.

**Goal:** the review measures protection rather than coverage, reports consequence rather than certainty, and cannot report "clean" when it means "clean over whatever I happened to open."

## Scope

### §1 — New shared reference: `ai-dev-tools/references/verification-evidence.md`

Sits alongside the existing `backlog-entry-format.md` and `tasks-file.md`, addressed by consumers as `${CLAUDE_PLUGIN_ROOT}/references/verification-evidence.md`.

Contents:

1. **The question.** *"If the behaviour this change is supposed to produce broke where it's actually used, would verification fail?"*
2. **What counts.** A test counts only if it runs normally and an assertion observes the changed output, branch, or contract.
3. **What does NOT count** (stack-agnostic): no execution; source-text assertions that match a file's wording instead of running it; success/no-throw/snapshot-only checks; mock and log-call checks; tests that mock away the integration; e2e tests that pass through without checking the changed output; stale assertions or fixtures. Worked example: `expect(x ?? DEFAULT).toBe(DEFAULT)` passes when `x` is missing — it asserts the fallback, not the behaviour.
4. **Per-stack weak patterns** — Node.js (Jest/Vitest), Python (pytest), .NET (xUnit). **Moved verbatim** from `test-audit/references/dimension-heuristics.md` § Weak Assertions, so the two skills cannot disagree about what a weak assertion is.

The reference defines *evidence*. It does not define severity, risk, effort, or finding shape — each consumer keeps its own scoring.

### §2 — `skills/review-code/` changes

**Change 1 — replace the `test-gap` category with a verification-gap lens.**

Rename `test-gap` → `verification-gap` in **four** locations:

| File | Location |
|---|---|
| `skills/review-code/prompts/reviewer.md` | the category definition |
| `skills/review-code/prompts/reviewer.md` | the inline JSON schema block |
| `skills/review-code/SKILL.md` | the `category` enum in the JSON Schema section |
| `references/backlog-entry-format.md` | the `**Category:**` enum line |

The fourth is the one the source work order misses (see §4.1).

The new definition, in the prompt's existing voice, covers three shapes:

- **Regression gap** — the changed code regresses where it is used, and no test covering that use would fail.
- **Broken-verification gap** — a test appears to cover the behaviour but would not protect it: skipped, flaky, not run in the normal verification path, or too weak to observe the regression.
- **Removed verification** — a deleted test or a weakened assertion leaves behaviour unpinned. Check every removed or replaced chunk: did it carry behaviour or a contract that the change neither re-established nor intentionally retired?

It defers to `${CLAUDE_PLUGIN_ROOT}/references/verification-evidence.md` for what counts as a test rather than restating it.

**Demonstration — required for every `verification-gap` finding.** Name the smallest realistic regression the consumer would observe (invert the branch, drop the default, omit the field, return the old error code), then state which test would fail. If a test would fail, there is no finding. The demonstration goes in `problem`.

**Evidence rules.** Read a test before claiming what it covers. Before claiming no test exists, search by the symbol under test *and* by import references — an expected file location is not enough. State what was checked and how far the search went. Drop any finding that cannot be grounded.

**Add to `## Do NOT Flag`**, so the lens cannot decay into a coverage complaint:

- Low coverage, or a missing test file, as a finding in itself — without a demonstration of what would ship broken
- Behaviour already verified by an integration, contract, or e2e test
- Cases the compiler or type checker already enforces
- Legacy untested code the change did not touch

**Change 2 — separate consequence from confidence.**

Two independent fields:

```json
{
  "severity": "critical|high|medium|low",   // consequence IF real, judged at the call site
  "confidence": <integer 40-100>            // likelihood the finding is real
}
```

Delete `Severity mapping by confidence: >= 80 = critical, ...`. Replace with: severity is rated by what happens to the software's user if the finding is real — data loss, auth bypass and silent corruption are critical however unsure the reviewer is; a cosmetic issue is low however certain. Confidence is rated separately. **Read the code before rating:** open the source at the finding's location and read enough surrounding code to judge reachability — call sites, guards, validation that live outside the diff hunk. Severity reflects the real consequence at a real call site, not the worst theoretical reading. Report findings with confidence >= 40; a high-severity finding below that threshold is investigated until it can be grounded or dropped, not silently discarded.

`low` is added to the `severity` enum in both the prompt's schema block and `SKILL.md`'s JSON Schema. `references/backlog-entry-format.md` already documents `low` as available to review-code, so it needs no change for this.

**Change 3 — a review with an unreported coverage hole is not "Approved".**

New required top-level field in the reviewer's JSON:

```json
"coverage": {
  "files_in_diff": <integer>,
  "files_inspected": <integer>,
  "not_inspected": ["path/one.ts", "path/two.ts"]
}
```

Prompt instruction: record every changed file actually inspected — via the diff or via `Read`. Any changed file not opened goes in `not_inspected`, with no exceptions. An empty `not_inspected` is a claim someone can challenge; an omitted one is not.

`SKILL.md` Status Logic gains **Incomplete** at position 3:

```
1. Error                     — loop aborted (includes output that failed validation twice)
2. Issues Found              — critical_count > 0 OR verification regressions present
3. Incomplete                — coverage.not_inspected is non-empty
4. Approved with suggestions — any high/medium/low issues remain
5. Approved                  — all other cases
```

**Incomplete has exactly one trigger.** The source work order also lists *"the reviewer's JSON was missing/malformed on any iteration"*. That clause is unreachable: malformed output is retried once and then aborts, and rule 1 is first-match-wins, so Error fires before rule 3 is evaluated. Under decision ④ this now holds in auto mode too. A status that can never be reached is worse than no status — it reads as coverage that does not exist.

Incomplete names the files that were not inspected rather than announcing the run clean. `not_inspected` also renders into the summary's existing `## Validation → Checks SKIPPED, and why` block — the surface introduced in 2.8.0 for exactly this class of omission.

**Explicitly not adopted from the source:** BMAD treats a layer "returning empty results" as a failure. On a genuinely clean small diff, zero findings is the correct answer, and treating it as incomplete would make the warning meaningless within a week. Only *unopened files* trigger Incomplete.

**Change 4 — validate the output with a machine, not a claim.** Not in the source work order; added because Change 3 makes the schema stricter and neither existing check is real.

New file `ai-dev-tools/scripts/validate-review-json.cjs` — Node built-ins only, no dependency, no network, no `package.json` required. Named `.cjs` rather than `.js` so its module type cannot change if a `package.json` is ever added to the plugin:

```
usage: node validate-review-json.cjs <path-to-review-code.json>
exit 0  valid
exit 1  invalid — one human-readable error per line on stderr
exit 2  file missing or unreadable
```

It uses only `JSON.parse`, `fs.readFileSync`, `process.argv` and `process.exit`, so no Node version floor applies and none is declared. It checks what `additionalProperties: false` and the enums actually mean: the file parses; required top-level keys are present; no unlisted top-level key exists; `coverage` has its three fields with the right types; every issue carries exactly the required keys and no others; `severity` and `category` are in enum; `confidence` is an integer in 40–100. It also **prints the recount** of severities from the `issues` array, so the orchestrator's "never trust the declared counts" rule is executed rather than remembered.

Two callers, one script:

- **The reviewer, as duty.** After writing `{{OUTPUT_PATH}}`, run the validator against it. On a non-zero exit, fix the reported problems and re-run until it passes, then finish. This is the writing agent taking responsibility for its own artifact rather than delegating it downstream.
- **The orchestrator, as verification.** The Iteration Flow VALIDATION step invokes the same script instead of reading the file and judging. Retry-once semantics are unchanged; what changes is that the check is now a machine's.

This requires a narrow carve-out in the reviewer prompt's Tool Usage Rules, which otherwise forbid Bash for file operations. The carve-out permits exactly one command shape — the validator, against its own output path — and nothing else. It is stated as an exception so it cannot be read as a general relaxation.

**When `node` is unavailable** (a native Claude Code install on a .NET-only or Python-only machine is a realistic case — `claude` ships as a native binary and does not imply a Node runtime), the validator is skipped, both callers fall back to reading the file, and the skip is recorded under `## Validation → Checks SKIPPED, and why` with the reason. An unavailable check that is stated is acceptable; one that is silently absent is the failure this whole change set exists to prevent.

### §3 — `skills/test-audit/` changes

**Only the extraction.** `references/dimension-heuristics.md` § Weak Assertions loses its inline per-stack pattern lists and points at `${CLAUDE_PLUGIN_ROOT}/references/verification-evidence.md`, keeping its `Risk: 2-3 / Effort: 1` scoring and its role as Agent 2's input.

Deliberately excluded, with reasons:

- **No demonstration requirement.** A suite-wide audit reporting "this module has no tests" is doing its job. The `Do NOT Flag → missing test file without a demonstration` rule is correct for a diff-scoped reviewer and would gut `test-audit`'s Coverage Gaps dimension.
- **No Change 2.** `test-audit` findings already carry `Risk` and `Effort` as independent axes — it separates consequence from cost correctly and needs no fix.
- **No removed-verification detection in `--changed` mode.** review-code covers that axis diff-scoped. Adding it here is a second implementation of one idea, which is what ① exists to prevent. Recorded in Deferred.

### §4 — Corrections to the source work order

**4.1 — The rename is four locations across three files.** The work order accounts for three locations across two files (the category definition and the schema block, both in `prompts/reviewer.md`, plus `SKILL.md`'s JSON Schema). It misses `references/backlog-entry-format.md:28`, which carries the same category enum. Acceptance criterion 1 as written (`grep -rn "test-gap" skills/`) greps only `skills/`, so it returns green over a stale enum in `references/`. **Widen the criterion to the repository root.**

**4.2 — `additionalProperties: false` blocks the new field.** `SKILL.md`'s JSON Schema sets `"additionalProperties": false` and `"required": ["critical_count","high_count","issues"]`. Adding `coverage` without amending both makes the reviewer's first output fail schema validation, which per Error Handling means *"Retry review once. Second failure: abort with error."* — **a hard abort on every run.** Both `properties` and `required` must be updated in the same edit.

**4.3 — Auto mode's fail-open is deleted, not worked around.** `references/auto/stages/stage-iii-code-review.md` currently states: *"Optimistic trust. Orchestrate does NOT validate review JSON for agent iii. Missing or malformed → treat as 'no criticals' and advance… advanced-as-clean, not retried"*, plus *"**Exception:** If iter 4 JSON is unreadable, assume critical count = 0 (fail open)."*

Both go. Three edits:

| File | Edit |
|---|---|
| `references/auto/stages/stage-iii-code-review.md` | Delete the **Unusable-Output Policy** section, including the iter-4 exception. Agent iii's output is validated like any other, by the script from Change 4. |
| `references/auto/failure-handling/retry-semantics.md` | Extend the Crash Signal Definition: an artifact that is **written but fails validation** is a crash, alongside the existing *"returns without writing its expected output artifact"*. Without this, malformed-but-present output falls through the crash definition and the deletion above has nothing to route into. |
| `skills/review-code/SKILL.md` | Note at the Status Logic that validation failure resolves to **Error** (rule 1) in both modes, so Incomplete's single trigger stays unambiguous. |

The deletion routes into machinery that already exists and is non-destructive: retry-once, then `crash-code-review.md`'s soft-reset to `last_iteration_head`, stash, state `skipped-crash-code-review`, **continue to next spec**. A malformed review skips one spec loudly and records why; it does not halt the batch and it does not destroy work.

**Accepted risk, stated deliberately:** if the reviewer produces malformed output *systematically* — most likely from a defect in the new prompt itself — an auto run will skip every spec rather than a few. That is the intended signal. The alternative is the current behaviour, where the same defect produces a run that reports every spec clean. A loud batch failure is diagnosable in one look; a silent false green is not diagnosable at all.

**4.4 — Incomplete's precedence.** The work order says "a third status alongside Approved and Issues Found" without placing it. It slots at position 3: after Issues Found (criticals are the more urgent signal) and before both Approved variants (a coverage hole must dominate any Approved reading).

### §5 — Consequences to re-read

Change 2 alters what `critical_count` means, from certainty to consequence. Re-read each consumer against the new meaning and confirm it still reads correctly:

- the Iteration Flow VALIDATION step, which now invokes the script rather than judging by reading — retry-once semantics unchanged
- the stop-check (`STOP CHECK (only when critical_count == 0)`)
- the synthetic-critical injection path for verification regressions — its fixed `severity: "critical", confidence: 85` is still correct under the split: a verification regression is critical by consequence and 85 by likelihood
- the `--max-iterations 1` terminal condition
- `references/common/error-logs-format.md`, which reads `.critical_count` via `jq`
- `references/auto/stages/stage-i-spec-review.md`'s pre-fix-criticals gate

With `low` in the enum, Status Logic rule 4 reads "any high/medium/low issues remain" so a low-only run does not silently fall through to "Approved".

## Verification

Empirical, per the work order's own bar. Criteria 1, 4 and 6 run in this repository; 2, 3 and 5 run against a throwaway fixture.

**Fixture** — created in the session scratchpad, `git init`, never inside `ai-dev-toolkit`:

```
$SCRATCHPAD/verification-fixture/
  src/pricing.js         ~20 lines
  test/pricing.test.js   ~20 lines
  big.js                 ~3500 generated lines
```

| # | Criterion | Method | Expected |
|---|---|---|---|
| 1 | Rename complete | `grep -rn "test-gap"` from the **repo root** (not `skills/`) | zero hits |
| 2 | Weakened assertion fires the lens | fixture commit 1: `expect(total).toBe(19.99)` → `expect(total).toBeDefined()`; run review-code | ≥1 `verification-gap` finding |
| 3 | No-op diff stays silent | fixture commit 2: comment/whitespace only; run review-code | zero `verification-gap` findings |
| 4 | Axes are independent | hand-check a constructed high-severity/low-confidence finding | not demoted to medium |
| 5a | Status logic honours `not_inspected` | hand-construct a `review-code.json` with non-empty `not_inspected` and zero criticals; run the Final Report logic | status **Incomplete**, files named, not "Approved" |
| 5b | Reviewer populates `not_inspected` honestly | fixture commit 3: change `big.js` so the diff exceeds 3000 lines; run review-code | either the file is read and `not_inspected` is `[]`, or it is skipped and appears in `not_inspected` — never skipped *and* absent |
| 6 | Clean diff still terminates | run review-code on a clean in-repo diff | status "Approved", no spurious Incomplete |
| 7 | Validator rejects bad artifacts | run `node validate-review-json.cjs` against hand-crafted files: an invented top-level key, an out-of-enum `severity`, `confidence: 30`, a trailing comma | exit 1 each time, naming the offending key or value |
| 8 | Validator accepts a good artifact | run it against a real `review-code.json` produced this session | exit 0, recount printed |
| 9 | Fail-open is gone | `grep -rn "fail open\|advanced-as-clean\|Optimistic trust" ai-dev-tools/` | zero hits |

**Criterion 5 is split deliberately.** The work order states it as *"a review where a changed file exceeds the diff budget **and is not read** reports Incomplete"* — but a compliant reviewer *does* read stat-only files, so a single test cannot force the condition. 5a tests the status logic deterministically; 5b tests reviewer honesty and may pass vacuously (`not_inspected: []` because everything was read). **A vacuous 5b is recorded as "satisfied vacuously — the reviewer read every file", not reported as the status having fired.** Claiming otherwise would be exactly the unearned green this change set exists to prevent.

Criterion 2 is the load-bearing one: it is the regression the whole change exists to catch. If it does not fire, the lens is not working and the design is wrong, not the test.

`claude plugin validate ./ai-dev-tools --strict` must pass after every commit (project CLAUDE.md gate).

## Commit strategy

Small commits on `master`, in dependency order:

1. `feat(references): add verification-evidence shared reference` — new file, patterns moved out of test-audit
2. `refactor(test-audit): read weak-assertion patterns from the shared reference`
3. `feat(review-code): replace test-gap with a verification-gap lens` — rename across 4 files + new definition + Do NOT Flag additions
4. `feat(review-code): separate severity from confidence` — schemas, mapping line, `low`
5. `feat(review-code): report unopened files and add the Incomplete status` — coverage field, `additionalProperties`/`required`, Status Logic, Validation rendering
6. `feat(review-code): validate reviewer output with a script, not a claim` — `scripts/validate-review-json.cjs`, the reviewer's pre-write duty, the Tool Usage carve-out, the orchestrator's VALIDATION step, and the `node`-absent fallback
7. `fix(orchestrate): stop advancing malformed review output as clean` — delete the Unusable-Output Policy and its iter-4 exception; extend the crash signal to cover written-but-invalid artifacts
8. `chore(release): ai-dev-tools 2.9.0` — bump **after** the fixes land, not before (2.8.0 was stamped ahead of its own review fixes and the version described a tree that no longer existed)

Commit 7 depends on commit 6: deleting the fail-open before a real validator exists would route valid-but-uninspected output into the crash path.

## Success criteria

- All nine acceptance criteria pass by execution, with results quoted. The one thing verified by reading rather than running is the `node`-absent fallback path; it is recorded as such under Checks SKIPPED rather than claimed.
- `grep -rn "test-gap"` from the repo root returns nothing.
- The shared reference has exactly one definition of the per-stack weak patterns; `test-audit` references it and does not restate it.
- `validate-review-json.cjs` runs on Node with no dependency and no `package.json`, exits 1 on each malformed fixture, and exits 0 on a real artifact.
- No fail-open language survives anywhere in `ai-dev-tools/`.
- `claude plugin validate ./ai-dev-tools --strict` passes.
- The release commit's `## Validation` section states commands run, checks skipped, and residual risk — the practice this plugin now enforces on everyone else applies to its own release.

## Deferred (explicit follow-ups)

- **Removed-verification detection in `test-audit --changed`.** Natural fit for its merge-base diff mode; excluded to avoid a second implementation of a review-code concern.
- **Auto-mode tasks-file handling.** Practice 3 from 2.8.0 is implemented for standard mode only; auto mode processes specs rather than tasks, so there is no defined mapping from a pipeline stage to "tasks this cycle advanced". Surfaced as a pushed-back finding in the 2.8.2 review; needs its own design.
- **Change 3's rule generalised to `review-doc`.** Different output contract; separate change.
- **BMAD's multi-layer review architecture** (parallel adversarial reviewers then triage). The biggest idea in the source repo and the least suited to a drop-in change; `review-code` is single-agent by design. Worth its own evaluation.
- **Git tags.** Releases 2.7.0 through 2.8.2 are untagged — only `v2.6.0` exists — and `changelog-from-commits` derives its range from the two most recent tags.

## Provenance

- Source repo: `github.com/bmad-code-org/BMAD-METHOD`, mined 2026-08-05. Relevant paths: `src/bmm-skills/ship/bmad-code-review/review-prompts/verification-gap.md`, `references/deletion-check.md`, `steps/step-02-review.md`, `steps/step-03-triage.md`.
- Not adopted, with reasons recorded in the work order: multi-layer architecture, the "find at least ten issues" forcing function, severity suppression at the finder, mutation testing as a tool, and any change to `review-doc`.
- Design rule inherited from the predecessor work order: nothing project-specific. Every rule here is true in any repository; anything that only makes sense in one project belongs in that project's CLAUDE.md.
