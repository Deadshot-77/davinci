# The full chain, end to end

The first run in which every stage of the pipeline executed in one pass and
produced working software. Recorded as observed, including what did not happen.

## What was asked for

A tiny service-status page: a health endpoint, a server entry point, an
`index.html` and stylesheet that display the status, a `package.json`, and one
test that actually runs. Deliberately small — the point was the pipeline, not
the product.

## What ran

```
davinci → tech-lead → infra-architect
                    → code-reviewer  (foundation gate)  verdict: pass
                    → backend-engineer + frontend-engineer
                    → review-lens (tests)
```

Every one of the six reports filed was valid against the plugin's own validator.
No report was rejected, and the give-up valve never fired.

## What was produced

```
src/api/health.js     src/server.js
public/index.html     public/styles.css
test/health.test.js   package.json
```

`npm test` passes: one test, and it is a real integration test rather than a
stub — it imports `createServer`, binds a live port, issues a request, and
asserts the response shape.

## Verification actually happened

Across the run the agents executed real commands and recorded real exit codes:
nine for the backend, seven for the foundation gate, five for infra and the
tests lens, four for the frontend. For two increments every report came back
with an empty `verification` array; this run is the first where the design's
central rule — prove completion with commands, not assertions — held across the
whole pipeline.

Both builders reported `status: complete`. That is also a first.

## What did not happen, and why it matters

**The security gate never ran.** No `security-engineer` report exists. The brief
asked for security and code review; the lead dispatched the code reviewer and a
tests lens, and skipped security without saying so. A skipped gate that leaves no
record is worse than a failing one, because nothing surfaces.

The lead's instructions now state that both gates are mandatory and that a run is
not closed until each has returned a verdict — and that a gate judged not to apply
must be declared explicitly rather than omitted. That change is unexercised.

## The defect this run existed to find

An earlier attempt completed the same chain but stranded both builders. The stack
profile that infra wrote — and that the foundation gate approved with
`verdict: pass` — assigned `src/server.js` and `test/health.test.js` to the
backend. The write-scope hook granted `src/server/**` and `tests/api/**`. Neither
matched, so the builders correctly refused to write out of scope, the lead
re-routed the work to infra, and infra hit the identical wall.

The contract every agent obeys and the enforcement that binds them were two
sources of truth that could silently disagree, and the gate whose job is to catch
a defective foundation had no way to see it.

The foundation gate now checks every Directory map assignment against the real
scope map, so a profile that assigns an unwritable path fails at the gate instead
of stranding a builder three stages later. The scope map was also widened to
accept the layouts the profile reasonably chose.

## Honest limits

- One run. It has not been repeated, and the both-gates-mandatory fix has not
  been exercised at all.
- The page was never opened in a browser. Verification was structural.
- `infra-architect` filed one `blocked` report against an install attempt — the
  permission profile deliberately excludes `npm install`, so that denial is the
  profile working as intended rather than a defect.
