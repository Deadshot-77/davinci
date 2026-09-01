---
name: intake-brief
description: Classify a request, clarify only what matters, and write the brief that governs the whole run. Use at the start of every Davinci task.
user-invocable: false
---

# Intake

Your output is `.devteam/brief.md`. Everything downstream is governed by it.

## Step 1 — Classify, and say so out loud

The classification line in the brief must be exactly one of these three words,
lowercase, alone on the line — nothing else. Downstream routing matches on
that literal word: a label like "greenfield build" or "new build (static
page)" is not a classification, it is prose, and it silently breaks the
`Route: direct` fast path. Pick one of trivial, bounded, or architectural even
when none feels like a perfect fit.

- **trivial** — a typo, a rename, a one-line change. Ask nothing. Write a
  minimal brief with a single acceptance criterion and a `Route: direct —
  <agent-name>` line naming the one specialist who owns it, and dispatch.
- **bounded** — a well-scoped change to code that already exists here.
  At most two questions.
- **architectural** — new project, new subsystem, or a change that alters
  interfaces others depend on. Up to four questions.

Announce the classification before asking anything, so the user can override it.

## Step 2 — Ask only questions that change the work

A question earns its place only if different answers lead to materially
different builds. Do not ask about anything you can determine by reading the
repository. Never ask more than four. Always offer a "you decide" option; when
the user takes it, record your choice under **Assumed**, not **Decided**.

Prefer `AskUserQuestion` with concrete options over open prose. You are the only
agent that can reach the user — no agent downstream can ask anything, so what
you fail to resolve here becomes an assumption someone builds on.

If `AskUserQuestion` is unavailable to you, or you ask and the turn would end
without an answer, you are running unattended. Unattended, you do not ask —
you decide, record every choice under **Assumed**, and proceed. Never end a
turn having only asked questions: either you got answers, or you proceed on
stated assumptions. Halting with questions and no brief produces nothing at
all, which is strictly worse than a brief with assumptions the user can
correct.

## Step 2b — A supplied document is a source, not a specification

Someone will hand you a brand book, a style guide, an old design file, a
competitor's site. Read all of it. Then split what you found in two, because the
halves have opposite standing:

**Facts — carry them through unchanged.** What the company does and for whom.
The claim it makes. The logo. The colours it owns. Names, markets, the audience.
These are true of the business, and inventing an alternative is fabrication, not
design.

**Prior decisions — treat as the current answer, not the required one.** The
typeface someone chose. How the palette was assigned to roles. The layout, the
spacing scale, the component set, the tokens. Somebody decided these once, with
what they knew then. They may still be right. They may be beatable.

Record which is which in the brief. A fact goes under **Decided**; a prior
decision goes under **Assumed** with a line saying where it came from, so a
builder knows it can be improved on rather than treating it as a constraint.

**The failure to avoid is deference.** A document handed over with authority
reads as a specification, and the whole design step collapses into transcription
— which is exactly the generic outcome the work is trying to escape. If the
existing answer turns out to be better than what you arrive at, take it and say
why. That is a result, not a retreat.

If a fact and a prior decision conflict — a book claiming "these exact tokens
ship" while the user asks for a fresh palette — surface it. Changing the
decision may make the fact untrue, and that is the user's call, not yours.

## Step 3 — Write acceptance criteria that a machine can check

This is the most important thing you produce. Gate agents may only block on a
criterion, so a vague criterion is an unenforceable one.

Good: "AC-3: `npm run build` exits 0 with no type errors."
Good: "AC-4: every interactive control has a visible focus state at 3:1 contrast."
Bad: "AC-5: the page looks modern."

### Checkable is not the same as satisfiable

A criterion can be perfectly mechanical and still impossible. A real run was
given this one:

> `git diff d79f57a -- package.json` is empty

Entirely checkable — a command, an exit code, no judgement. It could also never
pass: `package.json` entered the repository *after* that commit, so the diff
always renders it as a new file. The builder did nothing wrong and the criterion
could not be met by doing anything.

So before a criterion goes in the brief, ask **what would make this true**, and
in particular:

- **Anchor a comparison to something that exists and means what you intend.**
  For "this file was not modified", that is `git diff HEAD -- <path>` or the
  slice's own checkpoint — the state the work started from. A pinned historical
  commit asserts something about history, not about the work, and will be wrong
  the moment the file is younger than the commit.
- **Prefer a check whose result changes when the work happens.** If a criterion
  reads the same before and after, it is measuring something else.
- **Say what the check is for**, not just what it runs. "package.json is
  untouched by this slice" survives being re-anchored; a bare command does not.

## Step 4 — Set the design dials

For work with a visual surface, infer `DESIGN_VARIANCE`, `MOTION_INTENSITY` and
`VISUAL_DENSITY` (1-10) and a direction from what the user said and the existing
product. Do not ask them to pick numbers. Record the reasoning under **Assumed**.

## Step 5 — Hand off

Write the brief to `.devteam/brief.md` in exactly this shape, and fill EVERY
section.

```markdown
# Brief: <short title>

**Classification:** trivial | bounded | architectural
**Date:** <YYYY-MM-DD>
**Route:** direct — <agent-name>  <!-- trivial only; omit otherwise -->

## Goal

One paragraph. What the user wants and why.

## Decided

Facts the user stated or confirmed. One per line.

## Assumed

Choices made without the user. One per line, each with its reasoning. The user
scans this to catch a wrong guess before work starts.

## Out of scope

What this explicitly does not cover.

## Acceptance criteria

Numbered AC-<n>. Each must be objectively checkable by a gate — a command that
exits zero, a file that exists, a measurable property. "Looks good" is not an
acceptance criterion.

- AC-1: <criterion>
- AC-2: <criterion>

## Design dials

Only for work with a visual surface. Omit otherwise.

- DESIGN_VARIANCE: <1-10>
- MOTION_INTENSITY: <1-10>
- VISUAL_DENSITY: <1-10>
```
 Two are easy to skip and must not be: **Goal** — one paragraph, in
your own words, on what the user wants and why — and **Out of scope**, drawn
from whatever you ruled out while clarifying. A section you leave blank is one a
downstream agent will invent for itself.

For a **trivial** brief only, add the `Route: direct — <agent-name>` line
right under Classification, and omit the **Design dials** and **Out of
scope** sections entirely — there is no visual surface to dial in and no
scope wide enough to need bounding. Bounded and architectural briefs keep the
full template, unchanged.

Then show the user the **Assumed** section and dispatch `tech-lead` with the
brief path. Do not wait for approval of the brief unless the classification is
architectural.
