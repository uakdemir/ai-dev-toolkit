# Placeholder Resolution — expo stack

Authoritative, in-skill placeholder resolution for the `expo` stack (transcribed from the Mobile Scaffold Integration design § Section 3 so the skill no longer depends on a doc in the user's project tree).

Schema per placeholder: `placeholder_name`, `resolution_source`, `default_value`, `config_yaml_key`.
Resolution order (per SKILL.md § Placeholder Resolution): auto-derive → `--config <path>.yaml` → interactive prompt.

## Root layer (`templates/expo/root/`) — `--bootstrap`

| Placeholder | Resolution source | Default | Config YAML key |
|---|---|---|---|
| `{{PROJECT_NAME}}` | `--bootstrap` interactive prompt | directory basename | `project_name` |
| `{{STACK_DECISIONS_DOC_PATH}}` | `--bootstrap` interactive prompt | (omitted if blank — the placeholder line is dropped from output) | `stack_decisions_doc_path` |

`{{STACK_DECISIONS_DOC_PATH}}` MUST sit on its own line with no inline prose, so line-dropping cleanly removes only that line when the value is blank. The lead-in text ("Stack decisions reference:") sits on the preceding line and remains intact even when blank (a harmless artefact).

## Package layer (`templates/expo/package/`) — `--add-package <name>`

| Placeholder | Resolution source | Default | Config YAML key |
|---|---|---|---|
| `{{FEATURE_NAME}}` | `--add-package <name>` argument (or interactive prompt) | the `<name>` argument | `feature_name` |
| `{{FEATURE_DESCRIPTION}}` | interactive prompt | empty (line dropped if blank) | `feature_description` |
| `{{RELATED_SDKS}}` | interactive prompt | empty / none | `related_sdks` |

All placeholders resolved during bootstrap / add-package are stored in the manifest `placeholders:` map so refresh can re-substitute if the template wording changes.
