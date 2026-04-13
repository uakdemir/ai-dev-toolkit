# Error Log Templates

Templates for `tmp/_reviews_errors/error-logs.md` entries.

---

## Q2 (Endless Loop) — Warning

```
[YYYY-MM-DD HH:MM:SS] <run_id> Warning  <spec>.md: <agent-name> endless loop at iter <N>, <M> criticals remaining, committed wip, skipped spec
```

## Q3 Agent i Crash — Error

```
[YYYY-MM-DD HH:MM:SS] <run_id> Error    <spec>.md: agent i <phase-N> crashed twice, skipped spec
```

## Q3 Agent ii Crash — Error

```
[YYYY-MM-DD HH:MM:SS] <run_id> Error    <spec>.md: agent ii implement crashed twice, halting pipeline, wip committed at <short-hash>
```

## Q3 Agent iii Crash — Error

```
[YYYY-MM-DD HH:MM:SS] <run_id> Error    <spec>.md: agent iii code-review iter <N> crashed twice, rolled back to <target>, stashed, skipped spec
```
