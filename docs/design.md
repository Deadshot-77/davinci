# Davinci — Autonomous Development Team

**Date:** 2026-08-27
**Status:** Design approved, pending spec review
**Deliverable:** A Claude Code plugin (`davinci`) containing 7 agents, 4 authored skills, 3 hooks, and a sourced skill stack — installable into any project.

---

## 1. Purpose

A development team of specialist agents that takes a request from the user, clarifies it, plans it, builds it, and gates it — without the user arbitrating each handoff.

Built and iterated in `xpandrix-playground`, but the deliverable is portable: one plugin directory that installs into any future website or project.

**Naming.** The plugin is `davinci`. The entry agent is also `davinci`, declared as the plugin's main thread, so enabling the plugin makes Davinci what the user talks to. All skills namespace as `/davinci:*`. The metaphor is deliberate and load-bearing: Leonardo ran a *bottega* — the master took the commission and set direction, specialists executed.

---

## 2. Decisions on record

| # | Decision | Rationale |
|---|---|---|
| D1 | **Subagent hierarchy**, not agent teams | Agent teams are experimental, interactive-only, silently ignore the `skills:` frontmatter field, and force teammates to inherit the lead's effort — which would break per-agent skills and the xhigh security pass. |
| D2 | **Dedicated `tech-lead`**, not infra-as-lead or bare main session | Separates arbitration from execution; portable as an installable unit. |
| D3 | **Hook-enforced gates**, not prompt-only handoffs | Prompts are advisory. Hooks are enforced by the harness and hold when a model decides to skip a step. |
| D4 | **`davinci` is the main thread**, `tech-lead` is its first delegate | Technical necessity: `AskUserQuestion` is stripped from every subagent's tool pool. The clarify step is impossible anywhere but the main thread. |
| D5 | **Foundation gated before builders start** | The infra output is the contract all other agents obey. Blast radius of a bad foundation is the whole project; cost of gating it is one review of one document. |
| D6 | **Gates are read-only** | An auditor that patches its own findings grades its own homework. Also prevents two agents colliding on one file. |
| D7 | **Frontend on Opus 5, not Sonnet** | Reversal of an earlier call. Sonnet was chosen when frontend meant CRUD screens. Art direction, taste judgment, and running a critique loop against a 60-point rubric is reasoning work. |
| D8 | **`taste-skill` over the official `frontend-design`** | Per user instruction to source externally. Verified: 81,195 stars, pushed 3 days ago, ~17k-word spec with a mechanically checkable pre-flight. |
| D9 | **Reject `claudedesignskills`** | 782 stars but last pushed 2025-11-20. Nine months stale in a fast-moving 3D/animation stack teaches outdated APIs — the exact failure mode this design exists to prevent. Mine its structure, verify every API against live docs. |
| D10 | **Hooks written in Node**, exec form | Node is present in any website project; avoids the bash/PowerShell split on Windows. |

---

## 3. Roster

Chain of command: **user → davinci → tech-lead → {builders} → {gates} → back to tech-lead**

### Control plane — no write tools

**`davinci`** · Opus 5 · `effort: high`

- Classifies request (trivial / bounded / architectural), clarifies, writes `.devteam/brief.md`.
- Only agent with `AskUserQuestion`. Caps questions at 3–4 with a "you decide" escape hatch.
- `tools: Agent(tech-lead)` and nothing else. No `Write`/`Edit` except `.devteam/brief.md`.
- Sets the taste-skill dials (`DESIGN_VARIANCE`, `MOTION_INTENSITY`, `VISUAL_DENSITY`) from the brief so the user never configures them by hand.

**`tech-lead`** · Opus 5 · `effort: xhigh`

- Reads `.devteam/brief.md`, dispatches specialists, arbitrates, re-routes failed gate verdicts.
- No `Write`/`Edit` — structurally cannot skip its own chain of command by coding directly.
- `tools: Agent(infra-architect, backend-engineer, frontend-engineer, security-engineer, code-reviewer)`
- `maxTurns` ceiling so a confused lead surfaces rather than spirals.

### Builders — scoped write access

**`infra-architect`** · Fable 5 · `effort: high`

- Scaffolding, conventions, and the `stack-profile` contract every other agent reads.
- Prefers running real generators (`create-next-app`, framework CLIs) over hand-writing config from training data.
- Output must pass the foundation gate before any builder starts.
- Works in the project tree, not an isolated worktree. Worktree isolation was tried and removed: a live run showed its output stranded in `.claude/worktrees/` with no merge step, so the foundation never reached the agents depending on it.

**`backend-engineer`** · Opus 5 · `effort: high`

- APIs, data layer, server logic. Write scope: `src/api`, `src/server`, schema files.

**`frontend-engineer`** · Opus 5 · `effort: high`

- Art direction and build. Write scope: `src/app`, `src/components`, styles, `public/media`.
- `mcpServers:` scoped to Higgsfield for generative media.
- **Closed perception loop:** `preview_start` → `screenshot` → critique against the taste pre-flight → revise. Plus `resize_window` for mobile/tablet and `read_console_messages`. An agent writing CSS that cannot see the result is working blind; this is the single most important capability in the creative seat.

### Gates — read-only, `disallowedTools: Write, Edit`

**`security-engineer`** · Opus 5 · `effort: xhigh`

- Audits and reports. Never patches. Fixes route back through the owning builder.

**`code-reviewer`** · Opus 5 · `effort: high`

- Invoked twice per run with different lenses: **foundation gate** (architecture, before builders start) and **code review** (after builders finish).

---

## 4. Delegation contract

Both envelopes are files, not chat messages — hooks can read them and compaction cannot erode them.

**Dispatch** (lead → specialist) carries: path to `.devteam/brief.md`, the task, the **write scope** (globs), contract files to obey, and the **acceptance criteria IDs** this task owns.

**Report** (specialist → lead), at `.devteam/reports/<agent>-<n>.json`:

```json
{
  "agent": "backend-engineer",
  "status": "complete | blocked | needs_input",
  "files_changed": ["src/api/users.ts"],
  "criteria_addressed": ["AC-3", "AC-4"],
  "verification": [{ "cmd": "npm test", "exit_code": 0 }],
  "assumptions": ["Paginated at 25/page — brief did not specify"],
  "handoff_notes": "..."
}
```

**Gate verdict** mirrors it: `verdict: pass | fail`, plus `findings[]` where every blocking finding cites the acceptance criterion it violates. Findings that map to no criterion are advisory and never block — this is what stops gates bikeshedding a run.

### The load-bearing rule

**No agent may declare itself done.** `status: complete` is a claim. A task closes only when a gate returns `verdict: pass` against its criteria IDs. `verification` must carry real commands with real exit codes, so "I ran the tests" cannot be satisfied by assertion.

---

## 5. Hook gates

| Hook | Event | Blocks |
|---|---|---|
| `enforce-write-scope.js` | `PreToolUse` on `Write` / `Edit` | Denies writes outside the agent's declared scope, using `agent_type` from hook input. Frontmatter `disallowedTools` covers the coarse case for gates; this covers path scoping, which frontmatter cannot express. |
| `validate-report.js` | `SubagentStop` | Report exists, parses, no placeholder strings, `verification` populated. For `infra-architect`, additionally runs the foundation validator: required sections filled, no `TODO`/`TBD`, declared stack matches `package.json`. |
| `gate-completion.js` | `TaskCompleted` | Refuses completion until every acceptance criterion has a passing verdict. |

**Known unknown:** the docs are explicit that `TaskCompleted` exit 2 prevents completion and returns feedback; they are looser on exactly how `SubagentStop` surfaces a bounce-back. Increment 1 settles this empirically — it is one of the main reasons the slice exists.

---

## 6. Skill inventory

### Sourced

| Skill | Source | Verified | Goes to |
|---|---|---|---|
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | 81,195 stars, pushed 2026-08-24 | frontend |
| `web-design-engineer` | [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills) | 11,083 stars, pushed 2026-07-12 | frontend |
| `higgsfield` | bundled skill + MCP | connected | frontend |
| ctx7 / doc fetching | user global instruction | standing | infra, backend, frontend |

`taste-skill` also ships aesthetic directions (`minimalist-ui`, `industrial-brutalist-ui`, `high-end-visual-design`) that Davinci selects from the brief rather than the user configuring.

**Rejected:** `freshtechbro/claudedesignskills` — see D9.

**Deferred:** backend, infra and security skill stacks re-sourced the same way in a later pass. This pass was scoped to frontend by the user.

### Authored (the portable asset)

1. **`intake-brief`** — classify → clarify → brief, with template. Records *decided* vs *assumed* separately. Emits acceptance criteria.
2. **`delegation-contract`** — the two envelopes. Preloaded into all 7 agents, therefore must stay short: preloaded skills inject **full content** at agent startup.
3. **`stack-profile`** — the template infra fills and everyone reads.
4. **`foundation-review`** — architecture lens for code-reviewer's first invocation.

### Why the creative work can be gated objectively

The `taste-skill` pre-flight is 60 mechanical checkboxes — "max 1 eyebrow per 3 sections", "CTA text must fit one line at desktop", "4.5:1 contrast minimum". These become gate criteria. Taste stops being a matter of opinion at the gate.

### Generative media constraints (hard gate criteria)

- **Weight budget** — poster frames, `preload="none"`, lazy-load below fold.
- **`prefers-reduced-motion`** — a scroll-scrubbed video page needs a static path.
- **Credits are metered** — batch generation; never regenerate on a whim.

---

## 7. Layout

```
davinci/
├─ .claude-plugin/plugin.json
├─ settings.json          -> { "agent": "davinci" }
├─ agents/                -> 7 .md files (4 in increment 1)
├─ skills/                -> 4 authored skills + templates
├─ hooks/
│  ├─ hooks.json
│  ├─ scope-map.json
│  ├─ enforce-write-scope.js
│  ├─ validate-report.js
│  ├─ gate-completion.js   (increment 2)
│  ├─ lib/                 pure logic, unit tested
│  └─ test/
├─ docs/
└─ README.md
```

Runtime state (`.devteam/brief.md`, `.devteam/reports/`) lands in the *target* project, not here.

Development loop:

```bash
claude --plugin-dir /path/to/davinci
```

`/reload-plugins` picks up edits without a restart.

---

## 8. Increments

**Increment 1 — prove the mechanism.**
`davinci` → `tech-lead` → `infra-architect` → `code-reviewer`, plus `enforce-write-scope` and `validate-report`. Four agents, two hooks, one end-to-end run.

This exercises the entire mechanism *including a gate and a bounce-back*. Adding `backend-engineer` to the slice would prove nothing new — it is the same dispatch path a second time.

**Increment 2 — replicate.** `backend-engineer`, `frontend-engineer` (with taste stack and Higgsfield), `security-engineer`, `gate-completion.js`.

**Increment 3 — harden.** Agent prompt evals, backend/security skill sourcing.

---

## 9. Prerequisites and open items

- **BLOCKER: `git init`.** The playground is not a git repo. `isolation: worktree` requires git, and the review gates need `git diff` to scope changes. Both are load-bearing.
- **Open: model pinning.** `model: opus` (alias, tracks newest Opus) vs `claude-opus-5` (pinned, frozen behavior). Default is the alias, matching Anthropic's own orchestrator.
- **Assumption: stack seed.** First `stack-profile` seeded with Next.js + TypeScript as the default for "a website". One-file change.
- **Assumption: agent prompts stay stack-agnostic**; the stack lives in the swappable `stack-profile`. This is what makes the team portable.
- **Watch item: Fable 5 on `infra-architect`.** The highest-leverage seat — its output is the contract all others obey. Mitigated by templates, the foundation validator, the foundation gate, worktree isolation, and preferring real generators over hand-written config. If foundations come out thin in increment 1, promoting to Opus is one line.

---

## 10. Non-goals

- Agent teams / peer-to-peer messaging (see D1).
- Deploying anything. Davinci builds and gates; shipping stays manual.
- Multi-project orchestration. One repo per run.

---

## 11. Increment 2 corrections

Design changes the live run forced, recorded here because they revise decisions made earlier in this document rather than merely extending them.

- **Static web files moved builders.** `*.html`, `*.css`, `*.svg` moved from `infra-architect`'s scope (§3, Builders) to `frontend-engineer`'s. Scaffolding and markup/styling are different concerns, and leaving them on infra meant two agents could plausibly both own the same file. Scopes must stay disjoint. `hooks/test/scope.test.js` now asserts, for a representative set of paths, that no path is allowed for more than one scoped agent in `scope-map.json` — checked behaviourally by running `decideScope` against the real map for every scoped agent, not by comparing glob strings for equality — so a future grant that reintroduces an overlap fails the suite instead of surfacing as a runtime collision.
- **`frontend-engineer` uses an exhaustive `tools:` allowlist, deliberately, not `disallowedTools`.** A live probe showed `disallowedTools: Agent` inherits *every* MCP tool connected in whatever installation runs the plugin — in the probe environment that meant desktop control with arbitrary PowerShell/registry access, Cloudways server and DNS management, and Notion/Slack writes, none of it named in `scope-map.json` and none of it covered by the write-scope hook, which only matches `Write|Edit|NotebookEdit|Bash`. An allowlist is the only mechanism that keeps a builder confined to the surface it's actually meant to build; the cost is that new browser-MCP tools must be added to the list by name.
- **The stack-profile requirement (§5, `validate-report.js`) is no longer unconditional.** It now fires only on evidence of an actual scaffold: `requiresStackProfile()` inspects the report's own `files_changed`, unioned with independent evidence from `git status --porcelain` (`scaffoldEvidence()` in `hooks/lib/foundation.js`). The git cross-check exists because the report being graded is written by the agent being gated — trusting `files_changed` alone would let an agent under-report its way past the requirement.
