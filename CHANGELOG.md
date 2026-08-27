# Changelog

## 0.1.1

First live end-to-end run. Three defects found and fixed:

- Plugin agents are namespaced (`davinci:tech-lead`); rosters said `tech-lead`, so nothing
  could be dispatched. Hooks now normalise the prefix, and a Davinci agent missing from
  the scope map is denied rather than silently ungoverned.
- A main-thread agent’s `Agent(...)` roster is a session-wide allowlist, not that agent’s
  own limit, so restricting the entry agent blocked every downstream dispatch.
- The Bash guard blocked pure reads such as `node -e "JSON.parse(...)"`, preventing
  read-only agents from verifying anything.
- `infra-architect` no longer runs in an isolated worktree: its output was stranded there
  with no merge step, so the foundation never reached the agents depending on it.

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
