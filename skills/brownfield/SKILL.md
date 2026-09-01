---
name: brownfield
description: Working in a codebase that already exists and nobody here wrote — orienting in it, learning its conventions, and changing it without breaking what you cannot see. Use whenever the project is not empty.
user-invocable: false
---

# Brownfield

`stack-profile` opens with *"Generate, do not author"* — run the scaffolder, let
the tool produce correct config. That is right for an empty directory and wrong
for everything else. On a project that already exists there is nothing to
generate. There is something to **discover**, and the difference matters because
a profile written from assumption is a contract every other agent then obeys.

So the rule here is the mirror of that one: **discover, do not assume.** Every
line of the profile traces to a file you read or a command you ran.

## 1. Get the map before reading anything

```
node <plugin>/scripts/survey.mjs .
```

One command, under a second on a large repository. It reports where the code
actually is, the test ratio, the entry points, which files the last four hundred
commits touched, what is generated or vendored, and — the part to read
carefully — **what it could not establish.**

Churn is the most useful line in it. Directory size tells you where code
accumulated; churn tells you where the work is, which is almost always where
your change lands.

## 2. Read with a question, and record what you did not read

You cannot read ten thousand files and you must not pretend otherwise. Senior
practice is to decide what to understand and what to skip, with a goal — not to
front-load the whole system.

Follow one thread end to end: pick the entry point nearest your task and read
outward until you can say what happens when a user does the thing you are about
to change. That single trace is worth more than any amount of breadth.

Then **write down what you did not look at.** An unexplored area is an unknown,
not an absence, and a profile that quietly omits its blind spots reads as
complete. Put them in `assumptions`.

## 3. The tests are the documentation

Read them before the implementation. They state what the code is supposed to do,
show how it is meant to be called, and reveal the conventions faster than any
source file — a test is written by someone explaining the thing to themselves.

If there are no tests, that is not a detail to note in passing. It is the
central fact about the risk of your change. **Code not protected by tests cannot
be changed safely**, and saying so is more useful than proceeding carefully and
hoping.

## 4. Pin the behaviour before you change it

The hardest problem in existing code is that you do not know what it currently
does, so you cannot tell whether you broke it.

Before changing behaviour you do not fully understand, write a test that
captures what it does **right now** — not what it ought to do. It may pin
something that looks wrong; pin it anyway. Its job is not to judge the code, it
is to tell you the moment your change altered something you did not intend.

Then make your change and watch what that test says. If it fails and you expected
it to, you have understood the code. If it fails and you did not, you have just
been saved.

## 5. The conventions are theirs

`code-craft` says read the neighbours before you write. Here that is the whole
project, not one file: naming, directory structure, error handling, how tests are
written, how state moves.

**Follow what you find, including where you would have done it differently.** A
codebase with one consistent mediocre pattern is easier to work in than one with
two good ones. If you genuinely must depart, say why in `assumptions` — a
deliberate exception is fine, an accidental second convention is not.

## 6. Know the blast radius before you change anything

Before altering something that already exists, find out who depends on it.
`grep` for the name; `node <plugin>/scripts/waste.mjs .` builds the reference
graph and will show you what the file is connected to.

Two things you do not touch:

- **Generated files.** The survey lists them. Editing one is work that vanishes
  on the next build. Change the thing that generates it.
- **Vendored and third-party code.** It will be overwritten, and the change is
  invisible to everyone who reads the manifest.

## 7. Small, reversible, verified

Everything about existing code argues for smaller steps than greenfield work
needs. You are operating on something you only partly understand, with tests you
did not write, around behaviour other people depend on.

Slices should be smaller. Checkpoints matter more. And the verification that
counts is not "my new thing works" — it is **"nothing that used to work
stopped."** Run the existing test suite before your change as well as after, so
you know which failures you caused and which were already there.

## Pre-flight

- [ ] the survey was run, and its unknowns recorded rather than skipped
- [ ] one path traced end to end through the area being changed
- [ ] the existing test suite run *before* the change, so its baseline is known
- [ ] current behaviour pinned by a test wherever the change is not obviously safe
- [ ] conventions followed, or the departure explained
- [ ] nothing generated or vendored was hand-edited
- [ ] what was not read is written down
