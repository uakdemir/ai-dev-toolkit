# Placeholder Resolution — expo stack

Authoritative, in-skill placeholder resolution for the `expo` stack (transcribed from the Mobile Scaffold Integration design § Section 3 so the skill no longer depends on a doc in the user's project tree).

Resolution order (per SKILL.md § Placeholder Resolution): auto-derive → `--config <path>.yaml` → interactive prompt.

## Root layer (`templates/expo/root/`) — `--bootstrap`

| Placeholder | Resolution source | Default | Config YAML key |
|---|---|---|---|
| `{{PROJECT_NAME}}` | `--bootstrap` interactive prompt | directory basename | `project_name` |
| `{{STACK_DECISIONS_DOC_PATH}}` | `--bootstrap` interactive prompt | (omitted if blank — the placeholder line is dropped from output) | `stack_decisions_doc_path` |

`{{STACK_DECISIONS_DOC_PATH}}` MUST sit on its own line with no inline prose, so line-dropping cleanly removes only that line when the value is blank. The lead-in text ("Stack decisions reference:") sits on the preceding line and remains intact even when blank (a harmless artefact).

## Package layer (`templates/expo/package/`) — `--add-package <name>`

| Placeholder | Resolution source | Default |
|---|---|---|
| `{{FEATURE_NAME}}` | `--add-package <name>` argument | (required — no default) |
| `{{FEATURE_DESCRIPTION}}` | `--add-package` interactive prompt | `Feature description TBD` |
| `{{RELATED_SDKS}}` | `--add-package` interactive prompt (comma-separated SDK names) | `""` |

The design defines no `--config` YAML keys for the package layer (unlike the root layer).

## Placeholder scope in the manifest

- **Top-level `placeholders:`** — bootstrap-wide values that apply to every scaffold-written file (`PROJECT_NAME`, `STACK_DECISIONS_DOC_PATH`).
- **Per-file `placeholders:`** — add-package feature-specific values, keyed by the UPPERCASE placeholder name (e.g. `FEATURE_NAME: matching`). Feature-specific placeholders MUST be stored per-file and never top-level: `FEATURE_NAME` differs per `features/<name>/CLAUDE.md`, so a top-level entry would collide across `--add-package` runs.
- **Resolution at diff time:** merge the top-level placeholders with the file's per-file placeholders (per-file wins on key collision), then substitute into the template content.
