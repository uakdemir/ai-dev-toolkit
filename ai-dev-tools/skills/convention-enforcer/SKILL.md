---
name: convention-enforcer
description: "Use when the user wants to enforce coding conventions, prevent AI agent drift, harden linter rules, generate convention-based structural tests, detect naming/error handling/import/logging inconsistencies, or analyze a codebase for convention violations — even if they don't use the exact skill name."
---

<help-text>
convention-enforcer — Detect and enforce coding conventions

USAGE
  /convention-enforcer [flags]

PARAMETERS
  --re-analyze       Full run from scratch
  --skip-enforced    Skip already-enforced categories
  --start-fresh      Remove existing artifacts before re-analysis

EXAMPLES
  /convention-enforcer               Analyze conventions
  /convention-enforcer --re-analyze  Full re-analysis from scratch
  /convention-enforcer --start-fresh Clean slate analysis
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# convention-enforcer

Analyze codebase conventions across 7 fixed categories plus open-ended discovery. Two agents (core + discovery) scan in parallel, findings are merged and presented. The user confirms detected conventions, picks which to harden, and reviews generated enforcement artifacts (structural tests + linter rules + violations report).

## Workflow Overview

Execute these steps in order. Each step feeds into the next:

1. **Tech Stack Detection** — auto-detect stack, linter config, test framework, and sub-framework.
2. **Scope Detection** — walk up from CWD to find project root, determine monorepo boundaries.
3. **Previous Run Detection** — scan for existing convention-enforcer artifacts.
4. **Dispatch Agents** — launch Core Agent and Discovery Agent in parallel (sequential fallback).
5. **Merge Findings** — combine results, deduplicate (core takes priority).
6. **Present Detected Conventions** — USER CHECKPOINT: confirm/correct/skip each convention.
7. **Present Violations** — USER CHECKPOINT: pick which findings to harden.
8. **Present Routing Plan** — USER CHECKPOINT: review/override enforcement mechanism per finding.
9. **Generate Artifacts** — produce structural tests, modify linter config, generate violations report.
9a. **Validate Artifacts** — parse linter config, syntax-check generated test files.
10. **Review Checkpoint** — USER CHECKPOINT: accept all / revert selected / discard run.

Reference files used throughout (do not inline their content — read them at the indicated step):

- `references/tech-stacks.md` — stack detection heuristics, linter config paths, test runner, DI patterns per stack
- `references/agent-prompts.md` — full prompt instructions for Core Agent and Discovery Agent invocations
- `references/convention-test-templates.md` — structural test templates per convention category per stack
- `references/linter-rule-mappings.md` — mapping from convention categories to specific linter rules per stack

---

## Step 1: Tech Stack Detection

Read `references/tech-stacks.md` now.

### Auto-Detection Algorithm

1. Scan project root for detection files: `package.json`, `pyproject.toml`, `.csproj` / `.sln`.
2. Scan for linter config files (`.eslintrc.*`, `eslint.config.*`, `ruff.toml`, `.editorconfig`) and test frameworks (`vitest.config.*`, `jest.config.*`, `pytest.ini`, `xunit.runner.json`).
3. **One match** — proceed to sub-framework detection.
4. **Zero matches** — prompt user to specify (see "Other" flow below).
5. **Multiple matches** — trigger mismatch gate.
6. Cross-check linter and test framework findings against detected stack — mismatch gate on inconsistencies.

### Sub-Framework Detection

After identifying the language/platform, detect the specific framework via dependency analysis:

- **Node.js:** Check `package.json` dependencies for `fastify`, `express`, `@nestjs/core`, etc. Confirm with user.
- **Python:** Check `pyproject.toml` / `requirements.txt` for `fastapi`, `django`, `flask`, etc. Confirm with user.
- **.NET:** Check `.csproj` package references and `Program.cs` / `Startup.cs` patterns. Confirm with user.

If the detected sub-framework is not in the supported list, proceed with reduced category coverage: framework-agnostic categories work normally; DI and API Response categories use generic analysis with a warning.

### Mismatch Gate

On any inconsistency (multiple stacks, linter mismatch, multiple linters, test framework ambiguity), stop and present the conflict. Wait for user input — never guess.

### "Other" Stack Flow

If auto-detection fails, prompt for 4 answers:

1. Language/framework?
2. Linter tool and config file path?
3. Test runner?
4. DI/dependency injection pattern used (if any)?

**For "Other" stacks, stop at analysis and violations reporting — no structural tests or linter rules are generated.** Explain: "Convention analysis and violations report are available for all stacks. Structural tests and linter rules are only generated for supported stacks (Node.js, Python, .NET). For your stack, use the violations report to write enforcement artifacts manually."

---

## Step 2: Scope Detection

Walk up from CWD to find the project root (directory containing the detected stack marker file).

- **Single-project repo:** Scan from that root.
- **Monorepo detected** (workspace config files found: `pnpm-workspace.yaml`, `lerna.json`, `turbo.json`, `nx.json`, `rush.json`, `workspaces` field in root `package.json`, `.moon/workspace.yml`, `pants.toml`, `Directory.Build.props`, or equivalent): v1 scopes to the current working directory only. Present: "Monorepo detected. Scanning from CWD: `[path]`. Convention analysis scopes to this package only."

---

## Step 3: Previous Run Detection

Scan for existing convention-enforcer artifacts:

1. Scan `tests/structural/` for files matching `convention-*.test.*` with convention-enforcer marker comments.
2. Scan linter config for comments containing `convention-enforcer:` or (for JSON configs) a `_conventionEnforcer` metadata key.
3. Check for existing `docs/convention-enforcer/violations-report.md`.

If previous artifacts exist, present three options:

- **Re-analyze all:** Full run. At Step 9, existing artifacts for re-confirmed categories are overwritten (matched by marker comment category ID). New categories create new artifacts.
- **Skip already-enforced:** Extract enforced category names from marker comments in detected artifacts. Pass as exclusion list to both agents via prompt context. In Step 5 merge logic, drop any finding whose category matches an excluded name. If no un-enforced categories remain for the core agent, skip core agent dispatch entirely. Discovery agent runs its full scan regardless.
- **Start fresh:** Before proceeding, show user exactly which artifacts will be removed. Only remove entries with convention-enforcer marker comments/metadata. Then run a full analysis from scratch.

---

## Step 4: Dispatch Agents

Read `references/agent-prompts.md` now.

Substitute `{stack}`, `{scope}`, and `{exclusions}` in the prompt templates from the reference file.

**Preferred:** Dispatch Core Agent + Discovery Agent in parallel — two Agent tool invocations in a single message. Each agent receives the detected stack, scope, and output format requirements. Results are returned independently and merged in Step 5.

**Sequential fallback:** If the runtime does not support sub-agents or parallel tool dispatch, run both analyses sequentially within a single context: core categories first, then discovery scan. The output format and merge logic remain identical — the only difference is execution order.

If one agent (or sequential pass) fails, use the other's results. Report the failed agent's categories as "analysis failed."

---

## Step 5: Merge Findings

1. **Core findings included as-is** — core agent results take priority.
2. **Overlap check** — match each discovery finding's `category` and `convention_description` against core category keyword lists. Require 2+ keyword matches from a single category to count as overlap:
   - Error Handling: `exception`, `throw`, `catch`, `try`, `fault`, `error-handling`, `error-class`
   - Naming: `camelCase`, `snake_case`, `PascalCase`, `kebab-case`, `naming-convention`
   - Import Ordering: `import-order`, `require-order`, `import-grouping`, `absolute-import`, `relative-import`
   - DI / Dependency: `inject`, `dependency-injection`, `provider`, `service-locator`, `IoC`, `DI-registration`
   - API Response: `response-envelope`, `status-code`, `response-shape`, `endpoint-return`
   - File Organization: `directory-structure`, `folder-convention`, `co-location`, `file-placement`
   - Logging: `logger`, `structured-logging`, `log-level`, `console-log`
3. **Discard overlapping discovery findings** (2+ keyword overlap detected).
4. **Append remaining** discovery findings after core findings, labeled as `[Discovery]`.

If "Skip already-enforced" was chosen in Step 3, also drop findings whose category matches an excluded name.

---

## Step 6: Present Detected Conventions (USER CHECKPOINT)

For each finding (core then discovery), present:

- Category name, detected convention description, frequency percentage.
- Three options: **Correct** (enforce this) | **Wrong** (user provides the correct convention) | **Skip**.

**User correction handling:** When the user corrects a convention, recompute violations from the `files_analyzed` per-file data in the agent output, using the user's stated convention as the new baseline. No agent re-dispatch needed.

**Pattern not in codebase:** If the user specifies a convention not found in any scanned file, all files become violations with a note: "Convention not yet present in codebase — all files reported as violations."

**Multi-scope categories:** For categories with multiple independent scopes (e.g., Naming Conventions checks file names, class names, and function names separately), present each scope as a separate sub-finding. The >50% threshold applies independently per scope.

**Tie scenario:** If no pattern exceeds 50%, present the top two patterns and ask which to enforce. If the user skips, mark the category as "no convention detected."

**Note:** User corrections at Step 6 do not re-trigger merge logic. They only affect the violation list for the corrected category. Discovery findings that passed the overlap filter remain unchanged.

---

## Step 7: Present Violations (USER CHECKPOINT)

Rank confirmed findings by `severity_level x violation_count` (descending). Present per-category:

- Violation count, severity, top files (with line numbers where applicable).
- Two options: **Harden** | **Skip**.

Zero violations for a confirmed convention: report "Convention consistently followed. No enforcement needed." Skip artifact generation for that category.

---

## Step 8: Present Routing Plan (USER CHECKPOINT)

Show the default enforcement mechanism per hardened finding:

| Core Category | Default Enforcement | Rationale |
|---|---|---|
| Error Handling | Both (hybrid) | Structural test for class hierarchy, linter rule for catch patterns |
| Naming Conventions | Linter rule | Linters have built-in naming rules |
| Import Ordering | Linter rule | Linters have built-in import sorting |
| DI / Dependency Patterns | Structural test | Cross-file, linters cannot express |
| API Response Shapes | Structural test | Needs cross-endpoint analysis |
| File Organization | Structural test | Cross-file directory checking |
| Logging | Linter rule | Single-file pattern (no-console, etc.) |

For discovery findings, use the `suggested_routing` field from the agent output. If a discovery finding is overridden to "linter rule" and no built-in rule mapping exists, warn: "No known linter rule for this convention. Falling back to structural test."

The user can override any routing before generation begins. For hybrid cases, both artifacts are generated together.

---

## Step 9: Generate Artifacts

Read `references/convention-test-templates.md` and `references/linter-rule-mappings.md` now.

For each hardened finding, based on routing:

**Structural test (`structural_test` or `both`):**
- Use template from `references/convention-test-templates.md`, fill with convention data.
- Write to `tests/structural/convention-{category}.test.{ext}` (JS/TS and Python) or `Tests/Structural/Convention{Category}Tests.cs` (.NET PascalCase).
- Create `tests/structural/` directory if it does not exist.

**Linter rule (`linter_rule` or `both`):**
- Use mappings from `references/linter-rule-mappings.md`.
- Insert rules into the project's existing linter config with format-specific markers.
- Stack-specific insertion:
  - **ESLint:** Detect flat config vs legacy format; add to the appropriate `rules` object.
  - **Ruff:** Add rule codes to the `extend-select` list under `[tool.ruff.lint]`.
  - **.editorconfig:** Place rules under the appropriate file-glob section; create section if needed.
- Before writing, check for conflicting existing rules — warn user if detected.

**Violations report:**
- Generate to `docs/convention-enforcer/violations-report.md`.
- Grouped by category. Each violation: file path, line number (where applicable), expected vs found.
- Summary at top with total violations per category and severity ranking.
- Header: "Generated snapshot. Regenerate by running convention-enforcer."

**Marker comments** on all generated artifacts using the target language's comment syntax:
- JS/TS/C#: `// --- Generated by convention-enforcer: {category} ---`
- Python: `# --- Generated by convention-enforcer: {category} ---`
- For JSON linter configs (`.eslintrc.json`): add `"_conventionEnforcer": { "{category}": ["rule1", "rule2"] }` metadata key.
- Category name is the stable dedup key, enabling idempotent re-runs.

**Idempotent behavior:** If an existing marker for the same category is found, replace the block.

---

## Step 9a: Validate Artifacts

1. **Linter config:** Parse the modified config to verify syntax (e.g., `JSON.parse` for `.eslintrc.json`, TOML parse for Ruff config).
2. **Test files:** Run syntax-only check on generated test files:
   - Node.js: `npx tsc --noEmit` or syntax parse
   - Python: `python -m py_compile`
   - .NET: `dotnet build --no-restore`
3. **On failure:** Attempt auto-fix. If unfixable, skip that artifact with a warning and proceed to Step 10 with remaining artifacts.

---

## Step 10: Review Checkpoint (USER CHECKPOINT)

Show `git diff` of all changes. Present three outcomes:

- **Accept all:** Commit all generated artifacts.
- **Revert selected:** Delete rejected convention-enforcer test files (identified by marker comment). Remove rejected linter rules (identified by marker comment or `_conventionEnforcer` metadata key). Keep accepted artifacts. Commit the remaining accepted artifacts.
- **Discard run:** `git checkout` all modified files. Delete all newly created convention-enforcer files. No commit.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No source files found | Stop: "No source files found for {stack}. Check your CWD and stack detection." |
| No dominant pattern (no pattern >50%) | Present top two patterns, ask which to enforce. User skips = "no convention detected." |
| Linter config file missing | Warn, skip linter rule generation. Only structural tests produced. |
| Linter config malformed | Warn: "Could not parse {config_file}. Skipping linter rules for this config." |
| `tests/structural/` directory missing | Create it automatically. |
| User corrects to minority pattern | Recompute violations from per-file data. No agent re-dispatch. |
| User states convention not in codebase | All files become violations with explanatory note. |
| Zero violations for confirmed convention | Report consistently followed, skip artifact generation. |
| Discovery finds zero additional patterns | Report: "No additional project-specific conventions found." |
| Large codebase (>50K LOC) | Sample files evenly by modification date. Core: up to 100 per category. Discovery: up to 50 across directories. Report as approximate. |
| Linter rule conflicts with existing | Warn and ask: skip or override. |
| One agent fails | Use the other agent's results. Report failed categories as "analysis failed." |
| Validation fails at Step 9a | Show errors. Attempt auto-fix. If unfixable, skip that artifact with warning. |

---

## Severity Model

| Severity | Level | Criteria | Categories |
|---|---|---|---|
| High | 3 | Causes runtime errors, security issues, or breaks consumers | Error Handling, DI / Dependency Patterns, API Response Shapes |
| Medium | 2 | Causes confusion, inconsistency, or slows development | Naming, Import Ordering, File Organization, Logging |
| Low | 1 | Cosmetic or stylistic | Discovery agent findings (when appropriate) |

**Ranking formula:** `score = severity_level x violation_count`

Findings are presented in descending score order. Discovery findings default to Medium unless the agent's analysis indicates otherwise.

---

## Progressive Disclosure Schedule

Load reference files only when needed to minimize context window usage:

| Step | Load |
|------|------|
| Step 1 (Tech Stack Detection) | `references/tech-stacks.md` |
| Step 4 (Dispatch Agents) | `references/agent-prompts.md` |
| Step 9 (Generate Artifacts) | `references/convention-test-templates.md` |
| Step 9 (Generate Artifacts) | `references/linter-rule-mappings.md` |

If "Other" was selected for tech stack, `references/tech-stacks.md` is still loaded for detection heuristics but linter-specific sections are skipped.
