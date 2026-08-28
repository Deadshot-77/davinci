# Spending the budget where it buys quality

## The correction this came from

The plugin had been built with cost treated as a thing to minimise. That shows
up in specific decisions, not in a stated policy — `review-lens` was given the
`Skill` tool instead of preloading `code-craft` so only the one lens that needed
it would pay; review depth was left to the gate's discretion rather than
specified; every dispatch fell through to the agent's frontmatter model because
overriding it seemed like an extra.

That is the wrong objective function. The product is what matters. Tokens and
wall-clock are the budget spent reaching it, and the job is to spend them where
they buy quality rather than to spend as few as possible.

Spending them evenly is the same mistake made twice. Opus and a six-lens review
over a fixture buys nothing and slows delivery. A cheap pass over an
authorisation path ships a defect nobody catches. Both are failures, and the
second one is the expensive one.

## The mechanism

`work-tiers` has the lead assign every task a tier from what the work carries,
never from how large it is — blast radius, exposure to untrusted input or
credentials, whether anything else builds on its shape, and how long it lives. A
single yes on exposure or reversibility makes it load-bearing; the rubric is a
floor, not an average.

| Tier | Model | Revision pass | Review depth | Gates | `CRAFT` |
|---|---|---|---|---|---|
| `load-bearing` | Opus | mandatory, before the gate | six lenses | both | blocks |
| `standard` | Opus | builder's call | correctness, tests, craft | review; security when a boundary is touched | advisory |
| `scaffolding` | Sonnet or Haiku | none | one lens or a gate read | review | advisory |

The point is that one decision sets both ends. The tier that says how much to
spend is the tier that says how strictly to judge the result, so the two can
never drift apart into "expensive but lenient" or "cheap but obstructive".

It is a different axis from the brief's `Classification`. That says how big the
request is and how it routes. This says what one task inside it carries — a
`bounded` brief routinely holds one load-bearing task and three scaffolding ones.

## Raising the floor without causing churn

`CRAFT` is a new criterion that blocks regardless of what the brief asked for,
the way `SECURITY` already does. It covers exactly three defects:

1. An error path that can fail in production with no test exercising it.
2. A discarded error cause — a `catch` binding nothing and logging nothing — on
   such a path.
3. An exported interface with no test at all.

All three were found in the team's own output by hand (see
[code-craft.md](code-craft.md)) and none was raised by the review gate that
passed that code, because the gate's rule was that anything not citing an
`AC-<n>` is advisory and gets let go.

`CRAFT` blocks **only on load-bearing work**. Everywhere else the same findings
stay advisory. That restriction is the whole balance, and a test enforces it: an
agent that cites `CRAFT` without naming the load-bearing condition fails the
suite, because an unrestricted `CRAFT` turns every fixture into a review
argument and costs delivery without improving anything.

## The revision pass

On load-bearing work the builder critiques its own output against `code-craft`
— and `frontend-craft` where there is a visual surface — revises, and only then
reports. A gate bounce costs a full re-dispatch of the builder plus a second
gate run; a self-critique costs one turn. This is the cheap half of the quality
budget, and it was previously spent nowhere.

## What the lead can actually set

The `Agent` tool takes a `model` override and it beats the agent's frontmatter.
That lever is real.

It takes **no effort override**. Effort is fixed per agent definition and cannot
be changed at dispatch. The skill states this plainly rather than leaving the
lead to write `effort: xhigh` into a dispatch and believe it bought something —
an instruction that silently does nothing is worse than an absent one, and this
repository has already shipped a test for exactly that class of mistake.

So the levers are: model, review fan-out depth, whether a revision pass runs,
which gates run, and whether independent builders are dispatched concurrently.

## Also corrected here

`review-lens` now preloads `code-craft` instead of reaching for it through the
`Skill` tool, and the `Skill` tool was removed from its allowlist. A reviewer
that has to remember to load its own standard is a reviewer that sometimes does
not — the original choice was made to save tokens on the five lens instances
that do not need it, which is precisely the trade this document exists to
reverse.

`tech-lead`'s turn cap moved from 40 to 60. Revision passes and tier-driven
fan-out lengthen a run, and a lead truncated mid-arbitration leaves work
unreviewed.

## Honest limits

- No live run has used a tier yet. The rubric, the `CRAFT` floor, and the
  revision pass are all unexercised.
- The tier is chosen by the lead's judgement. Nothing mechanically verifies
  that a task touching auth was actually called load-bearing; the hook layer
  cannot see intent, only paths.
- The claim that a self-critique is cheaper than a gate bounce is reasoning
  about the dispatch mechanics, not a measurement.
