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
