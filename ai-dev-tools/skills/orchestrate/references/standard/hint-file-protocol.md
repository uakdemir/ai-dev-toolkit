# Hint File Protocol

`tmp/orchestrate-state.md` — YAML frontmatter persisting detected state between invocations.

---

## Fields

| Field | Type | Purpose |
|---|---|---|
| `feature` | string | From spec filename, `""` if none |
| `step` | number or `finalized` | Current state machine step (1-7 or `finalized`) |
| `spec` | path | Full path to spec file, `""` if none |
| `plan` | path | Full path to plan file, `""` if none |
| `plan_hash` | 40-char SHA or `""` | From `git log --format=%H -1 -- {plan_path}` when first writing hint at step 5+ |
| `head` | 40-char SHA | `git rev-parse HEAD` at hint-write time |
| `updated` | ISO timestamp | When hint was last written |

**Removed fields:** `mode` (no strict mode in overhaul).

---

## Write Rules

Written at end of every orchestrate invocation.

| Event | `step` value written |
|---|---|
| Step 1-7 presented | The step number |
| User overrides or exits | The detected step |

When routing to Step 1 from `finalized`, write hint with `feature: ""`, `spec: ""`, `plan: ""`, `plan_hash: ""`, `step: 1`. The hint file is never deleted. `finalized` is a valid state.

**Validation:** Read hint → compare `head` to `git rev-parse HEAD` → run step-specific check.
