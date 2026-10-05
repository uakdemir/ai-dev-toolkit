# Stage i: Spec Review (Two-Phase)

Orchestrate composes phase structure by making two serial `/review-doc` calls.

---

## Phase 1 — Exploration (no fact-check)

```bash
/review-doc <spec> --fact-check false --max-iterations 2 --run-id <run_id>-phase1
```

- Model and effort: neither `--model` nor `--effort` is passed, so `review-doc` selects its default, the `max` agent, and names no model. Whether this stage's sub-agent can dispatch that agent is for Claude Code's spawn-depth cap to decide, and no nested run has measured it: `references/shared-rules/agent-dispatch-pin.md`
- No fact-check
- Up to 2 iterations with early-exit on 0 criticals

## Phase 2 — Rigorous (fact-check on)

```bash
/review-doc <spec> --fact-check true --max-iterations 2 --run-id <run_id>-phase2
```

- Model and effort: neither `--model` nor `--effort` is passed, so `review-doc` selects its default, the `max` agent, and names no model. Whether this stage's sub-agent can dispatch that agent is for Claude Code's spawn-depth cap to decide, and no nested run has measured it: `references/shared-rules/agent-dispatch-pin.md`
- Fact-check enabled
- Up to 2 iterations

Phase 2 **always runs** regardless of phase 1 outcome.

---

## Handoff Between Phases

The spec file on disk is the state. Phase 1 mutates the spec via its fixer and exits. Phase 2 reads the already-improved spec and iterates further. No in-memory state threading.

---

## Phase Commits

After each phase completes, orchestrate checks `git diff --quiet <spec_path>`:
- Changed → `git add <spec_path> && git commit -m "chore(auto): <spec-slug>: spec review phase N fixes"`
- Unchanged → skip commit

---

## Profiling

After each phase dispatch (phase 1 and phase 2) returns, append one JSONL entry to the profiling log per the protocol in `references/auto/profiling-log.md`.

- Phase 1 entry: `action=review-doc`, `round=1`, `model=inherited`.
- Phase 2 entry: `action=review-doc`, `round=2`, `model=inherited`.
- Write failures are silently swallowed; profiling never blocks the pipeline.

---

## Failed Review Runs

After each phase dispatch returns, determine whether the run reported **Error** under
`references/shared-rules/run-failure-disclosure.md` — a review that could not complete, as distinct
from one that completed and found problems. If it did:

1. Record it in `tmp/_reviews_errors/error-logs.md` (`SKILL.md` > Auto Mode > Completion).
2. Increment `R`, the review-failure counter initialised at `SKILL.md` > Auto Mode > Initialization
   and printed by `stage-iv-verification-gate.md` step 4.
3. Treat the dispatch as a crash and apply `../failure-handling/retry-semantics.md`.

---

## Unresolved-Criticals Check

Applies ONLY to phase 2's final iteration (not phase 1):
- Phase 2 final iter pre-fix criticals == 0 → success, continue pipeline
- Phase 2 final iter pre-fix criticals > 0 → Q2 failure (see `../failure-handling/unresolved-criticals.md`)

Phase 1's exit state is irrelevant for this check.

**Bounded worst case:** 2 dispatches (one per phase), 4 review iterations, per spec.

---

## Next Stage

When stage i is complete (both phases done, commits made if applicable), update `tmp/auto-state.md` state to `spec-review-phase-2-complete`, then load and execute `references/auto/stages/stage-ii-implement.md`.

**Do NOT skip this step. Do NOT proceed to implementation without loading the stage ii file.**
