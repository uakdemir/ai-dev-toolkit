# Error Log Templates

Templates for `tmp/_reviews_errors/error-logs.md` entries.

`<spec-filename>` is the spec basename with its extension, defined in `../pipeline-overview.md` >
Spec Name Tokens.

---

## Q2 (Unresolved Criticals) — Warning

```
[YYYY-MM-DD HH:MM:SS] <run_id> Warning  <spec-filename>: <agent-name> unresolved criticals at iter <N>, <M> criticals remaining, committed wip, stopped
```

## Q3 (Crash After Retry) — Error

One template, whatever crashed. `crash.md` has one response and no stage column, so there is nothing
for a per-stage template to differ on.

```
[YYYY-MM-DD HH:MM:SS] <run_id> Error    <spec-filename>: <stage> crashed twice, wip committed at <short-hash>, stopped
```

`<stage>` is the crash-site token defined in `crash.md` > Response — the same one used in its wip
commit message and in `stopped-crash-<stage>`. If `crash.md` step 1 staged nothing and made no
commit, write `nothing to commit` in place of `wip committed at <short-hash>`.

## Stage iii coverage hole — Warning

Written when the final agent iii iteration still reports a non-empty `coverage.not_inspected`
(`../stages/stage-iii-code-review.md` > Early Exit). The run continues.

```
[YYYY-MM-DD HH:MM:SS] <run_id> Warning  <spec-filename>: agent iii iter <N> coverage hole, files not inspected: <list>
```

## Stage iii schema check waived — Warning

Written when `node` is unavailable and the artifact's schema validation cannot run
(`../stages/stage-iii-code-review.md` > Successful iteration definition). The run continues.

```
[YYYY-MM-DD HH:MM:SS] <run_id> Warning  <spec-filename>: agent iii iter <N> schema validation not run: node unavailable
```
