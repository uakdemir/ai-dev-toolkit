# Stage iv: Verification Gate

> **GATE CHECK — MANDATORY**
> Read `tmp/auto-state.md`. Verify `state` matches `code-review-iter-{N}-complete` for some N.
> If it does NOT, you have skipped stage iii (code review). **STOP. Go back and execute stage iii first.**
> Do not proceed under any circumstances if this gate fails.

No agent dispatch. Orchestrate runs this directly.

---

## Current Release (No-Op)

This project has no test runner, so stage iv is a no-op. That is not the same as having nothing to
verify — the repo's root `CLAUDE.md` declares six static gates under `scripts/` as mandatory before a
commit — but running them from the pipeline is not part of this release, and auto mode's commits land
without them.

1. **(No-op)** Test-runner detection deferred to future work.
2. If a future release introduces verification fixes, commit: `chore(auto): <spec-slug>: verification fixes`
3. Transition to `finalized` in `auto-state.md` — the terminal state the next run's stale-state check reads. Writing it after the exit would leave every successful run reported as incomplete.
4. If `R > 0`, print the review-failure line auto mode holds: `[auto] R review failures recorded in tmp/_reviews_errors/error-logs.md`. This is the only line auto mode adds here; it must print before the completion log, not after the exit.
5. Print completion log: `✓ <spec-slug> complete (spec_baseline..HEAD: N commits)`
6. Exit.
