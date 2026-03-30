---
name: orchestrate
description: "Use when the user wants to start a development cycle, continue where they left off, check what's next, automate their brainstorm-review-implement-review-commit workflow, or get recommendations for quality gates — even if they don't use the exact skill name."
---

<help-text>
orchestrate — Manage your full development cycle

USAGE
  /orchestrate [--strict]

FLAGS
  --strict    Enable quality discipline: TDD enforcement, verification
              gates, per-task spec compliance review, intelligent execution
              model selection, and structured completion options.
              Recommended for features where correctness matters more
              than speed.

EXAMPLES
  /orchestrate                       Detect state and suggest next step
  /orchestrate --strict              Detect state with quality discipline
</help-text>

Parse arguments: if `--help` is present, output ONLY the text inside <help-text> tags above verbatim and exit. If `--strict` is present, set strict mode active for this invocation. Both flags can coexist with `--help` taking priority.

**Strict mode banner:** When `--strict` is active, print before any state detection:
```
Mode: strict (TDD + verification + spec compliance + structured completion)
```

# orchestrate

A meta-skill that manages the developer's core development loop and advises on quality gates. Single entry point: `/orchestrate`. It detects where you are in the cycle by scanning artifacts and git, presents the next step with context, and invokes the appropriate skill on confirmation.

**Execution model:** Orchestrate is a **re-invocable state machine**, not a persistent execution loop. Each `/orchestrate` invocation detects state, suggests ONE step, and then the invoked skill takes over the conversation. After that skill completes, the user re-invokes `/orchestrate` to continue. This avoids nested skill invocation — no SKILL.md invokes another skill in a persistent loop.

**It is NOT** a monolithic skill that replaces all others. It is a dispatcher — it detects state, suggests the next action, and hands off to the appropriate skill.

**Resume:** The user can exit mid-cycle and `/orchestrate` picks up where they left off. State is detected from artifacts, not session history.

**Project-agnostic:** Works on any codebase. Detects implementation progress via git and plan checkboxes.

---

## On Each Invocation

```
/orchestrate
    |
    v
1. Detect current state (scan artifacts + git)
    |
    v
2. Present status + next step with context
    |
    v
3. User confirms -> invoke skill (skill takes over conversation)
   User overrides -> do what they want
   User exits -> state persists in artifacts
    |
    v
4. After skill completes -> user re-invokes /orchestrate
    |
    v
5. If cycle just completed -> check quality gate triggers -> present recommendations
    |
    v
6. "What's next?" -> next feature / run recommendation / something else
```

Each `/orchestrate` invocation handles ONE step. The user re-invokes after each skill completes. This is the natural Claude Code interaction model — skills do not nest.

---

## Core Loop: 8 Steps

Execute these steps in order. State detection (see below) determines which step applies on each invocation. The first matching trigger wins — earlier steps take priority.

### Step 1: BRAINSTORM

**Trigger:** No spec file in `docs/superpowers/specs/` for the current feature. This is the entry point for new features.

**Behavior:**
- Check `tmp/current-roadmap.md` for the next unimplemented item (if file exists).
- If no roadmap: ask "What feature would you like to work on?"
- Present: "Based on the roadmap, next up is `{skill_name}`. Start brainstorming? Or tell me what you'd like to work on."
- On confirm: invoke `superpowers:brainstorming` (requires the superpowers plugin to be installed). If the skill is not available, instruct the user: "The superpowers plugin is required for brainstorming. Install it or create the spec manually at `docs/superpowers/specs/`."
- On override: user provides their own feature description, pass to brainstorming.
- The brainstorming skill produces a spec file in `docs/superpowers/specs/`. On the next `/orchestrate` invocation, state detection will find this spec and route to Step 2.

**Prerequisites:** Steps 1, 4, and 5 depend on the `superpowers` plugin (`superpowers:brainstorming`, `superpowers:writing-plans`, `superpowers:subagent-driven-development`). If these are not installed, orchestrate warns and offers alternatives: create specs/plans manually, or use inline execution for implementation.

### Step 2: SPEC REVIEW

**Trigger:** Spec file exists in `docs/superpowers/specs/`, AND either:
- The spec's `**Status:**` header (line 4, bold format) does not contain "Approved", OR
- `tmp/review_summary.md` does not exist or its `**Reviewed:**` field does not match the current spec path (review not yet run for this spec).

This check matches both "Approved" and "Approved with suggestions" as passing — either means zero criticals.

**Behavior:**
- Present: "Spec written at `{path}`. Ready to review? I'll dispatch 3 parallel review agents."
- On confirm: invoke `/review-doc {spec_path}`
- The review skill produces `tmp/review_summary.md` with `**Status:**` field.
- **Clean review path:** If the review returns "Approved" or "Approved with suggestions" (zero criticals), update the spec's `**Status:**` header to "Approved" immediately, so the next `/orchestrate` invocation advances to Step 4. Do not wait for Step 3 to update it.

### Step 3: RESPOND TO REVIEW

**Trigger:** `tmp/review_summary.md` exists AND its `**Reviewed:**` field matches the current spec path AND Critical count > 0. If `**Reviewed:**` does not match current spec, treat as stale and ignore. If zero criticals but High > 0, present as informational: "Review found {M} suggestions. Fix these or proceed to planning?"

**Behavior:**
- Present: "Review found {N} critical, {M} high findings. Ready to apply fixes?"
- On confirm: invoke `/respond-to-review {round_number} {spec_path}` where round_number = count `## Round N` sections in `tmp/response_analysis.md` that belong to the current spec (match by spec name in section content) + 1. If no matching sections exist, round = 1. No arch file argument for spec reviews.
- **Loop:** After responding, re-invoke `/review-doc` if critical findings existed. Repeat Steps 2-3 until spec status is "Approved" or "Approved with suggestions" (either = zero criticals, loop exits).
- **Status update:** After re-review confirms zero criticals, update the spec's `**Status:**` header to `Approved (R{N} revisions applied)` so state detection recognizes the approval on subsequent `/orchestrate` invocations.

### Step 4: WRITE PLAN

**Trigger:** Spec Approved (or Approved with suggestions), no matching plan file in `docs/superpowers/plans/`. Match plan files by extracting the feature name from the spec filename and looking for `*-{feature_name}-plan.md`.

**Behavior:**
- Present: "Spec approved. I'll extract architectural decisions as ADRs, then write the implementation plan. Proceed?"
- On confirm:
  1. **ADR extraction (inline pre-processing):** Follow the extraction algorithm in `ai-dev-tools/skills/document-for-ai/references/adr-extraction.md`. This is NOT a skill invocation — no conversation takeover. Read the reference file and execute the algorithm directly.
     - Report result (including any overlap warnings):

       If qualifying decisions found:
       > "Extracted {N} architectural decisions:
       >   1. [{score}] {title}
       >   2. [{score}] {title}
       >   Filtered: {M} low-impact decisions"

       If zero qualifying decisions:
       > "No architectural decisions met the threshold for ADRs."

     - **On extraction failure:** Do not auto-proceed. Report the failure and offer: (1) Retry extraction, (2) Skip ADRs and write plan, (3) Exit.

  2. **Invoke `superpowers:writing-plans`** (single skill takeover for this invocation).
- On decline: skip to next `/orchestrate` invocation. No files written.

**Design constraint:** One skill takeover per invocation maintained. ADR extraction is an inline pre-processing action, not a `/document-for-ai` skill invocation. The extraction algorithm is defined once in the reference file, consumed by both the standalone command and orchestrate. The only skill takeover in Step 4 is `superpowers:writing-plans`.

**Commit guidance:** ADR files and plan file are written to disk during Step 4 but not auto-committed. When committed, include `document-for-ai` in the commit message (e.g., `docs(document-for-ai): extract ADRs from feature-X spec`) so the Step 8 quality gate baseline detection works.

### Step 5: IMPLEMENT

**Trigger:** Plan file exists, not all checkboxes are `[x]`.

**Behavior:**
- Present (without `--strict`): "Plan at `{path}` -- {N} tasks, {M} completed. Continue implementation? I'll use subagent-driven-development."
- Present (with `--strict`): "Plan at `{path}` -- {N} tasks, {M} completed. Continue implementation? I'll recommend an execution model."
- On confirm (without `--strict`): invoke `superpowers:subagent-driven-development`
- On confirm (with `--strict`): run the execution model recommendation preamble first (see below), then dispatch with overrides (see Step 5 Dispatch section).
- **Dependency:** Assumes the implementation skill updates plan checkboxes `- [ ]` to `- [x]` in-place as tasks complete.
- **Note:** If all checkboxes are already `[x]`, Step 5 does not trigger — state detection routes directly to Step 6.

**When `--strict` is active**, do NOT immediately dispatch. Run the execution model recommendation preamble first:

#### Execution Model Recommendation (--strict only)

**Inputs:**
1. Plan file (count tasks, scan for "Files" sections)
2. Context estimate: `estimated_used = number_of_user_messages_in_conversation × 2_000`. Apply floor: `estimated_used = max(estimated_used, 10_000)`.
3. Task coupling from "Files" sections (see algorithm below)

**Coupling assessment:**
```
Scan each task's "Files" section for paths listed.
If no tasks have a "Files" section → MEDIUM (conservative default).
If fewer than half of tasks have a "Files" section → MEDIUM (insufficient data).
Otherwise, only tasks with "Files" sections participate:
  Count how many participating tasks share at least one file path.
  >40% share → HIGH | 20-40% → MEDIUM | <20% → LOW
```

**Recommendation algorithm:**
```
remaining = 200_000 - estimated_used
implementation_estimate = task_count × 12_000

If implementation_estimate > remaining × 0.8 → subagent-per-task
  (also include in Reason line: "Consider clearing context first for single-agent (Option [3])")
Else if coupling == HIGH → single-agent
Else if task_count > 8 AND coupling == LOW → subagent-per-task
Else → single-agent
```

**Present to user:**
```
── Step 5: Implementation ──────────────────────
Plan: <N> tasks, <coupling assessment>
Context: ~<used>K / 200K used, ~<remaining>K remaining
Estimated cost: ~<estimate>K tokens

Recommendation: <Single-agent | Subagent-per-task>
  Reason: <one-line explanation>

Alternatives:
  [1] Single-agent <(recommended) if applicable>
  [2] Subagent-per-task <(recommended) if applicable>
  [3] Clear context + single-agent

Proceed with [N]?
```

Any input other than 1, 2, or 3 re-presents the options.

**Option [3] behavior:** Print: "Start a new conversation and run `/orchestrate --strict` to continue with a fresh context window. Your plan is saved and will be picked up automatically." Then exit. The `--strict` flag is not persisted across sessions — the exit message includes the full command as a reminder.

#### Override Dispatch (--strict only)

After user selects [1] or [2], dispatch to the chosen superpowers skill with a behavioral override block prepended to the dispatch prompt.

**If user selected [1] Single-agent**, dispatch to `superpowers:executing-plans` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate --strict):

1. TDD ENFORCEMENT: You MUST use red-green-refactor for every task.
   Write a failing test first, watch it fail, write minimal code to
   pass, watch it pass, then refactor. No production code without a
   failing test. This is non-negotiable.

2. VERIFICATION GATE: After completing each task, run the project's
   test/build commands and confirm they pass BEFORE proceeding to the
   next task. Do not skip this step.

3. SPEC COMPLIANCE CHECK: After each task, verify: "Did I build
   exactly what the plan specified? Nothing more, nothing less?"
   If you detect drift, fix before proceeding.

4. RETRY ON FAILURE: If tests fail for a task, you have 2 retry
   attempts to fix. If still failing after 2 retries, mark the task
   as BLOCKED and continue to the next task. Report all blocked
   tasks when execution completes.
```

Note: No SKIP CODE QUALITY REVIEW override is included because `executing-plans` does not dispatch separate reviewer subagents — there is nothing to skip.

Single-agent spec compliance limitation: Self-assessment is less reliable than the subagent spec-reviewer, but is the only option without subagent architecture. Drift will be caught by review-code at Step 6.

**If user selected [2] Subagent-per-task**, dispatch to `superpowers:subagent-driven-development` with this preamble prepended:

```
IMPORTANT OVERRIDES FOR THIS EXECUTION (from orchestrate --strict):

1. TDD ENFORCEMENT: The implementer subagent MUST use red-green-refactor
   for every change. Write a failing test first, watch it fail, write
   minimal code to pass, watch it pass, then refactor. No production
   code without a failing test. This is non-negotiable.

2. VERIFICATION GATE: After each task completes, the coordinator
   (not the implementer subagent) must run the project's test/build
   commands and confirm they pass BEFORE marking the task as done.
   Do not rely on the subagent's self-report — run verification fresh.

3. SKIP CODE QUALITY REVIEW: Do NOT dispatch the code-quality-reviewer
   after each task. Quality review is handled by a superior engine
   (review-code with confidence scoring and noise filtering) at a
   later stage. Dispatching both is redundant and wastes tokens.

4. KEEP SPEC COMPLIANCE REVIEW: DO dispatch the spec-reviewer after
   each task. This lightweight "did you build what the plan said?"
   check is essential for catching scope drift.

5. RETRY ON FAILURE: If a subagent's tests fail, allow 2 retry
   attempts. If still failing after 2 retries, mark the task as
   BLOCKED and continue to the next task. Report all blocked tasks
   when execution completes.
```

**Override reliability:** Under context pressure, the superpowers skill's native instructions may take priority over these overrides. The failure mode is benign: the agent may occasionally dispatch the code-quality-reviewer (wasting tokens), skip TDD enforcement, or skip verification (all caught by review-code at Step 6 and the Step 8 verification gate). No destructive failure path exists.

### Step 6: CODE REVIEW

**Trigger:** Implementation commits exist after the plan's last commit. Detect the plan's commit hash via `git log --format=%H -1 -- {plan_path}`. Count commits from that hash to HEAD: `git log --oneline {plan_hash}..HEAD`. Note: use `%H` for commit hashes, not `%aI` for dates.

**Behavior:**
- Count implementation commits since plan was written.
- Present: "Implementation has {N} commits. Ready for code review against the spec?"
- Check for interleaved non-feature commits: compare total `plan_hash..HEAD` count vs `--grep='{feature_name}'` count. If they differ significantly (>50% non-feature commits interleaved), warn: "Other features' commits are interleaved. Code review may include unrelated changes. Proceed or review manually?"
- On confirm: invoke `/review-code {N} {spec_path}` where N = total commits from plan_hash..HEAD (full distance — review-code uses "last N from HEAD"). The spec_path is passed so review-code can detect spec drift.

### Step 7: FIX REVIEW FINDINGS

**Trigger:** `tmp/review_summary.md` exists with Critical or High count > 0 AND the review's commit hashes match the current feature's commits (cross-check to avoid stale review from a different feature).

**Behavior:**
- Present: "Code review found {N} issues ({C} critical, {H} high). Ready to fix?"
- On confirm: read `tmp/review_summary.md` findings, apply fixes per the suggested-fix in each finding.
- Re-run `/review-code` with updated commit count (recount commits since plan hash using same method as Step 6).
- **Loop:** Repeat Steps 6-7 until zero critical and zero high in `tmp/review_summary.md`. On re-review, recount commits since plan hash (same method as Step 6) and pass the updated count.
- **Note:** Does NOT use `/respond-to-review` for code fixes. That skill is for doc review responses, not code reviews. Code fixes are applied directly based on the review's suggested fixes. Re-reviews examine current code — fixed issues will not reproduce. Intentionally deferred items may be re-raised.

### Step 8: COMPLETE

**Trigger:** Code review clean (zero critical, zero high) or user accepts remaining findings.

**Behavior:**
- Present: "All critical/high issues resolved. {M} medium, {L} low remaining. Ready to finalize?"
- No new commit — implementation was committed during Step 5. Step 8 updates roadmap and checks quality gates only.
- If `tmp/current-roadmap.md` exists: update it, mark feature as Done. If no roadmap file, skip this substep.
- Check quality gate triggers (see Quality Gate Triggers section below).
- Present recommendations and "What's next?" with the standard 3 options.
- This completes the cycle for the current feature. The next `/orchestrate` invocation will detect a clean slate (or another in-progress feature) and route accordingly.

**When `--strict` is active**, enrich Step 8 with verification and structured finishing:

#### Verification Gate (--strict only)

Discover and run the project's test/build commands fresh (see Error Handling: test/build command discovery algorithm). If failing:
- "Verification failed. Fix before completing?"
- → Yes: fix failing tests inline, then re-run verification
- → No: proceed with warning in completion output

#### Structured Finishing (--strict only)

After quality gate recommendations, present:

```
── Step 8: Complete ──────────────────────────
Feature: <feature-name>
Status: <Approved | Approved with suggestions | Issues Found>
Verification: <PASS | FAIL with details>

Options:
  [1] Print merge command for <base-branch>
  [2] Keep branch as-is (no action)
  [3] Generate session handoff for next session

Proceed with?
```

**Base-branch resolution:** Use the branch that was checked out when `/orchestrate` was first invoked (captured at Step 1 via `git rev-parse --abbrev-ref HEAD` before any feature branch is created). If not available, prompt the user: "Which branch should this merge into?"

**Option behaviors:**
- [1] Print the `git merge` command for the user to run manually. Do not execute it.
- [2] Exit with no action.
- [3] Dispatch `/session-handoff`.

**Blocked task reporting:** If any tasks were marked BLOCKED during Step 5, include them in the Status field: e.g., "Status: Approved with 2 blocked tasks".

---

## State Detection

Orchestrate detects the current cycle position by scanning artifacts and git history. State detection runs on every invocation — there is no persistent state file. The artifact files and git log ARE the state.

Evaluate the state table top-to-bottom. The first matching trigger determines which step to present:

| Check | Source | Status signal |
|---|---|---|
| Feature identified | `tmp/current-roadmap.md` | Next unimplemented item (if file exists) |
| Spec exists | `docs/superpowers/specs/*-design.md` | File exists for current feature |
| Spec reviewed | Spec file `**Status:**` header (line 4, bold format) | Contains "Approved" (matches both "Approved" and "Approved with suggestions") |
| Spec review has findings | `tmp/review_summary.md` `**Reviewed:**` field | Matches current spec path AND status is "Issues Found" |
| Spec review applied | `tmp/response_analysis.md` | Has entries for current round AND spec status still not "Approved" |
| Plan exists | `docs/superpowers/plans/*-plan.md` | File exists matching spec's feature name |
| Implementation in progress | Plan file checkboxes | Some `- [x]`, some `- [ ]` |
| Implementation complete | Plan file checkboxes + git | All `- [x]` OR commits after plan commit hash |
| Code reviewed | `tmp/review_summary.md` | File exists, commits in findings match current feature |
| Review resolved | `tmp/review_summary.md` Summary table | 0 Critical, 0 High |
| Fixes applied, re-review needed | Commits after reviewed commits | New commits since last review |

### Feature Detection Algorithm

1. Scan `docs/superpowers/specs/` for all `*-design.md` files.
2. For each spec, extract the feature name from the filename.
3. Check if the feature's cycle is complete. A cycle is complete if:
   - (a) Matching plan exists with all checkboxes `[x]` AND `tmp/review_summary.md` is clean (0 Critical, 0 High) with commit hashes matching this feature, OR
   - (b) Feature is marked Done in `tmp/current-roadmap.md` (legacy features completed before orchestrate), OR
   - (c) Plan exists with all unchecked boxes BUT feature-specific commits exist after plan hash AND `tmp/review_summary.md` has 0 Critical/0 High for matching commits (fallback for plans where checkboxes were not tracked).
4. Collect all specs whose cycle is NOT complete.
5. If exactly one incomplete spec: that is the current feature.
6. If multiple incomplete specs: present list: "Found multiple in-progress features: {list}. Which one?"
7. If zero incomplete specs: clean slate, go to Step 1.

### Matching Logic

Spec and plan filenames encode date + feature name (e.g., `2026-03-28-convention-enforcer-design.md` maps to feature `convention-enforcer`). Extract feature name by stripping the date prefix (`YYYY-MM-DD-`) and the `-design`/`-plan` suffix. This feature name is used for:
- Matching specs to plans (same feature name, different suffix).
- Scoping git log searches via `--grep='{feature_name}'`.
- Cross-checking commit hashes in tmp/ review files.

**Known limitation:** Feature names that are prefixes of other feature names (e.g., `implement-plan` vs `implement-plan-monorepo`) may cause inaccurate commit counts due to substring matching. The ambiguity handler (step 3 above) presents both features for user selection, so the critical path is unaffected. Commit counts may be slightly inflated — review-code examines actual diffs, so this is harmless.

### Implementation Detection

To determine if implementation has started or completed:

- Find the plan's commit hash: `git log --format=%H -1 -- {plan_path}`
- Count commits from plan to HEAD: `git log --oneline {plan_commit_hash}..HEAD --grep='{feature_name}'`
- Uses `--grep` for feature scoping by commit message substring matching. Note: `--grep` and pathspec cannot be combined in a single git log command — use `--grep` only.
- Doc/temp commits for the feature are included — review-code examines actual diffs, so inflated count is harmless.
- If count > 0: implementation has started.
- If count > 0 AND all plan checkboxes are `[x]`: implementation is complete, route to Step 6.

### Cross-Checking tmp/ Files

`tmp/review_summary.md` and `tmp/review.json` are global singletons (no feature prefix). They contain results from whatever feature was last reviewed, which may not be the current feature. To avoid attributing a stale review to the wrong feature:

- **Code review with findings:** Parse commit hashes from the `tmp/review.json` issues array `location` fields. Verify those commits appear in `git log --grep='{feature_name}'` output. If commits do not match: treat as stale, ignore.
- **Code review with zero findings (clean review):** A clean review has no commit hashes in findings. To attribute it: check the `**Scope:**` header in `tmp/review_summary.md` (review-code includes the commit range). Verify the commit range overlaps with the current feature's plan_hash..HEAD window. If it doesn't overlap or the header is missing: treat as stale.
- **Doc review:** Verify the `**Reviewed:**` field in `tmp/review_summary.md` matches the current spec path. If it references a different spec: treat as stale, ignore.
- **response_analysis.md:** This file is NOT read by orchestrate for state detection of code reviews. It is only relevant for spec review rounds (Step 3 round counting).

### Ambiguity Handling

- **Multiple in-progress features:** Present list, ask user to pick. Do not auto-select by date.
- **No artifacts at all:** Clean slate, go to Step 1 (suggest from roadmap or ask).
- **Stale artifacts:** If spec exists but is >30 days old with no plan, ask: "Found stale spec for `{name}` from {date}. Continue or start fresh?" Staleness is determined by comparing the date prefix in the spec filename against the current date.
- **Conflicting signals:** If artifacts suggest different steps (e.g., plan exists but spec is not approved), prioritize earlier steps. The spec approval gate must be passed before planning proceeds.

---

## Quality Gate Triggers

Checked after Step 8 (cycle completion) and presented as recommendations. Quality gates are recommended, not invoked — the user decides when to run them.

| Gate | Trigger | Detection | Recommendation |
|---|---|---|---|
| convention-enforcer | >20 files changed since last run | `git diff --name-only {baseline}..HEAD` where baseline = last commit with `convention-enforcer` in message | "Warning: {N} files changed since last convention-enforcer. Run `/convention-enforcer`" |
| api-contract-guard | New module directory created OR >15 files added | `git log --diff-filter=A --name-only {baseline}..HEAD` for new top-level directories or bulk additions | "Warning: New module `{name}` created. Run `/api-contract-guard`" |
| test-audit | >10 commits since last run | `git log --oneline {baseline}..HEAD` where baseline = last commit with `test-audit` in message | "Warning: {N} commits since last test-audit. Run `/test-audit`" |
| document-for-ai | >15 files changed since last run | `git diff --name-only {baseline}..HEAD` where baseline = last commit with `document-for-ai` in message. **Fallback:** If no commit message contains `document-for-ai`, check `git log -- docs/architecture/adrs/ docs/architecture/adrs.md AI_INDEX.md` for the most recent commit touching any ADR artifact. No baseline from either = "never run," always recommend. | "Warning: {N} files changed since last doc update. Run `/document-for-ai`" |
| consolidate | >40 commits since last run | Same pattern with `consolidate` baseline | "Info: {N} commits since last consolidate. Run `/consolidate`" |
| refactor-to-layers | Module exceeds ~30K lines | Scan directories containing source files, `wc -l` (directory detection is project-dependent — scan for directories containing source files) | "Warning: Module `{name}` at {N}K lines. Consider `/refactor-to-layers`" |
| session-handoff | Long conversation (>50 exchanges) or user mentions context pressure | Heuristic based on conversation length (context window usage cannot be directly queried) | "Info: Long conversation. Consider `/session-handoff` before next feature" |

### Detection of "Last Run"

Scan `git log --oneline` for commits whose messages contain the skill name as a substring. This matches both `feat(convention-enforcer):` parenthetical format and `convention-enforcer: ...` prefix format. Most recent such commit = baseline. No such commit = "never run" and always recommend on first trigger check.

For each gate, compute the baseline independently. The baseline is the most recent commit whose message contains the gate's skill name. If no baseline exists, use the repository root (all history counts).

### Presentation Format

```
Feature "{name}" complete.

Recommendations:
  [Warning] 23 files changed since last convention-enforcer -> run /convention-enforcer
  [Info] Long conversation -- consider /session-handoff before next feature

What's next?
  > Next feature (continue with /orchestrate)
  > Run a recommendation above
  > Something else (tell me what you need)
```

- Warnings first, info second.
- Max 3 recommendations at a time. If more than 3 gates trigger, show the top 3 by priority.
- Priority order: convention-enforcer > api-contract-guard > test-audit > document-for-ai > consolidate > refactor-to-layers > session-handoff.
- User can always choose "something else" — never locked into recommendations.
- "What's next?" always offers 3 options: next feature, run a recommendation, or something else.

---

## Error Handling

Handle each scenario gracefully. Never crash or leave the user without options.

| Scenario | Behavior |
|---|---|
| No roadmap file found | Ask: "What feature would you like to work on?" Skip roadmap suggestion. |
| Spec exists but cannot determine feature name | Ask: "Which feature is this spec for?" Present the filename for context. |
| Multiple specs without plans | Present list with dates and status, ask user to pick. |
| Invoked skill fails | Report the failure with context, offer: "Retry / Skip to next step / Exit" |
| Git history unavailable | Skip quality gate trigger checks, warn: "Cannot check quality gate triggers without git history." Core loop still works via file scanning. |
| Long conversation / context pressure | Recommend `/session-handoff` before proceeding. Context exhaustion is handled by the resume mechanism — the next `/orchestrate` invocation detects state from artifacts regardless of session history. |
| User says "something else" | Exit orchestrate, let user do whatever they want. `/orchestrate` will re-detect state next time. |
| Stale artifacts (>30 days) | Ask: "Found stale spec for `{name}` from {date}. Continue or start fresh?" If start fresh, do not delete old artifacts — user handles cleanup. |
| Plan partially completed | Present progress: "{N}/{M} tasks done. Resume?" Show which tasks remain. |
| No roadmap to update at Step 8 | Skip roadmap update, proceed to quality gate check. |
| tmp/review_summary.md has stale data from different feature | Cross-check commit hashes in findings against current feature's commits via `git log --grep`. If mismatch, ignore and treat as "no review yet." |
| Verification gate fails at Step 8 (--strict) | Offer to fix failing tests inline and re-run verification, or proceed with warning |
| All tasks BLOCKED at Step 5 (--strict) | Report blocked list, skip to Step 6 (review-code reviews what was committed) |
| No test/build command discoverable (--strict) | Discovery algorithm: (1) check CLAUDE.md for test/build commands, (2) check package.json scripts (test, build), (3) check for Makefile (test target), (4) probe for pytest/jest/cargo test. If none found, skip verification gate with: "No verification command found. Configure test commands in CLAUDE.md." |
| Base-branch unknown at Step 8 (--strict) | Prompt user: "Which branch should this merge into?" |
| Override ignored by superpowers (--strict) | Benign — redundant quality review wastes tokens, caught by review-code at Step 6 |
| --strict with --max-iterations 0 on review-code (Step 6) | Allowed — --strict does not force review-code iterations |
| Context pressure during Step 5 (--strict) | Execution model recommendation already accounts for this; if single-agent was chosen and pressure builds mid-execution, the agent continues (superpowers handles context naturally) |

---

## Relationship to Other Skills

Orchestrate is a **dispatcher** — it invokes these skills (one per `/orchestrate` invocation) but does not modify or extend them:

| Skill | When invoked | Invocation syntax |
|---|---|---|
| superpowers:brainstorming | Step 1 (new feature) | `superpowers:` plugin skill |
| /review-doc | Step 2 (spec review) | User-level `/` skill |
| /respond-to-review | Step 3 (fix spec review findings) | User-level `/` skill |
| superpowers:writing-plans | Step 4 (write plan) | `superpowers:` plugin skill |
| superpowers:subagent-driven-development | Step 5 (implement, default + --strict subagent) | `superpowers:` plugin skill |
| superpowers:executing-plans | Step 5 (implement, --strict single-agent) | `superpowers:` plugin skill |
| /review-code | Step 6 (code review) | User-level `/` skill |
| /session-handoff | Error handling (context pressure) | ai-dev-tools plugin skill |

**Note on invocation syntax:** Skills from the `superpowers` plugin use the `superpowers:` prefix. User-level skills at `~/.claude/skills/` use the `/` prefix. ai-dev-tools plugin skills use `/ai-dev-tools:` prefix or `/` if installed. Orchestrate uses whichever syntax the skill requires.

**Quality gates** are recommended after cycle completion, not automatically invoked:

| Gate skill | Trigger type |
|---|---|
| /convention-enforcer | File count threshold |
| /api-contract-guard | New directory or bulk file additions |
| /test-audit | Commit count threshold |
| /document-for-ai | File count threshold |
| /consolidate | Commit count threshold |
| /refactor-to-layers | Line count threshold |
| /session-handoff | Conversation length heuristic |

**Manual only:** /refactor-to-monorepo has no automatic trigger — it is never recommended by orchestrate. The user decides when the codebase needs monorepo extraction.

---

**Design constraint:** Orchestrate never modifies the SKILL.md files of skills it dispatches. Each skill operates independently with its own definition. In standard mode, orchestrate only detects state, presents context, and invokes. With `--strict`, orchestrate may prepend behavioral override blocks to dispatch prompts — this is composition (prompt-level hints), not modification (file changes). Dispatched skills may ignore these overrides; the failure mode is benign.
