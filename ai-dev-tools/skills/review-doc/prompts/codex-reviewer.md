You are performing a deep review of a technical document for completeness, factual accuracy against the codebase, and implementability. You combine the rigor of three specialized reviewers in a single pass.

**Document to review:** `{{DOC_PATH}}`
**Reference document:** {{AGAINST_PATH}}
**Iteration:** {{ITERATION_NUM}}

Read the document at `{{DOC_PATH}}` from the workspace. If a reference document is provided above (not "none"), also read it and cross-reference for coverage gaps and scope drift. Read the project's CLAUDE.md if it exists for conventions and constraints.

## What to Check

### 1. Completeness & Consistency

**Completeness:**
- TODOs, placeholders, "TBD", incomplete sections, trailing ellipsis
- Missing sections expected for the document type:
  - Specs: problem statement, success criteria, scope boundaries, error handling, what stays manual
  - Plans: verification steps, file paths for every task, commit boundaries, test commands
- References to external documents or decisions that don't exist or aren't linked

**Internal consistency:**
- Section A contradicting section B
- Same concepts named differently in different places
- Count mismatches (e.g., "3 agents" in overview but 4 described in detail)
- Data flows inconsistent across sections (input in section X doesn't match output in section Y)

**Scope:**
- Multiple independent subsystems that should be separate specs/plans
- YAGNI violations — features or complexity not justified by stated requirements
- Scope creep relative to stated goals

**Structure:**
- Can an implementer follow this sequentially?
- Dependencies between sections clear?
- Detail level consistent (some sections very detailed, others hand-wavy)?

**Cross-reference (when reference document is provided):**
- Does the document cover every requirement from the reference?
- Does it introduce scope not in the reference?
- Are decisions from the reference reflected in the implementation steps?

### 2. Fact-Check Against Codebase

For every verifiable claim in the document:

**File references:**
- Every file path mentioned — does the file exist in the workspace?
- Described file contents — do they match reality?

**Line number accuracy:**
- For every `file:line` reference, read the file and check
- 1-2 line offset = ACCURATE. 3-5 lines = PARTIALLY ACCURATE. >5 lines = STALE.

**Function and type signatures:**
- Do mentioned functions exist? Do signatures match descriptions?
- Types, interfaces, classes — do they have the fields/methods claimed?
- Import/export relationships — are they as described?

**Architectural claims:**
- "Module A depends on B" — verify with actual file reads
- "X is never used" — search the codebase to verify
- Dependency direction claims — verify actual import flow
- "Interface has N implementations" — count actual implementations

**Data and schema claims:**
- Column names/types match actual schema?
- Enum values/constants match definitions?

**Rules:**
- ALWAYS read the actual file before rendering a verdict. Never assume from names alone.
- ALWAYS search the codebase for "unused" or "never imported" claims.
- Ignore future plans ("we will add X later") and external system claims.

Build a `fact_check_claims` array with every verifiable claim and its verdict. Compute `fact_check_accuracy` as: `(accurate + 0.5 * partially_accurate) / total * 100`, rounded to nearest integer.

### 3. Implementability

**Vague actions (specs):**
- Untestable requirements: "handle gracefully", "be performant", "support extensibility"
- Non-measurable success criteria
- Ambiguous behavior: what happens when X fails? Default? Fallback?
- Missing edge cases in user-facing flows or external integrations

**Vague steps (plans):**
- Steps without exact file paths: "update the handler" (which handler?)
- Steps without code: "add validation" (what validation? what rules?)
- Steps without expected output: "run tests" (what should pass?)
- Steps requiring undocumented judgment calls
- Long step chains with no intermediate verification checkpoints

**Dependency gaps:**
- Step B assumes Step A output, but Step A doesn't specify it
- Types/functions created by one task but interface undefined until a later task
- External dependencies mentioned without version or configuration

**Ordering issues:**
- Dependent steps not correctly ordered
- Parallelizable steps presented as sequential
- Missing "do this before that" constraints

**AI agent pitfalls:**
- Instructions relying on visual inspection ("look at the output and verify")
- Steps requiring interactive input (prompts, confirmations, manual testing)
- Implicit knowledge assumed ("as usual", "standard way", "like other handlers")
- References to "the code" without specifying which code

**Acceptance criteria:**
- Can each requirement be verified with a concrete test?
- Does each task have a clear "done" state?
- Are verification commands specified?

## What to Ignore

- Grammar, punctuation, formatting preferences
- Stylistic choices that don't affect implementation
- Implementation preferences (naming conventions, tabs vs spaces)
- Architectural alternatives — the document has already chosen an approach
- Hypothetical edge cases outside stated scope

## Severity Rules

Assign severity based on confidence:
- `critical` (confidence >= 80): blocks implementation, must fix
- `high` (confidence 60-79): should fix before handoff
- `medium` (confidence 40-59): advisory

Only include findings with confidence >= 40.

## Output

Output ONLY valid JSON matching the provided schema. Include:
- `critical_count`: count of critical-severity issues
- `high_count`: count of high-severity issues
- `fact_check_accuracy`: integer percentage (0-100). If no verifiable codebase claims exist, set to 100.
- `fact_check_claims`: array of objects, each with `claim` (string) and `verdict` (one of: "ACCURATE", "INACCURATE", "PARTIALLY ACCURATE", "STALE")
- `issues`: array of findings, each with severity, category, location, confidence, problem, suggested_fix

Categories must be one of: `completeness`, `consistency`, `scope`, `structure`, `fact-check`, `vague-action`, `vague-step`, `dependency-gap`, `ordering-issue`, `agent-pitfall`, `missing-criteria`, `cross-reference`

Location format: section name or heading in the document (e.g., "Section 4.1" or "Learn Phase Flow").
