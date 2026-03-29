# Help System Redesign

## Status: Draft

## Problem

The current `/help` skill dynamically discovers skills by globbing `skills/*/SKILL.md`, parsing YAML frontmatter, and building tables at runtime. This is slow and produces verbose output. Individual skills have no quick-reference usage information.

## Goals

1. Replace `/help` with pure static text that loads instantly
2. Add `--help` to each eligible skill for quick parameter/usage reference
3. Keep everything minimal — no overwhelming output, no dynamic discovery

## Design

### Part 1: Per-Skill `--help` Guard

**Scope:** All skills EXCEPT `review-doc`, `review-code`, and `help` (11 skills total).

Each SKILL.md gets a block immediately after the YAML frontmatter. When the user passes `--help`, the agent outputs the static text verbatim and stops — no skill logic executes.

**Block structure:**

```markdown
<help-text>
skill-name — one-line description

USAGE
  /skill-name [args] [flags]

PARAMETERS
  arg-name          What it does
  --flag-name       What it does

EXAMPLES
  /skill-name                        Basic usage
  /skill-name arg --flag value       With options
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.
```

**Rules:**
- USAGE shows the invocation syntax
- PARAMETERS lists each argument and flag with a short description; omit this section entirely for skills with no parameters (e.g. `orchestrate`, `session-handoff`)
- EXAMPLES shows 2-4 representative invocations
- No mention of orchestrate relationship — the `/help` output already covers that

**Per-skill help content:**

#### orchestrate
```
orchestrate — Manage your full development cycle

USAGE
  /orchestrate

EXAMPLES
  /orchestrate                       Detect state and suggest next step
```

#### refactor-to-monorepo
```
refactor-to-monorepo — Analyze monolith for monorepo extraction strategy

USAGE
  /refactor-to-monorepo

EXAMPLES
  /refactor-to-monorepo              Analyze and produce extraction plan
```

#### refactor-to-layers
```
refactor-to-layers — Enforce layered architecture within modules

USAGE
  /refactor-to-layers

EXAMPLES
  /refactor-to-layers                Analyze or scaffold layer structure
```

#### implement-plan
```
implement-plan — Execute a restructuring plan

USAGE
  /implement-plan

EXAMPLES
  /implement-plan                    Auto-detect and execute latest plan
```

#### convention-enforcer
```
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
```

#### api-contract-guard
```
api-contract-guard — Enforce module API boundaries via barrel files

USAGE
  /api-contract-guard

EXAMPLES
  /api-contract-guard                Analyze and enforce API contracts
```

#### consolidate
```
consolidate — Unify AI configs or linting rules across monorepo

USAGE
  /consolidate <subcommand>

PARAMETERS
  ai                 Consolidate AI configs only
  lint               Consolidate linting rules only
  all                Both AI configs and linting rules

EXAMPLES
  /consolidate ai                    Unify AI configs
  /consolidate lint                  Unify linting rules
  /consolidate all                   Unify everything
```

#### document-for-ai
```
document-for-ai — Generate AI-optimized documentation

USAGE
  /document-for-ai [command] [path]

PARAMETERS
  humanize [path]    Render AI docs for human readers
  adr <spec_path>    Extract architectural decisions from spec

EXAMPLES
  /document-for-ai                   Generate CLAUDE.md and AI_INDEX.md
  /document-for-ai humanize          Render docs for humans
  /document-for-ai adr docs/spec.md  Extract ADRs from spec
```

#### changelog-from-commits
```
changelog-from-commits — Generate release notes from git history

USAGE
  /changelog-from-commits [range] [options]

PARAMETERS
  range                Git range (e.g. v1.0..v2.0)
  --version <label>    Override version label
  --since <date>       Commits since date (YYYY-MM-DD)
  --last <N>           Last N commits

EXAMPLES
  /changelog-from-commits                     Auto-detect from tags
  /changelog-from-commits v1.0.0..v2.0.0      Specific range
  /changelog-from-commits --last 20           Last 20 commits
  /changelog-from-commits --since 2026-01-01  Since date
```

#### session-handoff
```
session-handoff — Create handoff document for next session

USAGE
  /session-handoff

EXAMPLES
  /session-handoff                   Generate handoff from current session
```

#### test-audit
```
test-audit — Audit test quality and coverage gaps

USAGE
  /test-audit [path] [flags]

PARAMETERS
  path               Scope audit to a directory
  --changed           Audit only git-changed files
  --base <branch>    Merge base for --changed

EXAMPLES
  /test-audit                        Full codebase audit
  /test-audit src/services/          Path-scoped audit
  /test-audit --changed              Changed files only
  /test-audit --changed --base main  Explicit merge base
```

### Part 2: New `/help` Skill

The entire SKILL.md is replaced with pure static output. No dynamic discovery, no globbing, no agent logic. The agent outputs the text verbatim.

**Output:**

```
ai-dev-tools — AI-native development automation

MAIN COMMAND
  /orchestrate              Manages your full development cycle automatically.
                            Detects where you are and suggests the next step.

  Orchestrate flow:
    brainstorm → review-doc → implement → review-code → complete
    ─────────   ──────────   ─────────   ───────────   ────────
    Design &    Validate     Execute     Audit code    Update
    spec the    the spec     the plan    for bugs &    roadmap &
    feature                              drift         quality gates

COMMANDS (ORCHESTRATE FLOW)
  /orchestrate              Development cycle manager (start here)
  /review-doc <path>        Review specs and design documents
  /document-for-ai          Generate AI-optimized docs (auto-invoked by orchestrate)
  /review-code <N> <spec>   Review last N commits against a spec

COMMANDS (INDEPENDENT QUALITY CHECKS)
  /changelog-from-commits   Generate release notes from git history
  /session-handoff          Create handoff document for next session
  /test-audit               Audit test quality and coverage gaps
  /convention-enforcer      Detect and enforce coding conventions
  /api-contract-guard       Enforce module API boundaries via barrel files
  /consolidate <ai|lint>    Unify AI configs or linting rules across monorepo
  /refactor-to-monorepo     Analyze monolith for monorepo extraction
  /refactor-to-layers       Enforce layered architecture within modules
  /implement-plan           Execute a restructuring plan

  Run any command with --help for usage details.

TIPS
  Start with /orchestrate — it handles the workflow for you.
  Re-invoke /orchestrate after each step completes to continue.
```

**SKILL.md structure:**

```markdown
---
name: help
description: Show available commands and usage for the ai-dev-tools plugin
---

Output the following text exactly, then stop:

[static text above]
```

## Implementation Summary

| Change | Files affected |
|--------|---------------|
| Add `--help` guard block | 11 SKILL.md files |
| Replace help skill | `skills/help/SKILL.md` |
| Total files modified | 12 |

## Out of Scope

- `review-doc`, `review-code`: modified in a separate branch
- `help --help`: not needed (help is the help)
- Dynamic skill discovery: removed entirely
- Parameter documentation in `/help` output: delegated to per-skill `--help`
