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
| `frontend-engineer` | Opus 5 | high | Art direction and build — owns markup, components, styles | scoped |
| `code-reviewer` | Opus 5 | high | Foundation gate, then code review | nothing |

`backend-engineer` and `security-engineer` still don't exist, so no backend or security work is routed yet.

## How it works

```
you → davinci → tech-lead → infra-architect → code-reviewer (foundation gate)
                                                    ↓
                                          frontend-engineer → code-reviewer (code review)
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

## Layout

```
davinci/
├─ .claude-plugin/plugin.json   plugin manifest
├─ settings.json                declares davinci as the main thread
├─ agents/                      the five agent definitions
├─ skills/                      intake, delegation contract, stack profile, foundation review, frontend craft
├─ hooks/
│  ├─ hooks.json                event wiring
│  ├─ scope-map.json            who may write what
│  ├─ lib/                      pure logic, unit tested
│  └─ test/                     90 tests, zero dependencies
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

Increment 2, verified by a live end-to-end run. The five agents above, both hooks, and 90 passing tests.

**Confirmed working in a real session.** The chain `davinci` → `tech-lead` → `infra-architect` → `frontend-engineer` runs, and produced a real single-page site: `index.html` (11.6KB) and `styles.css` (12.4KB). The brief that run actually used carried **thirteen** acceptance criteria, AC-1 through AC-13. Only the first five were ever checked, and they passed mechanically — exactly one stylesheet link, zero network calls, no `@font-face`, photo-free, correct file shape. The remaining eight, AC-6 through AC-13, were never checked; AC-13 (the `package.json` script actually serving the page) is recorded in the run's own report as explicitly not addressed, because every command that would have proven the script ran was denied. That report is the only one the run filed, and it carries `"status": "blocked"`. `frontend-craft`'s accessibility floor was honoured without being asked: `prefers-reduced-motion` handled and focus states defined, 19 CSS custom properties, 3 breakpoints, 9 headings, 5 sections. `infra-architect` scaffolded into the project tree (not an isolated worktree) and, unprompted, wrote an inline Node preview server into `package.json`'s `start` script. Two of the three enforcement layers are corroborated as having fired against a real agent in this run. The report gate bounced a malformed report repeatedly. The write-scope hook denied two genuine write attempts by `infra-architect` — one to a path outside the project directory entirely, one out-of-scope inside it — both carrying the exact denial text `hooks/lib/scope.js` produces, glob list included. The Bash guard was not exercised in this run; it remains verified only by direct invocation in increment 1.

**Known limits, stated plainly.**

- Nobody has seen the page with their own eyes in an automated session. The browser pane does not composite headlessly, so verification here was structural — the rendered DOM read back — not visual. `frontend-craft`'s perception loop has a third tier for exactly this case: say so rather than imply you looked. That applies to the tooling used in this run as much as it applies to the agent.
- A full chain run took upwards of fifteen minutes and was truncated more than once.
- `frontend-engineer` filed no report in the run that produced the page above; it was most likely still being bounced by the report gate when the run was cut off.
- Browser-MCP access under a `tools:` allowlist is confirmed by mechanism — an explicit allowlist drops unnamed MCP tools, so named ones are kept — but has never been directly sighted, because no test environment so far has had that server connected. The `claude` CLI itself carries no browser MCP at all.
- `backend-engineer` and `security-engineer` still don't exist, so no backend or security work has ever been routed.

And `davinci` itself, running as the main thread, is still **not** governed by the write-scope hook: a main-thread agent presents no agent identity to hooks, so its "brief only" restriction is protocol, not enforcement.

Design rationale and the decisions behind the architecture are in [docs/design.md](docs/design.md); what was found by the live run is in [docs/verification-status.md](docs/verification-status.md).

## License

MIT
