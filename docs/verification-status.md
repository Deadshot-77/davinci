# Increment 1 run notes — 2026-08-27

## Status

Everything that can be checked by invoking code directly (unit tests, plugin
manifest validation, both hooks called with real hook-shaped JSON, the scope
map, the foundation gate) has been checked and is recorded below with actual
command output from this run.

What has **not** been checked is whether Claude Code's runtime actually wires
these hooks up against live agents — the interactive end-to-end scenario in
the Task 10 brief (Steps 2–5: launch `claude --plugin-dir ...`, dispatch the
full `davinci` → `tech-lead` → `infra-architect` → `code-reviewer` chain,
provoke a live deny and a live `SubagentStop` block). That requires a human
at an interactive terminal. Controller Ruling R21 (see
`.superpowers/sdd/2026-08-27-davinci-increment-1/progress.md`) made the same
call for the same reason and scoped Task 10 down to this write-up. Nothing
below should be read as claiming the interactive run happened — it did not.

Read this together with the execution record kept in the development repository
(`docs/superpowers/notes/2026-08-27-increment-1-rulings.md`), which has the full
task-by-task history and every ruling this note draws on.

> **Note on paths.** The plugin has since been moved into its own `davinci/`
> directory. Command output captured below is preserved verbatim as evidence and
> still shows the older repository-root paths; run the commands from the `davinci/`
> directory instead.

## Verified, with real command output

All commands were re-run from `<plugin-dir>` on
2026-08-27 against commit `HEAD` of `davinci/increment-1` (working tree also
carries one unrelated pre-existing uncommitted edit to
`docs/superpowers/plans/2026-08-27-davinci-increment-1.md`, not touched by
this task).

### 1. Unit suite

Command:

```
node --test "hooks/test/**/*.test.js"
```

Result: **47/47 passing**, matches the brief's expectation exactly.

```
ℹ tests 47
ℹ suites 0
ℹ pass 47
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

### 2. Plugin manifest validity

Command:

```
claude plugin validate .
```

Result:

```
Validating plugin manifest: <plugin-dir>\.claude-plugin\plugin.json

✔ Validation passed
```

Matches expectation exactly.

### 3. Write-scope hook, direct invocation

Three cases, each piping a hook-shaped JSON payload into
`hooks/enforce-write-scope.js` directly (not through Claude Code's runtime —
see "Not verified" below for why that distinction matters).

**a) Read-only agent denied.**

```
echo '{"agent_type":"code-reviewer","cwd":".","tool_input":{"file_path":"./src/x.ts"}}' | node hooks/enforce-write-scope.js
```

Output:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"code-reviewer is read-only and may not write src/x.ts. Report findings instead."}}
```

Process exit code: `0`.

**b) Ungoverned agent silent, exit 0.**

```
echo '{"agent_type":"general-purpose","cwd":".","tool_input":{"file_path":"./src/x.ts"}}' | node hooks/enforce-write-scope.js
```

Output: empty (no stdout). Process exit code: `0`.

**c) Fail-closed on an unrecognised input shape.**

```
echo '{"agent_type":"frontend-engineer","cwd":".","tool_input":{"weird_key":"x"}}' | node hooks/enforce-write-scope.js
```

Output:

```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"frontend-engineer used a write tool with no recognisable file path (tool_input keys: weird_key). Denied because write scope cannot be checked."}}
```

Process exit code: `0`.

All three match the brief's expectations. One detail worth flagging for
whoever reads this next: **every case above exits `0`, including the two
denies.** This hook does not signal a deny through the process exit code —
it signals through the JSON `permissionDecision` field in stdout, which is
Claude Code's documented mechanism for `PreToolUse` hooks. Only
`validate-report.js` (the `SubagentStop` gate) uses `process.exit(2)` to
block, because `SubagentStop` doesn't support the same structured
permission-decision field. Don't mistake exit code `0` on the write-scope
hook for "it didn't deny" — read the JSON.

### 4. Scope map correctness

Command:

```
node -e "const {decideScope}=require('./hooks/lib/scope.js');const m=JSON.parse(require('fs').readFileSync('hooks/scope-map.json','utf8'));for(const [a,f] of [['infra-architect','.devteam/stack-profile.md'],['frontend-engineer','.devteam/stack-profile.md'],['infra-architect','.devteam/anything-else.md']]) console.log((decideScope({agent_type:a,cwd:'/p',tool_input:{file_path:'/p/'+f}},m)?'DENY ':'allow'), a, f);"
```

Output:

```
allow infra-architect .devteam/stack-profile.md
DENY  frontend-engineer .devteam/stack-profile.md
DENY  infra-architect .devteam/anything-else.md
```

Matches expectation exactly: `infra-architect` can write the one file it
owns and nothing else in `.devteam/`; `frontend-engineer` (not yet built —
Increment 2) has no grant there at all.

### 5. Foundation gate on an unfilled template

Command:

```
node -e "const {validateFoundation}=require('./hooks/lib/foundation.js');const t=require('fs').readFileSync('skills/stack-profile/templates/stack-profile.md','utf8');console.log('unfilled template errors:',validateFoundation(t,null).length);"
```

Output:

```
unfilled template errors: 7
```

Matches expectation exactly — the raw template (all placeholder sections,
none filled in) trips all 7 required-section checks. An `infra-architect`
that copies the template without filling it in cannot pass the
`SubagentStop` foundation gate.

## Not verified — stated plainly

Everything above was checked by invoking the hook scripts and library
functions directly with hand-built JSON that matches the documented input
shape. None of it proves that Claude Code's own runtime actually behaves
this way when it is really running the plugin. Specifically, still open:

- **Does Claude Code actually load `hooks/hooks.json` and fire both hooks
  against real agents?** Every hook test so far — in this task and in Tasks
  3, 4, 8, 9 — invoked `enforce-write-scope.js` / `validate-report.js`
  directly as a subprocess with piped JSON. Nobody has confirmed the
  plugin's `hooks.json` is actually picked up by a running `claude` session
  and triggers on real `PreToolUse` / `SubagentStop` events.

- **Is `agent_type` populated in hook input for `davinci` itself?**
  `davinci` is activated as the *main thread* via the plugin's
  `settings.json` (`{"agent":"davinci"}`), not dispatched as a subagent via
  `Agent(...)`. Hook documentation says `agent_id` (and by inference
  `agent_type`) is populated "when in a subagent." If it is absent for a
  main-thread agent, `enforce-write-scope.js`'s early-exit
  (`if (!agent || !GOVERNED.includes(agent)) return null` — ungoverned,
  silent) means `davinci` is **not** governed by the write-scope hook at
  all, despite `hooks/scope-map.json` granting it a scope
  (`.devteam/brief.md`) as if it were. This is logged as **Observation O1**
  and accepted for Increment 1 under **Ruling R3** in the SDD ledger
  (`.superpowers/sdd/2026-08-27-davinci-increment-1/progress.md`, lines
  ~22–32): low consequence because `davinci`'s own prompt already forbids
  writing code, but genuinely unverified, and worth closing before
  `davinci` is trusted with anything higher-stakes.

- **How does `SubagentStop` exit 2 actually behave against a live agent?**
  `validate-report.js` calls `process.exit(2)` with a JSON
  `additionalContext` telling the agent to fix its report and finish again
  (see the `block()` function in `hooks/validate-report.js`). What's
  confirmed: the function is reachable and produces exit 2 with that
  payload when called directly (Task 9's controller reproduced this against
  a temp project: "gate with no verdict BLOCKS (exit 2)"). What's **not**
  confirmed: whether a real subagent, mid-`SubagentStop`, actually receives
  `additionalContext` as feedback and retries — versus just terminating,
  versus the parent agent silently swallowing the block. This was the
  plan's stated known unknown from the start and remains unknown. It is
  also explicitly the finding the original brief (Step 5) called "the
  finding that matters most from this task" — and it is exactly the part
  that cannot be produced without an interactive session.

- **Does the full `davinci` → `tech-lead` → `infra-architect` →
  `code-reviewer` chain run end to end?** Not run. No `.devteam/brief.md`,
  `.devteam/stack-profile.md`, or `.devteam/reports/*.json` has been
  produced by an actual agent in this increment — only by hand-built
  fixtures used in unit tests (Task 8's controller used a temp project to
  verify the scope fix; that is not the same as a real dispatch chain).

- **Is the Fable-authored foundation strong enough to justify promoting
  `infra-architect` off Fable (to Opus)?** Unanswerable without a real
  `infra-architect` run producing a real `stack-profile.md` for
  `code-reviewer`'s foundation-review lens to judge. No such run has
  happened.

## How to finish this verification

A human needs to run this interactively; it can't be scripted from an
automated session. Adapted from the original brief's Steps 1–5:

1. **Create a throwaway target project**, somewhere outside this repo:

   ```bash
   mkdir -p /tmp/davinci-e2e && cd /tmp/davinci-e2e && git init \
     && echo "# e2e target" > README.md && git add -A && git commit -m "init"
   ```

2. **Launch Davinci against it:**

   ```bash
   cd /tmp/davinci-e2e && claude --plugin-dir /path/to/davinci
   ```

   On startup, run `/context` and confirm:
   - the four agents (`davinci`, `tech-lead`, `infra-architect`,
     `code-reviewer`) are listed:
   - `davinci` is the active (main-thread) agent, per the plugin's
     `settings.json`.

   If either is missing, check `claude plugin validate .` and the `/plugin`
   Errors tab before going further — something about the runtime load
   didn't happen as designed, and nothing downstream can be trusted.

3. **Give it a task that exercises the whole chain.** Prompt:

   > Set up a minimal static landing page project with a build command and
   > one smoke test.

   Record, in order, whether each of these actually happened:
   1. Davinci announces a classification and asks at most four questions.
   2. `.devteam/brief.md` appears, with `AC-<n>` acceptance criteria and
      the Goal / Out of scope sections actually filled in (not blank —
      Task 6's review found the skill originally never instructed davinci
      to fill these; that was fixed under Ruling R15, but confirm the fix
      holds in practice).
   3. `tech-lead` dispatches `infra-architect`.
   4. `infra-architect` scaffolds files and writes
      `.devteam/stack-profile.md`.
   5. `code-reviewer` runs as the foundation gate and returns a verdict.

   Save (copy out) `.devteam/brief.md`, `.devteam/stack-profile.md`, and
   whatever lands in `.devteam/reports/*.json` — these are the artifacts
   that answer the Fable-vs-Opus question in the next step.

4. **Provoke the write-scope hook adversarially.** While the run is still
   active (or in a fresh turn against the same session), prompt:

   > Ask the code-reviewer to fix the issue it found directly.

   Expected: the write is denied, and the reason string names
   `read-only` (matching the `enforce-write-scope.js` message verified
   above: `"<agent> is read-only and may not write <path>. Report findings
   instead."`). Record the literal text Claude Code surfaces to the user —
   is it the hook's `permissionDecisionReason` verbatim, or reworded by the
   agent? If the edit *succeeds* instead of being denied, the hook is not
   wired at runtime — check `hooks.json` and the `/plugin` Errors tab, and
   also check whether this is `davinci` itself performing the edit (see
   Observation O1 above — if so, this failure is expected and already
   understood, not a new bug).

5. **Provoke the report gate adversarially.** Mid-run, delete the infra
   report and let the agent try to finish:

   ```bash
   rm -f .devteam/reports/infra-architect-*.json
   ```

   Expected: `validate-report.js` blocks the stop
   (`No report found at .devteam/reports/infra-architect-<n>.json. Write
   one before finishing.`), via `SubagentStop` exit 2 with
   `additionalContext`. **This is the observation that matters most.**
   Record specifically:
   - Did the agent visibly receive the feedback text and retry (i.e. write
     a report and finish again)?
   - Or did it just stop, with the user left to notice nothing happened?
   - Or something else — a generic error, a silent retry loop, a different
     message entirely?

   Whatever happens, write it down verbatim (screenshot or transcript
   excerpt) — this is the one thing in the whole increment that no amount
   of direct hook invocation can substitute for.

6. **Update this notes file** with what actually happened in steps 2–5 above
   — replace this "How to finish" section's *expectations* with *observed
   results*, and resolve the "Not verified" section's open items one by one.
   Then also answer, based on the saved `stack-profile.md`: was the
   Fable-authored foundation specific enough (per the
   `foundation-review` skill's specificity lens) that `infra-architect`
   should move off Fable, or thin enough that Increment 2 should hold it
   there another round?

7. **Clean up:**

   ```bash
   rm -rf /tmp/davinci-e2e
   ```

## Relationship to "Definition of done for Increment 1"

The plan's checklist (`docs/superpowers/plans/2026-08-27-davinci-increment-1.md`)
lists six items gating Increment 2. As of this note:

- [x] `node --test "hooks/test/**/*.test.js"` passes — 47/47 (verified above;
      note the plan's checklist still says "30 tests," which is stale — the
      true count grew task by task per the ledger's "Test totals amended"
      entries and the Task 10 brief itself already expects 47).
- [x] `claude plugin validate .` passes (verified above).
- [ ] A real run produced `.devteam/brief.md` with checkable acceptance
      criteria — **not done**, needs step 3 above.
- [ ] A read-only agent was actually denied a write by the hook, not by
      prompt compliance — **partially done**: denial by the hook logic is
      verified in isolation (Verified §3a); denial *inside a live Claude
      Code run* is not — needs step 4 above.
- [ ] A missing report actually blocked an agent from finishing —
      **partially done**: the block logic is verified in isolation
      (Verified §5, and Task 9's temp-project run); blocking *a live agent
      mid-run* is not — needs step 5 above.
- [ ] The `SubagentStop` bounce-back behaviour is written down — **not
      done**, this is the open question this whole note exists to flag;
      needs step 5 above.

Increment 2 (`backend-engineer`, `frontend-engineer` with the taste stack
and Higgsfield, `security-engineer`, `gate-completion.js`) was gated on a
human running steps 1–6 above and this file being updated with real
observations in place of expectations. That live run has since happened —
see "Increment 2 run notes" below for what it actually found, superseding
the expectations this section originally set out.

---

# Increment 2 run notes — 2026-08-27

`frontend-engineer` and `frontend-craft` shipped, and — unlike Increment 1 —
a live chain run actually produced output. What follows is what that run
established, and, in equal weight, what it did not.

## Verified, from a real session

- The chain `davinci` → `tech-lead` → `infra-architect` → `frontend-engineer`
  ran and produced a real single-page site: `index.html` (11.6KB) and
  `styles.css` (12.4KB).
- The brief this run actually used carried **thirteen** acceptance criteria,
  AC-1 through AC-13 (`davinci-test/.devteam/brief.md`). Only the first five
  were ever checked, and they passed mechanically: exactly one stylesheet
  link, zero network calls, no `@font-face`, photo-free, correct file shape.
  The remaining eight, AC-6 through AC-13, were never checked. AC-13 — the
  `package.json` script actually serving the page — is recorded in the run's
  own report as explicitly **not addressed**: every command that would have
  proven the script ran was denied. That report,
  `.devteam/reports/infra-architect-1.json`, is the only report the run
  filed, and it carries `"status": "blocked"`.
- `frontend-craft`'s accessibility floor was honoured without being asked:
  `prefers-reduced-motion` handled and focus states defined. 19 CSS custom
  properties, 3 breakpoints, 9 headings, 5 sections.
- `infra-architect` scaffolded into the project tree (not an isolated
  worktree) and, unprompted, wrote an inline Node preview server into
  `package.json`'s `start` script.
- Two of the three enforcement layers are corroborated as having fired against a real agent in this run. The report gate bounced a malformed report repeatedly. The write-scope hook denied two genuine write attempts by `infra-architect` — one to a path outside the project directory entirely, one out-of-scope inside it — both carrying the exact denial text `hooks/lib/scope.js` produces, glob list included. The Bash guard was not exercised in this run; it remains verified only by direct invocation in increment 1.

## Not verified — stated plainly

- **Nobody has seen the page with their own eyes in an automated session.**
  The browser pane does not composite headlessly, so verification was
  structural (the rendered DOM read back), not visual. `frontend-craft`'s
  perception loop has a third tier for exactly this — say so rather than
  imply you looked — and it applies to the tooling used to check this run
  as much as it applies to the agent that built the page.
- A full chain run took upwards of fifteen minutes and was truncated more
  than once.
- `frontend-engineer` filed no report in the run that produced the page
  above; it was most likely still being bounced by the report gate when the
  run was cut off.
- Browser-MCP access under a `tools:` allowlist is confirmed by mechanism —
  an explicit allowlist drops unnamed MCP tools, so named ones are kept —
  but has never been directly sighted, because no test environment so far
  has had that server connected. The `claude` CLI itself carries no browser
  MCP at all.
- `backend-engineer` and `security-engineer` did not exist as of this
  Increment 2 run, so no backend or security work had been routed through
  them yet. Both were added in Increment 3 — see the Increment 3 section
  below for their current, still-unexercised status; the "no backend or
  security work has ever been routed" gap described here was not closed by
  their addition, only by an actual dispatch, which still has not
  happened.
- The three defect fixes below, made in response to what this live run
  found, have not themselves been re-verified by another live run — only
  by unit tests and direct invocation.

## Defects the run found and fixed

1. **Reports didn't match the contract.** `infra-architect` invented its own
   report schema — adding fields like `dispatch`, `summary`,
   `criteria_not_addressed`, `hook_denials` — while omitting the required
   `files_changed` and `handoff_notes`, and its `verification` entries
   carried no `cmd`. The `SubagentStop` gate correctly bounced it, but
   repeatedly and without converging, burning the run's time budget on
   retries that never fixed the shape. Root cause: `delegation-contract`
   described the report fields in prose but never gave a literal example to
   copy, and agents conform to a template far more reliably than to a
   description. Fixed by adding a copy-pasteable minimal example JSON report
   to the skill, plus a unit test that runs that exact example through the
   validator to keep the doc and the gate from drifting apart again.
2. **Classification invented labels outside the three the skill defines.**
   `davinci` announced "Classification: greenfield build" in one run — not
   `trivial`, `bounded`, or `architectural` — so the `Route: direct` fast
   path could never trigger for it. Fixed by mandating the classification
   line be exactly one of the three values, lowercase, alone on the line,
   with an explicit wrong-example in the skill, and by having `tech-lead`
   treat any unrecognised label as `bounded` (full sequence, foundation gate
   included) rather than silently skipping steps.
3. **No way to detect unattended operation.** `intake-brief`'s "you decide"
   escape hatch only covers ambiguity the agent chooses to resolve itself;
   it had no rule for the case where `AskUserQuestion` cannot be answered by
   anyone at all. A headless run asked three genuinely good clarifying
   questions and then blocked forever, producing nothing. Fixed with an
   explicit unattended rule: when there is no way to get an answer, decide,
   record the choice under `assumptions`, and proceed — never end a turn
   having only asked questions.

---

# Increment 3 run notes — 2026-08-27

No live chain run happened this increment. This section is a direct
invocation and static-analysis pass, the same kind Increment 1 relied on —
not a substitute for the interactive run Increment 2 actually performed.

## What was added

- Two new agents completing the roster: `backend-engineer` (Opus 5, high
  effort — APIs, server logic, the data layer) and `security-engineer`
  (Opus 5, xhigh effort — a read-only security gate that audits `git diff`
  and reports, never patches).
- The `security-audit` skill, governing what `security-engineer` checks
  and how it decides blocking versus advisory findings.
- An ownership move resolving the collision `backend-engineer`'s addition
  exposed: `src/lib/**` (plus `src/types/**` and `src/index.ts`) moved from
  `infra-architect` to `backend-engineer`; `app/**` moved from
  `infra-architect` to `frontend-engineer`.

## Verified, by direct invocation

- Every agent shipped on disk under `agents/*.md` has a corresponding key
  in the real `hooks/scope-map.json` — proved by a test that reads the
  `agents/` directory from disk and checks each file's name against the
  map, so a new agent left ungoverned fails the suite instead of shipping
  silently.
- No path in the scope map is writable by more than one agent — `decideScope`
  run behaviourally against the real map for representative paths in every
  agent's territory, including the new `backend-engineer` and
  `frontend-engineer` grants.
- Both gates — `security-engineer` and `code-reviewer` — are denied an
  ordinary write against the real map, and `security-engineer` is
  additionally denied a write-intent Bash command via `decideBash` while
  still allowed `git diff`.
- 98 tests pass (`node --test "hooks/test/**/*.test.js"`), up from 90 at
  the start of this increment.

## Not verified — stated plainly

- **Neither new agent has ever been dispatched.** `backend-engineer` and
  `security-engineer` exist, are governed by the scope map, and are wired
  into `davinci`'s roster and the `SubagentStop` matcher — but no live
  session has ever routed a task through either of them. Built and
  governed is not the same claim as exercised.
- **No backend or security work has ever been routed.** The scope grants
  and the gate wiring are proved correct in isolation; nobody has watched
  `backend-engineer` write a route and prove it with a real test run, or
  watched `security-engineer` receive a real diff and decide.
- **The security gate's findings discipline has never been exercised
  against real code.** Whether `security-engineer` actually scopes to
  `git diff`, cites `AC-<n>` or the reserved `SECURITY` value correctly,
  and holds the line between blocking and advisory when facing a genuine
  vulnerability in a genuine diff — none of that has been observed. Only
  the prompt and the skill that govern it have been read, not watched in
  use.
- Increment 1's interactive end-to-end run was never performed at all —
  its hooks were verified only by direct invocation, and that gap was
  never closed by a later live run the way Increment 2 closed the
  equivalent gap for `infra-architect` and `frontend-engineer`.

## Increment 3 live run

Both new agents have now been dispatched. Findings, the three defects the run exposed,
and what remains unverified are recorded in [increment-3-run.md](increment-3-run.md).
