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

## The rule that governs everything

**You cannot declare yourself done.** `status: "complete"` is a claim. A task
closes only when a gate returns `verdict: "pass"`. Do not describe your work as
finished, shipped, or verified in prose — report the facts and let the gate decide.

## Gate agents

If you are a gate, your report is every field above PLUS `verdict` and
`findings` — not those two alone. Every finding with `severity: "blocking"`
MUST cite a `criterion` from the brief. A concern that maps to no criterion is
`severity: "advisory"` and never blocks.

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
