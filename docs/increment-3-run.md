# Increment 3 — live run of the backend and security agents

Both agents added in increment 3 have now been dispatched. This records what was
observed, and what still has not been.

## Verified

**`backend-engineer` built working code.** Dispatched to create a subscribe endpoint
in plain Node with zero dependencies, it produced `src/api/subscribe.js`,
`src/lib/db/store.js` and `tests/api/subscribe.test.js`. Fifteen tests pass — run
independently by the controller, not taken from the agent's word. The code bounds
body size, checks the request method, and documents the limitations of its own email
regex rather than overstating it.

**Its report conformed to the delegation contract** — exactly the seven required
keys. This was the first report to do so, and it validates the fix made after
earlier runs, where agents invented their own report schemas and the gate bounced
them until the run timed out.

**`security-engineer` found what was planted, and more.** Two vulnerabilities were
deliberately planted to test detection rather than mere execution: a hardcoded live
API token with a production database password, and an endpoint returning every
subscriber with no authentication.

It returned `verdict: fail` with thirteen findings, blocking on both credentials. It
also reported ten findings nobody planted — no rate limiting on a public write
endpoint, subscriber enumeration through differing status codes, secrets propagating
to every importer, a quadratic membership scan. It checked the email regex for ReDoS
and reported it **not** vulnerable, which is a negative result stated honestly rather
than padded into a hit.

It did not modify any source file, confirmed by checksum.

## Three defects this run found and fixed

**The security skill was shadowed by a bundled skill of the same name.** Claude Code
ships a `security-review` skill that runs `git diff origin/HEAD...` as dynamic
context. Our identically-named plugin skill lost the collision, so the agent died
during construction in any repository without an `origin` remote — which is every
freshly initialised one. Renamed to `security-audit`. A test now fails if any skill
directory takes a known-bundled name.

**The report gate could deadlock.** Given a dispatch that forbade writing files, the
gate rejected the agent's finish eight consecutive times and the run burned thirteen
minutes producing nothing. The contract now states that filing the report overrides
any dispatch instruction to the contrary, and the gate gives up after four attempts,
writing a `<agent>-GATE-FAILED.json` record instead of looping. That valve fired
correctly during this run before the next fix landed.

**The gates could not satisfy the gate governing them.** Both `security-engineer`
and `code-reviewer` carried `disallowedTools: Write`, so they had no tool capable of
writing the report the `SubagentStop` hook demands, and the Bash guard blocked
redirects as an escape. The write-scope hook was already correct — its self-report
exemption permits an agent to write its own report and nothing else — so the fix was
to stop removing the tool and let the hook do the confining.

## One design hole the security agent surfaced itself

Its `fail` verdict rested on a `SECURITY` criterion it had to invent, because the
brief carried no security acceptance criteria. Under the contract as written, both
credential findings should have been advisory and nothing would have blocked. The
unauthenticated endpoint — the worst defect present — was marked advisory for the
same reason.

The reserved criterion now covers a defined class rather than secrets alone: exposed
credentials, missing authentication or authorisation on a path touching user data or
a privileged action, and injection reachable from untrusted input. Anything outside
those three still needs an `AC-<n>`, and stays advisory without one.

## Not verified

- **Neither agent ran through the full chain.** Both were dispatched directly to keep
  runs inside a time budget. `davinci` → `tech-lead` → `backend-engineer` →
  `security-engineer` has never executed end to end.
- **Neither agent could self-verify.** Every Bash call either made was denied by the
  permission model in headless mode, so `backend-engineer` finished `blocked` with
  only `node --version` in its verification array, and `security-engineer` finished
  `needs_input` with an empty one. The evidence that the code works and the findings
  are real came from the controller running the checks, not from the agents.
- The three fixes above have not themselves been re-run live end to end.
