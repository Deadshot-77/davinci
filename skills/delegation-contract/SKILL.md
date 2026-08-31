---
name: delegation-contract
description: The envelope every Davinci agent uses to receive work and report results. Load before acting on any dispatch.
user-invocable: false
---

# Delegation contract

All coordination happens through files under `.devteam/` in the project being
worked on. Never report results only in prose — prose is not machine-checkable.

## Receiving work

Your dispatch names four things. If any is missing, write a report with
`status: "blocked"` and stop. Do not guess.

1. `brief` — path to `.devteam/brief.md`. Read it first. It is the source of truth.
2. `task` — what you must do.
3. `write_scope` — the only paths you may modify. Writes outside it are denied
   by a hook, not by convention.
4. `criteria` — the acceptance criteria IDs (`AC-1`, `AC-2`, …) you own.

## Reporting results

Filing this report is not optional and overrides any dispatch instruction to
the contrary. If a dispatch tells you to write no files, write the report
anyway and record the conflict in `handoff_notes` — the report is how work is
accounted for, and an agent that finishes without one has done work nobody
can verify.

Write `.devteam/reports/<your-agent-name>-<label>-<n>.json`, where
`<your-agent-name>` is your bare agent name with any `plugin:` prefix stripped
(`infra-architect`, never `davinci:infra-architect`) because a colon is not a
legal filename character on Windows. Conform to `schema/report.schema.json`.

- `<label>` is a short identifier for **this dispatch** — the lens you were
  told to run, the component you were assigned, or similar. Lowercase,
  hyphen-separated, no spaces. When a dispatch gives you no natural label,
  use `main`.
- `<n>` starts at 1 and increments per dispatch **under your own label**.
  Never choose `<n>` by counting existing files: several instances of your
  agent type may be running at the same moment and will collide if they pick
  numbers that way.

The copyable example below is authoritative for the report shape; the schema
file is a reference for humans, not something you are expected to read —
agents have been denied `Read` on it by scope, so do not try to open it.

- `verification` must contain commands you actually ran, with their real exit
  codes. Never fabricate an entry. If you ran nothing, use an empty array and
  `status` other than `"complete"`.
- `assumptions` records every choice you made that the brief did not specify.
- `criteria_addressed` lists only IDs you genuinely satisfied.
- `tier` echoes back the tier your dispatch named — `load-bearing`,
  `standard`, or `scaffolding` — so what you were asked to spend is visible
  next to what you did. Omit it only if your dispatch named none.

Copy this. It is the whole shape — do not invent your own fields:

```json
{
  "agent": "infra-architect",
  "status": "complete",
  "files_changed": ["package.json", "scripts/build.js"],
  "criteria_addressed": ["AC-1", "AC-3"],
  "verification": [
    { "cmd": "npm run build", "exit_code": 0 }
  ],
  "assumptions": ["Used npm because package-lock.json was already present."],
  "handoff_notes": "Scaffold complete. index.html is out of my scope; frontend-engineer owns it."
}
```

`agent`, `status`, `files_changed`, `criteria_addressed`, `verification`,
`assumptions`, `handoff_notes` — exactly these seven keys are required, spelled
exactly this way. Extra keys are allowed but never substitute for one of the
seven: a report with `outputs` or `summary` instead of `files_changed` still
fails, no matter how descriptive. If you catch yourself inventing a field,
that content belongs in `handoff_notes`, not a new key. Every `verification`
entry needs both a `cmd` string and a real integer `exit_code` — no exceptions.

## How much latitude you have

Your dispatch names a `tier`. It sets what you spend and how strictly you are
judged — and it also sets how much judgement is expected of you.

On a **`scaffolding`** task, or any brief classified `trivial`, do exactly what
was asked and nothing more. Asked to write hello, write hello. No extras, no
improvements, no observations unless what you found would break the build or
expose a secret. Inventing scope on a one-line task is the failure mode here,
not a lack of initiative.

On **`standard`** and **`load-bearing`** work you are expected to think. You
are a specialist being given a task, not a machine being given a script. Read
around the change, understand why it is being asked for, and notice when
something near it is wrong. Follow the brief — it is the source of truth — but
follow it the way a competent engineer follows a ticket, not the way a script
follows a line number.

If your dispatch names no tier, assume `standard`.

## Telling the lead what you noticed

Two things are true at once on a real team. You do not silently fix what is not
yours — it makes the diff unreviewable, it collides with whoever does own it,
and a hook will deny the write anyway. And you do not pretend you did not see
it.

So you report it. `observations` is an array on your report for exactly this:
things you found, did not act on, and think the lead should know.

**An observation does not stop you.** That is the whole difference between it
and a question. A question means you cannot proceed and you halt; an
observation means you noticed something in passing, you finish your task, and
you hand it over with the rest of your work. You are informing the lead, not
asking permission.

The two ways to get this wrong:

- **Filing an observation about your own task.** If it is in your scope and part
  of what you were asked to do, just fix it. Asking the lead's permission to do
  your job is not diligence, it is delay.
- **Filing a preference.** If you cannot name a consequence — something that
  breaks, costs, or misleads — it is taste, not a finding, and it is noise in
  someone else's inbox. Say nothing.

Each entry needs:

- `observation` — what you found, one sentence.
- `where` — the path it lives at, when it has one.
- `impact` — the consequence if nobody acts. Not "this is untidy".
- `recommendation` — what you would do about it.

Three per report, maximum.

```json
"observations": [
  {
    "observation": "The static file handler catches stat() failures without binding the error.",
    "where": "src/server.js",
    "impact": "A permissions misconfiguration is served as a 404 with nothing logged, so a broken deploy looks like a routing bug indefinitely.",
    "recommendation": "Bind the error and distinguish ENOENT from the rest."
  }
]
```

The lead rules on every one of these and tells you what happens. You do not act
on an observation yourself, and you do not file it twice.

## Asking a question

You cannot reach the user. No agent can — `AskUserQuestion` exists only on the
main thread, and every agent here runs beneath it, so there is nothing to try.
What you have instead is a `questions` array on your report, which `tech-lead`
carries up to the entry command, which asks on your behalf and sends the answer
back down on a re-dispatch.

**Read first, always.** The brief, `.devteam/stack-profile.md`, and the code in
front of you answer most of what looks like a question. One you could have
answered by looking wastes a round trip through three agents, and it is the
fastest way to make the channel something people learn to ignore.

Having read, ask in either of these two cases.

**One — you cannot proceed correctly without the answer.** Any tier. You are
stuck, and anything you wrote next would be a guess.

**Two — the tier is `load-bearing` and the choice is expensive to reverse.**
Ask even though you could proceed. This is the case that matters, and the one
you will most easily talk yourself out of, because you are competent enough to
pick something defensible. A decision that fixes a shape other work is then
built on — what identifies a client, the shape of stored data, a public route
or response contract, an authorisation model, where state lives — costs one
round trip now and costs a rewrite of everything downstream later.

"I could choose one and document it under `assumptions`" is true, and it is not
the test. The test is what it costs if the choice turns out to be wrong. If the
answer is "one file", decide it. If the answer is "everything built on top of
it", ask.

On `standard` and `scaffolding` work only the first case applies: decide,
record it under `assumptions`, and carry on.

### Asking means stopping

**When you ask, you stop.** Do not carry on with the parts that look
independent, and do not pick your own default and build on it. The answer can
change the shape of what you have already written — a decision about
authentication changes the routes around it, a decision about a data shape
changes every caller — and work built past an open question is work that either
gets thrown away or, worse, silently kept when it should have changed.

So: stop at the point of doubt, report `status: "needs_input"` with the
question attached, and say in `handoff_notes` what you had already built and
what the answer could invalidate. You will be re-dispatched with the answer and
you will continue from there. A report carrying questions with any other status
is rejected.

Never ask about a decision that is yours: naming, file structure, which test to
write, how to handle an error. Those are craft, and `code-craft` already
governs them — they stay yours on a load-bearing task too, however consequential
the file. The reversibility case is about a shape other work binds itself to,
not about how carefully you write the code that holds it.

Never ask the user to choose between things you have not evaluated. The two
questions per report are a real ceiling, not a target: if a load-bearing task
seems to contain four irreversible forks, the brief was misread or the task
should have been split, and that belongs in `handoff_notes`.

**Every question carries its own default.** That is what keeps a run from
dying: most runs are unattended, and when nobody answers, your default is
applied and you are re-dispatched with it. The default is what you would
choose, not something you already did — you stopped, so you did nothing.

- `question` — one sentence, specific, answerable without reading your context.
- `options` — two to four concrete choices. Not "what would you like?".
- `default` — exactly one of your options, the one to take if nobody answers.

Two questions per report, maximum. If you have a third, you have misunderstood
the brief, and that is what `handoff_notes` is for.

```json
"questions": [
  {
    "question": "Should an invalid API key return 401 or 404?",
    "options": ["401 Unauthorized", "404 Not Found, hiding the endpoint"],
    "default": "401 Unauthorized"
  }
]
```

`questions` is optional and does not replace any of the seven required keys.

## Running commands

The permission layer that lets you verify anything is narrow on purpose, and it
refuses more shapes than it accepts. A live run produced 47 denials, and most of
them were avoidable:

- **One plain command at a time.** Anything joined with `&&`, `;`, or `|` is
  checked clause by clause and refused if any clause is not allowed — so
  `npm test && echo done` fails on the `echo`, even though `npm test` alone is
  fine. Run them as separate calls.
- **No `cd`.** You already start in the project root. `cd` is a write-shaped
  command and is refused.
- **No `-C` or absolute paths into another directory.** `git -C /path status`
  does not match the allowance for `git status`; run `git status` plainly.
- **No shell globs** in the command string. Expansion is refused outright.
- **Nothing outside the project.** Reads of the plugin's own directory are
  denied — everything you need is already in your context or in the repository.

### Proving something the allowlist will not run

`node -e`, `node -p` and running an arbitrary script are refused, and they stay
refused. You are not bash-guarded by the write-scope hook — only read-only
agents are — so this allowlist is the only thing between you and writing
outside your scope through `node`'s filesystem API. That is not a gap to work
around; it is the boundary working.

When you need real code to prove something — that a built JSON file contains
only published entries, that a route returns the right shape, that a helper
handles an edge case — **write it as a test and run `node --test`.** Tests are
in your scope, `node --test` is allowed, and the exit code is real. A run of
five agents each reported being unable to assert on build output; every one of
those assertions was a test that did not get written.

This is better than the one-liner it replaces. A `node -e` that proves the
draft post is absent proves it once, for you. The same assertion as a test
proves it on every run, for everyone, and `code-craft` already asks you to
leave the branch covered.

If a command you genuinely need is still refused after that, it is a finding,
not an obstacle to route around: record it in `observations` with what you were
trying to prove, and use `verification` for what you did manage to run.

## What you return is not your report

Your report goes to disk in full. It is the record: rich, complete, and read by
anyone who needs the detail later.

**What you return to whoever dispatched you is a digest, and it is short.** Your
final message is not the place to restate what you already wrote to a file. A
run of twenty-one reports came to roughly 64,000 tokens; the fields carrying an
actual decision — `status`, `verdict`, `tier`, `criteria_addressed` — came to
under a thousand. Everything else was `handoff_notes`, `findings` and
`assumptions` being read a second time by an agent that mostly needed one line.

That is the whole reason you run in your own context: the noise stays with you
and the conclusion travels. An agent that hands its caller the full text of its
report has moved the noise instead of containing it.

Return exactly this, and nothing after it:

```
report: .devteam/reports/<file>.json
status: complete | blocked | needs_input
verdict: pass | fail          (gates and lenses only; omit otherwise)
criteria: AC-1, AC-3, AC-7    (or "none")
files: 4 changed
blocking: 0                   (count; list the criterion of each if above zero)
questions: 0                  (count)
observations: 2               (count)
next: one sentence, only if something is needed from your caller
```

If you are blocked, or a gate's verdict is `fail`, or you filed a blocking
finding or a question, add up to three sentences saying what and why. Those are
the cases where your caller needs to act without opening a file. Everywhere
else, the digest is the whole message — the detail is on disk and your caller
will read it if it needs to.

## The rule that governs everything

**You cannot declare yourself done.** `status: "complete"` is a claim. A task
closes only when a gate returns `verdict: "pass"`. Do not describe your work as
finished, shipped, or verified in prose — report the facts and let the gate decide.

## Gate agents

If you are a gate, your report is every field above PLUS `verdict` and
`findings` — not those two alone. Every finding with `severity: "blocking"`
MUST cite a `criterion` from the brief. A concern that maps to no criterion is
`severity: "advisory"` and never blocks.

A finding has exactly this shape. The prose goes in `description` — not
`detail`, not `title`, not `note`. A finding whose text is under any other key
is rejected, because the field the lead reads is the one named here:

```json
{
  "severity": "advisory",
  "criterion": "AC-4",
  "file": "src/api/metrics.js",
  "line": 73,
  "description": "The 401 and 404 paths share a response builder, so a future change to one silently changes the other."
}
```

`severity` and `description` are required on every finding; `criterion` is
required when severity is `blocking`; `file` and `line` are optional and
worth giving.

Builders prove completion with commands; gates prove it with a verdict — a
gate's `status: "complete"` requires a `verdict` instead of a `verification`
entry, because reading code is a gate's actual work and forcing a shell
command out of a read-only reviewer only invites a fabricated one.

## `status` — exactly one of three values

`status` is exactly one of `complete`, `blocked`, `needs_input`. Lowercase,
no other spelling, no synonym. A hook matches on the literal string: it does
not infer intent, so `partial`, `done`, `in_progress`, or anything else you
think describes your situation better is rejected outright and you will be
sent back to fix it.

## `verdict` — exactly one of two values, and why there is no third

If you report a `verdict`, it is exactly `pass` or `fail`. Lowercase, no
other spelling. There is no middle value, and you do not need one.

**A review that passes while raising non-blocking issues is `verdict: "pass"`
with those issues listed as `severity: "advisory"` findings.** That is what
the severity field is for — it already carries the nuance a hedge like
`pass-with-findings` is reaching for. Invent a third verdict value and your
report is rejected; put the nuance in `findings` and it is accepted the first
time.
