# Davinci

**An autonomous development team for Claude Code.**

You describe what you want. Davinci clarifies it, writes a brief, and hands it to a team of specialist agents who build it and gate each other's work — without you arbitrating every handoff.

The name is the architecture: Leonardo ran a *bottega*, a workshop where the master took the commission and set direction while specialists executed.

---

## The team

`/davinci:build` is the way in. It runs on your own session — the only place that can ask you anything — and dispatches the seven agents below.

| Agent | Model | Effort | Role | Can write |
|---|---|---|---|---|
| `tech-lead` | Opus 5 | xhigh | Dispatches specialists, arbitrates verdicts, re-routes | nothing |
| `infra-architect` | Fable 5 | high | Scaffolding and the conventions everyone obeys | scoped |
| `backend-engineer` | Opus 5 | high | APIs, server logic, data layer | scoped |
| `frontend-engineer` | Opus 5 | high | Art direction and build — owns markup, components, styles | scoped |
| `security-engineer` | Opus 5 | xhigh | Audits changed code; reports, never patches | nothing |
| `code-reviewer` | Opus 5 | high | Foundation gate, then code review | nothing |
| `review-lens` | Sonnet 5 | high | One review lens — correctness, silent-failure, types, tests, secrets or craft | nothing |

The lead overrides `model` per dispatch from the tier it assigns, so the table shows each agent's default rather than a fixed assignment.

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

Clone it anywhere, then point Claude Code at it:

```bash
git clone https://github.com/Deadshot-77/davinci.git
```

```bash
claude --plugin-dir ./davinci
```

That is the configuration everything here was built and tested against. To load
it in every session without the flag, add the directory to your Claude Code
plugin configuration, or publish the containing repository as a marketplace: add
a `.claude-plugin/marketplace.json` at the *repository* root — not inside this
directory, where it would shadow the plugin's own manifest — with an entry whose
`source` points at `./davinci`. Teammates then run
`claude plugin marketplace add <owner>/<repo>`.

After editing any agent, skill, or hook, run `/reload-plugins` to pick up
changes without restarting.

**Davinci does not take over your session.** Earlier versions shipped a
`settings.json` that made an entry agent the main thread. It has been removed: a
main-thread agent receives its prompt but not its identity, not its declared
tools, and none of its skills. Probed twice, it named itself
`davinci:orchestrator` once and `davinci:product-manager` the next, had
`intake-brief` in context neither time, invented a classification outside the
closed set, and ended a run having only asked questions with nothing built.

Your session stays your own. `/davinci:build` runs on it, does the intake, and
dispatches the team beneath it, where frontmatter is honoured and every agent is
confined by its own `tools:` allowlist and by the hooks.

## Use

```
/davinci:build Add a contact form to the marketing site with server-side validation.
```

The command classifies the request, asks only the questions that change the
outcome, writes `.devteam/brief.md` with checkable acceptance criteria, and
hands off to the tech lead. When the team finishes you get back what was built,
which criteria passed, every assumption the specialists made, and every
observation with the lead's ruling on it.

**The entry point is a command rather than an agent, and that is not a style
choice.** `AskUserQuestion` exists on the main thread and nowhere below it, so
only something running on your session can reach you — and an agent stopped on a
question needs exactly that. An entry *agent* was tried and does not work twice
over: on the main thread it loses its skills and its identity, and as a subagent
it cannot be dispatched at all, because the Agent tool silently excludes an agent
whose name matches its plugin. A test now guards that trap.

Runtime state lives in `.devteam/` **in the project being worked on**, never in
this directory. Add it to that project's `.gitignore` if you would rather not
commit it.

## Companion skills

Davinci works standalone — `frontend-craft` carries its own design judgment (a named direction, the three dials, ten banned defaults, an accessibility floor) and needs nothing else installed. It gets better with [`taste-skill`](https://github.com/Leonxlnx/taste-skill) alongside: a large, actively-maintained design rulebook with a mechanical pre-flight that goes well beyond what fits in one bundled skill file. Install it once, globally:

```bash
git clone https://github.com/Leonxlnx/taste-skill.git ~/.claude/skills/taste-skill
```

`frontend-craft` invokes it when present and follows what it says; when it's absent, `frontend-craft` falls back to its own guidance. `taste-skill` is a separate MIT-licensed project, not part of Davinci.

## Generated media (optional, and often absent)

`frontend-engineer` can drive a media MCP server to produce imagery or video, and by default does not have one. Two facts decide whether it can, both measured rather than assumed:

- **A wildcard in `tools:` does not work.** An agent declared with `tools: Read, mcp__*` receives exactly one tool — the pattern is dropped, not expanded. Every MCP tool must be named in full.
- **A connector missing from the startup tool list may still be reachable.** Deferred MCP tools load on demand through `ToolSearch`: a run whose init listing named only Notion, Spotify and Figma went on to generate a photograph with `mcp__claude_ai_Magnific__images_generate` after searching for it. An init listing is not an inventory — a claim to the contrary shipped here in 0.20 and was wrong. But `ToolSearch` is itself a tool and is absent from every agent allowlist, so today only the entry command can reach a deferred generator.

So the server must be one the CLI itself knows about (`claude mcp add …`), and its tool names listed on the `tools:` line in `agents/frontend-engineer.md`. Without that the agent produces static design and records in `assumptions` that no media server was reachable — which is the honest outcome, not a silent downgrade.


## What is actually enforced

Prompts are advisory; hooks are not. Two hooks enforce the rules the harness can check:

- **Write scope** — each agent may only modify paths it owns, and a denial names the agent that does own the path so the lead re-routes instead of guessing. Where nobody owns it, the denial says that too: a missing owner is a gap in the foundation, not a mistake by the builder that tripped over it.
- **Write scope, continued** — each agent may only modify paths it owns. A read-only agent attempting any write is denied, and an agent whose tool input exposes no recognisable path is denied rather than waved through.
- **Project scopes** — the shipped scope map fits one shape of project. `infra-architect` writes `.devteam/scope-map.json` for the project it is actually scaffolding, the foundation gate reviews it, and the hook enforces it — falling back to the shipped map when it is absent, unparseable, or invalid. Four rules hold regardless: only agents that ship, scopes stay disjoint, nothing under `.devteam/` beyond an agent own scratch, and a gate can never be given source scope. Details in [docs/project-scope-map.md](docs/project-scope-map.md).
- **Foundation first** — while `.devteam/stack-profile.md` does not exist, every builder write outside `.devteam/` is denied. The design always said no builder starts before the foundation gate passes; a live run showed the lead skipping it anyway, so it is now the hook's rule rather than the lead's intention. The agent that owns the stack profile is exempt, and so is a brief carrying `Route: direct`.
- **Report validity** — an agent cannot finish without a well-formed report, and a gate cannot finish without a verdict. The infra agent's foundation is additionally checked for unfilled sections and for declaring a framework that isn't in `package.json`.

**Gates can prove things, not just read them.** Each gate owns one scratch directory — `.devteam/scratch/<agent>/` — and nothing else. It builds a mutation harness there with the `Write` tool, which is checked by exact path, and runs `node --test` against it: a mutation the suite would not have caught is a finding with an exit code behind it. Four agents in a live run reported that a load-bearing review "silently degrades to reading" without this. No shell permission was widened to allow it, and an agent whose only writable ground is coordination state stays bash-guarded — handing the gates a scratch path would otherwise have switched their shell guard off entirely.

**A script that writes a file is a write the Bash guard cannot see.** It matches redirection, `sed -i`, `cp`, `node -e` — not `node scripts/shoot.mjs <url> <path>`. A read-only gate could therefore write a PNG over a source file, or outside the project entirely. `shoot.mjs` now refuses any output path outside the project or without a `.png` extension, and refuses before launching the browser rather than after it has already written. The guard belongs in the tool, not the hook: patching the hook means chasing every script that happens to write a file. Found by this plugin’s own foundation gate, auditing the run it was part of.

**One honest limitation.** The Bash guard is best effort. An arbitrary shell cannot be made safe by pattern matching — it stops a read-only agent casually routing around its scope, not a determined one. Treat the enforcement as a strong seatbelt, not a sandbox.

## Letting agents verify their own work

**Why it matters.** The design's central rule is that no agent may declare itself done, and every report must carry real commands with real exit codes. Without a permission profile in place, that rule is unenforceable: every Bash call an agent makes is denied, so reports come back with `status: "blocked"` and an empty `verification` array — "I ran the tests" cannot be satisfied by assertion, but neither can it be satisfied at all. This is a real limitation, not a footnote: it went unnoticed for two full increments of live runs before the cause was understood.

`permissions.example.json`, at the root of this repository, is a permission profile scoped to verification only — `npm test`, `npm run build`/`lint`/`typecheck`, `node --test`, `git status`/`diff`/`log`, and read-only commands like `ls`, `cat`, `grep`. It deliberately omits `npm install`, `git commit`, `git push`, and anything that deploys: agents do not need them to verify, and granting them widens the blast radius of a mistake.

Apply it one of two ways:

- Copy its `permissions.allow` entries into the project's `.claude/settings.json`.
- Pass it directly on the command line, without touching the project's own settings: `claude --settings "$(cat permissions.example.json)"`.

**The trust requirement.** A project's `.claude/settings.json` permissions are silently ignored until the workspace is trusted: Claude Code prints `Ignoring N permissions.allow entries from .claude/settings.json: this workspace has not been trusted.` and proceeds as if the file weren't there. Trust the workspace by running Claude Code interactively in that directory once and accepting the trust dialog — there is no headless equivalent. Skip this step and the profile does nothing, silently, which is exactly how this went unnoticed. The `--settings` flag bypasses the trust requirement entirely, which makes it the reliable choice for headless or first-run dispatches.

**`node -e` is refused, on purpose.** A builder is not bash-guarded by the write-scope hook — only read-only agents are — so this profile is the only thing between a builder and writing outside its scope through Node's filesystem API. Granting an escape hatch to save one command would remove the plugin's central safety property, and a test fails the suite if anyone adds one. When an agent needs real code to prove something, it writes a test and runs `node --test`: the exit code is real, the assertion survives, and `code-craft` wanted the branch covered anyway.

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

## Agents that think, and know when to stop

A specialist on a real team does not silently fix what is not theirs, and does
not pretend they did not see it. Two channels carry that, and they behave
differently on purpose.

**A question stops the agent.** Two things earn one, and only after the brief,
the stack profile and the code have been read: the agent cannot proceed without
the answer, or the task is `load-bearing` and the choice is expensive to reverse
— what identifies a client, the shape of stored data, a public contract, where
state lives. The second case is deliberate: an agent competent enough to pick
something defensible will otherwise decide every one of those for you and tell
you afterwards. Craft decisions stay the agent's own on any tier. When one is
earned, the agent halts where it stands and reports `needs_input` with the
question attached. It does not pick a
default and build on it, because the answer can change the shape of what was
already written. No agent below `davinci` can reach you, so the question travels
up as structured data and `davinci` asks. Every question carries two to four
concrete options and a stated default, so an unattended run never dies on one —
the default is applied and the agent re-dispatched. The validator rejects a
question with no default, with fewer than two options, or attached to any status
other than `needs_input`.

**An observation does not stop the agent.** Something noticed in passing, outside
its own task, goes to the tech lead as an `observations` entry while the agent
finishes its work. Every entry must name a consequence — something that breaks,
costs, or misleads — or the validator rejects it as a preference. The lead reads
the file before ruling and must `act`, `defer`, or `dismiss` each one; acting
means a new dispatch with its own scope and tier, never "while you're in there".
Every observation and its ruling reaches you.

How much initiative is expected scales with the tier. On `scaffolding` work, or
any `trivial` brief, an agent does exactly what was asked and nothing more —
asked to write hello, it writes hello. On `standard` and `load-bearing` work it
is expected to think.

## The report is the record; what comes back is a digest

An agent runs in its own context so the noise stays with it and only the conclusion travels. Handing a caller the full text of a report moves the noise instead of containing it — the documented failure mode of multi-agent systems, and one this plugin had. Measured on a real run: 21 reports came to roughly **64,000 tokens**, while the fields carrying an actual decision — `status`, `verdict`, `tier`, `criteria_addressed` — came to under **1,000**. The rest was `handoff_notes`, `findings` and `assumptions` being read a second time by an agent that needed one line.

So reports stay rich on disk, and every agent returns a fixed digest: its report path, status, verdict, criteria, and counts of files, blocking findings, questions and observations. A caller opens the full report when the digest gives it a reason — a status other than `complete`, a `fail` verdict, a blocking count above zero, a question, or a number that contradicts the dispatch. A test derives the dispatching agents from their tool lists, so one added later cannot arrive without the rule.

## Spending the budget where it buys quality

The product is the objective. Tokens and wall-clock are the budget spent
reaching it — not a second goal competing with it, and not something to
minimise on its own.

Spending them evenly is the same mistake made twice. Opus and a six-lens review
over a fixture buys nothing and slows the run; a cheap pass over an
authorisation path ships a defect nobody catches. So `work-tiers` has the lead
give every task a tier from what the work carries rather than how large it is —
blast radius, exposure to untrusted input or credentials, whether anything else
builds on its shape, and how long it lives. Three lines touching auth are
load-bearing. Four hundred lines of static copy are not.

| Tier | Revision pass | Review depth | `CRAFT` findings |
|---|---|---|---|
| `load-bearing` | mandatory before the gate | all six lenses, both gates | **block** |
| `standard` | builder's call | correctness, tests, craft | advisory |
| `scaffolding` | none | one lens, or the gate reads it | advisory |

**Model is a separate question.** The tier says how badly it hurts to be wrong; the model says how much reasoning the work needs. Collapsing them was a real defect: on a greenfield build almost every task passes the reversibility test, so a live run tiered 19 of 21 dispatches `load-bearing` and ran almost all of them on Opus — the lead obeying the rubric exactly. The rule is now the field's: default to Sonnet, drop to Haiku for mechanical work, escalate to Opus for architecture and the genuinely subtle — **or when a gate has already failed the work.** That last loop is one most systems cannot close, because they have no gate to observe the stumble.

One decision sets both ends, which is the point: the tier that says how much to
spend is the tier that says how strictly to judge the result. `CRAFT` blocks
regardless of what the brief asked for — like `SECURITY` — but only on
load-bearing work, and only for three defects: an error path that can fail in
production with no test exercising it, a discarded error cause on such a path,
and an exported interface with no test at all. Applying that floor everywhere
produces review churn that slows delivery without improving the product;
applying the scaffolding floor everywhere ships untested auth.

On load-bearing work the builder also critiques its own output against
`code-craft` and revises before the gate ever sees it. A gate bounce costs a
full re-dispatch plus a second gate run; a self-critique costs a turn.

**One honest limit on the mechanism.** The `Agent` tool takes a `model` override
that beats an agent's frontmatter, and that lever is real. It takes no effort
override — effort is fixed per agent definition — so the skill says so plainly
rather than letting the lead write one and believe it took.

## Restraint with no counterweight converges

Three runs of the same brief produced three near-identical pages: near-black ground, a display serif with one word in italic accent, monospace letter-spaced labels, hairline rules, a right-aligned spec table, and nothing to look at. Each believed it had committed to its own direction. Each passed the banned-defaults check — because every entry there is a prohibition, and an empty page violates none of them.

`story-direction`’s escalation ladder caused it. Words, structure, still, motion, with *stop as soon as the beat does its job* — every clause biasing toward less, and no rule anywhere saying a beat might require showing. A studio selling brand and interface systems shipped a page demonstrating none of its work, with a selected-work section listing client names as text.

**The ladder now has that rung.** If a beat’s job is to show, showing is the job and type cannot substitute. The test is: *could this be the same page for a different company?* Where showing is genuinely impossible — no generator, no real work — say so, rather than substituting a list and letting it pass as the section it replaced.

Two things follow. **Departing from a convention is not inverting it**: the audit found every competitor leading with a full-bleed reel, and the departure taken was *no imagery*, which discards what those pages did right. And the idiom is now a banned default in its own right, named beside Inter and the three cards — unlike those, this plugin produced it three times unprompted, which makes it the likeliest of all to recur.

## The page is directed, not assembled

A page built section by section — each one competently designed — arrives looking like a list of components. `story-direction` runs before any visual decision and decides what the page is *for*: the claim in one sentence a reader could disagree with, then three to six beats with the job each one does, in order. **A beat that leaves the reader unchanged is a section you can delete.**

Only then does it ask what a beat needs, in escalating order: words and hierarchy, then structure, then a still, then motion. Most beats stop at the first. Motion is reserved for where the change itself is the point, and the page has to make its argument with every animation disabled — a beat that is incomprehensible without movement is staged rather than designed.

**Asset briefs are provider-neutral.** The brief names what the asset shows, what it must make the reader understand, its form and duration, the shared treatment — and `without it`, the fallback if it cannot be made. Only then is it mapped onto whatever generator happens to exist: a CLI on `PATH`, an MCP tool, a stock library, or CSS and SVG by hand. The mapping is mechanical; the brief is the work, and it survives the provider being swapped. A test fails the suite if any vendor name appears in the skill.

One more rule holds a page together: the treatment is decided **once**, before the first brief, and repeated in every one after it. Assets generated independently look generated — a moody long-lens hero above flat vector illustration is two art directions and no identity.

## The frontend agent researches before it designs

A designer handed a brief does not start drawing — they find out what the category already looks like, by looking. The agent can now do that literally: `scripts/shoot.mjs` points at any URL, not only a local dev server, so it renders three or four real competitors and **reads the images** before deciding anything. Verified against a live site before the instruction was written.

The discipline matters more than the capability. Research done naively produces convergence — four sites use a centred hero over a gradient, the agent absorbs that as what the category looks like, and builds a fifth, arriving at the training-data average this skill exists to break by way of the internet. So the rule is to name the convention in order to depart from it, and the required output is a sentence of the form *“they all do X; this one will do Y instead, because Z.”*

**Better is not the same but nicer.** Improving a competitor’s spacing produces a derivative worse than either an honest copy or an original. Better means finding what the category collectively fails to do — the thing everyone’s visitors put up with — and doing that.

Gated to work with a real visual surface at `standard` or `load-bearing` tier, capped at three or four references, and recorded in `assumptions` — including, when the network or a headless-hostile site makes it impossible, a plain statement that it could not look.

## Code that reads as though a person wrote it

Seeing fixed how the output looks. `code-craft` is the same argument applied to
what is underneath it: the authoring standard every agent that can write source
carries into the job, rather than a checklist a reviewer applies afterwards.

The average of every repository in a training set has a shape — everything
imports everything, nothing is ever deleted, every error is caught and
discarded, and whatever fits nowhere lands in `utils`. It compiles and it
passes a glance. The skill names that shape and rules it out: read the
neighbouring files before writing so the change belongs; read each changed file
whole after the last edit, because a patch never shows you what you assembled;
take a deletion pass and record its result either way; keep dependency running
one direction; handle an error or propagate it but never both and never
neither; and confirm a new test fails against the unfixed code before trusting
it.

It is enforced at both ends. Every agent whose write scope includes source
preloads it — checked by a test that derives the list from the scope map, so an
agent added later with a source scope fails the suite rather than shipping
without the standard. And `review-lens` gained a sixth lens, `craft`, which loads
the same skill and reviews against it, so builders and reviewers are held to one
standard instead of two.

See [docs/work-tiers.md](docs/work-tiers.md) for the rubric in full, and
[docs/code-craft.md](docs/code-craft.md) for what the standard found when applied to
the team's own output.

## Layout

```
davinci/
├─ .claude-plugin/plugin.json   plugin manifest
├─ commands/build.md            the /davinci:build entry command
├─ permissions.example.json     verification-only permission profile for agents
├─ agents/                      the seven agent definitions
├─ skills/                      intake, delegation contract, work tiers, stack profile, foundation review, story direction, frontend craft, code craft, security audit,
│                               motion craft, work placement + seven invoked on demand: technical seo, caching: technique research, generating assets, parallax layers, glass surfaces, scroll video
├─ scripts/
│  ├─ shoot.mjs                 zero-dependency headless screenshot tool
│  ├─ waste.mjs                 zero-dependency orphan, broken-link and asset-weight sweep, with optional budget
│  ├─ seo.mjs                   zero-dependency check of what built pages declare to crawlers and screen readers
│  └─ png-crop.mjs              dependency-free PNG crop, for true small viewports
├─ hooks/
│  ├─ hooks.json                event wiring
│  ├─ scope-map.json            who may write what
│  ├─ lib/                      pure logic, unit tested
│  └─ test/                     322 tests, zero dependencies
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

Increment 3. Seven agents, one entry command, both hooks, and 322 passing tests. Increment 2's
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
**The tiering run.** A live run built API-key authentication on the existing service and produced the first evidence that the spend rubric works: the lead set `model` explicitly on twelve of seventeen dispatches — Opus for the auth build and the load-bearing review fan-out, Sonnet for the README and `.editorconfig`. The builder ran the mandatory revision pass, recorded its deletion pass, and went further than asked, proving its own suite could fail with a six-mutant battery against the new module. The scope hook denied `backend-engineer` the README and the lead re-routed it to the agent that owns `*.md`.

It also found three defects, now fixed: 54 findings filed their prose under invented keys because nothing validated `description`; the placeholder detector bounced the security gate four times for writing the word "placeholder" in a sentence about placeholder credentials; and `davinci` on the main thread receives neither its declared skills nor its declared tools, which killed the first attempt outright. The full record is in [docs/live-run-auth.md](docs/live-run-auth.md).

**The rate-limiting run.** A second live run added per-client rate limiting and request logging, and produced 32 passing tests, a new `src/lib/` with one-way dependencies, and the first complete fail → fix → re-gate cycle: the tests lens blocked on a test that could not fail — stdout and stderr were teed into one buffer, so a logger switched to stderr still passed — the lead re-dispatched, and a re-gate passed.

The observation channel carried 17 findings from 8 agents, including the silent-failure lens independently reporting the five bare catches in `src/server.js`: noticed, correctly left alone as out of scope, and escalated with a consequence. Findings filed under invented keys went from 54 to zero. The question channel did not fire, and `CRAFT` has still never blocked. The full record is in [docs/live-run-rate-limit.md](docs/live-run-rate-limit.md).

**The entry command run.** The first run through `/davinci:build` completed the full chain with both gates returning `verdict: pass` — and produced the first question the channel has ever carried. `backend-engineer` stopped, reported `needs_input`, and asked which agent should own `.nvmrc` and `README.md` given that its enforced scope covers neither, offering two options and a default. It diagnosed the scope-map defect itself rather than guessing, which is what the channel exists for.

**The Astro run.** The first run against a framework the shipped scope map does not fit. `infra-architect` wrote a project scope map on its own and split `src/pages/` correctly between two agents — `src/pages/api/**` to the backend, `src/pages/blog/**` to the frontend, disjointly — which is the case the shipped defaults cannot express. The run was then cut short, and its 47 permission denials exposed three setup defects now fixed: two skills pointed agents at template files inside the plugin directory, which is always denied, so `infra-architect` guessed the seven required headings and was bounced by the gate for guessing wrong; the shell constraints lived only in this README, which agents never read; and `git -C` and `cd` were being reached for despite neither being grantable.

**Known limits, stated plainly.**

- Nobody has seen the page with their own eyes in an automated session. The browser pane does not composite headlessly, so verification here was structural — the rendered DOM read back — not visual. `frontend-craft`'s perception loop has a third tier for exactly this case: say so rather than imply you looked. That applies to the tooling used in this run as much as it applies to the agent.
- A full chain run took upwards of fifteen minutes and was truncated more than once.
- `frontend-engineer` filed no report in the run that produced the page above; it was most likely still being bounced by the report gate when the run was cut off.
- Browser-MCP access under a `tools:` allowlist is confirmed by mechanism — an explicit allowlist drops unnamed MCP tools, so named ones are kept — but has never been directly sighted, because no test environment so far has had that server connected. The `claude` CLI itself carries no browser MCP at all.
- `security-engineer` is built and wired — scope map, roster allowlists, `SubagentStop` matcher — but has never run. No security work has been routed through a live session, so nothing about its actual behaviour is confirmed yet, only its governance. `backend-engineer` has since run as part of the full chain.

Now that `davinci` runs as a subagent rather than owning your session, it presents an agent identity to the hooks like everyone else, so its "brief only" scope is enforced rather than merely stated. Whatever agent dispatches it — your own session — is not governed, and cannot be: a main-thread agent presents no identity to a hook. That is the boundary, and it is where it belongs.

Design rationale and the decisions behind the architecture are in [docs/design.md](docs/design.md); what was found by the live run is in [docs/verification-status.md](docs/verification-status.md).

## License

MIT
