---
name: scaffold
description: "Use when the user wants to bootstrap a monorepo from scratch, scaffold a new project, generate the initial CLAUDE.md/.claude/ layout for a fresh repo, or add a new workspace package to an existing monorepo — even if they don't use the exact skill name. Supports --bootstrap (fresh monorepo) and --add-package <name> (add to existing). Default stack: node-fastify-react."
---

<help-text>
/scaffold — bootstrap a monorepo or add a package

Usage: /scaffold [--bootstrap | --add-package <name>] [options]

Modes:
  --bootstrap                  Generate a fresh monorepo (empty dir)
  --add-package <name>         Add a package to an existing monorepo

Options:
  --stack <name>               Template stack (default: node-fastify-react)
  --config <path>              YAML file with placeholder values (skips prompts)
  --has-schema                 (--add-package) include db/schema/ directory
  --has-routes                 (--add-package) include routes/ directory
  --has-client                 (--add-package) include client/ hooks
  --force                      Overwrite manifest-listed files (warns first)
  --help                       Show this help

Examples:
  /scaffold --bootstrap
  /scaffold --bootstrap --config scaffold.yaml
  /scaffold --add-package auth --has-routes --has-schema
  /scaffold --add-package billing --config billing.yaml
</help-text>

If the user's arguments contain `--help`, output ONLY the text inside <help-text> tags above verbatim. Do not execute any skill logic.

# /scaffold

Bootstraps a monorepo or adds a new package to an existing monorepo, writing a standardized `CLAUDE.md` + `.claude/` layout baked from the `node-fastify-react` template stack.

<!-- Workflow sections populated in subsequent tasks -->
