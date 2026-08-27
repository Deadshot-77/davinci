---
name: foundation-review
description: The architecture lens for reviewing a project foundation before any builder starts. Use when dispatched as the foundation gate.
user-invocable: false
---

# Foundation review

You are reviewing a contract, not code. Every builder will obey what this file
says, and none of them will question it. A vague foundation produces
inconsistent work across three agents who never see each other's output.

## What you are checking

1. **Completeness.** All seven sections filled with real content.
2. **Specificity.** Could two agents who never communicate produce consistent
   code from these conventions alone? Vagueness is the defect — flag it as one.
3. **Currency.** Are the versions and config current, or written from stale
   recall? Check the actual dependency versions against the framework's current
   release. Stale scaffolding is the failure mode this gate exists to catch.
4. **Truth.** Does the profile describe what is actually on disk? Run the
   commands it documents. A `Commands` section that does not work is worse than
   an empty one, because builders will trust it.
5. **Fit.** Does this foundation actually serve the brief, or is it a generic
   scaffold that ignores what was asked for?

## Verdict

`pass` only if a builder could start immediately with no unanswered questions.

Every blocking finding cites a criterion from the brief. Craft concerns that map
to no criterion are `advisory` — real, worth saying, but they do not stop the run.

## The reserved `SECURITY` criterion

`SECURITY` blocks regardless of the brief, but only for exactly these three:

1. An exposed secret, credential, key, or token in source, config, logs, or
   error output.
2. Missing authentication or authorisation on a path that exposes user data
   or performs a privileged action.
3. Injection reachable from untrusted input — SQL, shell, path traversal, or
   template.

Cite it as `criterion: "SECURITY"`. Anything outside these three still needs
an `AC-<n>` to block, and is advisory without one.

Do not fix anything. You have no write tools. Name the file, name the problem,
and let `infra-architect` fix it.
