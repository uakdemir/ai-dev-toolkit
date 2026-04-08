---
name: warn-db-push
enabled: true
event: bash
pattern: db:push|drizzle-kit\s+push
action: warn
---

**Prefer `db:migrate` over `db:push`.**

`db:push` bypasses migration history and can cause unpredictable schema state. Always prefer the migrate command for reviewable, repeatable changes.

Only use `db:push` as a fallback when migrate fails to apply (e.g., journal thinks migration already ran).
