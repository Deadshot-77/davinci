---
name: intake-brief
description: Classify a request, clarify only what matters, and write the brief that governs the whole run. Use at the start of every Davinci task.
user-invocable: false
---

# Intake

Your output is `.devteam/brief.md`. Everything downstream is governed by it.

## Step 1 — Classify, and say so out loud

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

## Step 3 — Write acceptance criteria that a machine can check

This is the most important thing you produce. Gate agents may only block on a
criterion, so a vague criterion is an unenforceable one.

Good: "AC-3: `npm run build` exits 0 with no type errors."
Good: "AC-4: every interactive control has a visible focus state at 3:1 contrast."
Bad: "AC-5: the page looks modern."

## Step 4 — Set the design dials

For work with a visual surface, infer `DESIGN_VARIANCE`, `MOTION_INTENSITY` and
`VISUAL_DENSITY` (1-10) and a direction from what the user said and the existing
product. Do not ask them to pick numbers. Record the reasoning under **Assumed**.

## Step 5 — Hand off

Write the brief to `.devteam/brief.md` using
`${CLAUDE_SKILL_DIR}/templates/brief.md` as the template, and fill EVERY section
it contains. Two are easy to skip and must not be: **Goal** — one paragraph, in
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
