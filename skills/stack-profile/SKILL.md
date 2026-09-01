---
name: stack-profile
description: How to produce the stack profile contract that every other Davinci agent obeys. Use when scaffolding a project or establishing conventions.
user-invocable: false
---

# Writing the stack profile

The profile at `.devteam/stack-profile.md` is read by every builder. A vague
profile produces inconsistent code across agents that never see each other's work.

## On an empty directory, find out what you may run first

A profile that grants `npm run build` still cannot run it without
`node_modules`, and `npm install` is usually not granted -- installing runs a
package's own postinstall scripts, which is arbitrary code execution. So on a
greenfield project the ordinary verification commands are inert, and the way you
discover that matters.

**Check at the start, not at the end.** One plain command:

```
npm ls --depth=0
```

If dependencies are absent and you may not install them, you have three moves and
only the last is wrong:

1. **Ask, and stop.** A blocked scaffold is a genuine blocker: return
   `needs_input` with the exact denied commands and the options, before writing
   a tree you cannot verify. This is the preferred move on a greenfield project.
2. **Hand-write it and mark it unverified.** Legitimate when the shape is
   unambiguous. Pin versions you confirmed with `npm view`, never from memory,
   and state in `assumptions` that nothing was installed, built, or linted.
3. **Report it as built and working.** Never. A scaffold nobody installed has
   not been shown to run, and a profile that denied the proof is a blocked
   check, not a passing one.

A measured run did exactly this correctly: it detected that every package-manager
command was denied, stopped at `needs_input`, and asked whether to open the
permission layer or accept a hand-written scaffold. That is the behaviour to
copy.

## If the project already exists, this section does not apply

"Generate, do not author" is advice for an empty directory. On a project that
already has code there is nothing to generate, and a profile written from
assumption becomes a contract every other agent then obeys.

Check first — `ls`, or the survey below. If there is source already,
**invoke `davinci:brownfield` and follow it instead of this section.** It
starts with `node <plugin>/scripts/survey.mjs .`, which reports where the code
is, the test ratio, the entry points, where the churn is, what is generated, and
what it could not establish.

Everything after "Fill every section" still applies. What changes is where the
answers come from: discovered, not decided.

## Generate, do not author

Where a real generator exists, run it. `create-next-app`, a framework CLI, a
`prisma init` — these produce correct, current config. Hand-writing config from
memory is the single most common way scaffolding comes out subtly stale.

Before choosing any version or config key, fetch current documentation rather
than relying on recall. Framework defaults change faster than training data.

## Fill every section

Write `.devteam/stack-profile.md` with exactly these seven headings, spelled
this way. The gate matches them literally: a heading you invent is a section it
cannot find, and the profile is rejected for being incomplete even when the
content is all there. That has happened in a live run.

```markdown
# Stack profile

Every agent reads this file before writing code. It is the contract.

## Framework

Name and major version, e.g. "Next.js 15 (App Router)". Must match a real
dependency in package.json.

## Language

e.g. "TypeScript 5, strict mode on"

## Package manager

npm | pnpm | yarn | bun, and the lockfile that proves it

## Directory map

Where each kind of file lives, one line per directory, with its owning agent.
Every path here must be covered by the `.devteam/scope-map.json` you write
alongside it.

## Naming conventions

File naming, component naming, export style. Specific enough that two agents
writing different files produce consistent output.

## Testing

Runner, file location, naming pattern, and how to run a single test.

## Commands

dev, build, test, lint. The exact command strings.

## Available to build with

What is already installed that the work should use rather than duplicate.
Animation and motion libraries, state, data fetching, styling, component
libraries, test utilities -- read from the manifest, not guessed.

Name what is absent too, where its absence decides an approach: "no animation
library; motion is CSS and IntersectionObserver". An agent choosing a technique
needs to know whether it is picking one or living with one.

This section exists because adding a dependency to do what the project already
does is a cost nobody asked for, and an agent with no record of what is
installed has no way to avoid it.
```

An eighth section of your own is fine — put anything that fits none of the seven
under one, rather than bending a heading to hold it. A hook checks that each of
the seven is present and non-empty, that none still contains an unfilled
template marker, and that the framework you declare actually appears in
`package.json`. An unfilled section fails the gate; it does not pass with a note.

## The Directory map and `.devteam/scope-map.json` are the same decision

A hook enforces write scope, and it does not read your Directory map. What it
reads is `.devteam/scope-map.json` — which you also write, from the same
decision, at the same time. Write both or neither. A Directory map with no
matching scope map is a contract with no enforcement behind it, and a builder
discovers the gap only when its write is refused three stages later. That has
happened in three separate runs.

The shipped default fits one shape of project — `src/api/**`, `src/app/**`,
`test/**`. Astro's `src/pages/**` and `src/content/**` match nothing in it. A
Next.js layout hands all of `app/**` to the frontend, so `app/api/**` route
handlers land with the wrong agent. Declare the real layout instead of bending
the project to fit the default:

```json
{
  "frontend-engineer": ["src/pages/**", "src/content/**", "src/layouts/**", "public/**"],
  "backend-engineer": ["src/lib/server/**", "db/**", "tests/server/**"]
}
```

Omit an agent and it keeps its shipped scope; you are specialising, not
redefining. Four rules are enforced, and a map that breaks any of them is
ignored in favour of the shipped one — so the foundation gate rejects it rather
than letting you believe it took:

- Only agents this plugin ships. A map cannot invent one.
- Scopes must be disjoint. Two builders dispatched together write concurrently.
- Nothing under `.devteam/` except an agent's own
  `.devteam/scratch/<agent>/**`. Reports, the brief, the profile and the scope
  map itself are the hook's ground — a map that could widen itself is not a
  boundary.
- A gate stays a gate. `code-reviewer`, `review-lens` and `security-engineer`
  cannot be given source scope; a reviewer that can patch its own findings is
  grading its own homework.

Every path in the Directory map must be covered by the scope map you wrote. If
the natural layout needs something the rules above forbid, say so in the profile
and report it as a blocker rather than assigning it anyway.

## Be specific enough to remove judgement

Bad: "Components go in the components folder."
Good: "`src/components/<domain>/<ComponentName>.tsx`, one component per file,
default export, colocated `.test.tsx`."

The test: could two agents who never talk produce consistent code from this
sentence alone? If not, it is not specific enough.
