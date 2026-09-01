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

## Not everything gets a ledger

A plan is for work large enough that the plan earns its cost. A typo does not
need slices, an approval loop and a journal — that is friction wearing rigour's
clothes, and it teaches the user to route around the tool.

`trivial` work skips all of this: a checkpoint, the change, a report. The entry
command handles it before this skill is ever invoked. Everything `bounded` or
larger gets a ledger.

If work classified trivial turns out not to be, stop and re-classify rather than
carrying on. A one-line change that becomes three files is a misclassification,
and continuing is how a small change becomes an unreviewed large one.

## Two files, and the split is the point

**`.devteam/plan.md` — the contract.** Drafted at intake, shown to the user in
full, revised until they approve it, and never rewritten afterwards.

The draft-to-contract moment is exact: it is the `{"event":"plan-approved"}`
line in the journal. Before it, the plan is a proposal and rewriting it is the
whole point. After it, the plan is fixed and changing it is a conversation.

**A plan with no approval line is a draft**, however complete it looks — a run
that died between writing it and showing it leaves exactly that. Do not build
from one.

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

### Where to draw the boundary

The sharpest test — adapted from `superpowers`' plan skills, and it fits here
better than it fits there because this plugin has an actual gate:

> **Split only where the reviewer could meaningfully reject one slice while
> approving its neighbour.**

If a bounce on the first would automatically invalidate the second, they are one
slice. If the gate could sensibly pass one and fail the other, they are two.

Two consequences worth stating, because both are commonly got wrong:

- **Fold setup into the slice that needs it.** Scaffolding, config, a dependency,
  a fixture, the documentation for a thing — these belong inside the slice whose
  deliverable requires them, never as a slice of their own. "Set up the tooling"
  delivers nothing a reviewer can accept or reject.
- **A step is not a slice.** "Write the test, run it, see it fail, implement,
  see it pass" is five steps inside one slice. If the user would see no
  difference, it is a step.

Size a slice so that:

- it is **independently verifiable** — its criteria can be checked without the
  slices after it existing
- it leaves the project **working** — a slice never ends with the build broken
- it is **worth looking at** — the user can see what changed

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

`status` is `started`, `done`, `blocked` or `reverted`. A `reverted` slice
is pending again — the checkpoint put the tree back and the work is to be done
differently, not continued. **`done` requires evidence** — the
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

## Nothing is written until the plan is approved

While the plan is a draft, the project is read-only. Read the repository as much
as you like — that is how a good plan gets written — but do not scaffold, do not
install, do not create the branch. Claude Code's own plan mode works this way
and the reason is sound: work started before agreement is work the user has to
undo before they can disagree.

The first write of the build belongs to S1, after approval.

**And check where you are about to write.** If the repository is on its default
branch — `main`, `master` — say so and get consent before the first slice
writes anything. A user who wanted a branch and got commits on `main` has a
mess that costs more to clean than the slice cost to build.

## Starting a slice

1. Read `plan.md` and the journal. **Re-read the goal from the file** — this is
   the re-anchoring that stops drift; do not work from what you remember.

   Read the slice **critically**, not just receptively. You know things now that
   nobody knew when the plan was written — what the last slice actually cost,
   what the codebase turned out to look like. If the slice is wrong, say so
   before building it: return `needs_input` with what you would change and why.
   **Objecting is allowed; editing is not.** The plan changes when the user
   changes it, and a slice built against an objection you swallowed is worse
   than a slice delayed by a question.
2. If the previous slice is marked `done`, **re-run its acceptance criteria
   before continuing.** A status is a claim and the working tree is the fact; a
   killed run can leave the two disagreeing. If they disagree, say so and stop.
3. If the current slice is already marked `started`, you are resuming an
   interrupted attempt. Inspect what is already on disk before writing anything
   — half-written files from the previous attempt are yours to finish or undo,
   not to duplicate.
4. Append `started`, do the work, append `done` with evidence.

## Every slice is checkpointed before it starts

`scripts/checkpoint.mjs save . S<n>` before the first write, and the tree can
be put back exactly with `restore`. It uses a shadow git repository under
`.devteam/` — the project's own git history is never touched, and nothing here
needs the `git commit` grant the profile withholds.

A rejection is not destructive: restoring saves the discarded state first, so
if the rejection was the mistake, the work comes back.

**If the checkpoint could not be taken, say so before building.** A slice with
no checkpoint cannot be undone, and the user should learn that before they see
the result rather than after they ask for it back.

## Ending a slice

Stop. Report what was delivered, which criteria passed with what evidence, and
what the next slice is. Do not begin it.

The user decides: continue, change something, or stop. That decision is the
reason for the whole mechanism — it is what turns an hour of unattended
building into a sequence of small, checkable deliveries.
