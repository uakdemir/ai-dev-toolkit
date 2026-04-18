# Stage i: Spec Review (Two-Phase)

Orchestrate composes phase structure by making two serial `/review-doc` calls.

---

## Phase 1 — Cheap sonnet exploration

```bash
/review-doc <spec> --fact-check false --max-iterations 2 --run-id <run_id>-phase1
```

- Model: sonnet (default)
- No fact-check
- Up to 2 iterations with early-exit on 0 criticals

## Phase 2 — Rigorous opus + fact-check

```bash
/review-doc <spec> --fact-check true --model opus --max-iterations 2 --run-id <run_id>-phase2
```

- Model: opus
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

- Phase 1 entry: `action=review-doc`, `round=1`, `model=sonnet`.
- Phase 2 entry: `action=review-doc`, `round=2`, `model=opus`.
- Write failures are silently swallowed; profiling never blocks the pipeline.

---

## Endless-Loop Check

Applies ONLY to phase 2's final iteration (not phase 1):
- Phase 2 final iter pre-fix criticals ≤ 1 → success, continue pipeline
- Phase 2 final iter pre-fix criticals > 1 → Q2 failure (see `failure-handling/endless-loop.md`)

Phase 1's exit state is irrelevant for the endless-loop check.

**Bounded worst case:** 2 + 2 = 4 review dispatches per spec.

---

## Next Stage

When stage i is complete (both phases done, commits made if applicable), update `tmp/auto-state.md` state to `spec-review-phase-2-complete`, then load and execute `references/auto/stages/stage-ii-implement.md`.

**Do NOT skip this step. Do NOT proceed to implementation without loading the stage ii file.**
