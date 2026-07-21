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
