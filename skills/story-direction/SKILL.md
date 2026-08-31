---
name: story-direction
description: Deciding what a page is arguing and in what order, before any of it is designed or generated. Use when building a page with more than one section, or when generated assets or scroll-linked motion are on the table.
user-invocable: false
---

# Story direction

Every other skill here executes a decision. This one makes it.

`frontend-craft` gets as far as a visual direction — a stance about type,
colour and density. That is not the same as knowing what the page *says*, in
what order, and why anyone should still be reading at the fourth section. A
page assembled section by section, each one competently designed, arrives
looking like a list of components. A page directed is a sequence that goes
somewhere.

You are the director. Do this before you choose a typeface, and long before
you generate anything.

## 1. Find the argument

Write the page's claim in one sentence, in your own words, without adjectives.
Not "a modern site for a design studio" — that is a category, not a claim.
Something a reader could disagree with: *"most brands stop being good at the
handover"*, *"your ledger is lying to you by month"*.

If you cannot write that sentence, you do not yet know what you are building,
and no amount of layout will hide it. Ask, or state the claim you are assuming
in `assumptions` and proceed on it.

## 2. Break the claim into beats

A beat is a section with a job. Name the job before the content:

| Beat | Its job |
|---|---|
| 1 | make the claim, and make it cost something to disagree |
| 2 | show you have earned the right to say it |
| 3 | make it concrete — the thing itself |
| 4 | remove the last objection |
| 5 | ask |

Three to six beats. The classical shape is tension, then exploration, then
resolution, and it is classical because it works: open with a problem the
reader recognises, build through what you found, close with what to do.

**A beat that does not change the reader's state is a section you can delete.**
Test each one: what does the reader know, believe or feel after it that they
did not before? "It looks nice" is not an answer. If two beats have the same
job, they are one beat with a formatting problem.

Record the beats and their jobs in the report's `assumptions`. A stated spine
can be argued with; an unstated one just produces sections.

## 3. Decide what each beat actually needs

Most beats need type, space and a sentence worth reading. That is not a
failure of ambition — it is what most good pages are made of.

Work in this order, and stop as soon as the beat does its job:

1. **Words and hierarchy.** Can the beat land with a line of type and the room
   to read it? Usually yes.
2. **Structure.** A table, a list, a comparison — something with shape that
   carries information the prose would labour.
3. **A still image.** When the beat needs to show rather than tell.
4. **Motion or a scroll-linked sequence.** Only when the *change itself* is
   the point: a before and after, a process with steps, a thing revealing its
   parts.

Number four is rare. If more than one or two beats reach it, you are decorating
rather than directing.

### Some beats cannot be done with type at all

The ladder above is about not decorating beats that do not need it. It is not
permission to ship a page with nothing to look at.

**If a beat's job is to show something, showing is the job, and type cannot
substitute for it.** A selected-work section that lists client names is a table
of contents for a portfolio, not a portfolio. A product page with no product, a
studio selling visual craft that demonstrates none, a case study with no case —
each has failed at the one thing that section existed to do, however good the
sentence above it is.

Ask of every beat: *could this be the same page for a different company?* If a
studio's work section would read identically for any other studio, it is showing
nothing. That is the same failure as a centred hero over three cards, reached
from the opposite direction — and it is the one this ladder makes easy, because
stopping early always looks like discipline.

When a beat needs showing and you genuinely cannot show — no generator, no real
work to display, nothing but placeholders available — say that plainly in
`assumptions` and in your handoff. Do not quietly substitute a list and let it
pass as the section it replaced.

### Departing from a convention is not inverting it

If the audit says every competitor leads with a full-bleed reel, the departure
is not "no imagery". It is *say something first, then show the work* — you have
kept the thing that made their pages worth looking at and fixed the thing that
made them say nothing. Inverting a convention throws away what it was doing
right, and arrives somewhere just as predictable.

## 4. Motion has to earn the scroll

When a beat genuinely wants scroll-linked behaviour, the `scrollytelling`
skill is installed on some systems and is far more detailed than this section —
invoke it with the `Skill` tool and follow it. Its first principle is the one
that matters and it is worth repeating here: **lead with the narrative, not the
technique.** Restraint over spectacle. Not every section needs animation.

Whatever you build:

- The reader controls the pace. Never take the scroll away from them, never
  hijack it, never make them wait through an animation to reach text.
- `prefers-reduced-motion` gets a real path, not a degraded one — the same
  beats, delivered without movement.
- The page must make its argument with every animation disabled. If a beat is
  incomprehensible without motion, the beat is not designed, it is staged.

## 5. Briefing an asset, for any generator

You may have an image or video generator available. You may not. **Find out
before you plan around one** — check what is actually in your tool context and
what commands you are permitted to run. Never design a beat around media you
have not confirmed you can make, and never describe an asset you did not
generate as though it exists.

Write the brief provider-neutral, because the provider changes and the brief
should not:

```
beat:        which beat this serves, and what job it does there
shows:       the subject, concretely — what is in frame
does:        what it must make the reader understand or feel
form:        still | loop | sequence      aspect: 16:9 | 1:1 | 9:16
duration:    for anything moving, in seconds
treatment:   lens, light, palette, texture — the shared system, see below
without it:  what the beat falls back to if this cannot be made
```

Only then map it onto whatever generator exists — a CLI on `PATH`, an MCP tool
in context, a stock library, or your own hands in CSS and SVG. The mapping is
mechanical. The brief is the work, and it survives the provider being swapped.

**`without it` is not optional.** Generation fails, credits run out, a provider
is absent on the machine that builds this next. A beat whose fallback is "a grey
box" was never designed.

## 6. One system, or eight strangers

Assets generated one at a time look generated. Decide the treatment **once**,
before the first brief, and put the same words in every brief after it: the
palette, the light, the lens or rendering, the texture, how people appear if
they appear at all.

Then hold it. A page whose hero is a moody long-lens photograph and whose
services section is flat vector illustration has two art directions and no
identity — and that reads as assembled, which is the specific charge this
whole skill exists to answer.

Generation is metered on most providers. Brief a batch and generate once; a
retry loop burns a balance fast, and the second attempt is rarely better than a
better brief.

## 7. Pre-flight, before you report

- [ ] the claim written as one sentence, in `assumptions`
- [ ] beats listed with the job each one does, in order
- [ ] no beat that leaves the reader unchanged
- [ ] motion only where the change itself is the point, and the page still
      argues with motion disabled
- [ ] every asset brief carries a `without it` fallback
- [ ] one treatment named once and repeated in every brief
- [ ] no asset described as made unless it was actually made
