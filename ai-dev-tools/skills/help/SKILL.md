---
name: help
description: Show available commands and usage for the ai-dev-tools plugin
---

You MUST read `ai-dev-tools/VERSION` using the Read tool to get the current version number — do NOT guess or assume the version. Output the following text (replacing `{VERSION}` with the exact version from that file), then stop:

<help-output>
ai-dev-tools v{VERSION} — AI-native development automation

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
</help-output>
