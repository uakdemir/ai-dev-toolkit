# Fast-Path Detection Algorithm

Runs after Session Bootstrap completes.

---

```
1. Read tmp/orchestrate-state.md
   ├── Not found or no valid cycle state (missing/empty `feature` field)
   │    → User Prompt
   └── Found → compare head field to current git rev-parse HEAD
        ├── Same HEAD → trust hint, skip to step-specific validation
        └── Different HEAD → lightweight validation:
             git log --oneline <hint_head>..HEAD
             ├── 0 commits or git log errors → User Prompt
             ├── Commits match feature name (git log --grep) → advance step
             └── Commits don't match feature → User Prompt

2. If step == "finalized":
   ├── Same HEAD → write hint (step: 1, clear all fields) → route to Step 1
   └── Different HEAD → User Prompt
```

---

## Step-Specific Validation

One tool call each:

| Step | Check | Action on contradiction |
|---|---|---|
| 1 | spec not exist | If exists → advance to 2 |
| 2 | spec Status header | Check review status |
| 3 | review-doc-summary Reviewed matches hint spec AND Critical/High counts | Critical>0: stay. Critical=0 + High>0: advance to 4. Critical=0 + High=0: advance to 4. Mismatch: stale, route to 2 |
| 4 | plan exists | — |
| 5 | commits since plan_hash | Implementation progress check |
| 6 | commits since plan_hash via `git log <plan_hash>..HEAD` | If plan_hash empty, populate via `git log --format=%H -1 -- {plan_path}` |
| 7 | review-code-summary criticals/highs | — |

If validation contradicts hint, advance to next logical step (don't rescan).

**Exit:** Fast-path detection itself does not emit a breadcrumb. It hands off to the resolved step.
