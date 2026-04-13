# Rollback Mechanism (Non-Destructive)

---

## Procedure

```bash
# Never destructive — soft reset + stash
git reset --soft <rollback_target>
git stash push --include-untracked \
  -m "wip(auto): <spec> <stage> iter <N> crashed"
```

After: HEAD = rollback_target, working tree clean, crashed work preserved in a named stash entry.

---

## Recovery

User can inspect with:
```bash
git stash list
git stash show -p stash@{0}
git stash pop          # recover if desired
```

---

## Key Constraint

`git reset --hard` is **NEVER** used in auto mode. All rewinds use `git reset --soft` + stash.
