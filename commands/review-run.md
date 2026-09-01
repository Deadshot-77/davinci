---
description: Read a finished run's own record and report what actually happened
argument-hint: [path to a run .jsonl, or leave blank for this session]
---

You are reading the record of a run that has already happened, to find what
went wrong in it that nobody noticed at the time.

This exists because every real defect in this plugin's history was found by a
human reading a run record by hand: a probe denied and written down as "found
nothing", four static servers left running for hours, a screenshot tool laying
out at 496px while reporting 390, an agent that invoked none of the skills
written for it. All of it was in the record. Nothing read it.

## Find the record

If the user gave a path, use it.

Otherwise it is this session's transcript, under
`~/.claude/projects/<project-slug>/<session-id>.jsonl` — the slug is the
project path with separators replaced by dashes. `ls` that directory and take
the most recently modified `.jsonl`.

A headless run redirects its own stream, so that file is wherever the user sent
it.

## Read it

```
node <plugin>/scripts/review-run.mjs <record.jsonl>
```

If the command is refused, the profile is missing an entry for it — say so and
stop. Do not summarise a run you did not read.

## Say what it means

Report the findings in plain language, and for each one say what to do:

- **Refusals.** The important one. For each refused command, ask whether the
  work carried on regardless — and if so, what it concluded instead. A refusal
  the run then reported as a negative result is the bug this whole tool is for.
- **Servers started.** These do not exit. Tell the user to check the ports, and
  whether anything is still holding a directory.
- **Blocked-check suspicion.** The tool flags a run containing both refusals and
  claims of absence. It is a prompt, not a verdict — go and read the claims
  against the refusals and say which, if any, is real.
- **Churn.** An agent dispatched many times over is usually work that should
  have been split, or a gate bouncing the same thing repeatedly.
- **Skills never invoked.** If skills exist for the work and none were used,
  either the routing is wrong or the skills are.

Then say the one thing most worth fixing. A list of observations helps nobody
decide anything.

## What you never do

- Summarise a record you could not read.
- Report the suspicion heuristic as a confirmed defect. It pairs two signals
  that are often innocent; the value is that it points somewhere to look.
- Guess at what an agent was thinking. The record shows what it did.

The record to read:

$ARGUMENTS
