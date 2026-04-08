---
name: block-sql-writes
enabled: true
event: bash
pattern: \b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|DROP\s+|ALTER\s+TABLE|TRUNCATE\s+)\b
action: block
---

**SQL write operation blocked.**

Never run write/update/delete queries on the database. Provide the SQL for the user to run manually. Read-only SELECT queries are OK.
