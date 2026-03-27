# api-contract-guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `api-contract-guard` skill for the ai-dev-tools plugin — a barrel-file-based module boundary enforcer that detects modules, proposes/generates barrel files with user approval, and generates structural tests ensuring consumers import through barrels only.

**Architecture:** A Claude Code skill consisting of SKILL.md (orchestrator) + 3 reference files loaded via progressive disclosure. SKILL.md orchestrates a 10-step sequential workflow (single-agent, no sub-agent dispatch) with user checkpoints. Serena-aware with explicit regex fallback gate. Output is barrel files, structural tests (one per module), and a violations report.

**Tech Stack:** Markdown skill files following the ai-dev-tools plugin pattern. No runtime code.

**Spec:** `docs/superpowers/specs/2026-03-27-api-contract-guard-design.md`

---

## File Structure

```
ai-dev-tools/
├── .claude-plugin/
│   └── plugin.json                          # Modify: add api-contract-guard to description
└── skills/
    └── api-contract-guard/
        ├── SKILL.md                         # Create: main 10-step workflow orchestrator (~300 lines)
        └── references/
            ├── tech-stacks.md               # Create: stack detection, barrel conventions, import syntax (~130 lines)
            ├── barrel-patterns.md           # Create: barrel detection, export analysis, import scanning (~250 lines)
            └── contract-test-templates.md   # Create: per-stack structural test templates (~400 lines)
```

Each file has one clear responsibility:
- **SKILL.md** — workflow orchestration (steps 1-10, checkpoints, error handling, priority model)
- **tech-stacks.md** — all stack-specific detection: platforms, sub-frameworks, barrel conventions, import syntax, monorepo detection
- **barrel-patterns.md** — how to detect barrels, analyze exports (Serena + regex), detect incomplete barrels, scan cross-module imports, resolve import paths
- **contract-test-templates.md** — complete test code templates per stack for import-through-barrel enforcement

---

### Task 1: Create skill directory and tech-stacks.md

**Files:**
- Create: `ai-dev-tools/skills/api-contract-guard/references/tech-stacks.md`

This is loaded at Step 2 (Tech Stack Detection). Contains platform detection, sub-framework identification, barrel file conventions per stack, import syntax, monorepo workspace detection, and mismatch gate triggers. Largely mirrors convention-enforcer's tech-stacks.md but adds barrel-specific fields (barrel location, import-through-barrel syntax, re-export syntax) per stack.

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p ai-dev-tools/skills/api-contract-guard/references
```

- [ ] **Step 2: Write tech-stacks.md**

Create `ai-dev-tools/skills/api-contract-guard/references/tech-stacks.md`. The file must contain:

1. **Header** — loaded at Step 2, contains stack detection + barrel conventions
2. **Auto-Detection Algorithm** — same 3-step platform → linter/test → sub-framework detection as convention-enforcer
3. **Supported Stack Profiles** with barrel-specific fields per stack:
   - **Node.js + Fastify:** barrel locations (`index.ts`/`index.js`, `package.json` `exports` field with `.` entry as primary, subpath exports as additional public entry points), import detection syntax (barrel vs internal path), re-export syntax (`export { X } from './service'`), source extensions, DI patterns
   - **Python + FastAPI:** barrel locations (`__init__.py`), import detection (`from auth import X` vs `from auth.service import X`), re-export syntax (`from .service import AuthService` + `__all__`), source extensions, DI patterns
   - **.NET MVC:** no barrel — uses `internal` keyword + namespace visibility, module = project in `.sln` or top-level namespace, `using` statement detection for cross-project references
4. **Module Detection Heuristics** per stack:
   - Monorepo: Node.js (parse `workspaces`), Python (dirs with `pyproject.toml`/`__init__.py`), .NET (`.csproj` in `.sln`)
   - Single-project: top-level dirs under `src/` per stack, with Python `__init__.py` requirement
5. **Monorepo Workspace Detection** — same config file list as convention-enforcer (pnpm-workspace.yaml, lerna.json, turbo.json, nx.json, rush.json, workspaces field, .moon/workspace.yml, pants.toml, Directory.Build.props)
6. **Mismatch Gate** — same triggers as convention-enforcer
7. **"Other" Stack Flow** — 4 questions (language/framework, barrel convention, re-export syntax, import syntax). Structural tests only, no barrel generation.

Read `ai-dev-tools/skills/convention-enforcer/references/tech-stacks.md` as the structural reference.

- [ ] **Step 3: Verify and commit**

```bash
wc -l ai-dev-tools/skills/api-contract-guard/references/tech-stacks.md
git add ai-dev-tools/skills/api-contract-guard/references/tech-stacks.md
git commit -m "feat(api-contract-guard): add tech-stacks reference file

Stack detection, barrel file conventions, import syntax per stack,
module detection heuristics, monorepo workspace detection."
```

---

### Task 2: Create barrel-patterns.md

**Files:**
- Create: `ai-dev-tools/skills/api-contract-guard/references/barrel-patterns.md`

This is loaded at Step 6 (Barrel File Analysis). It's the core analytical reference — how to detect barrels, analyze exports, detect incomplete barrels, scan cross-module imports, and resolve import paths. Dual-mode: Serena instructions + regex fallback for every operation.

- [ ] **Step 1: Write barrel-patterns.md**

Create the file with these sections:

1. **Header** — loaded at Step 6, contains barrel detection + analysis algorithms
2. **Barrel File Detection** per stack:
   - Node.js: check for `index.ts`/`index.js` at module root, then `src/index.ts`, then `package.json` `exports["."]`
   - Python: check for `__init__.py` at module root, classify as barrel (has exports) or empty (no barrel)
   - .NET: N/A — describe the `internal` keyword analysis instead
3. **Export Analysis** (Serena mode):
   - `get_symbols_overview` on barrel file → list of `{symbol, source_file, export_kind}`
   - For each symbol: record name, whether it's `named`, `default`, or `type` export
4. **Export Analysis** (regex fallback):
   - Node.js regex patterns: `export { X } from './file'`, `export { default as X } from './file'`, `export type { X } from './file'`, `export * from './file'` (wildcard)
   - Python regex: `from .file import X`, lines in `__all__`
   - .NET: `public class X`, `public interface X`, `public enum X` in root namespace
5. **Incomplete Barrel Detection Algorithm**:
   - With Serena: `get_symbols_overview` on barrel → export set. `find_referencing_symbols` across repo → consumed set. Diff = discrepancies.
   - Without Serena: regex-extract exports from barrel. Regex-scan all files outside module for imports targeting internal paths. Diff.
6. **Cross-Module Import Scanning**:
   - With Serena: `find_referencing_symbols` per exported symbol → precise consumer map
   - Without Serena: regex scan all source files for import/require/from statements. Path resolution rules:
     - Relative imports: resolve against `dirname(importing_file)`
     - Monorepo bare specifiers: match against workspace package names
     - `package.json` `exports`: `.` entry = primary barrel, subpath exports = additional public entry points (NOT violations)
     - Path aliases: warn about potential false negatives
   - Violation rule: import target inside another module AND NOT pointing to barrel → violation
7. **Wildcard Re-Export Resolution**:
   - Serena: `get_symbols_overview` on target file → full resolution
   - Regex: read target file exports, one level only. Nested wildcards → warn.
8. **Barrel Generation Rules**:
   - Determine export kind per symbol (Serena: `get_symbols_overview` on source; regex: match patterns)
   - Node.js syntax: `export { X } from './file'`, `export { default as X } from './file'`, `export type { X } from './file'`
   - Python syntax: `from .file import X`, `__all__ = ['X', ...]`
   - Ordering: alphabetically within source file groups, source files in directory order
   - Header comment: `{comment_char} Generated by api-contract-guard. Edit freely — this is now your module's public API.`
   - Python: check for circular import risk before generating
9. **`package.json` `exports` Field Handling**:
   - `.` entry (or `main` field) = primary barrel
   - Subpath exports = additional public entry points
   - Conditional entries: use `default` condition, or `import` for ESM / `require` for CJS

- [ ] **Step 2: Verify and commit**

```bash
wc -l ai-dev-tools/skills/api-contract-guard/references/barrel-patterns.md
git add ai-dev-tools/skills/api-contract-guard/references/barrel-patterns.md
git commit -m "feat(api-contract-guard): add barrel-patterns reference file

Barrel detection, export analysis (Serena + regex), incomplete barrel
detection, cross-module import scanning, path resolution rules,
wildcard resolution, barrel generation rules."
```

---

### Task 3: Create contract-test-templates.md

**Files:**
- Create: `ai-dev-tools/skills/api-contract-guard/references/contract-test-templates.md`

Loaded at Step 9 (Generate Artifacts). Contains complete structural test code templates per stack. One test file per guarded module — the template is instantiated once per module with placeholders filled from the Module Analysis Format.

- [ ] **Step 1: Write contract-test-templates.md**

Read `ai-dev-tools/skills/convention-enforcer/references/convention-test-templates.md` for the structural reference (same template pattern: complete code, placeholders, marker comments).

Create the file with these sections:

1. **Header** — loaded at Step 9, describes placeholder system
2. **Placeholder Inventory**:
   - `{MODULE_NAME}` — module name (e.g., "auth")
   - `{MODULE_PATH}` — module directory (e.g., "src/auth")
   - `{BARREL_PATH}` — barrel file path (e.g., "src/auth/index.ts")
   - `{SOURCE_EXTENSIONS}` — file extensions (e.g., `['.ts', '.js']`)
   - `{MODULE_INTERNAL_DIRS}` — internal directories (everything under module except barrel)
3. **Node.js (Jest/Vitest) Template**:
   - File: `tests/structural/api-contracts-{MODULE_NAME}.test.ts`
   - Marker: `// --- Generated by api-contract-guard: {MODULE_NAME} ---`
   - Logic: use `glob` to find all source files outside `{MODULE_PATH}`, for each file read and extract import statements via regex, check if any import resolves to a path inside `{MODULE_PATH}` that isn't the barrel path, collect violations, assert empty
   - Complete runnable code (same style as convention-enforcer templates: import fs/glob, scan, assert)
4. **Python (pytest) Template**:
   - File: `tests/structural/api-contracts-{MODULE_NAME}.test.py`
   - Marker: `# --- Generated by api-contract-guard: {MODULE_NAME} ---`
   - Logic: same approach using `pathlib` and regex for Python imports (`from X.Y import Z`, `import X.Y`)
   - Check: import targets a path inside module AND is not the `__init__.py` barrel → violation
5. **.NET (xUnit) Template**:
   - File: `Tests/Structural/ApiContracts{MODULE_PASCAL}Tests.cs`
   - Marker: `// --- Generated by api-contract-guard: {MODULE_NAME} ---`
   - Logic: scan `.cs` files outside module project for `using` statements referencing internal namespaces
   - Check: `using App.Auth.Internal` when only `App.Auth` is the public namespace → violation
6. **Dedup Rules**: one file per module, file replacement on re-run (no start/end markers needed)

- [ ] **Step 2: Verify and commit**

```bash
wc -l ai-dev-tools/skills/api-contract-guard/references/contract-test-templates.md
git add ai-dev-tools/skills/api-contract-guard/references/contract-test-templates.md
git commit -m "feat(api-contract-guard): add contract test templates

Per-stack structural test templates (Node.js/Jest, Python/pytest,
.NET/xUnit) for import-through-barrel enforcement. One file per
guarded module with placeholder substitution."
```

---

### Task 4: Create SKILL.md

**Files:**
- Create: `ai-dev-tools/skills/api-contract-guard/SKILL.md`

The main orchestrator. Must follow the exact pattern of `ai-dev-tools/skills/convention-enforcer/SKILL.md` (read it first for structure).

- [ ] **Step 1: Write SKILL.md**

Create `ai-dev-tools/skills/api-contract-guard/SKILL.md` (~300 lines). Must contain:

1. **Frontmatter** — name + description from spec
2. **Summary paragraph**
3. **Workflow Overview** — 10 steps + 9a listed
4. **Reference file listing** — 3 files with load-at-step annotations
5. **Step 1: Serena Check** — check for Serena MCP plugin. If not available: hard gate with warning message and two options (install / proceed without). No analysis until user responds.
6. **Step 2: Tech Stack Detection** — load `references/tech-stacks.md`. Auto-detect, sub-framework, mismatch gate, "Other" flow.
7. **Step 3: Scope Detection** — walk up to root. **Monorepo: full-repo scan** (not CWD-only — cross-module analysis needs all modules). Present: "Scanning all packages from root."
8. **Step 4: Previous Run Detection** — scan for `api-contracts-*.test.*`, barrel files with api-contract-guard header, violations report. 3 options with mechanics (re-analyze / skip guarded / start fresh). Barrel files NOT removed by start fresh.
9. **Step 5: Module Detection** — monorepo: workspace packages. Single-project: top-level src/ dirs. Edge cases (nested, single-file, no consumers). If layer data exists, load and use for priority enrichment.
10. **Step 6: Barrel File Analysis** — load `references/barrel-patterns.md`. Per module: categorize as complete/missing/incomplete. State 2: propose barrel. State 3: detect discrepancies. Wildcard warning.
11. **Step 7: Cross-Module Import Analysis** — full scan, no sampling. Serena mode + regex fallback. Violation examples.
12. **Step 8: Present Findings (USER CHECKPOINT)** — summary table first (module, status, violations, consumers, priority stars), batch operations (approve all / review individually / skip all). Per-module detail in priority order. "Modify exports" = numbered checklist. Structural tests auto-generated for approved modules.
13. **Step 9: Generate Artifacts** — load `references/contract-test-templates.md`. Generate/update barrel files, generate test files (one per module), generate violations report. Barrel header comment. Named exports only. Python: relative imports + `__all__`.
14. **Step 9a: Validate Artifacts** — barrel: `npx tsc --noEmit` / `python -m py_compile` / N/A for .NET. Tests: same as convention-enforcer. Auto-fix or warn.
15. **Step 10: Review Checkpoint (USER CHECKPOINT)** — git diff. Accept all / revert selected / discard. Barrel ownership rules.
16. **Priority Model** — formula: `consumer_count × status_weight`. Weights: missing=3, incomplete=2, complete=1. Layer enrichment: 2× for cross-layer.
17. **Module Analysis Format** — JSON schema from spec.
18. **Error Handling table** — all scenarios from spec (15 rows).
19. **.NET v1 section** — limited support, public types analysis, no barrel generation.

Key structural patterns (match convention-enforcer SKILL.md):
- "Execute these steps in order."
- "Reference files used throughout (do not inline — read at indicated step):"
- Each step is `## Step N:` heading
- Progressive disclosure: "Read `references/X.md` now."

- [ ] **Step 2: Verify line count and frontmatter**

```bash
wc -l ai-dev-tools/skills/api-contract-guard/SKILL.md
head -4 ai-dev-tools/skills/api-contract-guard/SKILL.md
```

Expected: ~280-320 lines, frontmatter with `name: api-contract-guard`.

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/skills/api-contract-guard/SKILL.md
git commit -m "feat(api-contract-guard): add main SKILL.md workflow

10-step sequential orchestrator with Serena hard gate, full-repo
monorepo scan, barrel analysis (3 states), priority model,
user checkpoints, barrel ownership rules, .NET v1 limited support."
```

---

### Task 5: Update plugin.json

**Files:**
- Modify: `ai-dev-tools/.claude-plugin/plugin.json`

- [ ] **Step 1: Read current plugin.json**

```bash
cat ai-dev-tools/.claude-plugin/plugin.json
```

- [ ] **Step 2: Update description**

Add "API contract enforcement" to the description:

```json
{
  "name": "ai-dev-tools",
  "version": "1.0.0",
  "description": "AI-optimized documentation generation, monorepo refactoring strategy, architectural layer enforcement, plan execution, convention enforcement, and API contract enforcement",
  "author": {
    "name": "ai-dev-tools"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add ai-dev-tools/.claude-plugin/plugin.json
git commit -m "chore: update plugin.json for api-contract-guard skill"
```

---

### Task 6: Final verification

**Files:**
- All files from Tasks 1-5

- [ ] **Step 1: Verify directory structure**

```bash
find ai-dev-tools/skills/api-contract-guard -type f | sort
```

Expected:
```
ai-dev-tools/skills/api-contract-guard/SKILL.md
ai-dev-tools/skills/api-contract-guard/references/barrel-patterns.md
ai-dev-tools/skills/api-contract-guard/references/contract-test-templates.md
ai-dev-tools/skills/api-contract-guard/references/tech-stacks.md
```

- [ ] **Step 2: Verify SKILL.md frontmatter**

```bash
head -4 ai-dev-tools/skills/api-contract-guard/SKILL.md
```

Expected: `name: api-contract-guard` in frontmatter.

- [ ] **Step 3: Verify references mentioned in SKILL.md**

```bash
grep -c "references/" ai-dev-tools/skills/api-contract-guard/SKILL.md
```

Expected: 3+ occurrences.

- [ ] **Step 4: Verify plugin.json**

```bash
grep "API contract" ai-dev-tools/.claude-plugin/plugin.json
```

Expected: line containing "API contract enforcement".

- [ ] **Step 5: Count total lines**

```bash
wc -l ai-dev-tools/skills/api-contract-guard/SKILL.md ai-dev-tools/skills/api-contract-guard/references/*.md
```

Expected: ~1000-1200 total (comparable to convention-enforcer at 2435 but simpler — fewer categories, single-agent, no linter rules).
