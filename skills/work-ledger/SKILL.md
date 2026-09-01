---
name: work-ledger
description: Breaking a brief into deliverable slices, recording what happened, and picking up where a run stopped. Use at intake before any work is dispatched, and at the start of every slice.
user-invocable: false
---

# The work ledger

A run that tries to build everything at once takes an hour, cannot be
interrupted, and gives the user nothing to look at until it is finished or
broken. It also drifts: research on long-horizon agents is consistent that
step-by-step agents lose the goal because each locally-best move pulls slightly
away from it, while **plan-ahead agents hold**. The named failure modes are
losing track of earlier decisions, declaring half-finished work done, and
quietly changing what is being built.

The fix is not a longer prompt. It is to make the plan an **artifact the agent
re-reads**, rather than a memory it is trusted to keep.

## Two files, and the split is the point

**`.devteam/plan.md` — the contract.** Written once at intake, with the user,
before anything is dispatched. Never rewritten.

**`.devteam/progress.jsonl` — the journal.** One JSON object per line, appended,
never edited.

Durable systems converge on this shape because a rewrite can lose or invent
history and an append cannot. It also means an interrupted run leaves a truthful
record instead of a half-updated status field.

## Slicing: vertical, and the skeleton first

A slice is **a thin cut through every layer that actually runs**, not a layer.
Not "build the data model", then "build the API", then "build the UI" — that
defers every integration risk to the end, which is the failure the one-hour run
already has.

**S1 is always the walking skeleton**: the thinnest end-to-end thing that
builds, serves and can be looked at. A route that renders a masthead and
nothing else is a good S1. It proves the stack, the build, the route and the
screenshot loop all work before any judgement is spent on content.

Then thicken. Each later slice adds one visible capability to something that
already runs.

Size a slice so that:

- it is **independently verifiable** — its criteria can be checked without the
  slices after it existing
- it leaves the project **working** — a slice never ends with the build broken
- it is **worth looking at** — if the user would see no difference, it is not a
  slice, it is a step inside one

Three to eight slices is the usual range. More than that and they are steps;
fewer and they are projects.

## The format

```markdown
# Plan

## S1 — the route renders at all
**Delivers:** /jobs builds and serves, masthead only, nothing else on it.
- [ ] npm run build exits 0
- [ ] out/jobs/index.html exists
- [ ] a screenshot shows the masthead

## S2 — the rows carry real data
**Delivers:** every job visible with client, stage, owner and due date.
- [ ] twenty rows render from the fixture
- [ ] npm run lint exits 0
```

Ids are `S1`, `S2`, … in order, with no gaps. Every slice needs a `**Delivers:**`
line — one sentence, what the user will see — and at least one checkbox.
**A criterion that cannot be checked by a command or by looking at a screenshot
is not a criterion, it is a hope.**

## The journal

Append one line when a slice starts, and one when it ends:

```json
{"slice":"S1","status":"started"}
{"slice":"S1","status":"done","evidence":[{"cmd":"npm run build","exit_code":0}]}
```

`status` is `started`, `done` or `blocked`. **`done` requires evidence** — the
same commands and exit codes a report carries. A `done` with an empty evidence
array is the "declaring half-finished work done" failure with a tick next to it.

Append. Never rewrite the file, never edit a previous line. If something was
recorded wrongly, append a corrected event: the last event for a slice wins, and
the history of the mistake stays visible.

## The plan is a contract

**No agent may add a slice, remove one, or change its criteria.** That is the
whole drift control, and it only works if it is absolute.

Work discovered mid-slice goes in `observations` on the report — a channel that
already exists — where the lead can read it and the user can decide. A slice
that turns out to need something the plan did not anticipate returns
`needs_input` with the question. It does not quietly grow.

If the plan is genuinely wrong, that is a conversation with the user and a new
plan, not an edit made in passing.

## Starting a slice

1. Read `plan.md` and the journal. **Re-read the goal from the file** — this is
   the re-anchoring that stops drift; do not work from what you remember.
2. If the previous slice is marked `done`, **re-run its acceptance criteria
   before continuing.** A status is a claim and the working tree is the fact; a
   killed run can leave the two disagreeing. If they disagree, say so and stop.
3. If the current slice is already marked `started`, you are resuming an
   interrupted attempt. Inspect what is already on disk before writing anything
   — half-written files from the previous attempt are yours to finish or undo,
   not to duplicate.
4. Append `started`, do the work, append `done` with evidence.

## Ending a slice

Stop. Report what was delivered, which criteria passed with what evidence, and
what the next slice is. Do not begin it.

The user decides: continue, change something, or stop. That decision is the
reason for the whole mechanism — it is what turns an hour of unattended
building into a sequence of small, checkable deliveries.
