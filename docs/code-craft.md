# An authoring standard for the code

`frontend-craft` governs what an interface looks like. Nothing governed what
the code underneath it looked like — `code-reviewer` judged after the fact, and
a reviewer applying a standard the builder was never given produces an argument,
not a review. `code-craft` is the missing half: the standard the builders carry
into the work.

## What it rules out

The average of every repository in a training set has a recognisable shape.
Everything imports everything. Nothing is ever deleted. Every error is caught
and discarded. Whatever fits nowhere lands in `utils`. It compiles, it passes a
glance, and it costs someone six months later.

The skill names that shape and replaces it with decisions made while writing:
read the neighbouring files first so the change belongs; read each changed file
whole after the last edit, because a patch shows the lines you touched and never
the thing you assembled; take a deletion pass and record its result in
`assumptions` either way; keep dependency running one direction; make a module
earn its name; wait for a second caller before abstracting; handle an error or
propagate it but never both and never neither; and confirm a new test fails
against the unfixed code before trusting it.

## How it is wired

Preloaded into `infra-architect`, `backend-engineer`, `frontend-engineer`, and
`code-reviewer`. The requirement is not a hand-kept list: a test reads
`hooks/scope-map.json` and requires the skill of every agent whose write scope
includes a path outside `.devteam/`, so an agent added later with a source scope
fails the suite instead of shipping without the standard.

`review-lens` gained a sixth lens, `craft`, which invokes the same skill with
the `Skill` tool and reviews against it. One standard, both ends of the pipeline.

Two further tests came out of building it. One rejects an agent that references
a skill which no longer exists — a dangling preload raises no error, it simply
starts the agent with nothing where its standard should be, which is what the
`security-review` → `security-audit` rename could have caused silently. The
other rejects an agent instructed to use the `Skill` tool without `Skill` on its
tool list, since an agent told to use a tool it does not have will improvise
rather than fail.

Each of the three was confirmed to fail against a deliberately broken copy of
the file it guards, then restored. A test that passes before and after the thing
it protects is worth nothing, and this repository has shipped three of those.

## What it found on the team's own output

Applied to the service-status service the team built in the full-chain run —
good code by most measures: no god file, no `utils`, explanatory comments,
careful path-traversal defence.

- **Five `catch` sites, none binding the error.** `catch { … }` in
  `src/server.js` at the URL decode, the `stat`, the `readFile`, the request
  handler, and the top-level rejection guard. Each returns a correct status
  code and destroys the only evidence of what actually broke. The `stat` case
  also conflates ENOENT with EACCES and ELOOP, so a permissions
  misconfiguration is indistinguishable from a missing file, forever, with
  nothing logged. This is section 5 — preserve the cause, and do not catch what
  you cannot handle.
- **Zero test coverage of the security-critical path.** `resolveStaticPath` has
  five distinct rejection branches — malformed percent-encoding, NUL and drive
  specifiers, escape from the static root, directory listing, unknown
  extension — and the only test in the project asserts on the `/health` happy
  path. The most security-sensitive function is the least exercised. This is
  section 6 — cover the error paths and the boundaries, not only the path you
  built for.
- **A 181-line entry point doing three jobs** — routing, static file serving,
  and the HTTP bootstrap. Defensible at this size and the wrong trajectory;
  static serving is its own module. Section 4.

Neither of the first two was raised by the review gate that passed this code.

## Honest limits

- This is the standard applied by hand, by me, to existing output. It is
  evidence the rules find real defects in real agent-written code; it is not
  evidence that preloading them changes what an agent writes.
- The seeing loop had a before-and-after with one variable changed. This has no
  equivalent yet, and it should get one: the same brief built by an agent with
  and without the skill, judged on the same criteria.
- The `craft` lens has never been dispatched in a live run.
