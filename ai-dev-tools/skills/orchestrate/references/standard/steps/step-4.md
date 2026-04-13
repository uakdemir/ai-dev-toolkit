# Step 4: Write Plan

**Trigger:** Spec Approved, no matching plan.

---

## Action

Invoke `superpowers:writing-plans`. Prepend to dispatch prompt: "After saving the plan, do NOT present the Execution Handoff section. Return control to the caller. Orchestrate manages execution model selection at Step 5."

If writing-plans still presents an Execution Handoff, ignore it and proceed.

**ADR extraction is removed.** Step 4 is a thin wrapper around `/writing-plans` with no pre-work.

## Breadcrumb

After plan file is saved:

```
/commit
/orchestrate (/implement <plan_path>)
/orchestrate (/review-doc <plan_path>)
```

- Option 1: commit the plan
- Option 2: implement the plan (recommended)
- Option 3: review the freshly-written plan first (optional extra layer)

Edge: writing-plans failure → offer retry/exit.
