---
name: generating-assets
description: Finding a generator, deciding what to spend, and producing stills, layer sets and aspect variants. Use before designing any beat around imagery you do not already have.
user-invocable: false
---

# Generating assets

This skill answers one question first — *can you make anything at all?* — and
only then how. Get the order wrong and you will design a beat around a
photograph that never arrives.

## 1. Find out what you have, in a way that can answer

Run one plain command per call:

```
command -v higgsfield
```

No `cd`, no `&&`, no `for` loop, no pipe. Compound commands are refused clause
by clause, and a refused probe tells you nothing. A real run wrote a single
`cd … && for b in comfy sd sdxl …` across eighteen binaries, had it denied
outright, and recorded "found nothing" while an installed, authenticated
generator sat on `PATH` with its commands already granted.

Three outcomes, three different pages:

| what happened | what to record |
|---|---|
| probed, nothing installed | no generator; design for stills you can draw |
| probe refused, or binary found but not runnable | **blocked check** — name the command in `assumptions` |
| found and runnable | name it, and what you used it for |

Do not wait for a generator to appear in your tool list. Deferred MCP tools load
through `ToolSearch`, and `ToolSearch` cannot be given to an agent — declared on
an allowlist it is silently dropped, the same as an `mcp__*` wildcard. **The
route open to you is a binary on `PATH`, driven over Bash.**

## 2. Do not inherit a provider

Before choosing, check what you are about to copy. A run once grepped its own
project scratch directory, found the provider a previous run had used, selected
those tools by name, and never compared anything. Six files named that provider
by then; each run using it wrote more evidence that it was "the one this project
uses".

Precedent in a scratch directory is a record of what happened, not a decision.
If the user installed and authenticated something, that is the signal — an
earlier run's choice is not.

## 3. Price it before you spend it

Generation costs real credits, including on attempts you discard. Estimate
first:

```
higgsfield generate cost nano_banana_2 --prompt "…"
```

Measured on this toolchain: a still is around 2 credits, and the account balance
is readable with `higgsfield account status`. Check the balance before a batch,
not after. If you are about to generate more than a handful, say what the batch
will cost in your report.

## 4. The three things worth making

**A still.** The default, and usually enough.

```
higgsfield generate create nano_banana_2 \
  --prompt "…" --aspect-ratio 3:2 --wait --wait-timeout 8m
```

Returns a URL. One prompt, one image, no MCP involved.

**A layer set, for depth.** `image_decompose` splits a still into separable
layers, which is what real parallax needs — foreground and ground that can move
at different rates. Generating two images and hoping they align does not work;
decomposing one does.

```
higgsfield generate workflow image_decompose --image ./still.png --mode granular
```

Hand the result to `davinci:parallax-layers`.

**An aspect variant.** `reframe` converts an existing asset rather than
regenerating it, so the variants stay the same photograph. This is how you serve
a different crop per breakpoint without paying twice or drifting.

## 5. Writing the prompt

The brief format in `davinci:story-direction` decides *what* the asset must do.
This is about getting the model to make it.

Name the physical facts and let the model infer the mood — the reverse produces
stock. Say the lens, the light source and its direction, the surface, and the
palette. State one accent colour, not a scheme. Say what is *not* there
("no fill light", "no props") as readily as what is.

A prompt that produced a usable studio still on the first attempt:

> A single machined brass plumb bob resting on its side on a dark grey concrete
> workbench, beside a folded sheet of technical drawing paper with a thin violet
> band across one corner. Hard directional daylight from a high window, deep
> shadows, no fill light. Muted near-black palette, one violet accent. Shot on a
> 50mm lens, shallow depth of field, fine grain, editorial studio photography.

The parts doing the work: a named object, a named surface, one light with a
direction, an explicit negative, one accent, a lens.

**Treatment before subject.** Decide the lens, light and palette once for the
whole page and repeat that clause across every asset. Assets that share a
treatment read as one shoot; assets that share a subject but not a treatment
read as a stock search.

## 6. Moving assets

If a beat genuinely needs movement, the primitive that matters is a clip with a
**decided last frame**. Models that accept both a start and an end image
(`seedance_2_0` takes `start_image` and `end_image`, up to 4k, with
`generate_audio: false` for silent web use) let a scrubbed section land on a
composition you chose rather than wherever the model drifted.

Generate the two stills first, confirm they are right, then generate the motion
between them. Then hand it to `davinci:scroll-video`.

## 7. Say what you made

An asset that exists has provenance. In your report, name the generator, the
model, what each asset was for, and the credits spent. If you fell back to a
still because generation was blocked, say which command was refused.

Never describe an asset you did not generate as though it exists.
