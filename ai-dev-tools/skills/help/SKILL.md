---
name: help
description: Show available commands and usage for the ai-dev-tools plugin
---

Output the following text, then stop:

<help-output>
ai-dev-tools — AI-native development automation

WORKFLOW
  Four commands, run by hand, in this order. Each one prints the command
  for the next.

    brainstorm → review-doc → implement → review-code
    ──────────   ──────────   ─────────   ───────────
    Design &     Review the   Plan if     Review the
    write the    spec until   needed,     commits for
    spec         it is sound  then build  bugs & drift

COMMANDS (WORKFLOW)
  /brainstorm [topic]       Brainstorm an idea into a committed spec (start here)
  /review-doc <path> [...]  Review specs and design documents
  /implement <path> [...]   Implement a spec or plan (task graph + dispatch)
  /review-code <N|ref> [...]  Review recent commits for bugs & drift

COMMANDS (INDEPENDENT QUALITY CHECKS)
  /document-for-ai          Generate AI-optimized docs
  /changelog-from-commits   Generate release notes from git history
  /session-handoff          Create handoff document for next session
  /test-audit               Audit test quality and coverage gaps
  /convention-enforcer      Detect and enforce coding conventions
  /api-contract-guard       Enforce module API boundaries via barrel files
  /consolidate <ai|lint|all>  Unify AI configs or linting rules across monorepo
  /refactor-to-monorepo     Analyze monolith, produce unit extraction roadmap
  /refactor-to-layers       Enforce layered architecture, produce unit roadmap
  /scaffold --stack <name>  Bootstrap a project or add a package (node-fastify-react | expo | dotnet-mvc-react)
  /create-artifact [action]  Make, publish or finalize an engineering artifact (one portable HTML page)

  Run any command with --help for usage details.

AGENTS (name one as subagent_type in a prompt, and pass model on the call)
  ai-dev-tools:high-effort    Any role, pinned at high reasoning effort
  ai-dev-tools:xhigh-effort   Any role, pinned at xhigh reasoning effort
  ai-dev-tools:max-effort     Any role, pinned at max reasoning effort

  /review-code, /review-doc and /implement choose among them by risk tier:
  the tier sets each agent's effort and model, and --effort, --fix-effort
  and --model override it.

TIPS
  Start with /brainstorm. Each step ends by printing the command for the next one.
</help-output>
