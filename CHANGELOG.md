# Changelog

## 0.47.0

Department leads can hire.

A lead wrote every line of its slice itself, on Opus, one file after another.
Now frontend-engineer and backend-engineer can dispatch several implementer
workers at once -- Sonnet, low effort, no web tools, no delegation of their own
-- to write disjoint pieces concurrently, while the lead specifies the shape
first and reads every file that comes back.

Concurrent writers are the one place this system can corrupt its own output, so
the partition is enforced rather than instructed. Workers hold no scope-map
entry, because the paths they need are their lead's and a test asserts no path
in that map has two owners. Their scope arrives per batch instead, in
.devteam/assignments.json, and two properties are checked before any worker
writes anything:

  disjoint  -- no path appears in two assignments, so two workers can never
               race on one file.
  contained -- every path is inside the dispatching lead's own scope, so
               spawning a worker is a way to work inside the scope map faster
               rather than a way around it.

A file failing either check governs nothing and no worker writes at all. An
invalid partition must not be more permissive than a valid one, which is how a
guard becomes a liability. The first worker to write an assignment claims it
and a second is refused by name; claims retire when the batch name changes, so
no one cleans up by hand.

Two things this got wrong before the tests caught them. The lead could not
write the assignments file at all -- it is in nobody's scope, so the whole
mechanism was dead on arrival; it is now an exemption like the report file.
And the first version granted that exemption to any agent with a non-empty
scope, which handed it to the review gates on the strength of their scratch
directories. The leads are named explicitly, and a test derives that list from
whoever actually declares the worker tool so the two cannot drift.

The judgement stays with the lead: three or more independent pieces before it
is worth dispatching anyone, integration files never delegated, the conventions
and a sibling to copy fixed once and repeated in every dispatch, and every file
a worker wrote opened and read. Delegating the typing does not delegate the
reviewing, and a defect passed upward costs a gate bounce and a re-dispatch --
more than writing the file would have.

414 tests; 18 new guards each mutated and proven to fail. Two of those
mutations exposed assertions that could never fail: one read a frontmatter
field the test helper does not return, the other matched prose in the body
instead of the loaded skills list.

## 0.46.0

What ran on Opus? Nobody knew.

work-tiers has told the lead to choose a model on every dispatch for several
releases. Nothing ever checked. A 26-dispatch run finished leaving no record of
what any of them ran on -- reports carried no model field, and subagents write
no sidechain into the session transcript, so it could not be reconstructed
afterwards either. Five of the seven agents default to opus, which means a
dispatch that names no model spends the most expensive option by not deciding.

That made the largest cost in the system unmeasurable, and every proposal to
reduce it a guess -- including the plausible ones. Measuring the session first
killed the most obvious candidate: prompt caching was already running at a 93%
hit rate, 25.7M cache reads against 556 fresh input tokens. There was nothing
there to win.

So: model is now a required field on every report, echoing what the dispatch
named, validated against a closed set. Required rather than optional on
purpose -- an optional field goes missing exactly where the decision was
skipped, which is the case worth counting. `unspecified` is a legal value
and is the point of the design: it records a default deciding instead of the
lead, and an agent must never guess at what it is running on, because a
confident wrong number is worse than none.

The lead closes its report with the tally -- how many dispatches on each model,
how many unspecified. That tally is the only place this becomes visible.

One thing the field does not claim: it records the model that was *named*, not
the one that ran. Those coincide when the lead names one, and when it does not,
the honest record is that nobody chose.

394 tests; 11 new guards each mutated and proven to fail.

## 0.45.0

Proportion, and the decision you were never shown.

A real greenfield build classified 21 of 24 dispatches load-bearing and paid
six review lenses and a security audit on each -- for a static marketing page
whose only interactive elements were a skip link and an email address. One
slice took 97 minutes. The lead was obeying the rubric exactly.

The rubric already carried a note about this failure, from an earlier run that
put 19 of 21 dispatches on the top tier. That fix decoupled the model from the
tier and stopped there, leaving review depth and gate selection keyed to the
same signal -- so the overspend moved one axis across and carried on.

The cause is that two floors reach load-bearing and buy different things.
Exposure says the code is dangerous to get wrong; reversibility says it is
expensive to change later. On a greenfield build almost every early task passes
reversibility -- the scaffold, the tokens, the first components everything
copies -- which is a fact about the calendar, not the code. A token system
being wrong costs a refactor. It is not a breach. Reversibility alone now takes
the load-bearing review and the standard gates, and the fan-out is a ceiling
rather than a quota: a lens whose subject is absent from the diff is dropped,
and named as dropped.

tech-lead said both gates were mandatory. That contradicted the rubric outright
and won, being the more emphatic of the two. It now defers on which gates run
and keeps the part that was actually load-bearing: a skipped gate is stated
with its reason, and a gate that did not run is never reported as one that
passed.

Separately, and worse: approval printed the plan and never the exclusions. A
run deferred a headless CMS the user had asked for -- reasoned correctly,
recorded under Out of scope, and never once shown to them. They approved a plan
whose exclusions they had no way to see and found out several slices later. The
exclusions are now read out with the slices, and bringing one back into scope
is an option at the same prompt. An exclusion is a decision made on the user's
behalf, and it gets surfaced where they can still object to it.

The stack profile reached 36KB and was re-read by all twenty-six dispatches,
a third of it evidence an acceptance criterion had asked for. The evidence
stays; it now sits below a named heading that a builder stops at.

## 0.33.0

A work ledger: runs resume, and work ships one slice at a time.

Both problems were one absence. .devteam held a brief, a stack profile, a
scope map and reports -- and no plan. The plan lived in tech-lead's context
and died with the run, so nothing could say where a killed run had got to, and
nothing knew what "next" was.

Two files now, and the split is the mechanism. plan.md is the contract:
written once at intake with the user, approved before anything is dispatched,
never rewritten. progress.jsonl is an append-only journal. Durable-execution
systems converge on this shape because a rewrite can lose or invent history
and an append cannot -- and an interrupted run leaves a truthful record rather
than a half-updated status field.

Slices are vertical, walking skeleton first: the thinnest cut through every
layer that actually builds and can be looked at. Horizontal layering defers
every integration risk to the end, which is the failure the hour-long run
already had.

The drift control is the plan being an artifact rather than a memory. Research
on long-horizon agents is consistent that step-by-step agents lose the goal --
each locally-best move pulls away from it -- while plan-ahead agents hold, and
the named failure modes are losing earlier decisions, declaring half-finished
work done, and quietly changing what is being built. So no agent may add a
slice, remove one, or change its criteria. Discovered work goes to
observations, where a human decides.

Resume does not trust the ledger. A status is a claim and the working tree is
the fact, so the last done slice has its acceptance criteria re-run before
anything continues, and a slice left "started" is re-entered rather than
skipped -- a killed run may have written half its files.

done requires evidence: the same commands and exit codes a report carries. A
done with an empty evidence array is the half-finished-work failure with a
tick beside it.

Four guards, ten unit tests, eight mutations, each confirmed to fail.


## 0.32.0

Leaked servers, found by trying to delete a directory.

frontend-craft told agents to run npx --yes serve on the build output to get a
real http:// origin, then screenshot it. serve never exits. Four of them were
found still running hours later, holding ports 4173 and 4195 and a directory
handle that made the project undeletable. Nothing in the plugin ever stopped
what it started.

shoot.mjs --root <dir> <path> <out.png> now owns the lifetime: it spawns a
zero-dependency static server on an ephemeral port, takes the shot, and stops it
in a finally. The worker also self-destructs after two minutes in case the
parent dies badly. A server that cannot outlive its screenshot cannot leak, so
the three serve grants are gone from the profile entirely -- the case is covered
without a grant that can be misused.

One trap found while testing it. Git Bash rewrites a leading-slash argument into
a Windows path, so --root out /jobs/ arrived as C:/Program Files/Git/jobs/ and
produced a 2901-byte screenshot of a 404 that reads as a broken layout. A
plausible wrong answer is worse than an error, so that is refused with the fix
named: write jobs/, not /jobs/.

Three of the tests written for this were weak and were rewritten after
falsification caught them. The traversal test asked for /etc/passwd, absent on
Windows, so it passed with the guard removed; the real case is percent-encoded,
because new URL normalises a literal ../ away before the handler sees it.
Nothing exercised stop() at all, so startOwnedServer is now exported and tested
directly. And a mangled-path fixture lost its backslashes to a heredoc and
asserted on nothing.


## 0.31.0

SEO, and the alt-text rule that was missing from the accessibility floor.

The floor was four items -- focus states, contrast, reduced motion, keyboard --
and said nothing about images at all. It now carries a decision tree, because
"add alt text to every image" produces worse accessibility than no instruction:
it turns decoration into noise a screen reader has to read past. Does the image
carry information the text does not, is it a control, does it repeat adjacent
text, otherwise decorative. And the distinction the tree exists for: alt="" and
a missing alt attribute are opposites. Empty alt hides a decorative image; a
missing attribute makes a screen reader announce hero-final-v3.jpg.

scripts/seo.mjs checks what a page declares, and it reads BUILT HTML rather
than source. A framework metadata export, a layout title, a component alt
attribute -- none can be verified by reading the file they are written in,
because what ships is the render. With no build the check reports that it did
not run, which is not a pass.

Errors are what a page cannot do without: lang, title, viewport, an h1, and an
img with no alt attribute at all. Notes are judgement with context: canonical,
Open Graph, heading skips, several routes sharing one title. A tool that fails
a build over a missing canonical on a one-page site gets switched off, and then
it catches nothing.

technical-seo covers the judgement and states where the plugin runs out of
evidence: no keyword strategy, because that needs search-volume data and
business context it does not have. It also declines llms.txt outright --
heavily promoted, and three independent studies across more than 300,000
domains found no effect on AI citations or visibility. An agent reading 2026
blog posts would otherwise generate one and report it as SEO work.

Run against the real test project it found no errors -- every image already
carried alt -- and 25 notes: no canonical or Open Graph anywhere, no structured
data, and four routes sharing the layout default title.

Two guards, eight script tests, seven mutations, each confirmed to fail.


## 0.30.0

Work placement, taken from established practice rather than invented.

The caching skill in 0.28.0 was one rung of a larger decision written as though
it were the whole subject. Three bodies of practice say what the larger decision
actually is.

The ladder: build, edge, server, client. Work belongs on the highest rung its
inputs allow, and a statically rendered route does no per-request work at all.
Work moves down only when something specific forces it -- a cookie, a search
param, per-user content, freshness. A route that is dynamic because nobody
decided otherwise is the bug, and it is the common one because dynamic is
usually the default and nothing complains.

The diagnosis: RED then USE, in that order. Rate, Errors and Duration treat the
thing as a black box and say whether a user is affected. Utilisation, Saturation
and Errors say which resource is why. Top-down exists to stop something being
optimised that nobody waits on -- work a page does for no reason is only a
defect when it is on the path something waits for.

The enforcement: budgets, asymmetric, at three points -- bundler, CI, production
telemetry. The plugin owns the first. waste.mjs already computed total and
per-asset weight, so it now takes --max-total-kb and --max-asset-kb and turns a
breach into a finding. Given no budget it reports the weight and enforces
nothing, because a tool that invents a threshold fails builds on a number nobody
agreed to.

backend-engineer now preloads work-placement instead of caching, and caching
says come here second. Preloading the deep-dive made a cache look like the first
answer rather than the last, which is how work that could have moved up a rung
gets hidden behind one instead.

Three guards, six mutations, each confirmed to fail -- one of them only after
the mutation was corrected to replace both routes rather than the first.


## 0.29.1

The greenfield gap, found by a measurement that was looking for something else.

permissions.example.json grants npm run build, lint and test. All three need
node_modules. npm install is not granted, and should not be: it runs a package's
own postinstall scripts, which is the arbitrary code execution that node -e is
refused for. So on an empty directory every verification command in the profile
is inert, and an agent asked to scaffold cannot prove anything it writes.

infra-architect discovered this the expensive way -- after writing the tree.
It handled it correctly, stopping at needs_input and asking whether to open the
permission layer or accept a hand-written scaffold, which is the designed
pause-do-not-guess behaviour working unprompted. But discovering it last means
the work is already done and unverifiable.

stack-profile now checks first: one plain npm ls --depth=0 before writing
anything, and three moves if dependencies are absent and cannot be installed --
ask and stop, or hand-write it with versions confirmed by npm view and marked
unverified, or report it as built and working, which is never acceptable. A
scaffold nobody installed has not been shown to run, and a profile that denied
the proof is a blocked check rather than a passing one.

The profile documents the trade-off and the opt-in rather than quietly granting
it, and recommends running the generator yourself before dispatching.

One guard, four mutations, each confirmed to fail.


## 0.29.0

Named reference sources, each introduced with the fence that keeps it from
becoming a shortcut to somebody else's answer.

The failure this plugin has actually produced is convergence -- three runs on
one project arriving at near-identical pages unaided. So a reference library is
the highest-risk thing you can hand a designer, and the rule has to travel with
the source rather than sit in a different section.

frontend-craft gains published specifications: styles.refero.design carries
design systems extracted from real products, readable with WebFetch, and the
rules are the valuable part rather than the hex codes -- three radii is the
entire radius vocabulary, hairline borders instead of shadows, a single accent
CTA per view. Read two or three to learn what a category assumes, then decide
about those assumptions. Never adopt one: shipping a studio site in Linear's
system is the category average reached faster and with better production values.

technique-research gains component libraries, fenced to mechanism. Published
source answers how an effect is built faster than prose can. It is also
optimised for one-paste adoption, and a component copied whole brings its
author's type scale, spacing and colour logic with it -- none of which was
decided for the page being built. Read them to learn how; never paste them to
decide what.

motion-craft gains an admission instead of a source. Nothing in the library
teaches what good motion feels like -- timing, easing, the order things move in
-- and the galleries holding that knowledge are video. The agent can only
screenshot them, and one frame of an animation carries almost none of its
timing, so it is told not to claim it reviewed what it only ever saw still.

A hero-screenshot gallery was considered and declined. frontend-craft already
warns that award galleries and trend lists are how everything ends up looking
the same, and the competitive audit it runs instead is category-specific: on a
recent job-board task the agent rendered four real scheduling products, named
the convention all four shared, and departed from it deliberately.

Two guards, five mutations, each confirmed to fail.


## 0.28.0

Two numbers made the case: 529 lines of guidance on motion and generated
imagery, and zero on caching. Not one mention of the word anywhere in the
plugin. The design side had been getting all the attention.

code-craft has always had a deletion pass, and it is file-scoped -- it asks an
agent to clean the file it just changed. That is structurally blind to what the
change orphaned somewhere else: the component nothing imports now, the route
gone dead, the photograph still shipping after the section using it was
rewritten. Those are reference-graph facts rather than judgement, so scripts/
waste.mjs answers them exactly: orphaned modules, unreferenced assets with
their weight, and links pointing at nothing. Entry points are never orphans,
aliased imports resolve, and build output is never scanned.

It also refuses to overstate itself. A project that builds paths at runtime
cannot be resolved statically, so the report drops to partial confidence and
names the files responsible instead of calling itself clean -- the same rule
this plugin has now learned four times about refused commands and disabled
features. An unrunnable sweep is reported as unrun, never as a clean project.

The caching skill leads with the failure that makes caching dangerous rather
than the mechanics that make it fast: a key missing a user or tenant serves one
person another person's response, which is an incident and not a slow page.
Then invalidation, stampede, measuring before caching, choosing a layer, and
proving a hit, a miss and an invalidation instead of asserting "added caching".

backend-engineer preloads it. The trigger lives in code-craft, which every
source-writing agent already carries, because a skill you must know to look for
is one you will not invoke when you most need it.

Two guards and nine script tests, eight mutations, each confirmed to fail.


## 0.27.0

The agent could already research. It just could not see anything but pictures.

frontend-craft has always sent it to look at the category -- find the real
competitive set, screenshot three or four, name the convention, find the gap.
Every tool in that pass returns an image. So the agent could describe a page and
could not read how it worked, and technique had to be hand-authored into skills
one at a time, which does not scale and dates badly.

frontend-engineer now carries javascript_tool and read_page. Those two produced
every real finding in a study of a live product page: the video count, the
declarative plugin composition, the progress keyframes, the load timeout, and
the capability flag that nearly produced a false one. Two tool names on one
line, and the agent moves from imitating a look to reading a mechanism.

technique-research teaches that second pass. Read the artifact, not the article.
Extract mechanism, not aesthetic. And check whether a technique was switched off
before concluding it is absent -- a page reported readyState 0 on all sixteen of
its videos because its own detection had disabled inline media, and "this page
does not scrub video" was one inference away. An absent technique and a disabled
one look identical and mean opposite things.

Findings persist with provenance: date, source, measured, inferred, unchecked.
The last two fields are what make a finding safe to keep -- a note separating
what was seen from what was concluded can be corrected; one that merges them
becomes folklore. That is the direct lesson of six records naming a provider
until a run picked it without comparing anything.

stack-profile gains a required eighth section, "Available to build with", so an
agent choosing an approach knows what the project already carries. Adding a
dependency to do what the stack already does is a cost nobody asked for.

Four guards, seven mutations, each confirmed to fail.


## 0.26.0

Five skills for motion and generated imagery, split so that four of them cost
nothing until a beat commits to a technique.

The gap was never technique. An installed scrollytelling skill already carries
929 lines on sticky patterns, IntersectionObserver, GSAP and reduced motion --
and zero mentions of video scrubbing or backdrop-filter. What nothing connected
was the production chain: beat, to what it must show, to what asset that needs,
to how that asset gets made. An agent that knows fifty scroll techniques and has
no route to making anything worth scrolling through reaches for what it can draw
in markup and calls the restraint deliberate. Three runs on one project did
exactly that while a generator sat unused on PATH.

motion-craft is preloaded and thin: the chain, the costs motion carries that a
still does not, four things measured off a shipping Apple product page, and the
tells that give a motion page away. It routes to generating-assets,
parallax-layers, glass-surfaces and scroll-video, invoked with the Skill tool.

That routing was measured before it was built on. Reference FILES inside a
plugin are unreadable from an agent -- the plugin sits outside the project
working directory and every such read is denied, which an existing test already
enforces after infra-architect guessed at a template it could not open. Skills
are different: a subagent holding only Bash and Skill invoked a plugin skill it
had not preloaded and returned a marker it could not have guessed.

story-direction rung four is now motion that beats its own still, against three
costs the lower rungs do not carry: credits, failure surface, attention. Shipping
pages already work this way -- Apple gives every scroll-driven video a
three-second load timeout and a static poster, on every beat.

Four guards, seven mutations, each confirmed to fail. One of them caught a real
dangling pointer on its first run.


## 0.25.0

ToolSearch cannot be given to an agent. An agent declared `tools: Bash,
ToolSearch` receives only Bash -- the same silent drop as an `mcp__*` wildcard,
measured with a two-agent probe. 0.23.1 said an agent needing generated media
"has to be given both the search and the tool it finds". That is not possible,
and this release removes the claim.

The deferred-MCP route is therefore closed to agents entirely: a tool that loads
on demand has no schema until something searches for it, and only the entry
command can search. Listing its name on an allowlist cannot help.

What is open is a generator that installs as a binary. The same probe ran
`command -v higgsfield` inside an agent and got a path back. So discovery
targets PATH rather than the tool list, and the profile now grants
`Bash(command -v:*)` -- a probe that cannot run reports an absent generator,
which is a lie the page then gets built on. Generation stays opt-in per project,
because it spends real credits; a binary found but not runnable is a blocked
check, not an absent generator.

This also corrects the diagnosis shipped in 0.24.0. The denied `cd && for` probe
was real, but it was not why a run reached for the wrong provider. That run
grepped its own `.devteam/` directory at intake, found the provider a previous
run had used, and selected those tool names directly -- never searching, never
comparing. Each run using a provider wrote more evidence that it was the one
this project uses. Precedent, not discovery.

Two guards, four mutations, each confirmed to fail.


## 0.24.0

A refused check is not a negative result. A run probed for image generators with
a single compound command -- cd, then a for loop over eighteen binaries -- which
the permission layer refuses clause by clause. It was denied outright, and the
agent recorded the outcome as "found nothing" while an installed, authenticated
generator sat on PATH with its commands already granted in the profile. It was
never asked, and the page was built with the second-choice provider.

This is the third time a blocked check has been reported as a result rather than
an error. The mobile screenshot rendered at 496px and reported 390. Five agents
called criteria unverifiable when node -e was refused. Now a denied probe reads
as an absent generator.

story-direction now separates three outcomes that lead to three different pages:
probed and nothing installed, probe refused, or found. A refusal goes in
assumptions naming the command, because that is a routing problem with an owner
rather than a fact about the machine.

And the probe is shaped to survive: one plain command -v per call, no cd, no &&,
no loop, no pipe. Followed by a ToolSearch pass, since the startup tool list is
not the whole set -- which is how the only generator that did get used was found.

Two guards, three mutations, each confirmed to fail.


## 0.23.1

Corrects a claim shipped in 0.20 that measurement has since falsified.

That release stated that a claude.ai connector is not visible to a `claude -p`
run, concluded from the init tool lists of two live runs which named only
Notion and Spotify. A later run generated a photograph through
mcp__claude_ai_Magnific__images_generate, having loaded it with ToolSearch, on
a run whose init listing named only Notion, Spotify and Figma.

Deferred MCP tools do not appear at startup and load on demand. An init listing
is not an inventory, and reasoning from two observations to a general rule was
the error -- the same shape as concluding a test passes because the mutation
was never applied.

The correction matters practically: work went into registering a CLI-level MCP
server and debugging its OAuth, when the capability was reachable the whole
time by a different route.

What remains true is narrower and now stated as such. ToolSearch is itself a
tool and appears on no agent allowlist, so today only the entry command can
reach a deferred generator. An agent that needs generated media must be given
both the search and the tool it finds, and frontend-engineer currently has
neither.


## 0.23.0

Restraint with no counterweight converges. Three runs of the same brief
produced three near-identical pages -- near-black ground, display serif with
one word in italic accent, monospace letter-spaced labels, hairline rules, a
right-aligned spec table, and nothing to look at. Each believed it had
committed to its own direction. Each passed the banned-defaults check, because
every entry there is a prohibition and an empty page violates none of them.

story-direction caused it. The ladder read words, structure, still, motion,
with "stop as soon as the beat does its job" and "most beats need type, space
and a sentence worth reading". Every clause biased toward less, and nothing
said a beat might require showing. So a run with a generator available, credits
to spend and permission for three assets shipped hand-authored SVG instead --
and a studio selling brand and interface systems shipped a page demonstrating
none of its work.

The rung is now there: if a beat needs to show, showing is the job and type
cannot substitute. The test is whether the same section could belong to a
different company. Where showing is genuinely impossible, say so rather than
substituting a list and letting it pass as the section it replaced.

Departing from a convention is also not inverting it. The audit found every
competitor leading with a full-bleed reel; the departure taken was no imagery,
which throws away what those pages did right and lands somewhere equally
predictable.

And the idiom is a banned default in its own right now, named beside Inter and
the three cards. Unlike those, this plugin generated it three times unprompted,
which makes it the likeliest of them all to recur.

Three guards, each confirmed to fail against a softened copy. Whether the rule
changes what gets built is the next run to answer, not this commit.


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
