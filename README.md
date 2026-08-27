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
| `code-reviewer` | Opus 5 | high | Foundation gate, then code review | nothing |

`backend-engineer`, `frontend-engineer` and `security-engineer` arrive in the next increment.

## How it works

```
you → davinci → tech-lead → infra-architect → code-reviewer (foundation gate)
                                                    ↓
                                            builders → gates → back to tech-lead
```

Three properties do the real work:

**Only `davinci` can talk to you.** Claude Code strips `AskUserQuestion` from every subagent, so the clarifying step is only possible at the entry point. Whatever ambiguity Davinci fails to resolve becomes an assumption someone downstream silently builds on — which is why it exists.

**The lead cannot code.** `tech-lead` has no write tools at all. A lead that *can* write will eventually decide it's faster to skip its own chain of command; removing the tools makes that impossible rather than merely discouraged.

**No agent may declare itself done.** `status: "complete"` is a claim. A task closes only when a gate returns `verdict: "pass"`, and reports must carry real commands with real exit codes — so "I ran the tests" cannot be satisfied by assertion.

## Requirements

- Claude Code
- Node.js 18 or later (the hooks use `node:test` and have zero dependencies)
- Git, for the review gates and worktree isolation

## Install

**Globally, for every project** — copy this directory into your skills directory and it loads automatically on the next session, with no marketplace or install step:

```bash
cp -r davinci ~/.claude/skills/davinci
```

**For a single project**, without installing anything:

```bash
claude --plugin-dir /path/to/davinci
```

After editing any agent, skill, or hook, run `/reload-plugins` to pick up changes without restarting.

**To share it with a team**, publish the containing repository as a plugin marketplace by adding a `.claude-plugin/marketplace.json` at the *repository* root — not inside this directory, where it would shadow the plugin's own manifest — with an entry whose `source` points at `./davinci`. Teammates then run `claude plugin marketplace add <owner>/<repo>`.

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
├─ agents/                      the four agent definitions
├─ skills/                      intake, delegation contract, stack profile, foundation review
├─ hooks/
│  ├─ hooks.json                event wiring
│  ├─ scope-map.json            who may write what
│  ├─ lib/                      pure logic, unit tested
│  └─ test/                     55 tests, zero dependencies
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

Increment 1. The four agents above, both hooks, and 55 passing tests.

**Not yet verified end to end.** Every hook has been tested by direct invocation with real hook-shaped input, which proves the logic. It does not prove Claude Code loads `hooks.json` at runtime, nor how a blocked agent behaves when a gate rejects it. See [docs/verification-status.md](docs/verification-status.md) for exactly what remains and the ten-minute procedure to close it.

Design rationale and the decisions behind the architecture are in [docs/design.md](docs/design.md).

## License

MIT
