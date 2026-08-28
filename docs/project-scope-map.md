# Scopes the project declares, not scopes the plugin assumes

## What forced it

The shipped scope map fits one shape of project, because it grew around one:
`src/api/**`, `src/app/**`, `test/**`, plus `src/server.js` and `src/api.js`
bolted on reactively when a test project needed them.

Against real targets it misses badly. A Next.js app hands all of `app/**` to the
frontend, so `app/api/**` route handlers land with the wrong agent. Astro's
`src/pages/**` and `src/content/**` match nothing. A PHP or WordPress CMS matches
nothing at all.

Every miss strands a builder. It happened in three consecutive runs — the lead
assigning a path the hook denies, the builder refusing it and reporting blocked.
In the third, the agent stopped and asked about it, which is the first question
the channel ever carried:

> "The write-scope hook for this backend-engineer instance only permits src/api,
> src/server, src/lib, prisma, tests/api, src/types, src/index.ts, src/server.js,
> test/\*\* and src/api.js — it does not include .nvmrc or README.md as the
> dispatch requires. How should this be resolved?"

The agent diagnosed the architecture correctly and escalated instead of guessing.

## The shape

`infra-architect` writes `.devteam/scope-map.json` alongside the stack profile,
from the same decision. The foundation gate reviews it. The write hook reads it,
falling back to the shipped map when it is absent, unparseable, or invalid.

```json
{
  "frontend-engineer": ["src/pages/**", "src/content/**", "src/layouts/**", "public/**"],
  "backend-engineer": ["src/lib/server/**", "db/**", "tests/server/**"]
}
```

An agent the map does not mention keeps its shipped scope. This is specialising,
not redefining, so a map that fixes the frontend for Astro cannot silently strip
everyone else of the ground they had.

## What a project map may not do

Four rules, enforced at load. A map breaking any of them is ignored in favour of
the shipped one:

- **Only agents that ship.** A map cannot invent an agent; the hook would never
  consult the entry, and the write would go ungoverned.
- **Scopes stay disjoint.** Two builders dispatched in one message write
  concurrently.
- **Nothing under `.devteam/`** except an agent's own
  `.devteam/scratch/<agent>/**`. Reports, the brief, the profile and the scope
  map itself are the hook's ground. A map that could grant `.devteam/scope-map.json`
  could widen itself, and a boundary that can redraw itself is not one.
- **A gate stays a gate.** `code-reviewer`, `review-lens` and `security-engineer`
  cannot be given source scope at all. A reviewer that can patch its own findings
  is grading its own homework, and no per-project layout needs that.

Invalid falls back to the **shipped** map, never to an empty one. An empty map
means every agent is ungoverned, which is the one outcome worse than wrong
scopes.

## Why the gate has to check it too

The runtime fails safe and therefore fails silently: an invalid map is ignored
and the shipped default stays in force, so infra would believe it had set the
project's scopes while nothing had changed. That is the same silence that hid
the permission problem for two increments. So `foundation-review` now reads the
file and fails the gate on an invalid one — and records in its findings when
there is no map at all, so falling back to the default is on record rather than
an oversight.

## Fixed alongside

The placeholder detector flagged its own rejection message. An agent told
*"Report contains placeholder text: …"* quoted that sentence in its next report
and was rejected for containing "placeholder text" — a loop no agent can exit.
It burned four attempts and tripped the give-up valve in two separate runs. The
message now reads "unfilled template marker", and a test asserts the detector
never matches any message the validator emits.

## Honest limits

- No live run has used a project map. The rules are unit-tested; infra has never
  written one, and no gate has ever reviewed one.
- Disjointness is checked by exact glob string, not by overlap. `src/**` and
  `src/api/**` given to two agents will pass and do overlap.
- The shipped map is still what most runs will use, and it still fits one shape
  of project.
