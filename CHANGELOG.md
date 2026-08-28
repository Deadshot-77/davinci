# Changelog

## 0.10.0

Agents that think, and know when to stop. Two channels reach up out of a
dispatch. A `questions` array halts the asking agent — it reports `needs_input`
rather than building past an open question, because the answer can change what
it already wrote — and travels to `davinci`, the only agent that can reach the
user. Every question carries options and a default, so an unattended run applies
the default and continues instead of dying. An `observations` array does not halt
anyone: it hands the lead something noticed in passing, and the lead must read
the file and rule `act`, `defer`, or `dismiss` on every one. Initiative scales
with the tier — on scaffolding an agent does exactly what was asked.

Fixes three defects a live tiering run exposed. Findings must now carry their
text in `description`; the run filed 54 under `detail` and `title` and nothing
checked. The placeholder detector no longer matches the bare English word, which
had bounced the security gate four times for discussing placeholder credentials.
And `davinci` carries its closed classification set, its unattended rule, and its
relay duty in its own body, because a main-thread agent receives neither its
declared skills nor its declared tools.

## 0.9.0

Spend and strictness become one decision. Adds the `work-tiers` skill: the lead
gives every task a tier — `load-bearing`, `standard`, or `scaffolding` — from what
the work carries rather than how large it is, and that single tier sets the model
override, the review fan-out depth, whether a revision pass runs before the gate,
and which gates run at all.

It also sets the bar. A new `CRAFT` criterion blocks regardless of the brief, the
way `SECURITY` does, but only on load-bearing work and only for three defects: an
untested error path that can fail in production, a discarded error cause, and an
exported interface with no test at all. Everywhere else those stay advisory, so
the floor is high where being wrong is expensive and cheap where it is not.

On load-bearing work builders now critique their own output against `code-craft`
and revise before the gate sees it. `review-lens` preloads `code-craft` rather
than invoking it through the `Skill` tool — a reviewer that has to remember to
load its own standard is a reviewer that sometimes does not.

## 0.8.0

An authoring standard for the code itself. Adds the `code-craft` skill —
dependency direction, modules that earn their existence, errors that tell the
truth, tests confirmed to fail before they are trusted, and the tells that give
away machine authorship. Preloaded into every agent whose write scope includes
source, verified by a test derived from the scope map rather than a hand-kept
list. `review-lens` gains a sixth lens, `craft`, which loads the same skill so
builders and reviewers are judged against one standard. Also adds a test that
catches an agent referencing a skill that no longer exists — the failure mode
the `security-review` rename could have caused silently.

## 0.7.0

The frontend agent can see. Adds `scripts/shoot.mjs`, a zero-dependency headless
screenshot driver that finds an installed Edge or Chrome, verifies its output is a
real PNG, and fails loudly rather than letting an agent believe it looked when it
did not. The perception loop in `frontend-craft` now requires rendering over HTTP,
reading the image, and a mobile pass — with both screenshot paths recorded in the
report. Given sight, the same agent fixed a composition flaw that was invisible in
its own source.

## 0.6.0

The full chain runs end to end and produces working software. Adds the fix that
made it possible: the foundation gate now validates every Directory map assignment
in the stack profile against the real write-scope map, so a contract that assigns a
path an agent cannot write fails at the gate instead of stranding a builder three
stages later. The scope map is widened for the layouts profiles reasonably choose,
and the lead now treats both gates as mandatory after a run silently skipped the
security review.

## 0.5.0

Parallel review fan-out, verified live. Four `review-lens` agents run concurrently at
depth three and the gate synthesises their verdicts. Fixes three defects that only
appear under concurrency: report filenames now carry a per-dispatch label, the give-up
counter is keyed per agent instance rather than per type, and the `status`/`verdict`
vocabularies are stated as closed sets after agents invented `partial` and
`pass-with-findings`. Gates now prove completion with a verdict rather than a shell
command — demanding one from a read-only reviewer invited the fabrication the rule
exists to prevent.

## 0.4.0

Parallel review fan-out. Adds a `review-lens` agent that the gates dispatch several
of at once — correctness, silent-failure, types, tests, secrets — then synthesise.
`tech-lead` now dispatches the two builders together, their scopes being provably
disjoint. The report validator derives its governed-agent list from `agents/` on disk
instead of a hardcoded array, so a new agent can no longer slip past it. Built and
unit-tested; not yet exercised in a live run.

## 0.3.0

`backend-engineer` and `security-engineer` complete the roster, plus the
ownership collision their addition exposed.

**Agents.** `backend-engineer` (Opus 5, high effort) — APIs, server logic, and
the data layer, scoped to `src/api`, `src/server`, `src/lib`, `src/types`,
`src/index.ts`, `prisma/**`, `tests/api/**`. `security-engineer` (Opus 5, xhigh
effort) — a read-only security gate that audits changed code via `git diff`
and reports; it never patches. Its read-only confinement comes from the
exhaustive `tools: Read, Glob, Grep, Bash, TodoWrite` allowlist in
`agents/security-engineer.md`, not from its `disallowedTools: Write, Edit,
NotebookEdit` line — per `docs/design.md` §11, a denylist inherits the
entire connected MCP surface (desktop control, server management,
messaging, deploy), so the allowlist is what actually confines it. Both new
agents are wired into `hooks/scope-map.json`, into `davinci`'s `Agent(...)`
roster (the session-wide allowlist every downstream dispatch draws from),
and into the `SubagentStop` matcher in `hooks/hooks.json`.

**Skills.** `security-audit` — governs what `security-engineer` checks and
how it decides blocking versus advisory findings.

**Ownership collision resolved.** Adding `backend-engineer` exposed a genuine
overlap: `src/lib/**` was claimed by both `infra-architect` and
`backend-engineer`, and `app/**` sat on `infra-architect` despite being a
frontend directory layout. `src/lib/**` (plus `src/types/**` and
`src/index.ts`) moved fully to `backend-engineer` — it's application code, not
scaffolding. `app/**` moved fully to `frontend-engineer` — it's the
non-`src/` Next.js convention for the same territory `frontend-engineer`
already owns under `src/app/**`. `infra-architect` no longer claims either
glob. Some paths under `src/` (e.g. `src/utils/**`) are now unowned by design:
an unowned path is denied rather than guessed at, the agent reports blocked,
and the lead routes it. Fail-closed beats a silent overlap.

**Tests.** `hooks/test/scope.test.js`'s disjointness check now routes the new
territory (`src/api/**`, `src/server/**`, `src/lib/**`, `src/types/**`,
`src/index.ts`, `prisma/**`, `tests/api/**`, `app/**`) through `decideScope`
alongside the existing frontend and infra paths. New coverage: every
`agents/*.md` shipped on disk has a key in the real `scope-map.json` (the
check that would have caught this exact class of gap — a new agent added and
left ungoverned); both gates (`security-engineer`, `code-reviewer`) are denied
an ordinary write against the real map; `security-engineer` is denied a
write-intent Bash command via `decideBash` against the real map and still
allowed `git diff`. The overlap above was captured as a genuine failing test
before the scope-map fix landed, not asserted after the fact.

Test suite: 98 passing (up from 90 at the start of this increment).

**Known gap, carried forward.** `backend-engineer` and `security-engineer` are
built and governed but have never been dispatched in a live session — their
wiring is verified, their runtime behavior is not. See `docs/verification-status.md`.

## 0.2.0

`frontend-engineer` and its governing skill, `frontend-craft`, plus three defects
a live chain run found and fixed.

**Agents.** `frontend-engineer` (Opus 5, high effort) — art direction and build,
owns markup, components, styles, and public assets, with a capability-aware
perception loop: live browser preview when available, a headless-render fallback
when it isn't, and an honest "not verified" note in the report when neither is
possible. `backend-engineer` and `security-engineer` still don't exist.

**Skills.** `frontend-craft` — direction-first design judgment, the three design
dials, ten banned defaults, an accessibility floor, and a mechanical pre-flight.
Defers to `taste-skill` when installed alongside; falls back to its own guidance
when it isn't.

**Ceremony right-sizing.** A brief classified `trivial` now carries a
`Route: direct — <agent-name>` line; `tech-lead` skips the foundation gate for
it (quality gates still run). `intake-brief`'s classification line is now
mandated to be exactly `trivial` / `bounded` / `architectural` — a run found
`davinci` inventing "greenfield build" as a fourth label, which silently broke
the fast path; an unrecognised label now falls back to the full `bounded`
sequence instead of skipping steps.

**Scope move.** `*.html`, `*.css`, `*.svg` moved from `infra-architect` to
`frontend-engineer` — scaffolding and markup/styling are different concerns.
`hooks/test/scope.test.js` now routes representative paths through `decideScope` for
every scoped agent and asserts no path is writable by more than one, so
the two scopes can't drift back into overlap unnoticed.

**MCP allowlist security fix.** `frontend-engineer` ships with an exhaustive
`tools:` allowlist, not `disallowedTools`. A probe showed the denylist form
would have inherited every MCP tool connected in whatever installation runs
the plugin — desktop control, server management, messaging, deploy — none of
which the write-scope hook covers.

**Three live-run fixes**, found by an actual end-to-end chain run:

- Reports not matching the contract — `delegation-contract` now includes a
  literal copyable example report, verified against the validator by a unit
  test.
- Classification inventing labels outside the three the skill defines — the
  classification line is now mandated to one of three exact values.
- No way to detect unattended operation — `intake-brief` now has a rule for
  when no human can answer a clarifying question: decide, record the
  assumption, proceed. Never end a turn having only asked questions.

**Also:** the stack-profile requirement in `validate-report.js` is no longer
unconditional — it fires only on evidence of an actual scaffold, cross-checked
against `git status --porcelain` rather than trusting the self-reported
`files_changed` alone.

Test suite: 90 passing (up from 67 at the start of this increment).

**Known gap, carried forward.** The browser pane does not composite headlessly,
so the one real page this increment produced was verified structurally (DOM
read back), never visually. Browser-MCP access under the `tools:` allowlist is
confirmed by mechanism, not by direct sighting. See
`docs/verification-status.md`.

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
