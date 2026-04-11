# convention-enforcer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `convention-enforcer` skill for the ai-dev-tools plugin — a two-agent hardening tool that detects codebase conventions and generates structural tests + linter rules to prevent AI drift.

**Architecture:** A Claude Code skill consisting of SKILL.md (orchestrator) + 4 reference files loaded via progressive disclosure. The SKILL.md orchestrates a 10-step workflow with user checkpoints. Two agents (core + discovery) run in parallel, their findings are merged, and the user selects which conventions to enforce. Output is structural tests, linter config modifications, and a violations report.

**Tech Stack:** Markdown skill files following the ai-dev-tools plugin pattern. No runtime code — all logic is expressed as Claude Code instructions.

**Spec:** `docs/superpowers/specs/2026-03-27-convention-enforcer-design.md`

---

## File Structure

```
ai-dev-tools/
├── .claude-plugin/
│   └── plugin.json                          # Modify: add convention-enforcer to description
└── skills/
    └── convention-enforcer/
        ├── SKILL.md                         # Create: main workflow orchestrator (~280 lines)
        └── references/
            ├── tech-stacks.md               # Create: stack detection, linter paths, DI patterns (~150 lines)
            ├── agent-prompts.md             # Create: core + discovery agent prompt templates (~200 lines)
            ├── convention-test-templates.md  # Create: structural test templates per category per stack (~500 lines)
            └── linter-rule-mappings.md      # Create: category-to-rule mapping per stack (~200 lines)
```

Each file has one clear responsibility:
- **SKILL.md** — workflow orchestration only (steps 1-10, checkpoints, error handling)
- **tech-stacks.md** — all stack-specific detection heuristics and config paths
- **agent-prompts.md** — the exact prompts dispatched to core and discovery agents
- **convention-test-templates.md** — complete test code templates per convention per stack
- **linter-rule-mappings.md** — exact linter rules per convention per stack, with insertion syntax

---

### Task 1: Create skill directory and tech-stacks.md

**Files:**
- Create: `ai-dev-tools/skills/convention-enforcer/references/tech-stacks.md`

This is the first reference file because Step 1 (Tech Stack Detection) loads it. It contains all detection heuristics, linter config paths, test runners, DI patterns, sub-framework detection, and monorepo workspace config files.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p ai-dev-tools/skills/convention-enforcer/references
```

- [ ] **Step 2: Write tech-stacks.md**

Create `ai-dev-tools/skills/convention-enforcer/references/tech-stacks.md` with the following content. This file is loaded at Step 1 of the SKILL.md workflow.

```markdown
# Tech Stacks Reference — convention-enforcer

Loaded after Step 1 (Tech Stack Detection). Contains stack detection heuristics,
sub-framework identification, linter config paths, test runners, DI patterns, and
monorepo workspace config detection.

---

## Auto-Detection Algorithm

### Step 1: Platform Detection

Scan project root for these marker files:

| Marker file | Platform |
|---|---|
| `package.json` | Node.js |
| `pyproject.toml` | Python |
| `.csproj` / `.sln` | .NET |

- **One match** → proceed to sub-framework detection
- **Zero matches** → trigger "Other" stack flow
- **Multiple matches** → trigger mismatch gate

### Step 2: Linter & Test Framework Scan

| Config file pattern | Tool |
|---|---|
| `.eslintrc.*`, `eslint.config.*` | ESLint |
| `ruff.toml`, `pyproject.toml` with `[tool.ruff]` | Ruff |
| `.editorconfig` | Roslyn/.editorconfig |
| `vitest.config.*` | Vitest |
| `jest.config.*` | Jest |
| `pytest.ini`, `pyproject.toml` with `[tool.pytest]` | pytest |
| `xunit.runner.json` | xUnit |

Cross-check against detected platform. Trigger mismatch gate on inconsistencies
(e.g., `ruff.toml` in a Node.js project, both Jest and Vitest installed).

### Step 3: Sub-Framework Detection

After platform detection, identify the specific framework:

**Node.js** — scan `package.json` `dependencies` and `devDependencies` for:
- `fastify` → Node.js + Fastify (supported profile)
- `express` → Node.js + Express (generic profile)
- `@nestjs/core` → Node.js + NestJS (generic profile)
- `@hapi/hapi` → Node.js + Hapi (generic profile)
- `koa` → Node.js + Koa (generic profile)

**Python** — scan `pyproject.toml` `[project.dependencies]` or `requirements.txt` for:
- `fastapi` → Python + FastAPI (supported profile)
- `django` → Python + Django (generic profile)
- `flask` → Python + Flask (generic profile)
- `starlette` → Python + Starlette (generic profile)

**.NET** — scan `.csproj` PackageReferences and entry point patterns:
- `Microsoft.AspNetCore.Mvc` or controller classes → .NET MVC (supported profile)
- `app.MapGet/MapPost` patterns without controllers → .NET Minimal APIs (generic profile)

Confirm with user: "Detected {Platform} + {Framework}. Correct?"

**Generic profile behavior:** Framework-agnostic categories (Naming, Import Ordering,
File Organization, Logging, Error Handling) work normally. DI / Dependency Patterns
and API Response Shapes use generic analysis with user warning:
"DI analysis is generic — no {framework}-specific DI profile available."

---

## Supported Stack Profiles

### Node.js + Fastify

- **Linter:** ESLint
  - Config files: `.eslintrc.*` (legacy) or `eslint.config.*` (flat)
  - Detect format: `eslint.config.js` exists → flat config. `.eslintrc.*` exists → legacy.
- **Structural tests:** Vitest or Jest (check which is installed)
- **DI patterns:** `@fastify/awilix` (preferred), `fastify.decorate()` for manual wiring
- **Source extensions:** `.ts`, `.js`, `.tsx`, `.jsx`
- **Endpoint detection:** Files in `src/routes/`, `src/handlers/`, `src/api/`, or files exporting Fastify route handlers
- **DI detection:** Files importing from `@fastify/awilix`, files calling `fastify.decorate()`, files in `src/plugins/`

### Python + FastAPI

- **Linter:** Ruff
  - Config files: `ruff.toml` or `pyproject.toml` under `[tool.ruff]`
- **Structural tests:** pytest
- **DI patterns:** `Depends()` (FastAPI built-in), `dependency-injector` container
- **Source extensions:** `.py`
- **Endpoint detection:** Files with `@app.get`, `@app.post`, `@router.get`, `@router.post` decorators
- **DI detection:** Files using `Depends()`, files in `providers/` or `dependencies/`

### .NET MVC

- **Linter:** Roslyn analyzers + `.editorconfig`
- **Structural tests:** xUnit or NUnit (check which is referenced in test `.csproj`)
- **DI patterns:** `IServiceCollection` (built-in `Microsoft.Extensions.DependencyInjection`)
- **Source extensions:** `.cs`
- **Endpoint detection:** Classes inheriting `ControllerBase` or `Controller`, files in `Controllers/`
- **DI detection:** `Startup.cs` or `Program.cs` with `builder.Services.Add*` calls

---

## Monorepo Workspace Detection

Scan for these workspace config files (from project root upward):

| Config file | Tool |
|---|---|
| `pnpm-workspace.yaml` | pnpm |
| `lerna.json` | Lerna |
| `turbo.json` | Turborepo |
| `nx.json` | Nx |
| `rush.json` | Rush |
| `package.json` with `"workspaces"` field | npm/yarn workspaces |
| `.moon/workspace.yml` | moon |
| `pants.toml` | Pants |
| `Directory.Build.props` | .NET |

If any found: "Monorepo detected. Scanning from CWD: `{path}`. Convention analysis
scopes to this package only."

---

## Mismatch Gate Triggers

Stop and ask on any of these:
- Multiple platform markers in same root (e.g., `package.json` + `pyproject.toml`)
- Linter config doesn't match detected platform
- Multiple linters for same concern (e.g., ESLint + Biome)
- Multiple test frameworks (e.g., Jest + Vitest both installed)

Message: "Stack mismatch detected: Found {details}. Is this a monorepo/polyglot
project? Which stack should we target for this run?"

---

## "Other" Stack Flow

Prompt:
1. Language/framework?
2. Linter tool and config file path?
3. Test runner?
4. DI/dependency injection pattern used (if any)?

Behavior: structural tests only (language-generic patterns). No linter rule generation.
Explain: "Linter rules are only generated for supported stacks. Add linter rules
manually based on the violations report."
```

- [ ] **Step 3: Verify file exists and is readable**

```bash
cat ai-dev-tools/skills/convention-enforcer/references/tech-stacks.md | head -5
```

Expected: First 5 lines of the file including the title.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/skills/convention-enforcer/references/tech-stacks.md
git commit -m "feat(convention-enforcer): add tech-stacks reference file

Stack detection heuristics, sub-framework identification, linter config
paths, monorepo workspace detection, and mismatch gate triggers."
```

---

### Task 2: Create agent-prompts.md

**Files:**
- Create: `ai-dev-tools/skills/convention-enforcer/references/agent-prompts.md`

This reference file is loaded at Step 4 (Dispatch Agents). It contains the exact prompt templates for both the Core Agent and Discovery Agent, including the required output format.

- [ ] **Step 1: Write agent-prompts.md**

Create `ai-dev-tools/skills/convention-enforcer/references/agent-prompts.md` with the following content:

```markdown
# Agent Prompt Templates — convention-enforcer

Loaded at Step 4 (Dispatch Agents). Contains the exact prompt text for each agent invocation.
Substitute `{stack}`, `{scope}`, `{exclusions}` with values from Steps 1-3.

---

## Core Agent Prompt

Dispatch this prompt via the Agent tool. The agent receives the detected stack profile
and scope, and returns structured findings for all 7 fixed categories.

```text
You are a convention analysis agent. Analyze the codebase for convention patterns
in these 7 categories. For each category, detect the dominant pattern (used by >50%
of relevant files) and list violations.

**Detected stack:** {stack}
**Scope:** {scope}
**Excluded categories (already enforced):** {exclusions}

## Categories to Analyze

### 1. Error Handling
Scan for: error/exception class hierarchy, try/catch patterns, error propagation style,
custom error types vs raw throws.
Relevant files: all files containing try/catch or throw/raise statements.
Look for: most-used error base class, most common handling idiom.
Violations: raw Error()/bare except/untyped catch when a custom base exists, swallowed catches.

### 2. Naming Conventions
Scan for: function names, class names, file names, variable names, constants.
Relevant files: all source files.
Detect per-scope: file naming (kebab-case? PascalCase?), class names, function names, constants.
Each scope is a separate sub-finding.

### 3. Import Ordering
Scan for: import grouping/ordering, relative vs absolute imports, import statement structure.
Relevant files: all source files with imports.
Look for: consistent grouping pattern (stdlib → third-party → local), relative vs absolute preference.

### 4. DI / Dependency Patterns
Scan for: DI registration patterns, constructor injection, service locator, hardcoded deps.
Relevant files: files involved in dependency registration/injection.
{stack}-specific DI indicators: {di_patterns_from_tech_stacks}
If generic profile: scan for constructor injection and service locator patterns generically.

### 5. API Response Shapes
Scan for: response envelope structure, status code usage, error response format.
Relevant files: endpoint/handler/controller files.
{stack}-specific endpoint detection: {endpoint_detection_from_tech_stacks}
If generic profile: scan for functions returning HTTP responses.

### 6. File Organization
Scan for: directory-to-purpose mapping, where different file types live.
Relevant files: all source files (directory placement analysis).
Line number: null (file-level violation).

### 7. Logging
Scan for: logger instantiation, log level usage, structured vs unstructured, context inclusion.
Relevant files: all source files with logging calls.
Look for: project logger vs raw console.log/print/Console.WriteLine.

## Sampling (for codebases >50K LOC)
Sample up to 100 files per category, evenly distributed by modification date
(oldest, median, newest). Report: "Sampled N of M files. Approximately X%."

## Output Format (REQUIRED)

Return a JSON array of findings. Each finding MUST use this exact schema:

{
  "category": "string — category name",
  "convention_description": "string — human-readable description",
  "dominant_pattern": "string — code-level description of conforming code",
  "frequency_percent": number,
  "files_total_in_scope": number,
  "suggested_severity": "high" | "medium" | "low",
  "suggested_routing": "structural_test" | "linter_rule" | "both",
  "scope_description": "string — e.g. 'endpoint files', 'all source files'",
  "files_analyzed": [
    { "file": "path", "pattern_found": "description", "conforms": true/false }
  ],
  "violations": [
    { "file": "path", "line": number | null, "expected": "string", "found": "string" }
  ],
  "source": "core"
}

Severity defaults: Error Handling=high, Naming=medium, Import Ordering=medium,
DI Patterns=high, API Response Shapes=high, File Organization=medium, Logging=medium.

Routing defaults: Error Handling=both, Naming=linter_rule, Import Ordering=linter_rule,
DI Patterns=structural_test, API Response Shapes=structural_test,
File Organization=structural_test, Logging=linter_rule.

For multi-scope categories (Naming), return one finding per scope.
If no pattern exceeds 50%, still return the finding with frequency_percent of the
top pattern and an empty violations array — the orchestrator handles the tie scenario.
```

---

## Discovery Agent Prompt

Dispatch this prompt via the Agent tool. The agent scans for project-specific
conventions not covered by the 7 core categories.

```text
You are a convention discovery agent. Scan the codebase for project-specific
conventions that are NOT covered by these 7 categories: Error Handling, Naming,
Import Ordering, DI Patterns, API Response Shapes, File Organization, Logging.

**Detected stack:** {stack}
**Scope:** {scope}

## What to Look For

- Decorator/attribute usage patterns (e.g. every route handler has @authenticate)
- Middleware/filter chains (consistent ordering or composition)
- Database query patterns (ORM-only, repository pattern, raw SQL placement)
- Configuration access (always through config service, never raw env vars)
- Event/message naming conventions (dot-notation, past tense, prefixes)
- Test organization patterns (setup/teardown, fixture patterns, mock strategies)
- Comment/docstring conventions (JSDoc on public methods, inline comment style)
- Any other recurring structural pattern that appears in 3+ files

## Scanning Strategy

1. Read directory structure to understand project layout
2. Sample files: at least 3 per directory with source files, selected by modification
   date (oldest, median, newest). Include all files if directory has fewer than 3.
3. Identify recurring code shapes (decorators, signatures, return types, comment
   formats, etc.) that appear consistently across 3+ files
4. For each pattern, count frequency and list violating files
5. Report EVERYTHING you find — overlap filtering with core categories is handled
   by the orchestrator, not by you

## Sampling (for codebases >50K LOC)
Sample up to 50 files across directories, evenly distributed by modification date.
Report: "Sampled N of M files. Approximately X%."

## Output Format (REQUIRED)

Return a JSON array of findings. Each finding MUST use this exact schema:

{
  "category": "string — descriptive name for the convention",
  "convention_description": "string — human-readable description",
  "dominant_pattern": "string — code-level description of conforming code",
  "frequency_percent": number,
  "files_total_in_scope": number,
  "suggested_severity": "high" | "medium" | "low",
  "suggested_routing": "structural_test" | "linter_rule" | "both",
  "scope_description": "string — e.g. 'route handler files', 'test files'",
  "files_analyzed": [
    { "file": "path", "pattern_found": "description", "conforms": true/false }
  ],
  "violations": [
    { "file": "path", "line": number | null, "expected": "string", "found": "string" }
  ],
  "source": "discovery"
}

Zero findings is a valid outcome. Do not invent patterns — only report patterns
that appear in 3+ files with clear violations.
```
```

- [ ] **Step 2: Verify file exists**

```bash
cat ai-dev-tools/skills/convention-enforcer/references/agent-prompts.md | head -5
```

Expected: Title and header lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/convention-enforcer/references/agent-prompts.md
git commit -m "feat(convention-enforcer): add agent prompt templates

Core agent (7 categories) and discovery agent prompts with exact output
format schema, sampling strategy, and per-category scan instructions."
```

---

### Task 3: Create convention-test-templates.md

**Files:**
- Create: `ai-dev-tools/skills/convention-enforcer/references/convention-test-templates.md`

This is the largest reference file. It contains structural test code templates for each convention category that routes to `structural_test`, for each supported stack. Loaded at Step 9 (Generate Artifacts).

- [ ] **Step 1: Write convention-test-templates.md**

Create `ai-dev-tools/skills/convention-enforcer/references/convention-test-templates.md`. This file follows the same pattern as `refactor-to-layers/references/structural-test-templates.md` — complete, runnable test code per stack.

The file is large (~500 lines). Write it with these sections:

1. **Header** — explains the template system and how to adapt templates
2. **Error Handling templates** (hybrid: structural test portion) — per stack
3. **DI / Dependency Patterns templates** — per stack
4. **API Response Shapes templates** — per stack
5. **File Organization templates** — per stack
6. **Discovery finding templates** — generic per stack (for runtime-discovered conventions)

Each template includes:
- The marker comment format: `{comment_char} --- Generated by convention-enforcer: {category} ---`
- Placeholder variables: `{CONVENTION_DESCRIPTION}`, `{EXPECTED_PATTERN}`, `{SOURCE_DIRS}`, `{VIOLATION_PATTERNS}`
- Complete test code that scans source files and asserts the convention

The agent filling in these templates uses the confirmed convention from Step 6 and the violation data from the agent output to populate the placeholders.

**Key pattern per template:**
- Read source files matching the category's scope
- For each file, check if it conforms to the detected convention
- Assert that no violations remain (test fails when drift exists)

Structure each stack section identically to how `refactor-to-layers/references/structural-test-templates.md` structures its Tier 1 tests: import fs/glob, define the convention pattern, scan files, assert conformance.

- [ ] **Step 2: Verify file exists and check line count**

```bash
wc -l ai-dev-tools/skills/convention-enforcer/references/convention-test-templates.md
```

Expected: 400-600 lines.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/convention-enforcer/references/convention-test-templates.md
git commit -m "feat(convention-enforcer): add structural test templates

Per-category per-stack test templates for Error Handling, DI Patterns,
API Response Shapes, File Organization, and generic discovery findings."
```

---

### Task 4: Create linter-rule-mappings.md

**Files:**
- Create: `ai-dev-tools/skills/convention-enforcer/references/linter-rule-mappings.md`

This reference file maps each convention category to specific built-in linter rules per stack, with exact config insertion syntax. Loaded at Step 9 (Generate Artifacts).

- [ ] **Step 1: Write linter-rule-mappings.md**

Create `ai-dev-tools/skills/convention-enforcer/references/linter-rule-mappings.md` with the following content:

```markdown
# Linter Rule Mappings — convention-enforcer

Loaded at Step 9 (Generate Artifacts). Maps convention categories to specific
built-in linter rules per stack. Only rules that come with the linter or
well-known plugins — no custom rule authoring.

---

## Marker Strategy

All added rules must be tagged for idempotent re-runs:

- **JS/TS config** (`.eslintrc.js`, `.eslintrc.cjs`, `eslint.config.*`): inline comment
  `// convention-enforcer: {category}`
- **JSON config** (`.eslintrc.json`): metadata key
  `"_conventionEnforcer": { "{category}": ["rule1", "rule2"] }`
- **Ruff/TOML** (`ruff.toml`, `pyproject.toml`): inline comment
  `# convention-enforcer: {category}`
- **.editorconfig**: inline comment `# convention-enforcer: {category}`

---

## ESLint Config Format Detection

- `eslint.config.js` / `eslint.config.mjs` / `eslint.config.ts` → **flat config**
  - Rules go in: `export default [{ rules: { ... } }]`
- `.eslintrc.*` → **legacy config**
  - Rules go in: `"rules": { ... }`

---

## Category → Rule Mappings

### Error Handling (hybrid: linter rule portion)

**ESLint (Node.js):**
- `no-throw-literal` — forces `throw new Error()` instead of `throw "string"`
- `@typescript-eslint/no-throw-literal` — TypeScript variant
- `no-empty` with `allowEmptyCatch: false` — prevents swallowed catches

Insertion (legacy JSON):
```json
{
  "rules": {
    "no-throw-literal": "error",
    "no-empty": ["error", { "allowEmptyCatch": false }]
  },
  "_conventionEnforcer": { "error-handling": ["no-throw-literal", "no-empty"] }
}
```

Insertion (flat config):
```javascript
// convention-enforcer: error-handling
{ rules: { "no-throw-literal": "error", "no-empty": ["error", { allowEmptyCatch: false }] } }
```

**Ruff (Python):**
- `E722` — bare `except:` (do not use bare except)
- `B904` — raise without from (within exception handler)
- `TRY003` — avoid specifying long messages outside exception class

Insertion (`[tool.ruff.lint]` in `pyproject.toml` or `ruff.toml`):
```toml
# convention-enforcer: error-handling
extend-select = ["E722", "B904", "TRY003"]
```

**Roslyn (.NET .editorconfig):**
```ini
# convention-enforcer: error-handling
[*.cs]
dotnet_diagnostic.CA2200.severity = error  # Re-throw to preserve stack details
dotnet_diagnostic.CA1031.severity = warning  # Do not catch general exception types
```

### Naming Conventions

**ESLint (Node.js):**
- `@typescript-eslint/naming-convention` — enforces naming per identifier type

Insertion varies by detected convention. Example for camelCase functions + PascalCase classes:
```json
{
  "rules": {
    "@typescript-eslint/naming-convention": [
      "error",
      { "selector": "function", "format": ["camelCase"] },
      { "selector": "class", "format": ["PascalCase"] },
      { "selector": "variable", "format": ["camelCase", "UPPER_CASE"] }
    ]
  }
}
```

**Ruff (Python):**
- `N801` — class names should use CapWords convention
- `N802` — function name should be lowercase
- `N803` — argument name should be lowercase
- `N806` — variable in function should be lowercase

Insertion:
```toml
# convention-enforcer: naming
extend-select = ["N801", "N802", "N803", "N806"]
```

**Roslyn (.NET .editorconfig):**
```ini
# convention-enforcer: naming
[*.cs]
dotnet_naming_rule.methods_should_be_pascal_case.severity = error
dotnet_naming_rule.methods_should_be_pascal_case.symbols = methods
dotnet_naming_rule.methods_should_be_pascal_case.style = pascal_case
dotnet_naming_symbols.methods.applicable_kinds = method
dotnet_naming_style.pascal_case.capitalization = pascal_case
```

### Import Ordering

**ESLint (Node.js):**
- `import/order` (eslint-plugin-import) — enforces import grouping

```json
{
  "rules": {
    "import/order": ["error", {
      "groups": ["builtin", "external", "internal", "parent", "sibling", "index"],
      "newlines-between": "always"
    }]
  }
}
```

**Ruff (Python):**
- `I001` — import block is un-sorted or un-formatted (isort)

```toml
# convention-enforcer: import-ordering
extend-select = ["I001"]
```

**Roslyn (.NET .editorconfig):**
```ini
# convention-enforcer: import-ordering
[*.cs]
dotnet_sort_system_directives_first = true
dotnet_separate_import_directive_groups = true
```

### Logging

**ESLint (Node.js):**
- `no-console` — disallow `console.log` in production code

```json
{
  "rules": {
    "no-console": ["error", { "allow": ["warn", "error"] }]
  }
}
```

**Ruff (Python):**
- `T201` — `print` found (flake8-print)
- `T203` — `pprint` found

```toml
# convention-enforcer: logging
extend-select = ["T201", "T203"]
```

**Roslyn (.NET .editorconfig):**
```ini
# convention-enforcer: logging
[*.cs]
dotnet_diagnostic.CA2153.severity = warning  # Avoid Console.WriteLine (custom analyzer may be needed)
```

---

## Conflict Detection

Before inserting rules, scan existing config for:
1. Same rule name already configured → warn: "Rule {rule} already exists with value {value}. Skip or override?"
2. Contradicting rule (e.g., `no-console: off` when we want `error`) → warn and let user decide

---

## "Other" Stack

No linter rule generation for unrecognized stacks. Explain:
"Linter rules are only generated for supported stacks (Node.js/ESLint, Python/Ruff,
.NET/Roslyn). For your stack, add linter rules manually based on the violations report."
```

- [ ] **Step 2: Verify file exists**

```bash
cat ai-dev-tools/skills/convention-enforcer/references/linter-rule-mappings.md | head -5
```

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/convention-enforcer/references/linter-rule-mappings.md
git commit -m "feat(convention-enforcer): add linter rule mappings

Per-category per-stack rule mappings for ESLint, Ruff, and Roslyn with
exact config insertion syntax, marker strategy, and conflict detection."
```

---

### Task 5: Create SKILL.md

**Files:**
- Create: `ai-dev-tools/skills/convention-enforcer/SKILL.md`

The main orchestrator file. This is the file Claude Code loads when the skill is invoked. It follows the exact same structure as `refactor-to-layers/SKILL.md`: frontmatter, summary, workflow overview, numbered steps with progressive disclosure, error handling table, and relationship notes.

- [ ] **Step 1: Write SKILL.md**

Create `ai-dev-tools/skills/convention-enforcer/SKILL.md` (~280 lines). The file must contain:

1. **Frontmatter** — `name` and `description` fields (from spec)
2. **Summary paragraph** — what the skill does
3. **Workflow Overview** — numbered steps 1-10 with reference file loading points
4. **Reference file listing** — which files to read at which step (do not inline)
5. **Step 1: Tech Stack Detection** — load `references/tech-stacks.md`, run auto-detection algorithm, sub-framework detection, mismatch gate
6. **Step 2: Scope Detection** — walk up to project root, monorepo check
7. **Step 3: Previous Run Detection** — scan for existing artifacts, present options (re-analyze/skip/fresh)
8. **Step 4: Dispatch Agents** — load `references/agent-prompts.md`, dispatch Core Agent and Discovery Agent in parallel (or sequential fallback), substitute stack/scope/exclusions
9. **Step 5: Merge Findings** — core priority, overlap keyword check (2+ matches), discard overlaps, append discovery as `[Discovery]`
10. **Step 6: Present Detected Conventions** — dominant pattern per category, user confirms/corrects/skips, recompute violations on correction using per-file data
11. **Step 7: Present Violations** — ranked by severity x frequency, per-category harden/skip
12. **Step 8: Present Routing Plan** — default routing per category, user override, discovery fallback
13. **Step 9: Generate Artifacts** — load `references/convention-test-templates.md` and `references/linter-rule-mappings.md`, generate structural tests, modify linter config, generate violations report
14. **Step 9a: Validate Artifacts** — parse linter config, syntax-check tests
15. **Step 10: Review Checkpoint** — git diff review, accept/revert/discard
16. **Error Handling table** — all scenarios from spec
17. **Severity Model** — table with ranking formula
18. **Overlap Keywords** — the 7-category keyword lists for merge logic

Key structural patterns to match from `refactor-to-layers/SKILL.md`:
- "Execute these steps in order. Each step feeds into the next:"
- "Reference files used throughout (do not inline their content — read them at the indicated step):"
- Each step is a `## Step N:` heading
- Progressive disclosure: "Read `references/X.md` now."

- [ ] **Step 2: Verify line count and structure**

```bash
wc -l ai-dev-tools/skills/convention-enforcer/SKILL.md
```

Expected: 250-320 lines.

```bash
head -10 ai-dev-tools/skills/convention-enforcer/SKILL.md
```

Expected: YAML frontmatter with `name: convention-enforcer` and description.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/convention-enforcer/SKILL.md
git commit -m "feat(convention-enforcer): add main SKILL.md workflow

10-step orchestrator with user checkpoints, progressive disclosure,
parallel agent dispatch with sequential fallback, merge logic,
severity model, and error handling."
```

---

### Task 6: Update plugin.json

**Files:**
- Modify: `ai-dev-tools/.claude-plugin/plugin.json`

Update the plugin description to include convention enforcement.

- [ ] **Step 1: Read current plugin.json**

```bash
cat ai-dev-tools/.claude-plugin/plugin.json
```

Expected:
```json
{
  "name": "ai-dev-tools",
  "version": "1.0.0",
  "description": "AI-optimized documentation generation, monorepo refactoring strategy, architectural layer enforcement, and plan execution",
  "author": {
    "name": "ai-dev-tools"
  }
}
```

- [ ] **Step 2: Update description**

Change the `description` field to include convention enforcement:

```json
{
  "name": "ai-dev-tools",
  "version": "1.0.0",
  "description": "AI-optimized documentation generation, monorepo refactoring strategy, architectural layer enforcement, plan execution, and convention enforcement",
  "author": {
    "name": "ai-dev-tools"
  }
}
```

- [ ] **Step 3: Verify**

```bash
cat ai-dev-tools/.claude-plugin/plugin.json
```

Expected: Updated description.

- [ ] **Step 4: Commit**

```bash
git add ai-dev-tools/.claude-plugin/plugin.json
git commit -m "chore: update plugin.json for convention-enforcer skill"
```

---

### Task 7: Final verification

**Files:**
- All files from Tasks 1-6

Verify the complete skill structure matches the plugin pattern.

- [ ] **Step 1: Verify directory structure**

```bash
find ai-dev-tools/skills/convention-enforcer -type f | sort
```

Expected:
```
ai-dev-tools/skills/convention-enforcer/SKILL.md
ai-dev-tools/skills/convention-enforcer/references/agent-prompts.md
ai-dev-tools/skills/convention-enforcer/references/convention-test-templates.md
ai-dev-tools/skills/convention-enforcer/references/linter-rule-mappings.md
ai-dev-tools/skills/convention-enforcer/references/tech-stacks.md
```

- [ ] **Step 2: Verify SKILL.md frontmatter**

```bash
head -4 ai-dev-tools/skills/convention-enforcer/SKILL.md
```

Expected:
```
---
name: convention-enforcer
description: "Use when the user wants to enforce coding conventions..."
---
```

- [ ] **Step 3: Verify all reference files are mentioned in SKILL.md**

```bash
grep -c "references/" ai-dev-tools/skills/convention-enforcer/SKILL.md
```

Expected: 4+ occurrences (one per reference file).

- [ ] **Step 4: Verify plugin.json includes convention-enforcer**

```bash
grep "convention" ai-dev-tools/.claude-plugin/plugin.json
```

Expected: Line containing "convention enforcement".

- [ ] **Step 5: Count total lines**

```bash
wc -l ai-dev-tools/skills/convention-enforcer/SKILL.md ai-dev-tools/skills/convention-enforcer/references/*.md
```

Expected: ~1100-1400 total lines across all files (comparable to refactor-to-layers at 1204 lines).
