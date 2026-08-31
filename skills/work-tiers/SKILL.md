---
name: work-tiers
description: How much to spend on a piece of work and how strictly to judge it, decided from what the work carries rather than how large it is. Use when dispatching a task or gating one.
user-invocable: false
---

# Work tiers

The quality of what gets delivered is the objective. Tokens and wall-clock are
the budget you spend to reach it, not a second goal competing with it.

Spending the same on a favicon and an authentication flow gets both wrong — it
overpays for one and underpays for the other, and the underpaid one is the one
that costs somebody. One decision per task fixes both ends at once, because the
tier that says how much to spend is the same tier that says how strictly to
judge the result.

**Tier is not size.** Three lines touching auth are load-bearing. Four hundred
lines of static marketing copy are not. Judge what the code carries, never how
large the diff is.

This is a different axis from the brief's `Classification`. That says how big
the request is and how it routes. This says what a single task inside it
carries. A `bounded` brief routinely contains one load-bearing task and three
scaffolding ones.

## Deciding the tier

Four questions, asked per task:

1. **Blast radius** — if this is wrong, who notices? One screen, one feature,
   every user, or the data itself?
2. **Exposure** — does untrusted input reach it? Does it touch credentials,
   money, personal data, or an authorisation decision?
3. **Reversibility** — does anything else build on this shape? Schema, public
   API, routing, design tokens, and the scaffold every builder copies are
   contracts: changing them later means changing everything downstream too.
4. **Longevity** — is this thrown away next week, or does it live for years?

A single yes on **exposure** or **reversibility** makes it load-bearing. This is
a floor, not an average — a task does not get to be cheap because three of the
four answers were reassuring.

## The three tiers

### load-bearing

Schema and migrations, authentication and authorisation, payment, anything
untrusted input reaches, the shape of a public API, the design system's tokens,
and the scaffold every other agent copies.

- **revision pass, mandatory.** The builder critiques its own output against
  `code-craft` (and `frontend-craft` where there is a visual surface), revises,
  and only then reports. A gate bounce costs a full re-dispatch of the builder
  plus a second gate run; a self-critique costs a turn. Ship the second draft,
  not the first.
- **review** — full fan-out: correctness, silent-failure, types, tests,
  secrets, craft, dispatched in a single message so they run concurrently.
- **gates** — both.
- The `CRAFT` floor below blocks here.

### standard

Feature work built on top of a foundation that already exists.

- **revision pass** — the builder's call.
- **review** — correctness, tests, craft.
- **gates** — code review always; security whenever the change touches a
  route, an input boundary, config, or a dependency.
- `CRAFT` findings are advisory here.

### scaffolding

Config, a README, static copy, a fixture, a stylesheet tweak. Work that is
thrown away or trivially changed, and that nothing builds on.

- **revision pass** — no.
- **review** — one lens, or the gate reads it directly.
- `CRAFT` findings are advisory here. Do not let a reviewer relitigate a
  fixture.

## Model is a separate question from tier

The tier says how badly it hurts to be wrong. The model says how much reasoning
the work needs. Those are different, and running them together is a mistake
this rubric used to make: on a greenfield build almost every task passes the
reversibility test, so almost everything came out `load-bearing`, and when the
tier chose the model almost everything ran on Opus. A live run put 19 of 21
dispatches on the top tier. The lead was obeying the rubric exactly; the rubric
was wrong.

**Default to `sonnet`. Drop to `haiku` for clearly mechanical work. Escalate to
`opus` when the task is genuinely hard, or when a cheaper model has already
stumbled on it.** Choose from what the work *is*, not from what it costs to get
it wrong:

- **`haiku`** — extraction and classification. Reading a file to answer one
  question, checking a value, running a command and reporting the exit code,
  a single mechanical lens over a small diff.
- **`sonnet`** — most building and most reviewing. Routes, components, tests,
  refactors, content, and ordinary code review: work with a clear goal that
  does not need multi-step architectural reasoning. This is the default, and it
  covers the majority of dispatches on a normal run.
- **`opus`** — architecture and the genuinely subtle. The stack profile and
  scope map, a security audit, a multi-file bug whose cause is not local, a
  schema or migration, an authorisation model. Opus earns its price where being
  wrong costs more than the tokens.

A `load-bearing` task does not automatically mean Opus. Writing the tenth
component of a design system is load-bearing — everything binds to it — and it
is still ordinary generation. Judge the reasoning the work needs.

## Escalate on failure, not on suspicion

The cheapest way to find the tasks that genuinely need Opus is to let a gate
tell you. When a gate returns `verdict: "fail"` on a builder's work and you
re-dispatch it, **send the retry one model up** — `haiku` to `sonnet`,
`sonnet` to `opus` — and say in the dispatch that it is a retry after a failed
gate and why.

This is the loop most systems cannot close, because they have no gate to
observe the stumble. Use it: it spends the expensive model on exactly the work
that has proven it needs one, rather than on everything that might.

If the same criterion fails twice, stop escalating and report upward. A third
attempt at a higher price does not discover that the brief was wrong.

## What you can actually set at dispatch

The `Agent` tool takes a **`model`** override, and it beats the agent's own
frontmatter. That is the model lever, and it is real.

It does **not** take an effort override. Effort is fixed by the agent
definition and cannot be raised or lowered per dispatch. Do not write
`effort: xhigh` into a dispatch: nothing reads it, the agent runs at its
frontmatter effort regardless, and you will believe you bought something you
did not.

So the levers you actually hold are: model, review depth (how many lenses),
whether a revision pass is required before the gate, which gates run, and
whether independent builders are dispatched concurrently in one message.

## Record it

Name the tier in the dispatch, and name it again in your report with the one
fact that decided it — "load-bearing: the session cookie is set here". A tier
nobody can see is a judgement nobody can check, and the whole point is that the
spend was a decision rather than an accident.

## The floor that moves with the tier

On **load-bearing** work these three block regardless of whether the brief names
them, cited as `criterion: "CRAFT"` exactly the way `SECURITY` is:

1. An error path that can fail in production with no test exercising it.
2. A discarded error cause — a `catch` binding nothing and logging nothing — on
   a path that can fail in production. The status code is right and the evidence
   of what broke is gone.
3. An exported interface — a route, an exported function, a component
   contract — with no test at all.

Outside load-bearing, all three stay advisory and never stop a run.

That difference is the whole balance: strict where being wrong is expensive,
cheap where it is not. Applying the load-bearing floor everywhere produces
review churn that slows delivery without improving the product; applying the
scaffolding floor everywhere ships untested auth.

## Getting it wrong

Over-tier and you spend budget you did not need, and the work is still good.
Under-tier and you ship an untested authorisation path, and nobody finds out
until it matters. The costs are not symmetrical. When genuinely torn, take the
higher tier and say in one line why you were torn.
