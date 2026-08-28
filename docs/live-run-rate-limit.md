# The rate-limiting run: observations, a real gate failure, and three fixes

The second tiering run, and the first to exercise the observation channel. The
brief added per-client rate limiting to `/metrics` — 60 per minute, 429 on
exceed — plus request logging that must never emit the API key.

It was chosen so the fork would only appear once an agent was in the code:
"per-client" is undefined in a service with no IP handling anywhere, where
`req.socket.remoteAddress` is wrong behind a proxy.

Outcome: working software. 32 tests pass. The limiter and logger landed in a new
`src/lib/`, with the dependency running one way — transport imports them, they
know nothing of HTTP — and the builder documented that boundary as `code-craft`
asks.

## The observation channel worked

17 observations from 8 agents, every one carrying a real consequence. Two worth
quoting.

The silent-failure lens found, unprompted, the defect that had been sitting in
`src/server.js` since the first run:

> "All five bare catches in `src/server.js` are baseline and unmodified by this
> diff... bind no error and log nothing, so a permissions misconfiguration is
> served as a 404 and an unexpected throw as a 500, both with the cause
> destroyed. **Out of scope for this diff and correctly left alone.** Worth a
> follow-up brief."

Noticed, not fixed, escalated with a consequence — which is the entire design.

A gate caught a builder's verification entry that proved nothing:

> "The builder's revert evidence includes `git diff HEAD -- src/lib/log.js
> (empty diff)`, but `src/lib/` is untracked, so that command returns empty
> regardless of the file's contents — it would have looked identical had the
> mutation been left in place."

## The first complete fail → fix → re-gate cycle

The `tests` lens returned `verdict: fail` with a blocking finding citing AC-9,
and the finding was a test that could not fail:

> "`captureStdio` tees `process.stdout.write` and `process.stderr.write` into
> the SAME `written` array... A logger changed to write the identical line to
> stderr therefore passes AC-9."

The lead re-dispatched the builder, the test was fixed, and a re-gate passed.
That loop had never run end to end before.

Also: findings filed under invented keys went from 54 in the previous run to
**zero**. The validator fix held.

## The question channel did not fire

Zero questions. The planted fork — what identifies a client — was resolved by
the builder, which chose the peer IP and documented why not the API key and why
not `X-Forwarded-For`.

By the contract's own bar that is correct: the first condition is "you cannot
proceed correctly without the answer", and it could proceed. But the channel
remains unexercised, and the bar is plainly higher than "ask rather than guess".
If questions are wanted more readily, that first condition is the line to move.

`CRAFT` also produced no findings for the third run running.

## Three defects, all fixed

### 1. The gates had nowhere to prove anything

Four agents independently reported it. A lens put it plainest:

> "The five requested mutations could not be executed: the read-only hook denies
> all writes outside `.devteam/reports`... so there is no way to place mutated
> source in front of the real test files."

And a gate:

> "the deepest check available to a load-bearing gate silently degrades to
> reading."

Every gate now owns one scratch directory — `.devteam/scratch/<agent>/**` — and
can build a mutation harness there with the `Write` tool and run `node --test`
against it. A mutation the suite would not have caught is a finding with an exit
code behind it.

**No permission was loosened to do this.** Reading `bash.js` first turned out to
matter: `decideBash` returns early for any agent with a non-empty scope, so
simply handing the gates a scratch path would have switched their shell guard
off entirely — the opposite of the intent. An agent whose only writable ground
is coordination state under `.devteam/` now stays bash-guarded. The `Write` tool
is checked by exact path; an arbitrary shell cannot be, so it stays refused.

### 2. Foundation-first was skipped again

The lead skipped the foundation gate on a bounded brief, against its own
instructions — the second gate skipped in three runs. Prompts had already said
not to, twice.

It is now mechanical. While `.devteam/stack-profile.md` does not exist, the
write hook denies every builder write outside `.devteam/`:

> "backend-engineer may not write src/api/users.ts yet: .devteam/stack-profile.md
> does not exist, so there is no contract for this build to obey."

The foundation agent is exempt — derived from the map, as the agent whose scope
contains `.devteam/stack-profile.md`, so renaming it cannot desynchronise the
rule. A brief carrying `Route: direct` is the only other exemption, and a
blocked agent can always still write its report.

### 3. A dispatch's `write_scope` is not a grant

For the second run running, the lead assigned `backend-engineer` a path the hook
denies, and stranded it. The lead's dispatch cannot widen a scope; only the
scope map does.

The lead now takes `write_scope` from the stack profile's Directory map — which
the foundation gate already validates against the real scope map — and routes
work to the agent that owns the path rather than widening someone else's scope
on paper. That ties the fix to defect 2: without a foundation there is no
validated map to assign from.

## Honest limits

- The question channel and `CRAFT`'s blocking mode remain unexercised.
- The gates' scratch directory has never been used by a real gate; it is proven
  by unit tests only.
- The foundation enforcement has never fired in a live run — it exists because
  a live run showed the sequencing being skipped, not because it was observed
  working.
