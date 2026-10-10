---
name: help
description: Show available commands and usage for the ai-dev-tools plugin
---

Output the following text, then stop:

<help-output>
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
  /review-doc <path> [...]  Review specs and design documents
  /implement [path] [...]   Execute a plan or spec (task graph + dispatch)
  /document-for-ai          Generate AI-optimized docs (auto-invoked by orchestrate)
  /review-code <N|ref> [...]  Review recent commits for bugs & drift

COMMANDS (INDEPENDENT QUALITY CHECKS)
  /changelog-from-commits   Generate release notes from git history
  /session-handoff          Create handoff document for next session
  /test-audit               Audit test quality and coverage gaps
  /convention-enforcer      Detect and enforce coding conventions
  /api-contract-guard       Enforce module API boundaries via barrel files
  /consolidate <ai|lint|all>  Unify AI configs or linting rules across monorepo
  /refactor-to-monorepo     Analyze monolith, produce unit extraction roadmap
  /refactor-to-layers       Enforce layered architecture, produce unit roadmap
  /scaffold --stack <name>  Bootstrap a project or add a package (node-fastify-react | expo | dotnet-mvc-react)

  Run any command with --help for usage details.

AGENTS (name one as subagent_type in a prompt, and pass model on the call)
  ai-dev-tools:high-effort    Any role, pinned at high reasoning effort
  ai-dev-tools:xhigh-effort   Any role, pinned at xhigh reasoning effort
  ai-dev-tools:max-effort     Any role, pinned at max reasoning effort

  /review-code, /review-doc and /implement choose among them by risk tier:
  the tier sets each agent's effort and model, and --effort, --fix-effort
  and --model override it.

TIPS
  Start with /orchestrate — it handles the workflow for you.
  Re-invoke /orchestrate after each step completes to continue.
</help-output>
