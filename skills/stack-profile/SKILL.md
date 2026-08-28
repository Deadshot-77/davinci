---
name: stack-profile
description: How to produce the stack profile contract that every other Davinci agent obeys. Use when scaffolding a project or establishing conventions.
user-invocable: false
---

# Writing the stack profile

The profile at `.devteam/stack-profile.md` is read by every builder. A vague
profile produces inconsistent code across agents that never see each other's work.

## Generate, do not author

Where a real generator exists, run it. `create-next-app`, a framework CLI, a
`prisma init` — these produce correct, current config. Hand-writing config from
memory is the single most common way scaffolding comes out subtly stale.

Before choosing any version or config key, fetch current documentation rather
than relying on recall. Framework defaults change faster than training data.

## Fill every section

Copy `${CLAUDE_SKILL_DIR}/templates/stack-profile.md` to
`.devteam/stack-profile.md` and fill all seven sections. A hook checks that each
is present and non-empty, that none contains placeholder text, and that the
framework you declare actually appears in `package.json`. An unfilled section
fails the gate — it does not pass with a note.

## The Directory map must assign paths agents can actually write

A hook enforces write scope independently of this document, and it does not
consult the Directory map to decide who may write where. Only assign a path
in the Directory map to an agent whose write scope actually covers it — if
the natural layout for this project needs a path outside every candidate
owner's scope, say so in the profile and report it as a blocker rather than
assigning it anyway and leaving the builder to discover the contradiction
when its write is refused.

## Be specific enough to remove judgement

Bad: "Components go in the components folder."
Good: "`src/components/<domain>/<ComponentName>.tsx`, one component per file,
default export, colocated `.test.tsx`."

The test: could two agents who never talk produce consistent code from this
sentence alone? If not, it is not specific enough.
