# The tiering run: API-key auth on an existing service

The first run to exercise `work-tiers`. The brief was chosen so the tier split
would be unambiguous and the lead would have to make it rather than be told:
API-key authentication on a new `GET /metrics` (untrusted input, a credential,
an authorisation decision — load-bearing by any one of the four questions), plus
a README and an `.editorconfig` (scaffolding).

Recorded as observed, including the two attempts it took and the three defects
it found.

## Attempt one: the entry point never got out of the gate

Run as documented — `davinci` on the main thread via `settings.json` — the
session came up with:

```
tools: ["Read","Glob","Grep","Bash","Write","Edit","Task"]
```

No `Skill`. No `AskUserQuestion`. And **none of the agent's `skills:` frontmatter
preloaded**. It went looking for `intake-brief` on disk, in the wrong directory,
and said so: *"the Skill tool is disabled this session and the skill isn't on
disk, so I'm running the intake protocol from my operating instructions
directly."*

Two failures followed immediately, both of them things the missing skill exists
to prevent:

- It returned `Classification: brownfield feature addition`. The vocabulary is
  a closed set of three words because `Route: direct` matches the literal
  string. Same defect class as the agents that once invented `partial` and
  `pass-with-findings`.
- It asked four questions and ended the turn. `intake-brief` has an explicit
  unattended rule — decide, record under **Assumed**, never end a turn having
  only asked — and it was in the file that did not load.

Thirteen turns, zero files, exit code 0. A clean-looking success that built
nothing.

A probe isolated it: dispatched as a *subagent*, `davinci:tech-lead` reported
`work-tiers` and `delegation-contract` present in its context without reading
any file, and named the three tiers correctly. **Preloading works for
subagents and not for the main thread.**

`davinci` now carries the three rules whose absence breaks a run — the closed
classification set, the unattended rule, and the question-relay duty — in its
body, so they survive their skill not loading.

## Attempt two: the full chain, entered as a subagent

17 dispatches, 341 tool calls, 14 reports.

### Tiering happened, and the spend followed it

| Model | Dispatches |
|---|---|
| `opus` | 9 |
| `sonnet` | 3 |
| default | 5 |

The lead set `model` explicitly on twelve of seventeen dispatches. Sonnet went
to the README dispatch, the `.editorconfig` scaffolding, and one review; Opus to
the auth build, the security gate, and the load-bearing review fan-out. The
`model` override is a real lever and the lead used it as the rubric describes.

One misapplication: a `code-reviewer` dispatch tiered `load-bearing` was sent to
`sonnet`. The rubric says Opus for load-bearing.

### The load-bearing work got load-bearing treatment

`backend-engineer` returned 18 verification entries and, unprompted by anything
except `code-craft`, went past what was asked:

> "Beyond the revision pass I ran a six-mutant battery against
> `src/api/metrics.js` to prove the suite can fail: each mutation was applied in
> place, `npm test` run, and the mutation reverted. All six were caught."

That is section 6 of `code-craft` — confirm a test fails against the unfixed
code — executed as mutation testing without being asked for it.

The revision pass ran and is recorded: *"Tier load-bearing, so the revision pass
was mandatory and it ran. It produced one change."* So is the deletion pass:
*"Deletion pass taken; nothing was made redundant. The change is purely
additive."*

### The scope hook did its job, and the lead re-routed

`backend-engineer` was dispatched to write the README and correctly refused —
`README.md` is not in its scope — reporting `blocked` with the hook's exact
denial. The lead re-dispatched the same work to `infra-architect`, which owns
`*.md`, and it completed. That is the boundary working and the lead recovering
from its own misassignment.

## Three defects the run found

**1. Findings were filed under invented keys.** 54 of them carried their prose
under `detail` or `title` instead of `description`. The schema has always said
`description`; nothing checked, so the lead read an empty field 54 times. The
contract now states the finding shape with an example, and the validator
rejects a finding without a `description`.

**2. The placeholder detector false-positived on the security gate.** The gate
bounced four times and tripped the give-up valve, leaving a `GATE-FAILED`
record, for this:

```
Report contains placeholder text: "Verdict is pass. No blocking finding..."
```

The report contained the word *placeholder* in a sentence about placeholder
credentials — which is the subject matter of a security review. `frontend-craft`
likewise names "placeholder person names" in its banned defaults, so a craft
lens quoting its own standard would fail the same way. The detector matched the
English word rather than evidence of an unfilled template. It now matches
`TODO`, `TBD`, `FIXME`, `FILL`, `lorem ipsum`, `placeholder text/value/content/here`,
and angle-bracket slots like `<your-key>` — and a regression test asserts that a
security review discussing placeholder credentials passes while every real
marker is still caught.

The gate's own verdict was correct, and it also filed a valid report. The
give-up record was pure noise.

**3. `CRAFT` was used as a note, not a criterion.** The one `CRAFT` finding in
the run reads *"Not a violation, recorded so the gate need not re-derive it"* —
a lens using the criterion to record that it checked. Harmless, and not what the
field is for.

## What is still unexercised

- **`CRAFT` has never blocked anything.** No lens found a violation of its three
  defects, which is a good outcome for the product and leaves the floor untested
  in the mode that matters. The code was genuinely well covered — mutation-tested
  by the builder — so there was nothing for it to catch.
- The question and observation channels were built after this run and have never
  executed.
- One run. The `sonnet`-on-load-bearing misapplication has not been seen twice,
  so it is a single data point, not a pattern.
