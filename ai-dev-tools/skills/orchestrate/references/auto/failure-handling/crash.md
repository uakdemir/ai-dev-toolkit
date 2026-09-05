# Q3: Crash After Retry

**Trigger:** a stage failed, the single retry (`retry-semantics.md`) also failed.

---

## Response — one shape, whatever crashed

1. **Preserve the work exactly as it is.** If the working tree has changes, wip-commit them:
   `wip(auto): <spec-slug>: <stage> crashed after retry — see tmp/_reviews_errors/error-logs.md`
   Stage every modified and untracked file. If the tree is clean, skip the commit.
2. **Do not rewind.** No `git reset`, no stash, no rollback to an anchor. The crashed state is the
   most informative thing the run produced, and it is what a human needs to look at.
3. **Log an Error** to `tmp/_reviews_errors/error-logs.md`.
4. **State** → `stopped-crash-<stage>` in `auto-state.md`.
5. **Exit non-zero.** The run is over.

## Why there is only one response

There used to be three, and they differed only in what state the tree had to be left in **so the
next spec could start**: a spec-review crash skipped without committing (text artifacts are inert),
an implement crash halted the whole batch (uncommitted broken code could contaminate later specs),
and a code-review crash soft-reset to a rollback anchor and stashed, so the tree was clean for the
spec that followed.

Auto mode now runs exactly one spec. Nothing follows, so there is nothing to protect from
contamination and nothing to leave a clean tree for. The rewind was never for the crashed run's
benefit — it destroyed the evidence that run had just produced.

## Recovery

The wip commit is on the branch and the tree is untouched. Inspect it, fix what broke, and re-invoke
`/orchestrate --auto` on the same spec, or continue by hand from where it stopped.
