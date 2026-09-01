---
name: dispatching-workers
description: Getting several cheap workers to write disjoint parts of one slice at once, and supervising them so the result reads as one author. Use when a slice contains three or more independent pieces of comparable size.
user-invocable: false
---

# Dispatching workers

You are a department lead. You can write everything yourself on Opus, or you
can specify the pieces and have several `implementer` workers write them
concurrently on Sonnet while you direct and review.

The second is faster and cheaper — but only when the work genuinely divides,
and only when you do the two jobs that do not divide: **deciding the shape
before they start, and reading what comes back.** A lead who delegates and then
trusts the reports has not saved time, it has moved the defects downstream to a
gate that costs more to bounce off.

## When workers pay, and when they cost

Dispatch workers when the slice contains **three or more independent pieces of
comparable size**, each of which you could specify in a paragraph.

Do not dispatch them for:

- **One or two pieces.** Specifying the work costs about what doing it costs.
  Write it.
- **Work you cannot yet specify.** If you are still deciding the shape, deciding
  is the work, and it is yours. Explore first, then partition.
- **Anything where the pieces have to agree with each other as they are
  written** — a component and the hook it consumes, a type and its only user.
  That is one piece with two files in it, so give both to one worker.

## Partition on files, and delegate leaves

The unit is **a file nothing else in the batch touches.** Not a feature, not a
concern — a file. Two workers on one file overwrite each other, and the merge
of two agents' guesses is worse than either alone.

So: **delegate the leaves and keep the joins.** A component and its stylesheet
are a leaf. The page that imports four components, the barrel file, the token
sheet, the router table — those are where the pieces meet, and they are yours.
Write them yourself, before or after the batch.

The test is mechanical: if two workers would both need to edit a file, that
file is not delegable. It is your integration work.

## Decide the shape once, before any of them start

Four workers each making a reasonable independent choice produce four dialects,
and you then pay to reconcile them — which is the cost that quietly eats the
saving. The reconciliation is avoided by deciding first, not by reviewing
harder afterwards.

Before the batch, fix and put in **every** dispatch: the naming convention, the
props or signature shape, how state is held, how styles attach, the import
order, and **one sibling file to copy the structure of**. Pointing at a real
file in the repo is worth more than three paragraphs describing one.

This is the same rule that governs generated assets — one treatment, named
once, repeated in every brief — and for the same reason. Assembled-looking
output comes from independent choices, not from bad ones.

## Writing the batch

Write `.devteam/assignments.json` before dispatching. It is what the write hook
enforces, so a worker's scope is real rather than advisory:

```json
{
  "batch": "s3-beat-one",
  "lead": "frontend-engineer",
  "assignments": [
    { "label": "pillars",  "paths": ["components/home/Pillars.tsx", "components/home/Pillars.module.css"] },
    { "label": "audience", "paths": ["components/home/Audience.tsx", "components/home/Audience.module.css"] },
    { "label": "contact",  "paths": ["components/home/Contact.tsx", "components/home/Contact.module.css"] }
  ]
}
```

- `batch` is any name for this round. Changing it retires the previous round's
  claims, so you never clean up by hand.
- `lead` is you. Every path is checked to be inside **your** scope: a worker
  cannot reach where you could not, which is what stops delegation becoming a
  way around the scope map.
- Overlapping paths are rejected outright and then **no worker writes at all**.
  An invalid file is not permissive, it is closed.

Then dispatch them **in a single message** so they run concurrently. Dispatching
one at a time is the whole saving thrown away.

Each dispatch names the label, the exact paths, the spec, the sibling to match,
and `model` — `sonnet` unless the piece is genuinely hard.

## Supervising: read the code, not the report

**Open every file a worker wrote.** A report saying a component is complete is a
claim; the file is the evidence. This is the job you kept when you delegated the
typing, and skipping it converts workers from a speed-up into a liability —
because a defect you pass upward costs a full gate bounce and a re-dispatch,
which is more than writing the file yourself would have cost.

You are looking for what a gate will not catch and a worker cannot see: whether
the four pieces read as one author, whether anything drifted from the shape you
specified, whether a worker solved a problem you had already solved elsewhere.

Fix small divergences yourself. Re-dispatch only when a piece is wrong enough
that the fix is most of the work.

## When a worker reports blocked

A worker denied a path outside its assignment is the partition being wrong, not
the worker being wrong. It is the cheapest possible signal — it arrives before
anything is corrupted, and it names the file.

Take the file into your own work, or issue a new batch with a corrected
partition. Never widen the assignment to include a file another worker holds.

## Pre-flight

- [ ] three or more independent pieces, each specifiable in a paragraph
- [ ] every shared or integrating file kept for yourself
- [ ] shape, conventions and a sibling to copy fixed once and in every dispatch
- [ ] `assignments.json` written, paths disjoint and inside your own scope
- [ ] all workers dispatched in one message
- [ ] every file they wrote opened and read before you report
