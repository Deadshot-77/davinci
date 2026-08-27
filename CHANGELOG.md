# Changelog

## 0.1.0

First increment. The pipeline runs `davinci` -> `tech-lead` -> `infra-architect` -> `code-reviewer`,
with both enforcement hooks wired and 55 passing unit tests.

**Agents.** `davinci` (entry, clarifies and briefs), `tech-lead` (dispatch and arbitration,
no write tools), `infra-architect` (scaffolding and conventions, worktree-isolated),
`code-reviewer` (foundation gate and code review, read-only).

**Skills.** `intake-brief`, `delegation-contract`, `stack-profile`, `foundation-review`.

**Enforcement.** Per-agent write scoping including a best-effort Bash guard; report
validation that refuses to let an agent finish without real verification evidence, or a
gate finish without a verdict.

**Known gap.** The hooks are proven by direct invocation, not by a live Claude Code
session. See `docs/verification-status.md`.
