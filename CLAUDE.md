# ai-dev-toolkit

Source repo for the `ai-dev-tools` Claude Code plugin. The plugin is installed via a local
`directory` marketplace pointing at `ai-dev-tools/`, so **this working tree _is_ the plugin** —
edits go live after `/reload-plugins`. No `git push` is required for local use.

## Gate — manifest changes must pass strict validation

Any change to `ai-dev-tools/.claude-plugin/plugin.json` or `ai-dev-tools/.claude-plugin/marketplace.json`
MUST pass this before being committed:

```bash
claude plugin validate ./ai-dev-tools --strict
```

**A JSON parse check is not sufficient.** In the 2.6.0 refresh, `repository` was written in the
object form `{"type":"git","url":"…"}` — perfectly valid JSON, and rejected by the plugin loader:

```
plugins[0] plugin.json → repository: Invalid input: expected string, received object
```

That single field failed the **entire plugin load** (17 → 16 plugins, all 15 skills unavailable),
and the only user-visible symptom was a generic `1 error during load` plus `Unknown command`.
The validator names the offending field in one line; nothing else in the pipeline does.

## Gate — shared rules and count semantics

A rule that governs more than one skill lives in `ai-dev-tools/references/shared-rules/*.md` and
names the skills it governs. Before committing a change to any review skill, or to those rule files:

```bash
node ./ai-dev-tools/scripts/check-shared-semantics.cjs ./ai-dev-tools   # exit 0
./ai-dev-tools/scripts/count-exclusion-test.sh ./ai-dev-tools           # 4 passed
```

Both are static and sub-second. `check-shared-semantics.cjs` enforces that each shared rule is
single-sourced, stated (not merely cited) by every skill it governs, unviolated, and that no skill
outside its `applies-to` quietly does the governed thing. `count-exclusion-test.sh` enforces that
`critical_count` excludes the review loop's own churn and that the exclusion is round-local.

**These are manual gates — nothing invokes them automatically.** Severity-is-consequence forked
because `6f22c6a` fixed it in `review-code` and verification was scoped to the files that fix
touched; the gate exists so the next such divergence fails loudly, but only if it is run.

If you change a gate, re-run its mutation suite and add a case for what you changed:

```bash
./ai-dev-tools/scripts/shared-semantics-mutation-test.sh ./ai-dev-tools  # 39 passed
```

A gate tested only against the bug it was written from proves the author can grep. That suite has
now caught four defects in the gate itself that reading did not.
