---
name: technique-research
description: Finding out how a technique actually works by reading a live implementation rather than an article about it. Use when a beat needs a technique no preloaded skill covers.
user-invocable: false
---

# Technique research

`frontend-craft` already sends you to look at the category. That pass answers
*what does this look like* — it screenshots a page and you read the image.

This one answers a different question: **how does it work.** You cannot get that
from a picture, and you should not get it from an article. Articles describe what
someone built a year ago; the live page is the thing that is true now.

## Read the artifact, not the writing about it

Go to a real implementation and inspect it. `javascript_tool` runs a query
against the live DOM and `read_page` returns the accessibility tree — between
them you can see the mechanism directly.

What you are extracting is **mechanism, not aesthetic**: the properties that
move, the attribute names, how media is loaded and when, what happens on a slow
connection, what the fallback is. "Dark ground with a serif headline" is not a
finding. This is:

```js
// what is actually on the page
({
  videos: document.querySelectorAll('video').length,
  canvases: document.querySelectorAll('canvas').length,
  sticky: [...document.querySelectorAll('*')]
    .filter(e => getComputedStyle(e).position === 'sticky').length,
  attrs: [...new Set([...document.querySelectorAll('video')]
    .flatMap(v => [...v.attributes].map(a => a.name)))],
  backdrop: [...new Set([...document.querySelectorAll('*')]
    .map(e => getComputedStyle(e).backdropFilter).filter(v => v && v !== 'none'))],
})
```

A real study of a shipping product page returned sixteen videos, zero canvases,
and an attribute set naming its own plugin composition, its progress keyframes
and its load timeout. The whole architecture was readable from markup in one
query. None of it was in any article about the page.

## Component libraries are mechanism, never design

A published component — `21st.dev` and its like — is real source, and reading it
is a legitimate way to learn how an effect is built. How is a shimmer actually
constructed? What does the markup under a working scrub look like? That is the
question this skill exists to answer, and source answers it faster than prose.

**Read them to learn how. Never paste them to decide what.** These libraries are
optimised for one-paste adoption, which makes them the fastest available route to
a page that looks like every other page — the exact failure this plugin has
already produced three times unaided. A component copied whole brings its
author's type scale, spacing and colour logic with it, and none of that was
decided for the page you are building.

So: extract the technique, name it in your findings, and implement it inside the
system the page already has.

## Read the pattern, not the stack it happens to use

`mengto.github.io/kage` is worth reading live as a scroll-driven narrative done
well. What it is built from is the least transferable thing about it.

Inspected, it is Three.js — four canvases, 173KB of inline script,
`WebGLRenderer`, `PerspectiveCamera`, `FogExp`. **None of that is the lesson.**
The lesson is the shape underneath:

- **Named chapters, each with a scroll anchor.** `CHAPTER 00 — THE HIDDEN GATE`,
  `01 — THE SANMON`, and so on. Beats, in the `story-direction` sense, made
  navigable.
- **One continuous subject the reader moves through**, rather than a separate
  picture per section. That continuity is what makes it feel like a place
  instead of a list.
- **Text arriving with its chapter**, revealed by word as the beat does.
- **Only `transform` and `opacity` move**, and `prefers-reduced-motion` is
  honoured — a static, complete page, not a degraded one.
- **A designed loading state**, because a continuous subject has a build cost.

Every one of those is implementable without Three.js. The continuous subject can
be a scrubbed clip, a decomposed layer set, a sprite sequence, a canvas, or a
sequence of stills cross-faded on scroll. In a React or Next.js project it is a
client component, an `IntersectionObserver`, and CSS transforms — reach for a 3D
library only if the project already carries one, or the beat genuinely needs
geometry that nothing flatter can give.

**Extract the pattern; choose the implementation from the project's stack and
budget.** Copying the stack is how a studio site ends up shipping a 2.4MB WebGL
bundle to render what four images and a scroll handler would have said better —
and how a technique arrives as a dependency nobody on the project can maintain.

## The trap that will catch you

**A page can disable its own technique in your browser.** Feature detection,
`prefers-reduced-motion`, a user-agent branch, a breakpoint — any of them can
mean the thing you came to study is switched off while you look at it.

In that same study every video reported `readyState: 0` at every scroll position.
The obvious conclusion — *this page does not scrub video* — was wrong. The root
element carried `no-inline-media`: the site's own detection had decided this
browser could not do it, so sources were never attached. The technique was there;
the page had hidden it from me.

So before concluding a technique is absent, check whether it was **turned off**:

```js
({ html: document.documentElement.className,
   reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
   w: innerWidth, dpr: devicePixelRatio })
```

An absent technique and a disabled one look identical and mean opposite things.
This is the same shape as a refused command reported as a negative result: the
tool answered, the answer looked like data, and nothing had actually been
measured.

## Check the project before you research

A technique you cannot use is a finding you did not need. Before studying an
approach, find out what the project already has — `stack-profile` records what is
available to build with, and `package.json` settles it.

If the project already carries an animation library, the research question is how
to do this *with that*, not which library is best. Adding a dependency to do what
the existing stack already does is a cost the page never asked for.

## Budget

Two or three implementations. Stop when you can state the mechanism in three
sentences without hedging — that is the signal you understood it rather than
collected it. If a fourth site is not answering a question you can name, you are
procrastinating with a token cost.

Stop early when a preloaded skill already covers the technique. Research fills
gaps; it does not re-derive what you were handed.

## Write it down so it can be proved wrong

Findings go in your own scratch directory, at
`.devteam/scratch/frontend-engineer/findings.md`, appended — never rewritten.

```markdown
## backdrop-filter over scrolling media
date:      2026-09-01
source:    https://example.com/product  (inspected live, not an article)
measured:  blur(20px) saturate(1) on the bar; animated blur(7px) -> blur(0px)
           as a reveal. contain: paint on every filtered element.
inferred:  the animation is stepped, not continuous, probably for INP.
unchecked: no Safari available here, so the cross-browser claim is untested.
```

Four fields, and the last two are the ones that matter. **`inferred` and
`unchecked` are what make a finding safe to keep.** A note that separates what
you saw from what you concluded can be corrected by the next run. A note that
merges them becomes folklore.

## A finding is not a preference

This distinction is load-bearing, because getting it wrong has already cost this
plugin a real failure.

A record that says *"we use X here"* carries no evidence and invites no checking.
Six such records once accumulated in a project's scratch directory, each run
reading the last one's choice and reinforcing it, until a later run selected a
provider by name without ever comparing anything — while a better one sat
installed and unused.

So: record **what you measured, where, and when**. Never record what the project
"prefers". If a past finding contradicts what you observe now, the observation
wins and you append a dated correction — the old entry stays, so the change is
visible.

Precedent in a scratch directory is a record of what happened. It is not a
decision, and it is not permission to skip looking.
