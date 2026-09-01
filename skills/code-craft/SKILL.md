---
name: code-craft
description: Engineering judgment for code that reads as though an experienced engineer wrote it. Use when writing or changing any source file.
user-invocable: false
---

# Code craft

A model writes what it has seen most, and what it has seen most is the
average of every repository in its training data. That average has a shape:
everything imports everything, nothing is ever deleted, every error is caught
and swallowed, and every function that fits nowhere lands in `utils`. It
compiles. It passes a glance. It costs someone six months later, when the
file that was sixty lines is eight hundred and nobody can say what it is for.

Craft is decisions made while writing. There is no cleanup pass that adds it
afterwards.

## 1. Read the neighbours before you write

On a codebase this team did not write, that means the whole project and not one
file — and it is worth the extra care, because you are changing something other
people depend on with tests you did not write. `davinci:brownfield` covers
orienting, pinning current behaviour before changing it, and knowing the blast
radius.


The clearest tell of outside authorship is code that works and does not
belong. Before the first line, read the two or three files nearest the change
and take from them:

- how errors are raised, wrapped, and handled here
- how modules are named, and how deep the tree actually goes
- how tests are written, and what they assert on
- import ordering, naming, whether types are declared or inferred

`.devteam/stack-profile.md` states the conventions someone wrote down; the
neighbouring files carry the ones nobody did. Where the two disagree, the
profile wins and you note the disagreement in `handoff_notes`. Matching the
codebase beats matching your own preference every time — a consistent
codebase with a convention you dislike is worth more than a codebase with
two conventions.

## 2. Read the file you changed, whole

This is the code counterpart of looking at a page you styled. You edit by
patch, and a patch shows you the lines you touched — never the thing you
assembled. So after your last edit, read the complete file and ask:

- does it still do the one thing its name predicts?
- is there now a second function doing nearly what an existing one does?
- did a scaffold survive — an unused import, a debug log, a commented-out
  block, a `TODO` with no owner?
- would a reader who never saw this dispatch follow it top to bottom?

Skipping this is precisely how a small module becomes a large one: never in a
single bad commit, always one reasonable patch at a time.

## 3. Take the deletion pass

Named separately because a model almost never takes it. Every change makes
something redundant — a branch now unreachable, a helper with one remaining
caller you just inlined, a config key nothing reads, a test asserting
behaviour that no longer exists. Find it and remove it. Deleted code needs no
review, carries no bugs, and git remembers it anyway.

Then record it: state in `assumptions` what you removed and why, or state
plainly that nothing was made redundant. An unrecorded deletion pass is
indistinguishable from one that never happened.

**This pass is file-scoped, and that is its limit.** Reading the file you changed
cannot show you what the change orphaned somewhere else: the component nothing
imports now, the route gone dead, the image still shipping after the section
that used it was rewritten. Those are reference-graph facts, so run the graph:

```
node <plugin>/scripts/waste.mjs .
```

It reports orphaned modules, unreferenced assets with their weight, and links
pointing at nothing. Read its confidence line before acting — a project that
builds paths at runtime cannot be fully resolved statically, and the report says
so rather than calling itself clean. Adjudicate what it flags; a file reached
only through a template literal is not waste. Delete what is genuinely dead and
record it. If the command is not permitted, say that in `assumptions` — a check
you could not run is not a clean project.

## 4. Structure

- **Dependency runs one way.** Transport calls application, application calls
  domain, and nothing calls back up. A route that imports another route, or a
  domain type that imports the HTTP layer, is a cycle waiting to be found by
  someone else.
- **A module earns its existence.** `utils`, `helpers`, `common`, `shared`,
  `misc` are not names — they are the absence of a decision, and they grow
  without limit because nothing can be said not to belong. Name the thing by
  what it does, and put it where that name is true.
- **Two callers before an abstraction.** One caller means you invented a
  parameter you cannot yet evaluate. Duplication is cheaper than the wrong
  interface, and the second use case tells you what the interface actually is.
- **A boundary is a decision.** Whenever you create a new module, cross a
  layer, or introduce a dependency between areas that did not depend on each
  other, say so in `handoff_notes` and say why. Boundaries are what the next
  agent inherits.

## 5. Errors that tell the truth

- **Handle it or propagate it. Never both, never neither.** A `catch` that
  logs and continues is a decision to proceed with data you know is wrong —
  make that decision on purpose or not at all.
- **Do not catch what you cannot handle.** A bare `catch` around a whole
  function catches the failures you anticipated and the ones you did not,
  and treats them identically.
- **Preserve the cause.** Rethrowing a new error without the original one
  attached destroys the only evidence of what actually broke.
- **A default that masks a missing required value is a bug with a friendly
  face.** Falling back to an empty string, `0`, or `{}` for something the
  caller was obliged to supply converts a loud failure into a quiet wrong
  answer that surfaces three layers away.
- **Error messages name what failed and with what input.** `"Invalid
  configuration"` costs a debugging session that `"database.port must be an
  integer, got \"5432x\""` does not.

## 6. Tests that can fail

A test that passes before your change and after it has tested nothing. This
codebase shipped three of them — one asserted on a validator result that was
identical either side of the fix it was written to prove. They were caught by
reading, not by running, because running them looked exactly like success.

- Assert on observable behaviour, not on how the implementation reaches it.
  A test that restates the code changes whenever the code does and catches
  nothing.
- Before trusting a new test, confirm it fails against the unfixed code —
  by reverting, by inverting the assertion, or by reasoning explicitly about
  which line makes it red.
- Cover the error paths and the boundaries, not only the path you built for.
- Name it after the behaviour it protects, so a failure reads as a sentence
  about the system rather than the name of a function.

## 7. Tells

Each of these says a machine wrote it, or that nobody made a decision:

- `data`, `result`, `item`, `temp`, `value` — names for the type instead of
  the role
- a `Manager`, `Handler`, `Service`, or `Util` suffix standing in for knowing
  what the thing does
- a comment restating the line beneath it; comments record *why*, and the
  code already says *what*
- `try`/`catch` wrapped around code that cannot throw
- defensive null checks on values that cannot be null, used in place of a type
  or a stated invariant
- an options object, config bag, or dependency-injection seam with exactly
  one caller
- a `Base` class with exactly one subclass
- commented-out code kept "just in case" — git already keeps it
- `v2`, `New`, `Improved`, `Final` in an identifier: edit history leaking into
  the API
- a file whose halves were clearly written for different reasons and never
  reconciled
- a fresh `utils.ts` created because the new function had nowhere obvious to go

## 8. Pre-flight, before you report

Mechanical checks, not vibes — run through this before writing the report:

- [ ] neighbouring files read before writing, and their idiom followed
- [ ] every file you changed read whole, after the last edit
- [ ] deletion pass taken, and its result recorded in `assumptions` either way
- [ ] no tell from section 7 present in what you wrote
- [ ] every new branch has a test you are confident fails without the change
- [ ] `waste.mjs` run, its confidence line read, and anything it found either
      removed or explained
- [ ] if the change makes a page or endpoint do work,
      `davinci:work-placement` decided which rung that work belongs on before
      it was written — and `davinci:caching` was invoked before any cache, since
      the key is a security boundary and not a performance detail
- [ ] nothing left behind: unused imports, debug logging, commented-out code,
      unowned `TODO`s
- [ ] new modules, crossed layers, and new dependencies recorded in
      `handoff_notes` with the reason
