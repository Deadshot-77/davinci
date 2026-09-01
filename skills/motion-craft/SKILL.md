---
name: motion-craft
description: Deciding whether a beat needs motion or generated imagery, what to make for it, and what to do when it cannot be made. Use when scroll-linked animation, parallax, generated media, or glass surfaces are on the table.
user-invocable: false
---

# Motion craft

There is no shortage of instruction on how to animate a thing. What is usually
missing is the step before it: deciding what the thing *is*, and making it.

The chain runs in one direction and most pages break at the same link:

```
beat  →  what it must show  →  what asset that needs  →  how that gets made  →  how it is wired
```

Steps one and two come from `story-direction`. Step five is ordinary
engineering. **Step four is where pages go generic.** An agent that knows fifty
scroll techniques and has no way to make anything worth scrolling through will
reach for what it can draw in markup — a diagram, a hairline grid, a spec table
— and call the restraint deliberate. Three consecutive runs on the same project
did exactly that, each one arriving at dark ground, a display serif with one
italic accent word, and no imagery, while a fully installed generator sat
unused on `PATH`.

Restraint is a choice you make *after* you know what the alternative would have
looked like. Before that it is just the default with better manners.

## Motion has to beat its own fallback

Every moving thing on a page has a still version: the frame it would show if
the motion never loaded. Ask what that still costs you. If the beat still lands
without the movement, the movement is decoration and the still is the design.

This is not a purist position, it is what shipping pages actually do. Apple's
product pages give every scroll-driven video a **three-second load timeout**
and a static poster behind it. The motion is allowed to fail, on every beat, on
every page. Nothing on the page is load-bearing on it.

So the rung above `still` in the `story-direction` ladder is not "motion". It is
**motion that earns the still it replaces** — and it carries three costs the
lower rungs do not:

| cost | what it means |
|---|---|
| credits | generation spends real money, per attempt, including the ones you throw away |
| failure surface | a decode limit, a breakpoint variant, a reduced-motion path, a fallback poster |
| attention | movement takes reading attention away from the words next to it |

If you cannot name what the beat gains for those three, build the still.

## Four things Apple does that transfer

Measured off a live product page, not recalled:

**One clip per beat, not one film.** The media is named for the argument —
`hero/`, `fit-feel/`, `touch-controls/`, `case/`, `battery/`. Each beat owns its
asset and can fail alone. A single long video couples every beat to every other.

**The scroll-to-time mapping is data, not code.** Progress keyframes are written
as attributes in the markup, so the timing is tunable without touching the
player. Put your mapping where it can be adjusted by someone looking at the
page, not by someone reading a bundle.

**Media is announced as what it means, not what it is.** A decorative video
carries `role="img"` and an `aria-label` describing the subject. A screen reader
gets the meaning; it does not get "video".

**Capability detection degrades silently.** When their own detection decides a
browser cannot do inline media, the sources are never attached at all — no
broken player, no spinner. Build the negative path first; it is the one most
users on bad connections actually get.

## The technique skills

Do not read these speculatively. Invoke the one you have committed to, with the
`Skill` tool, once the beat has decided what it needs:

| invoke | when the beat needs |
|---|---|
| `davinci:generating-assets` | any generated still, layer set, or aspect variant — **start here**, it owns discovery and cost |
| `davinci:parallax-layers` | depth from a still: foreground and ground moving at different rates |
| `davinci:glass-surfaces` | a refracting or blurred panel over moving content |
| `davinci:scroll-video` | a clip whose playhead is driven by scroll position |

`generating-assets` comes first because it is the one that tells you whether you
can make anything at all. The other three assume an asset exists.

**When the technique you need is not one of these four**, do not improvise from
memory and do not read an article about it. Invoke `davinci:technique-research`
and go read a live implementation. These four skills are a starting set, not the
boundary of what a page may do.

## A gap worth knowing you have

Nothing here teaches what good motion *feels* like — the timing, the easing, the
order things move in. That knowledge is tacit and it is learned by watching real
interfaces move, which galleries such as `60fps.design` collect.

You cannot currently watch them. Screenshots are the only frame you get, and one
frame of an animation carries almost none of its timing. So do not claim to have
reviewed motion references you only ever saw still.

What you can do instead: take timing from systems that have published it, keep
durations short enough to feel like response rather than performance, and check
your own work by looking at it rather than by reasoning about the numbers.

## What gives a motion page away

The equivalents of banned defaults, for movement:

- **Parallax on everything.** Depth means something only where the page is
  otherwise flat. Applied uniformly it reads as a template setting.
- **A scrub with no landing frame.** If the section can end on any frame, the
  reader arrives nowhere. Decide the last frame before you generate.
- **Glass as decoration.** Refraction is expensive and means "there is something
  behind this". Over a flat colour it is a filter for its own sake.
- **Motion that repeats what the words already said.** If the caption says
  "it folds flat" and the clip shows it folding flat, one of them is redundant.
- **A reveal that withholds nothing.** Fading in a paragraph that was always
  going to be there adds latency, not drama.
- **Describing an asset you did not make.** A brief is not a photograph. If it
  was not generated, the beat falls back to the still and you say so in
  `assumptions`.

## When the generator will not run

Discovery and generation are granted separately, on purpose: probing is free and
generating spends credits. So the normal blocked case is a generator you can
*find* but not *run*.

That is a blocked check, not an absent generator, and the difference decides the
page. Report it in `assumptions` naming the exact command that was refused, and
build the still. Never record "no generator available" for a permission you were
not given — the lead can widen a profile, but only if the report says that is
what is needed.
