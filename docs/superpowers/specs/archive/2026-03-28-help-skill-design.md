# Help Skill Design

## Goal

Provide a single `/help` command that gives first-time users of the ai-dev-tools plugin an immediate, actionable understanding of what skills are available, how they relate to each other, and how to get started.

## Constraints

- **Audience:** Users who already have Claude Code and the ai-dev-tools plugin installed but don't know what skills exist or how to use them.
- **Output:** Terminal-only. No file output.
- **No arguments, no flags.** `/help` prints and exits.
- **Scope:** Covers ai-dev-tools skills + mentions superpowers integration points where relevant (orchestrate delegates to brainstorming, writing-plans, subagent-driven-development).

## Architecture

### Hybrid static + dynamic

The SKILL.md contains two kinds of content:

1. **Dynamic section (command table + skill families):** Instructions telling the agent to read all `skills/*/SKILL.md` frontmatter (name + description) at runtime, build a command reference table, and group skills into predefined families.
2. **Static sections (strategies, workflows, tips):** Written verbatim in the SKILL.md. The agent prints them as-is.

This ensures the command listing never goes stale (derived from frontmatter — the source of truth) while strategies and best practices remain hand-crafted and curated.

### File location

The help skill lives at `ai-dev-tools/skills/help/SKILL.md`. It consists of a single SKILL.md file — no `references/` directory needed because all content is either dynamic (generated at runtime) or static text embedded in the SKILL.md.

To discover sibling skills at runtime, the agent resolves the plugin root from this SKILL.md's location (`../../` — two levels up from `skills/help/SKILL.md`) and globs `skills/*/SKILL.md` from there.

### SKILL.md structure

```
---
name: help
description: Show available skills, workflows, strategies, and best practices for the ai-dev-tools plugin. Use when a user asks what commands are available, how to get started, or needs guidance on which skill to use.
---

[Dynamic section instructions]
[Static sections verbatim]
```

### Runtime behavior

When `/help` is invoked, the agent:

1. Reads all `skills/*/SKILL.md` files in this plugin's directory — frontmatter only (name, description).
2. Builds the COMMANDS table — one row per skill, showing slash-command and a short description derived from frontmatter.
3. Groups skills into the predefined SKILL FAMILIES (family membership is defined statically in the SKILL.md, not inferred).
4. Prints the full output: dynamic sections (COMMANDS, SKILL FAMILIES) interleaved with static sections (WHERE DO I START?, COMMON WORKFLOWS, TIPS).

## Terminal Output Format

The agent prints the following to terminal. The `[dynamic]`, `[hybrid]`, and `[static]` annotations below are for this spec only — they are not printed in the terminal output.

```
ai-dev-tools — AI-native development automation

COMMANDS                                                           [dynamic]
  /help                              This help page
  /orchestrate                       Full dev cycle (brainstorm → ... → review)
  /document-for-ai                   Generate AI-optimized docs, CLAUDE.md, AI_INDEX.md
  ...                                (one row per skill, from frontmatter)

SKILL FAMILIES                                                     [hybrid]
  Review & Quality    review-doc, review-doc-ralph, review-code,
                      review-code-ralph, test-audit
  Documentation       document-for-ai, session-handoff,
                      changelog-from-commits
  Refactoring         refactor-to-layers, refactor-to-monorepo,
                      implement-plan
  Conventions         convention-enforcer, api-contract-guard,
                      consolidate
  Orchestration       orchestrate

WHERE DO I START?                                                  [static]
  If you're new, start here:

  1. /orchestrate — your main entry point. It manages the full development
     cycle: brainstorm → spec review → plan → implement → code review → complete.
     Just re-invoke it and it picks up where you left off.

  2. After installing superpowers, /orchestrate becomes even more powerful —
     it delegates to superpowers:brainstorming for design,
     superpowers:writing-plans for planning, and
     superpowers:subagent-driven-development for implementation. Think of
     orchestrate as the conductor that tells you what to do next.

  3. For targeted work, go directly to a skill family:
     - Refactoring a messy codebase? /refactor-to-layers or
       /refactor-to-monorepo
     - Auditing test quality? /test-audit
     - Enforcing conventions? /convention-enforcer
     - Preparing docs for AI agents? /document-for-ai

COMMON WORKFLOWS                                                   [static]
  "I'm starting a new feature"
    /orchestrate → walks you through brainstorm → spec → plan →
    implement → review → complete

  "I have a spec and want to review it"
    /review-doc path/to/spec.md
    /review-doc path/to/spec.md --against path/to/reference.md
      (cross-checks spec against a reference document)

  "I want automated review-fix cycles"
    /review-doc-ralph or /review-code-ralph — iterates with Codex
    until clean

  "I want to improve my codebase structure"
    /refactor-to-layers (enforce dependency layers)
    /refactor-to-monorepo (plan monorepo extraction)
    /implement-plan (execute either plan)

  "I'm handing off to another session"
    /session-handoff

TIPS                                                               [static]
  - orchestrate detects state from artifacts (specs, plans, reviews
    in tmp/). No need to tell it where you are — just re-invoke
    /orchestrate.
  - ralph skills (review-code-ralph, review-doc-ralph) auto-iterate
    between Claude and Codex until zero critical issues. Use them
    when you want hands-off quality improvement.
  - review-doc dispatches 3 parallel agents (completeness, fact-check,
    implementability). Add --codex for single-pass Codex review instead.
  - All review output lands in tmp/ (review_analysis.md, review_code.md).
    Process findings with /respond-to-review (a separate user-level skill,
    not part of this plugin).
  - document-for-ai generates CLAUDE.md files and AI_INDEX.md — run it
    after major structural changes so AI agents stay oriented.
```

## Dynamic Section Details

### COMMANDS table generation

1. For each `skills/*/SKILL.md`, read YAML frontmatter to extract `name` and `description`.
2. Derive the slash command: `/{name}`.
3. Derive a short description (max ~60 chars) from the frontmatter `description`. The agent extracts the most informative phrase — exact wording may vary between invocations. Guideline: skip "Use when" prefixes, take the first actionable clause. Truncate at a word boundary and append "..." if over 60 chars.
4. Sort order: `orchestrate` first, then remaining skills alphabetically.
5. Skip the `help` skill's own directory. Insert `/help` as the first row with the hardcoded description `This help page` — it is not derived from frontmatter.
6. If a `skills/*/SKILL.md` has missing or malformed frontmatter (no `name` or `description` field), skip that skill silently. No warning printed.

### SKILL FAMILIES grouping

Family membership is defined statically in the SKILL.md as a mapping:

| Family | Members |
|--------|---------|
| Review & Quality | review-doc, review-doc-ralph, review-code, review-code-ralph, test-audit |
| Documentation | document-for-ai, session-handoff, changelog-from-commits |
| Refactoring | refactor-to-layers, refactor-to-monorepo, implement-plan |
| Conventions | convention-enforcer, api-contract-guard, consolidate |
| Orchestration | orchestrate |

The help skill does not appear in SKILL FAMILIES. It is excluded from both the COMMANDS dynamic scan (hardcoded first row) and the family grouping.

If a non-help skill discovered via frontmatter scan does not appear in any family, it is listed under an "Other" family at the end. This handles future skills gracefully.

## Scope Boundaries

- Family membership for new skills requires manually editing the static mapping in the SKILL.md.
- Workflow and tips content requires manual curation as skills evolve.
- Per-skill detailed help (`/help <skill-name>`) is out of scope — no arguments accepted.

## Success Criteria

1. `/help` prints all current skills with accurate descriptions (derived from frontmatter, not hardcoded).
2. Skills are grouped into meaningful families.
3. The "Where do I start?" section steers users toward `/orchestrate` as the primary entry point and explains the superpowers integration.
4. Common workflows give users copy-pasteable commands for the most common tasks.
5. Tips section covers non-obvious behaviors (artifact-based state, ralph iteration, parallel agents).
6. Adding a new skill to the plugin requires zero changes to the help skill — it appears automatically in the COMMANDS table. Family membership requires a one-line addition to the static mapping (acceptable maintenance cost).
7. No file output. Terminal only.
