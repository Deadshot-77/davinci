---
name: technical-seo
description: What a page must declare to a crawler and why — metadata, canonical, structured data, crawlability. Use when building any page that will be public.
user-invocable: false
---

# Technical SEO

This covers what the markup declares. It does not cover keyword strategy,
competitive positioning or content planning — those need search-volume data and
business context you do not have, and producing them from nothing yields
confident output with nothing behind it. **If a brief asks for keyword research,
say plainly that it needs data outside the project rather than inventing it.**

What you can do is make the page legible to a machine and honest about what it
is. That part is verifiable, which is why it belongs here.

## Run the check on built output

```
node <plugin>/scripts/seo.mjs .
```

It reads `out/`, `dist/` or `build/` — not your source. A framework's metadata
export, a layout's title, a component's alt attribute: none of them can be
verified by reading the file they are written in, because what ships is the
render. **If there is no build, the check does not run**, and it says so. That
is not a pass, and reporting it as one is the same error as reporting a
screenshot you never took.

Errors are things a page cannot do without. Notes are judgement calls with
context attached. Read both; fix the errors; decide about the notes.

## What every page owes

**A `lang` on `<html>`.** Without it a screen reader guesses and mispronounces.

**A `<title>` that is this page's, not the layout's.** The commonest defect the
check finds is several routes sharing one title, because a layout set it and no
route overrode it. The title is the name of the page in a tab, a bookmark, a
search result and a shared link.

**A viewport meta.** Indexing is mobile-first — the mobile render is what gets
evaluated, so a page without this is judged as a scaled-down desktop page.

**Exactly one `<h1>`, and no skipped levels.** Headings are how a screen reader
user navigates and how a crawler reads structure. `h1 → h3` means a level is
missing, not that the styling looked better.

**A meta description**, or a deliberate decision not to. Absent one, the snippet
gets written for you from whatever text comes first.

## Structured data, honestly

Pages appearing in AI-generated answers are markedly more likely to carry
schema. That is a correlation worth acting on, not a guarantee, and the
mechanism is plain enough: JSON-LD states in machine-readable form what prose
only implies.

Add it where the page genuinely is a thing with a type — an organisation, an
article, a product, an event, a FAQ. Use the type that is true. **Schema
describing something the page does not contain is a misrepresentation**, and the
penalty for being caught at it is worse than the benefit of the markup.

One `<script type="application/ld+json">` per page, matching what a reader
actually sees.

## Do not write an llms.txt

It is heavily promoted as AI-search optimisation. As of 2026 it is not a ranking
factor, not a citation signal, and not used by any major AI platform for
retrieval — three independent studies across more than 300,000 domains found no
effect on citations or visibility.

The actual pipeline is: someone asks a question, the assistant runs a web
search, reads the top results, and cites the best. Every step is governed by
ordinary ranking and by whether the page answers the question. So the work that
helps is the work below, not a file at the domain root.

If a brief asks for one, say this, and offer the alternative rather than
producing a file that does nothing so the box can be ticked.

## Speed is a tiebreaker, and it is somebody else's section

Core Web Vitals are a confirmed signal, and the correlation is real — but
content relevance dominates, and speed decides between pages that are otherwise
close. Do not restructure a page for a metric before it has anything worth
ranking.

When speed is the problem, it is a placement problem: see
`davinci:work-placement` for the ladder and for measuring before changing.

## Images

Alt text is an accessibility requirement that search happens to benefit from,
not a ranking tactic. The rule is a decision tree, not "describe everything",
and it lives in `davinci:frontend-craft`'s accessibility floor. Follow it there.

The one thing worth repeating: **a missing `alt` attribute and `alt=""` mean
opposite things.** The first makes a screen reader read out a filename. The
second is how you correctly hide a decorative image.

## Pre-flight

- [ ] `seo.mjs` run against a real build, and its errors at zero
- [ ] every route's title is its own, not inherited from the layout
- [ ] notes read and each one either fixed or explained in `assumptions`
- [ ] structured data present only where its type is true of the page
- [ ] no llms.txt written, and if one was asked for, the reason given
- [ ] if the check could not run, that is reported as unrun, not as a pass
