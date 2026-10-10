# Step 7: Complete

**Trigger:** Review clean (zero critical/high), a review that ended `Not reviewed (MECHANICAL)` (step 6 Case M), or user accepts remaining.

---

## Phase 1 (Pre-confirmation)

Present:
```
── Step 7: Complete ──────────────────────────────
Feature: <feature-name>
Status: <Approved | Approved with suggestions | Incomplete | Not reviewed (MECHANICAL)>
Not inspected: <files from coverage.not_inspected, or omit this line entirely>

Ready to finalize?
```

When the hint's `review` is `mechanical`, the status is `Not reviewed (MECHANICAL)` and the `Not inspected:` line is omitted: that review wrote no summary or JSON, so the ones on disk are an earlier run's and are not read.

## Phase 2 (Post-confirmation)

1. Update hint to `finalized`.
2. If `--use-roadmap` was active: load `references/standard/refactor-roadmap-check.md` for roadmap marking logic.
3. **Tasks file** (only when one exists — discovery order in `${CLAUDE_PLUGIN_ROOT}/references/tasks-file.md`): update the tasks this cycle advanced. Set `Evidence:` to the commit or `file:line` that proves the current state. Apply the completion rule — check the box only when the acceptance criteria and required validation pass. Where validation was skipped, record the gap on the task and leave the box unchecked; do not mark incomplete work done. If the file exists in more than one location, update none of them — surface the conflict and leave every copy untouched until the user says which is authoritative. The `/commit` breadcrumb below carries the edit, which is the point: a cycle that finalized without touching the tasks file shows the omission in the diff.

## Breadcrumb

```
/commit
/orchestrate
```

`/orchestrate` starts the next cycle — Step 1 detection invokes brainstorming internally.

## Roadmap Integration (only when `--use-roadmap` was passed)

Mark completed unit `[x]`. Print: "Unit `<completed>` done. Next: `<next-unit>`." Suggest brainstorming for next unit. If confirmed, write hint and invoke originating refactor skill with `--next-unit`.
