---
name: orchestrate
argument-hint: "[--auto <spec>] [--handoff] [--use-roadmap]"
description: "Use when the user wants to start a development cycle, continue where they left off, check what's next, or run an automated brainstorm-review-implement-review-commit pipeline — even if they don't use the exact skill name."
---

<help-text-loader>
When `--help` is present: read `references/common/help.md`, print its content verbatim, and exit.
</help-text-loader>

# Argument Parsing

```
/orchestrate [--auto <spec>] [--handoff] [--use-roadmap] [--help]
```

Parse in order:
1. `--help` → load and print `references/common/help.md`, exit.
2. `--auto <spec>` → take the single positional arg as the spec path, set auto mode.
3. `--handoff` → set handoff flag.
4. `--use-roadmap` → set roadmap flag.

**Hard errors at argparse time:**
- `--handoff` + `--auto` → `Error: --handoff and --auto are incompatible. --auto is a targeted post-brainstorm pipeline run; --handoff is for resuming standard-mode sessions. Use one or the other.`
- `--use-roadmap` + `--auto` → `Error: --use-roadmap is not supported in --auto mode. Refactor-unit execution requires the interactive standard-mode flow.`
- `--auto` with no positional args → `Error: --auto requires a spec path. Usage: /orchestrate --auto <spec>`
- `--auto` with more than one positional arg → `Error: --auto takes exactly one spec. Run it once per spec.` and exit. Auto mode used to queue several and process them serially; that is gone. It was never parallel — the only thing the queue bought was a skip-and-continue failure path, and its rewind machinery destroyed the evidence of the failure it was recovering from.

---

# Mode Dispatch

```
IF --auto flag present:
    → Auto mode (below)
ELSE:
    → Standard mode (below)
```

---

# Standard Mode

Re-invocable state machine: detect cycle position, suggest next step, invoke skill on confirm. One step per invocation. State from artifacts + hint file, not session history.

## Initialization Sequence

1. **Handoff check:** If `--handoff` → load `references/standard/session-handoff.md`, process, then continue.
2. **Session Bootstrap:** Load `references/standard/session-bootstrap.md`, run bootstrap logic.
3. **Fast-Path Detection:** Load `references/standard/fast-path-detection.md`, determine current step.
4. **User Prompt (if needed):** Load `references/standard/user-prompt.md` when no valid cycle state.
5. **Roadmap check:** If `--use-roadmap` → load `references/standard/refactor-roadmap-check.md`.

## Step Dispatch

Load the step file for the detected step and execute:

| Step | File | Trigger |
|---|---|---|
| 1 | `references/standard/steps/step-1.md` | No spec for feature |
| 2 | `references/standard/steps/step-2.md` | Spec exists, not reviewed |
| 3 | `references/standard/steps/step-3.md` | Review has criticals |
| 4 | `references/standard/steps/step-4.md` | Spec approved, no plan |
| 5 | `references/standard/steps/step-5.md` | Plan exists, not implemented |
| 6 | `references/standard/steps/step-6.md` | Implementation done, needs review |
| 7 | `references/standard/steps/step-7.md` | Review clean or user accepts |

## Hint File

Protocol defined in `references/standard/hint-file-protocol.md`. Written at end of every invocation.

## Exit Output Format

Every exit point MUST end with the breadcrumb as the literal last line(s). No prose, no commentary after the breadcrumb. Commands-only, one per line. The user copy-pastes them.

**Commit breadcrumbs:** When a step produced changes (inner skill modified files), include `/commit` as the first breadcrumb line before the next-step command(s).

`/commit` is a **prerequisite, not a plugin command.** This plugin ships no `commands/` directory and `plugin.json` declares none, so `/commit` resolves only where the user already has it. It leads every breadcrumb in steps 1-7 because the breadcrumb format is commands-only — one per line, no labels, no annotations — which leaves nowhere to explain a fallback inline. If it is unavailable, the equivalent is an ordinary `git add -A && git commit`. Stated here once rather than in eight step files.

**Phase boundaries:** Steps advancing across phases prepend `/clear → ` to recommend clearing context. Phase boundaries: Step 3→4, Step 5→6, Step 6→7.

**When NOT to emit:** Mid-conversation clarifying questions, tool-output displays, internal retries.

## Wrapped Next-Command Output

When orchestrate receives `/orchestrate (/some-command args)`:
1. Run full initialization sequence (Session Bootstrap, Fast-Path Detection).
2. Extract inner command from parentheses.
3. Dispatch via Skill tool.
4. After inner command completes, orchestrate resumes for state update + breadcrumb.

User modifications to inner command before pasting → dispatch verbatim. Receiving a wrapped command targeting a step beyond hint step → treat as implicit confirmation of prior steps.

## Error Handling

| Scenario | Behavior |
|---|---|
| Hint file missing/malformed | User Prompt. Write hint after resolution. |
| Unknown step or head not in history | User Prompt. Write hint after resolution. |
| Hint says finalized but spec deleted | Reset to step 1. |
| Validation contradicts hint step | Advance to next logical step. |
| references/ file missing | Error: "orchestrate reference file missing: {path}. Re-install the ai-dev-tools plugin." |
| Invoked skill fails | Report failure, offer: Retry / Skip / Exit. |

---

# Auto Mode

**Invariants:** No user prompts, no hint file, no breadcrumbs. Progress via status lines only. One spec per run. Non-destructive failure handling.

## Initialization

1. **Spec validation:** verify the positional spec arg exists, is readable, and ends in `.md`/`.markdown`. Any failure → hard error, exit.
2. **Stale-state check:** if `tmp/auto-state.md` exists and `state != finalized`, warn and overwrite.
3. **Initialize state:** set `spec_baseline = HEAD`, then write `tmp/auto-state.md` with all four fields the schema requires — `spec`, `state: started`, `datetime`, `spec_baseline`. Schema: `references/auto/auto-state-schema.md`.
4. **Initialize the review-failure counter:** set `R = 0`. It lives in orchestrate's own run state and is never written to `tmp/auto-state.md`. Stage i and stage iii increment it; stage iv prints it (see Completion below).

## Pipeline

Load `references/auto/pipeline-overview.md` for the 4-stage pipeline overview.

Auto mode takes **one** spec:
1. Generate `spec_hash` (8-char base36) for run-id prefix.
2. Load and execute `references/auto/stages/stage-i-spec-review.md`. Each stage file directs you to the next stage upon completion — do NOT skip ahead or look up stage file paths yourself.
3. On any failure → load `references/auto/failure-handling/overview.md` + specific handler.

## Error Logs

Format defined in `references/common/error-logs-format.md`. Templates in `references/auto/failure-handling/error-log-templates.md`.

## State Management

Schema in `references/auto/auto-state-schema.md`. Auto mode never reads or writes `tmp/orchestrate-state.md`.

## Completion

Stage iv prints the completion line and exits — `references/auto/stages/stage-iv-verification-gate.md` owns that output. Auto mode adds one line of its own, immediately before it, and only when `R > 0`:

`[auto] R review failures recorded in tmp/_reviews_errors/error-logs.md`

No succeeded/skipped/halted tally: one spec runs, and a run that fails never gets here — Q2 and Q3 both stop the run and exit non-zero (`references/auto/failure-handling/overview.md`).

`R` counts review runs that reported **Error** under `references/shared-rules/run-failure-disclosure.md` — a review that could not complete, as distinct from one that completed and found problems. Such a run leaves its artifact unwritten or unvalidatable, which is a crash under `references/auto/failure-handling/retry-semantics.md`: retry once, and if the retry also fails, `references/auto/failure-handling/crash.md` stops the run. Auto mode never prompts on those; it records each one in `tmp/_reviews_errors/error-logs.md` and increments `R`, which orchestrate holds in its own run state and never persists — so reaching this section with `R > 0` means a review failed and its retry succeeded. The count is here because the useful signal is the *rate*: an occasional failure is noise, a frequent one means a reviewer prompt needs work, and that comparison is only possible if every failure lands in one place and is counted.
