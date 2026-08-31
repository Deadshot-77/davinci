# Changelog

## 0.22.0

Adds story-direction: the skill that decides what a page is arguing, before
anything is styled or generated. Every other skill here executes a decision;
this one makes it. The claim in a sentence, three to six beats with the job
each does, and only then what any beat needs — words, structure, a still, or
motion, in that order, stopping as soon as the beat does its job.

Asset briefs are provider-neutral by construction. A brief names what the
asset shows, what it must convey, its form, the shared treatment, and a
"without it" fallback; the mapping onto a CLI, an MCP tool, a stock library or
hand-written SVG is mechanical and comes last. A test fails the suite if any
vendor name appears in the skill, so the brief survives the provider changing.

Cohesion is one rule: decide the treatment once, before the first brief, and
repeat it in every brief after. Assets generated independently look generated.

frontend-craft now defers to the scrollytelling skill where installed, rather
than paraphrasing it — it carries far more on pinned layouts and reveal
patterns than belongs here, and its first principle is the right one: lead
with the narrative, not the technique.

frontend-engineer is told not to hand the build to a generation provider.
Several offer to scaffold and deploy an entire site from a prompt, which would
discard the scope map, the perception loop, code-craft and the review gates in
one move. Providers make assets; the page is the agent to build.

Three guards, and the falsification pass earned its place again: the vendor
check was written with a single-backslash \b, which in a JS string is the
backspace character rather than a word boundary. It could never have matched,
and it passed with a vendor name sitting in the file. Now a plain substring
check, which also catches "higgsfield-generate" that a boundary would have
missed.


## 0.21.0

A write denial now names the agent that does own the path. Three consecutive
runs lost a dispatch to the same mistake — README.md, .nvmrc and
DESIGN_NOTES.md each assigned to a builder while the scope map gave them to
infra-architect. The map knew the answer every time; the message just never
said it, so the lead re-guessed rather than re-routed.

Where no agent owns the path, the denial says so explicitly. That is a gap in
the foundation rather than a mistake by the builder that tripped over it, and
naming a scapegoat sends the lead re-dispatching in circles.

The lead now takes write_scope from .devteam/scope-map.json when the project
has one — the file the hook actually enforces — rather than from the stack
profile Directory map, which is a description of intent. Where the two differ,
the hook wins.

Four guards, three confirmed to fail against a broken copy. The fourth could
not: it targeted a clause that turned out to be dead, because matchAny against
an empty scope is already false. The clause is removed rather than left to look
load-bearing.


## 0.20.1

The screenshot tool was an unguarded write primitive. The write-scope hook
checks Write and Edit by path, and Bash against patterns for redirection,
sed -i, cp and node -e. None of those match `node scripts/shoot.mjs <url>
<output-path>`, so a read-only gate could write a PNG over a source file or
outside the project and the hook would allow it. Verified against the real
scope map before fixing:

  ALLOWED  code-reviewer  node scripts/shoot.mjs http://x ../../escape.png
  ALLOWED  code-reviewer  node scripts/shoot.mjs http://x src/app/page.tsx

shoot.mjs now refuses an output path outside the project or without a .png
extension, and refuses before launching the browser rather than after it has
already written the file. The guard lives in the tool rather than the hook,
because patching the hook means chasing every script that writes a file.

Found by the plugin’s own foundation gate while auditing the run it was part
of — the observation channel doing something it was not designed for.

The guard immediately caught four existing tests writing screenshots into
tmpdir, which is outside the project. They now pass their own root.


## 0.20.0

The frontend agent researches before it designs. A designer handed a brief does
not start drawing; they find out what the category already looks like by looking.
The agent can now do that literally — scripts/shoot.mjs points at any URL, not
only a local dev server, so it renders three or four real competitors and reads
the images. Verified against a live site before the instruction was written.

The discipline is the point, not the capability. Naive inspiration-gathering
produces convergence: four sites use a centred hero over a gradient, the agent
absorbs that as the category, and builds a fifth — arriving at the training-data
average this skill exists to break, by way of the internet. So the rule is to
name the convention in order to depart from it, and the required output is a
sentence of the form "they all do X; this one will do Y instead, because Z".

Better is explicitly not the same but nicer. Improving a competitor layout
produces a derivative worse than either an honest copy or an original; better
means finding what the category collectively fails to do.

Gated to a real visual surface at standard or load-bearing tier, capped at three
or four references, and recorded in assumptions — including a plain statement
when the network or a headless-hostile site made looking impossible.

Adds a guard for drift this change caused. Inserting a section renumbered every
heading in frontend-craft, and three "frontend-craft section N" references in
frontend-engineer silently pointed one section off. A test now resolves every
such reference against the real headings, and was confirmed to fail against a
broken one.


## 0.19.0

Model choice is no longer decided by the stakes tier. Those are different
questions and collapsing them was a real defect: on a greenfield build almost
every task passes the reversibility test, so a live run tiered 19 of 21
dispatches load-bearing and ran nearly all of them on Opus. The lead was obeying
the rubric exactly — the rubric was wrong.

The tier still decides review depth, which gates run, whether a revision pass is
required, and whether CRAFT blocks. Model is now chosen from what the work is:
haiku for extraction and classification, sonnet as the default for building and
ordinary review, opus for architecture and the genuinely subtle. That inverts the
old default — cheap was the exception, now it is the baseline and Opus is the
escalation.

Adds escalation on failure: when a gate fails a builder and the lead re-dispatches,
the retry goes one model up. This spends the expensive model on work that has
proven it needs one, rather than on everything that might — a loop most systems
cannot close because they have no gate to observe the stumble.

review-lens now defaults to sonnet. One angle over one diff is a clear goal with
no multi-step architectural reasoning; seven of the last run twenty-one dispatches
were lenses inheriting opus.

Two guards, each confirmed to fail against a broken copy: a tier definition may
not name a model, and every model the rubric names must be one the Agent tool
accepts — an unknown string is not an error, the override is silently dropped and
the agent runs on its frontmatter model.

Found by measuring rather than guessing. The preload cost this started as turned
out to be a red herring: 91.8% of input tokens were served from cache, and preload
is about 11% of a median call. The driver is 1,356 API calls carrying a median
53,000 tokens each.


## 0.18.1

Fixes a regression in the 0.18.0 digest rule, found by testing it the way
superpowers tests skills: dispatch a subagent with the rule and without it, and
compare what it actually does.

Baseline, no rule: the agent read its report and returned ~500 words restating
it — the blowback the rule exists to prevent, so the rule addresses something
real. With the rule as shipped: the agent returned a correctly formatted digest
saying the report file did not exist and there was no .devteam directory at all,
having made zero tool calls. The file exists and is 5,211 bytes.

"Return exactly this, and nothing after it" read as a description of the whole
task. The format displaced the work — the same trap writing-skills documents for
description fields, where an instruction that summarises the output becomes a
shortcut agents take instead of doing the thing.

The rule now states that the digest is derived from what was written and
verified, that it governs the shape of the final message and not the amount of
work, and that it never turns an unread file into a reported fact. Re-tested: the
same scenario now produces a digest that names its uncertainty rather than
asserting a falsehood in a confident format.

docs/testing-skills.md records the method, this result, and a flaw in the test
harness itself — the scenario forbade the tool use it was measuring.


## 0.18.0

The report is the record; what comes back is a digest. An agent runs in its own
context so the noise stays with it and the conclusion travels — and this plugin
was moving the noise instead. Measured on a real run: 21 reports came to roughly
64,000 tokens, while the fields carrying a decision came to under 1,000. The rest
was handoff_notes, findings and assumptions being read a second time by an agent
that needed one line. tech-lead was explicitly instructed to read every report in
full.

Reports stay rich on disk. Every agent now returns a fixed digest — report path,
status, verdict, criteria, and counts of files, blocking findings, questions and
observations — and adds up to three sentences only when blocked, failing, or
carrying a blocking finding or a question. Callers open the full report when the
digest gives them a reason.

Applied to the three agents that fan out and to the entry command, which now
summarises for the user rather than pasting the pile.

Two guards, each confirmed to fail against a broken copy. The dispatcher list is
derived from tool frontmatter, so an agent given the Agent tool later cannot
arrive without the rule. The second catches the section being applied twice —
which is exactly what I did to the contract while making this change.

Borrowed rather than invented: the pattern is the one every surviving subagent in
the field shares, and context blowback is the anti-pattern most often blamed for
multi-agent systems costing more than they save.


## 0.17.0

Agents can prove their work again. A live Astro run had five agents
independently report that they could not verify anything: "No agent on this
project can run a script to assert on build output, so JSON-shaped criteria can
only be checked by reading the code."

The profile gains eighteen entries for what they were provably blocked on --
npm ls and npm view, framework builds, linters and test runners, read-only git
beyond status/diff/log, a static file server, and npx ctx7, which stack-profile
instructs agents to use and the profile was denying.

node -e, node -p and arbitrary script execution stay out, and now say why in the
file. A builder is not bash-guarded by the write-scope hook, so this allowlist is
the only boundary it has; an escape hatch would trade the plugin's central
safety property for one command. An assertion needing real code goes in a test
run with node --test, where the exit code is real and the check survives.

Five guards on the profile itself, each confirmed to fail against a broken copy:
no arbitrary code execution, nothing that installs or commits or deploys, every
:*-granted npm script also granted bare, the verification commands still present,
and the reason for the exclusions kept on record. The bare-form guard caught a
real gap on its first run -- npm run test was granted only with arguments.


## 0.16.0

The mobile screenshot was lying. A desktop OS refuses to make a browser window
narrower than roughly 480-500 CSS pixels, so --window-size=390,844 laid the page
out at 496px and wrote a PNG cropped to 390: a desktop render indistinguishable
from a broken mobile layout. Every mobile screenshot this tool took on Windows
was that, and the mobile pass frontend-craft mandates was silently useless.

Measured with a probe page that renders its own window.innerWidth: 496 at scale
factor 1 and 483 at 2, so --force-device-scale-factor does not help -- the clamp
is in CSS pixels.

A viewport below 520px is now rendered in an iframe of the true size inside a
legal window, which gives it a genuine viewport, and the letterbox is cropped
away by a dependency-free PNG codec in scripts/png-crop.mjs so the file is
exactly the viewport that was asked for -- padding an agent would otherwise read
as dead space in the design. A render that comes back the wrong width is refused
rather than handed to an agent about to judge a layout from it.

Eleven tests, each confirmed to fail against a broken copy.


## 0.15.0

Everything an agent must read now lives where it can read it. Two skills told
agents to copy a template from ${CLAUDE_SKILL_DIR}, which is inside the plugin
and therefore outside the working directory: every such read is denied. The
stack-profile template named the seven headings the foundation gate demands, so
infra-architect could not see the contract it was being held to -- it guessed,
guessed wrong, and was bounced. Both templates are now inline in their skill
bodies, which are preloaded, and the unreadable templates/ directories are gone.

The shell constraints moved into delegation-contract, which every agent
preloads, from the README, which no agent reads. A live run produced 47
permission denials and most were avoidable: compound commands checked clause by
clause, cd, git -C, and reads into the plugin directory.

Adds bare-form verification commands to permissions.example.json -- it had
Bash(npm test) and Bash(npm test:*) but only the :* form for build, lint and
typecheck, so a plain npm run build likely never matched. That is the only
verification command an Astro project has.

Two guards, both confirmed to fail against a broken copy: no skill, agent or
command may point at a path inside the plugin, and no skill may ship a
templates/ directory no agent can read.


## 0.14.0

Scopes the project declares, not scopes the plugin assumes. The shipped map fits
one shape of project: Next.js hands all of app/** to the frontend so app/api/**
route handlers land with the wrong agent, Astro pages and content match nothing,
a PHP CMS matches nothing at all. Three consecutive runs stranded a builder on
it, and in the third the agent stopped and asked -- the first question the
channel has ever carried.

infra-architect now writes .devteam/scope-map.json beside the stack profile,
the foundation gate reviews it, and the hook enforces it. Absent, unparseable or
invalid falls back to the shipped map -- never to an empty one, which would mean
no governance at all. An agent the map omits keeps its shipped scope.

Four rules hold whatever a map says: only agents that ship, scopes stay disjoint,
nothing under .devteam/ beyond an agent own scratch (so a map cannot widen
itself), and a gate can never be given source scope.

Also fixes a detector that flagged its own rejection message: an agent told
"Report contains placeholder text" quoted that back and was rejected for
containing it, four attempts and the give-up valve, in two separate runs. A test
now asserts the detector matches nothing the validator emits.


## 0.13.0

The entry point works. It was broken two different ways at once, and both are
fixed by making it a command instead of an agent.

Removed `settings.json`, which put an entry agent on the main thread. A
main-thread agent receives its prompt but not its identity, not its declared
tools and none of its skills. Probed twice, it named itself
`davinci:orchestrator` once and `davinci:product-manager` the next, had
intake-brief in context neither time, invented a classification outside the
closed set, and ended a run having only asked questions with nothing built.
Removing it also restored the Skill tool the half-install had been stripping.

Removed `agents/davinci.md`, which could never be dispatched: an agent whose
name matches its plugin appears in the session registry and is absent from the
Agent tool roster -- "Agent type davinci:davinci not found". Three live runs
had the main thread silently absorb its role, and each looked like it worked.

Its role now lives in `commands/build.md`, invoked as `/davinci:build`. That is
where it belonged: AskUserQuestion exists on the main thread and nowhere below
it, so the only thing that can reach the user is the thing running on the
user session. An entry agent could never have done the job it was designed for.

Three guards: no shipped agent may be named after the plugin, every shipped
agent must have a scope-map entry, and the entry command must dispatch an agent
that exists and carry $ARGUMENTS through.


## 0.12.0

Agents ask about decisions they could have made. The bar was three conditions
joined by AND, and the first -- 'you cannot proceed correctly without the
answer' -- filtered out nearly everything, because a competent agent can almost
always proceed. Two live runs produced zero questions: the builder chose a
client-identity scheme, documented why, and shipped.

It is now two cases joined by OR. Either the agent cannot proceed, on any tier;
or the task is load-bearing and the choice is expensive to reverse -- what
identifies a client, the shape of stored data, a public contract, where state
lives -- in which case it asks even though it could proceed. Reading the brief,
the profile and the code first is still required in both cases, craft decisions
stay the agent's own on every tier, and standard and scaffolding work are
untouched.


## 0.11.0

Three defects a live rate-limiting run exposed.

Gates had nowhere to prove anything — four agents independently reported that a
load-bearing review "silently degrades to reading" because mutation testing was
impossible. Each gate now owns one scratch directory and can build a harness
there with the `Write` tool, which is checked by exact path. No shell permission
was widened: `decideBash` returns early for any agent with a non-empty scope, so
a scratch path would have switched the gates' shell guard off entirely. An agent
whose only writable ground is coordination state now stays guarded.

Foundation-first is enforced rather than asked for. The lead skipped the
foundation gate on a bounded brief — the second gate skipped in three runs — so
while `.devteam/stack-profile.md` does not exist the write hook denies every
builder write outside `.devteam/`. The foundation agent is exempt, derived from
the map rather than named, and `Route: direct` still applies.

And a dispatch's `write_scope` is not a grant. For the second run running the
lead assigned a builder a path the hook denies and stranded it; it now takes
assignments from the stack profile's Directory map, which the foundation gate
already validates against the real scope map.

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
