# Step 5: Implement

**Trigger:** Plan exists, implementation not confirmed complete.

---

## Action

Step 5 is a delegating wrapper: orchestrate does NOT inline plan detection, task graph, or execution model dispatch — all of that lives in `/implement`.

Read the `plan:` field from the hint file. If `plan:` is empty or the plan file does not exist, emit error and route to Step 4:

```
No plan found for the current feature. Run /writing-plans <spec> first to produce a plan, then re-invoke orchestrate.
```

Otherwise, emit the breadcrumb and exit.

## Post-`/implement` Resume

After `/implement` returns, check for `tmp/implement-exit-status.md`:

- **Marker exists AND contains `early_exit: clear_context`:** Do NOT write `step: 6` (hint stays at `step: 5`). Delete the marker. `/implement` has already printed its own breadcrumb.
- **Marker absent OR no `early_exit: clear_context`:** Write `step: 6` to hint, emit phase-boundary breadcrumb.

## Breadcrumb

Pre-dispatch:
```
/orchestrate (/implement <plan-path>)
```

Post-dispatch (normal completion, phase boundary):
```
/commit
/clear → /orchestrate (/review-code <N> --against <spec_path> --max-iterations 3)
```

Edge: user explicitly states implementation is done → advance to Step 6. 0 commits since plan_hash → stay at Step 5, emit `/implement` breadcrumb. If user confirms done with 0 commits: advance with warning.
