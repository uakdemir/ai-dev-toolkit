---
name: orchestrate
description: "Use when the user wants to start a development cycle, continue where they left off, check what's next, or run an automated brainstorm-review-implement-review-commit pipeline — even if they don't use the exact skill name."
---

<help-text-loader>
When `--help` is present: read `references/common/help.md`, print its content verbatim, and exit.
</help-text-loader>

# Argument Parsing

```
/orchestrate [--auto <spec...>] [--handoff] [--use-roadmap] [--help]
```

Parse in order:
1. `--help` → load and print `references/common/help.md`, exit.
2. `--auto <spec...>` → collect all positional args as spec paths, set auto mode.
3. `--handoff` → set handoff flag.
4. `--use-roadmap` → set roadmap flag.

**Hard errors at argparse time:**
- `--handoff` + `--auto` → `Error: --handoff and --auto are incompatible. --auto is a targeted post-brainstorm pipeline run; --handoff is for resuming standard-mode sessions. Use one or the other.`
- `--use-roadmap` + `--auto` → `Error: --use-roadmap is not supported in --auto mode. Refactor-unit execution requires the interactive standard-mode flow.`
- `--auto` with no positional args → `Error: --auto requires at least one spec path. Usage: /orchestrate --auto <spec1> [<spec2> ...]`

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

**Invariants:** No user prompts, no hint file, no breadcrumbs. Progress via status lines only. Serial spec processing. Non-destructive failure handling.

## Initialization

1. **Spec validation:** verify all positional spec args exist, are readable, end in `.md`/`.markdown`. Any failure → hard error, exit.
2. **Stale-state check:** if `tmp/auto-state.md` exists and `state != finalized`, warn and overwrite.
3. **Initialize state:** write `tmp/auto-state.md` with spec list.

## Per-Spec Pipeline

Load `references/auto/pipeline-overview.md` for the 4-stage pipeline overview.

For each spec:
1. Generate `spec_hash` (8-char base36) for run-id prefix.
2. Set `spec_baseline = HEAD`.
3. Load and execute `references/auto/stages/stage-i-spec-review.md`. Each stage file directs you to the next stage upon completion — do NOT skip ahead or look up stage file paths yourself.
4. On any failure → load `references/auto/failure-handling/overview.md` + specific handler.

## Error Logs

Format defined in `references/common/error-logs-format.md`. Templates in `references/auto/failure-handling/error-log-templates.md`.

## State Management

Schema in `references/auto/auto-state-schema.md`. Auto mode never reads or writes `tmp/orchestrate-state.md`.

## Completion

After all specs processed (or pipeline halted):
- Print summary: `[auto] complete: N succeeded, M skipped, K halted`
- Exit.
