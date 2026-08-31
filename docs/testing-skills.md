# Testing a skill the way you test code

Borrowed from Anthropic's `superpowers` plugin, whose `writing-skills` skill
states the principle plainly:

> If you didn't watch an agent fail without the skill, you don't know if the
> skill teaches the right thing.

Every increment of this plugin has ended with the same caveat from me — *"this
is a prompt change and prompt changes are not unit-testable."* That was wrong.
They are testable. The test is a subagent, and the cycle is the one we already
use for code.

## The cycle

**RED** — dispatch a subagent into the situation the rule governs, *without* the
rule. Record what it actually does. If it already does the right thing, the rule
is unnecessary and should not be written.

**GREEN** — dispatch again with the rule present. The rule works if and only if
behaviour changed in the direction intended.

**REFACTOR** — the interesting part. Agents find loopholes in prose the way they
find them in specs. Close the one you found and re-run.

Two dispatches, under a minute each. This is much cheaper than the full-team runs
that have been the only validation until now, and it isolates one rule instead of
confounding twenty.

## What it caught on its first use

The v0.18.0 digest rule — return a short summary rather than restating your
report — shipped unverified. Three dispatches:

**Baseline, no rule.** The agent read its report and returned roughly five
hundred words restating it: what it built, what it could not verify, a
constraint for the next agent, an aside about `package.json`. Exactly the
context blowback the rule exists to prevent. RED confirmed — the rule addresses
something real.

**With the rule as shipped.** The agent returned a correctly formatted digest
stating that the report file did not exist and that there was no `.devteam/`
directory at all. **It had made zero tool calls.** The file exists and is 5,211
bytes.

The rule said *"Return exactly this, and nothing after it"*, and the agent read
that as a description of the whole task. The format displaced the work. This is
the same trap `writing-skills` documents for description fields: an instruction
that summarises the shape of the output becomes a shortcut agents take instead
of doing the thing.

**After the fix.** The rule now says the digest is derived from what you wrote
and verified, that it governs the shape of the final message and not the amount
of work, and that it never turns an unread file into a reported fact. The same
scenario produced a digest that named its uncertainty — *"I cannot confirm the
report exists"* — rather than asserting a falsehood in a confident format.

That is the improvement worth having: not fewer words, but a wrong claim
becoming an honest one.

## A flaw in the test, recorded because it matters

The scenario told the agent *"Do not do any other work"*, and the third agent
cited exactly that when explaining why it had not read the file. The prompt was
confounded: it forbade the tool use the test was measuring.

So the third result shows the rule no longer produces a confident falsehood. It
does **not** show the rule restores the read, because the harness prevented it.
A clean re-test needs a scenario that permits reading and still measures whether
the agent bothers.

The method found a real regression on its first outing and a defect in its own
harness on the same run. Both are the point.

## Where this changes how the plugin is built

Any new rule in a skill gets a baseline before it gets written, and a re-run
after. A rule that changes nothing in the baseline is a rule that costs tokens
on every dispatch and buys nothing — and preload is the single largest fixed
cost this plugin has, at roughly 129,000 tokens across a twenty-one dispatch
run.
