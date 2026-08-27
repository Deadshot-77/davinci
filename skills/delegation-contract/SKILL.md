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

Write `.devteam/reports/<your-agent-name>-<n>.json`, where `<n>` starts at 1 and
increments per dispatch. Conform to `schema/report.schema.json`.

- `verification` must contain commands you actually ran, with their real exit
  codes. Never fabricate an entry. If you ran nothing, use an empty array and
  `status` other than `"complete"`.
- `assumptions` records every choice you made that the brief did not specify.
- `criteria_addressed` lists only IDs you genuinely satisfied.

## The rule that governs everything

**You cannot declare yourself done.** `status: "complete"` is a claim. A task
closes only when a gate returns `verdict: "pass"`. Do not describe your work as
finished, shipped, or verified in prose — report the facts and let the gate decide.

## Gate agents

If you are a gate, your report is every field above PLUS `verdict` and
`findings` — not those two alone. Every finding with `severity: "blocking"`
MUST cite a `criterion` from the brief. A concern that maps to no criterion is
`severity: "advisory"` and never blocks.
