---
name: warn-supabase-migration-skip
enabled: true
event: bash
pattern: supabase\s+db\s+(push|execute|reset)\b
action: warn
---

**Supabase schema change without a migration file.**

Applying schema changes via `supabase db push`, `supabase db execute`,
or `supabase db reset` without a committed migration file bypasses
migration history. Without a migration file, teammates and production
cannot reproduce the change.

Correct flow:
1. Edit the schema (via `supabase migration new <name>` or hand-write
   a migration file under `supabase/migrations/`).
2. Apply with `supabase db reset` (local) or
   `supabase db push` (after the migration file exists and is committed).
3. Commit the migration file so production deploys can pick it up.

Only skip this if you are deliberately running an ad-hoc fix on a
branch database and plan to write the migration immediately afterwards.
