# Davinci

**An autonomous development team for Claude Code.**

You describe what you want. Davinci clarifies it, writes a brief, and hands it to a team of specialist agents who build it and gate each other's work — without you arbitrating every handoff.

The name is the architecture: Leonardo ran a *bottega*, a workshop where the master took the commission and set direction while specialists executed.

---

## The team

| Agent | Model | Effort | Role | Can write |
|---|---|---|---|---|
| `davinci` | Opus 5 | high | Clarifies your request, writes the brief, delegates | the brief only |
| `tech-lead` | Opus 5 | xhigh | Dispatches specialists, arbitrates verdicts, re-routes | nothing |
| `infra-architect` | Fable 5 | high | Scaffolding and the conventions everyone obeys | scoped |
| `backend-engineer` | Opus 5 | high | APIs, server logic, data layer | scoped |
| `frontend-engineer` | Opus 5 | high | Art direction and build — owns markup, components, styles | scoped |
| `security-engineer` | Opus 5 | xhigh | Audits changed code; reports, never patches | nothing |
| `code-reviewer` | Opus 5 | high | Foundation gate, then code review | nothing |
| `review-lens` | Opus 5 | high | One review lens — correctness, silent-failure, types, tests or secrets | nothing |

## How it works

```
you → davinci → tech-lead → infra-architect → code-reviewer (foundation gate)
                                                    ↓
                                  backend-engineer ─┤
                                  frontend-engineer ┘
                                                    ↓
                                    security-engineer, code-reviewer (gates)
                                                    ↓
                                              back to tech-lead
```

Three properties do the real work:

**Only `davinci` can talk to you.** Claude Code strips `AskUserQuestion` from every subagent, so the clarifying step is only possible at the entry point. Whatever ambiguity Davinci fails to resolve becomes an assumption someone downstream silently builds on — which is why it exists.

**The lead cannot code.** `tech-lead` has no write tools at all. A lead that *can* write will eventually decide it's faster to skip its own chain of command; removing the tools makes that impossible rather than merely discouraged.

**No agent may declare itself done.** `status: "complete"` is a claim. A task closes only when a gate returns `verdict: "pass"`, and reports must carry real commands with real exit codes — so "I ran the tests" cannot be satisfied by assertion.

## Requirements

- Claude Code
- Node.js 18 or later (the hooks use `node:test` and have zero dependencies)
- Git, for the review gates

## Install

**Globally, for every project** — clone into your skills directory and it loads automatically on the next session, with no marketplace and no install step:

```bash
git clone https://github.com/Deadshot-77/davinci.git ~/.claude/skills/davinci
```

**For a single project**, without installing globally:

```bash
git clone https://github.com/Deadshot-77/davinci.git
claude --plugin-dir ./davinci
```

After editing any agent, skill, or hook, run `/reload-plugins` to pick up changes without restarting.

**To share it with a team**, publish the containing repository as a plugin marketplace by adding a `.claude-plugin/marketplace.json` at the *repository* root — not inside this directory, where it would shadow the plugin's own manifest — with an entry whose `source` points at `./davinci`. Teammates then run `claude plugin marketplace add <owner>/<repo>`.

## Companion skills

Davinci works standalone — `frontend-craft` carries its own design judgment (a named direction, the three dials, ten banned defaults, an accessibility floor) and needs nothing else installed. It gets better with [`taste-skill`](https://github.com/Leonxlnx/taste-skill) alongside: a large, actively-maintained design rulebook with a mechanical pre-flight that goes well beyond what fits in one bundled skill file. Install it once, globally:

```bash
git clone https://github.com/Leonxlnx/taste-skill.git ~/.claude/skills/taste-skill
```

`frontend-craft` invokes it when present and follows what it says; when it's absent, `frontend-craft` falls back to its own guidance. `taste-skill` is a separate MIT-licensed project, not part of Davinci.

## Generated media (optional)

`frontend-engineer` can drive a media MCP server to produce imagery or video. The server identifier is per-installation and can't be shipped in this repository, so the block is commented out by default — uncomment and fill in the `mcpServers:` block at the top of `agents/frontend-engineer.md` with your own connected server's name. Without it, the agent produces static design instead; nothing breaks either way.

## Use

Start Claude Code in the project you want to work on. Davinci is the agent you talk to — everything else is delegated. Describe the work in plain language:

```
Add a contact form to the marketing site with server-side validation.
```

Davinci classifies the request, asks at most a few questions that genuinely change the outcome, writes `.devteam/brief.md` with checkable acceptance criteria, and dispatches the team. It reports back with what was built, which criteria passed, and — importantly — every assumption the specialists made along the way.

Runtime state lives in `.devteam/` **in the project being worked on**, never in this directory. Add it to that project's `.gitignore` if you'd rather not commit it.

## What is actually enforced

Prompts are advisory; hooks are not. Two hooks enforce the rules the harness can check:

- **Write scope** — each agent may only modify paths it owns. A read-only agent attempting any write is denied, and an agent whose tool input exposes no recognisable path is denied rather than waved through.
- **Report validity** — an agent cannot finish without a well-formed report, and a gate cannot finish without a verdict. The infra agent's foundation is additionally checked for unfilled sections and for declaring a framework that isn't in `package.json`.

**One honest limitation.** The Bash guard is best effort. An arbitrary shell cannot be made safe by pattern matching — it stops a read-only agent casually routing around its scope, not a determined one. Treat the enforcement as a strong seatbelt, not a sandbox.

## Letting agents verify their own work

**Why it matters.** The design's central rule is that no agent may declare itself done, and every report must carry real commands with real exit codes. Without a permission profile in place, that rule is unenforceable: every Bash call an agent makes is denied, so reports come back with `status: "blocked"` and an empty `verification` array — "I ran the tests" cannot be satisfied by assertion, but neither can it be satisfied at all. This is a real limitation, not a footnote: it went unnoticed for two full increments of live runs before the cause was understood.

`permissions.example.json`, at the root of this repository, is a permission profile scoped to verification only — `npm test`, `npm run build`/`lint`/`typecheck`, `node --test`, `git status`/`diff`/`log`, and read-only commands like `ls`, `cat`, `grep`. It deliberately omits `npm install`, `git commit`, `git push`, and anything that deploys: agents do not need them to verify, and granting them widens the blast radius of a mistake.

Apply it one of two ways:

- Copy its `permissions.allow` entries into the project's `.claude/settings.json`.
- Pass it directly on the command line, without touching the project's own settings: `claude --settings "$(cat permissions.example.json)"`.

**The trust requirement.** A project's `.claude/settings.json` permissions are silently ignored until the workspace is trusted: Claude Code prints `Ignoring N permissions.allow entries from .claude/settings.json: this workspace has not been trusted.` and proceeds as if the file weren't there. Trust the workspace by running Claude Code interactively in that directory once and accepting the trust dialog — there is no headless equivalent. Skip this step and the profile does nothing, silently, which is exactly how this went unnoticed. The `--settings` flag bypasses the trust requirement entirely, which makes it the reliable choice for headless or first-run dispatches.

**Two command shapes are refused regardless of the profile.** Compound commands joined with `;` or `&&` are refused per clause — `npm test; echo "exit=$?"` fails on the `echo` half even though `npm test` alone is allowed. Commands containing shell globs are refused with `Contains expansion`. Agents should run one plain command at a time.

### Letting `frontend-engineer` see its own work

The same problem — a claim nobody can check — applies to visual work.
`scripts/shoot.mjs` is a zero-dependency screenshot tool: it finds an
already-installed Chromium-family browser (Edge, Chrome, or Chromium — tried
via `CHROME_PATH`, then common install paths, then `PATH`), drives it
headlessly against a served URL, and verifies the output is a genuine PNG
before printing its dimensions. `frontend-engineer` runs it and then `Read`s
the resulting image, so a design gets critiqued against a real screenshot
instead of the code that supposedly produces it. No extra install is
required beyond whatever browser is already on the machine, and
`permissions.example.json` grants exactly the two commands this needs —
`node scripts/shoot.mjs` and `npx --yes serve`, for the plain-HTML case with
no dev server of its own. When no Chromium-family browser can be found, the
script fails loudly rather than silently, and the agent falls back to
stating in its report that visual verification was impossible and why —
never to implying it looked when it did not.

## Layout

```
davinci/
├─ .claude-plugin/plugin.json   plugin manifest
├─ settings.json                declares davinci as the main thread
├─ permissions.example.json     verification-only permission profile for agents
├─ agents/                      the seven agent definitions
├─ skills/                      intake, delegation contract, stack profile, foundation review, frontend craft, security review
├─ scripts/
│  └─ shoot.mjs                 zero-dependency headless screenshot tool
├─ hooks/
│  ├─ hooks.json                event wiring
│  ├─ scope-map.json            who may write what
│  ├─ lib/                      pure logic, unit tested
│  └─ test/                     170 tests, zero dependencies
└─ docs/                        design rationale and verification status
```

## Development

```bash
node --test "hooks/test/**/*.test.js"
```

Keep the quotes — Node expands the glob itself, so it works in both bash and PowerShell. The bare-directory form is broken on Node 24.

```bash
claude plugin validate .
```

## Status

Increment 3. Seven agents, both hooks, and 170 passing tests. Increment 2's
live end-to-end run verified the chain through `infra-architect` and
`frontend-engineer` (below); increment 1's interactive run was never
performed, and its hooks were verified only by direct invocation.
`backend-engineer` and `security-engineer` complete the roster and have both
now been dispatched. `backend-engineer` built a working endpoint with fifteen
passing tests; `security-engineer` audited it and returned `verdict: fail`,
blocking on two deliberately planted credentials and reporting ten further
findings nobody planted. Neither has yet run through the full chain from
`davinci` — both were dispatched directly to fit a time budget. The full record,
including three defects that run exposed, is in
[docs/increment-3-run.md](docs/increment-3-run.md).

**Confirmed working in a real session.** The chain `davinci` → `tech-lead` → `infra-architect` → `frontend-engineer` runs, and produced a real single-page site: `index.html` (11.6KB) and `styles.css` (12.4KB). The brief that run actually used carried **thirteen** acceptance criteria, AC-1 through AC-13. Only the first five were ever checked, and they passed mechanically — exactly one stylesheet link, zero network calls, no `@font-face`, photo-free, correct file shape. The remaining eight, AC-6 through AC-13, were never checked; AC-13 (the `package.json` script actually serving the page) is recorded in the run's own report as explicitly not addressed, because every command that would have proven the script ran was denied. That report is the only one the run filed, and it carries `"status": "blocked"`. `frontend-craft`'s accessibility floor was honoured without being asked: `prefers-reduced-motion` handled and focus states defined, 19 CSS custom properties, 3 breakpoints, 9 headings, 5 sections. `infra-architect` scaffolded into the project tree (not an isolated worktree) and, unprompted, wrote an inline Node preview server into `package.json`'s `start` script. Two of the three enforcement layers are corroborated as having fired against a real agent in this run. The report gate bounced a malformed report repeatedly. The write-scope hook denied two genuine write attempts by `infra-architect` — one to a path outside the project directory entirely, one out-of-scope inside it — both carrying the exact denial text `hooks/lib/scope.js` produces, glob list included. The Bash guard was not exercised in this run; it remains verified only by direct invocation in increment 1.

**Agents can now verify their own work.** For two increments, every report came back with empty `verification` because every Bash call an agent made was denied — the AC-13 line above is a direct record of that. The cause was found and fixed: see "Letting agents verify their own work" above. Passing `permissions.example.json` via `claude --settings` to a subagent let it genuinely run `npm test`, and its report came back with `npm test -> exit 0` — the first time an agent in this project confirmed its own work instead of reporting `blocked`. That exit code was inferred from the test runner's own summary output, not printed directly: a compound command like `npm test; echo "exit=$?"` is still refused on the `echo` half, so agents read success from what the runner itself prints rather than echoing the shell's exit status back.

**Parallel review, verified live.** The gates dispatch several `review-lens` agents in one message and synthesise their findings. Four lenses — correctness, silent-failure, types, secrets — ran concurrently at depth three against a real codebase and each filed a valid report with its own verdict; the gate synthesised twelve findings into `verdict: fail`. Concurrency was corroborated independently rather than taken on the report at face value: in an earlier run two lenses raced the same output path, which sequential dispatch cannot produce.

Three concurrency defects surfaced only under fan-out and are fixed: report filenames assumed one instance per agent type, the give-up counter was shared across instances of the same type, and the status/verdict vocabularies were loose enough that agents invented values like `partial` and `pass-with-findings`. A fourth is documented rather than fixed: roughly one lens instance per run still files a report without a verdict, exhausts its four attempts and trips the give-up valve. The run degrades correctly — that instance fails loudly and leaves a `GATE-FAILED` record while its siblings and the gate complete normally.


**The full chain runs end to end.** In a single pass, `davinci` → `tech-lead` → `infra-architect` → foundation gate → `backend-engineer` + `frontend-engineer` → a review lens produced a working service-status page: a health endpoint, a server entry point, a page and stylesheet, a manifest, and a test that genuinely runs and passes. All six reports filed were valid, no report was rejected, and the give-up valve never fired. Both builders reported `complete` — also a first. Across the run the agents executed real commands and recorded real exit codes rather than empty verification arrays.

One gate was skipped: `security-engineer` never ran and left no record. The lead now treats both gates as mandatory and must declare a gate explicitly rather than omit it — that change is unexercised. The full record, including the contract-versus-enforcement defect an earlier attempt exposed, is in [docs/full-chain-run.md](docs/full-chain-run.md).
**The frontend agent sees its own work.** `scripts/shoot.mjs` drives an already-installed Chromium-family browser headlessly — Edge or Chrome, no dependency and no install — and the agent reads the resulting PNG back with the `Read` tool, which renders images. For three increments the perception loop existed on paper and never executed; every design rule was applied blind.

It changes the output. A status page whose composition left a large dead zone was handed back to the same agent with the same skill and the same model, the only difference being that it could now screenshot and look. It produced a full-bleed layout that owns the viewport, kept the direction it was told to keep, and balanced what had been empty space. The before-and-after is in [docs/seeing-loop.md](docs/seeing-loop.md).
**Known limits, stated plainly.**

- Nobody has seen the page with their own eyes in an automated session. The browser pane does not composite headlessly, so verification here was structural — the rendered DOM read back — not visual. `frontend-craft`'s perception loop has a third tier for exactly this case: say so rather than imply you looked. That applies to the tooling used in this run as much as it applies to the agent.
- A full chain run took upwards of fifteen minutes and was truncated more than once.
- `frontend-engineer` filed no report in the run that produced the page above; it was most likely still being bounced by the report gate when the run was cut off.
- Browser-MCP access under a `tools:` allowlist is confirmed by mechanism — an explicit allowlist drops unnamed MCP tools, so named ones are kept — but has never been directly sighted, because no test environment so far has had that server connected. The `claude` CLI itself carries no browser MCP at all.
- `backend-engineer` and `security-engineer` are built and wired — scope map, roster allowlists, `SubagentStop` matcher — but have never run. No backend or security work has been routed through a live session, so nothing about their actual behavior is confirmed yet, only their governance.

And `davinci` itself, running as the main thread, is still **not** governed by the write-scope hook: a main-thread agent presents no agent identity to hooks, so its "brief only" restriction is protocol, not enforcement.

Design rationale and the decisions behind the architecture are in [docs/design.md](docs/design.md); what was found by the live run is in [docs/verification-status.md](docs/verification-status.md).

## License

MIT
