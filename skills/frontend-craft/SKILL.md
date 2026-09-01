---
name: frontend-craft
description: Design judgment for building interfaces that do not look templated. Use when writing any user-facing markup, styling, or motion.
user-invocable: false
---

# Frontend craft

A model builds what it has seen most, and what it has seen most is the average
of every interface in its training data — the same centred hero, the same
three cards, the same near-white greys, the same Inter. That average reads as
characterless the moment a human looks at it. Breaking it takes a decision
made before any code is written, not a cleanup pass after.

## Before any of this: know what the page is arguing

`story-direction` comes before everything in this file. A visual direction is
a stance about type, colour and density; it is not a decision about what the
page says, in what order, and why a reader is still there at the fourth
section. Settle the claim and the beats first, then come back here and dress
them.

## 1. Go and look at the category first

A designer handed a brief does not start drawing. They find out what the
category already looks like, and they do it by looking — not by recalling. You
can do the same, and you have the tool for it: `shoot.mjs` points at any URL,
not only your own dev server, and `Read` renders the image. You can genuinely
see a competitor's homepage rather than read a description of it.

Do this when the work has a real visual surface and the tier is `standard` or
`load-bearing`. A favicon or a config file does not get a competitive audit.

1. **Find the actual set.** Search for who does this specific thing — the
   studios, products or publications a visitor would compare this against. Not
   "best website design"; that returns award galleries and trend lists, which
   is how everything ends up looking the same.
2. **Look at three or four of them.** `node <plugin>/scripts/shoot.mjs <url>
   ref-<name>.png 1280 900`, then **`Read` each image**. Three or four is the
   budget. A survey is not research, it is procrastination with a token cost.
3. **Write down what you actually saw**, in specifics. Not "modern and clean" —
   that describes nothing and commits you to nothing. The type pairing. Where
   the eye lands first and what put it there. How colour behaves: one accent
   carrying state, or a palette competing with the content. What the layout
   does with the viewport. Whether the copy says anything.
4. **Name the convention, then decide about it deliberately.** The point of
   looking is not to gather things to imitate. It is to find out what the whole
   category does the same way, so that when you do it too it is a decision
   rather than a default — and so that you can see what none of them is doing.

### Published specifications, when you want the rules rather than the picture

Rendering a competitor tells you what it looks like. Some systems have been
written down, and reading the written form is faster and more precise than
inferring it from a screenshot.

`styles.refero.design` publishes design specifications extracted from real
products — colours, type, spacing and component rules — one page per product,
readable with `WebFetch`. The Linear entry, for instance, gives Acid Lime
`#e4f222`, Inter Variable at 300/400/510/590, a 4px base on an 8/12/24/96
ladder, and rules with reasons attached: *three radii is the entire radius
vocabulary*, *0.5px hairline borders instead of shadows*, *a single accent CTA
per view*.

The rules are the valuable part, not the hex codes. Read two or three to learn
what a category assumes about density, contrast and how much colour is allowed
to do — then decide about those assumptions.

**Never adopt one.** A specification is a description of somebody else's answer
to somebody else's problem. Shipping a studio site in Linear's system is the
same failure as shipping the category average, arrived at faster and with better
production values.

Looking at images answers *what does this look like*. When you need to know
*how something works* — a motion technique, a load strategy, an effect you can
see but not explain — that is a different pass with different tools, and
`davinci:technique-research` runs it.

**Research is for finding the gap, not the average.** The failure mode here is
convergence: four sites use a centred hero over a gradient, you absorb that as
"what this category looks like", and you produce a fifth. You have then used
the internet to arrive at exactly the training-data average this skill exists to
break. If the audit only tells you what to copy, you have wasted it. The useful
output is a sentence of the form *"they all do X; this one will do Y instead,
because Z."*

**"Better" is not "the same but nicer."** A competitor's design solves their
problem. Taking their layout and improving the spacing produces a derivative
that is worse than either an honest copy or an original. Better means finding
what the category collectively fails to do — the thing everyone's visitors put
up with — and doing that.

Record in the report's `assumptions`: which references you looked at, the one
convention you found, and what you are doing instead. Three lines. If you could
not look — no network, a site that refuses a headless browser — say that plainly
and choose a direction from the brief alone. Never imply you looked at
something you did not, and never cite a reference you did not actually render.

## 2. Commit to a direction first

Before touching markup, name a specific visual direction: editorial,
brutalist, minimal-swiss, maximalist, retro-futurist, whatever the brief
calls for. Record it in the report's `assumptions` even when the brief didn't
ask for one. A direction chosen after the first component exists isn't a
direction — it's a rationalisation of whatever fell out by default.

## 3. The three dials

Read `DESIGN_VARIANCE`, `MOTION_INTENSITY`, `VISUAL_DENSITY` (1-10 each) from
the brief's Design dials section when it has one. When it doesn't, infer them
from the product and the direction you picked, and record the inferred values
and your reasoning under `assumptions`. Never ask the user to pick numbers —
that question belongs to intake, not to you.

## 4. Look at what you build

CSS written and never viewed is a guess, not a design. An agent styling
blind is the single most common way this goes wrong, and shipping unlooked-at
work is the failure mode this section exists to prevent. Verify in this
order, don't skip steps, and don't stop after one pass:

1. **Serve, then shoot.** A dev server is refused by the permission profile —
   it never exits, so it would hang the call that started it. Build first, then
   serve the output directory: `npm run build` followed by
   `npx --yes serve <dist|out|build>` gives you a real `http://` URL for the
   thing that would actually ship, which is the more honest surface to judge
   anyway. Then run
   `node <plugin>/scripts/shoot.mjs <url> <out.png>` and **`Read` the
   resulting PNG**. Taking the screenshot is not the step — looking at it is.
   Critique the image against the checks below, revise, and re-shoot until it
   actually passes.
2. **A browser preview MCP happens to be available** (`preview_start`,
   `computer`, `resize_window`, `read_console_messages`, or equivalent): this
   is equally good — use it the same way, screenshot → critique → revise →
   repeat, plus `read_console_messages` for what's silently broken (a missing
   font, a failed request, a hydration warning rarely throws where you're
   looking).
   The plugin's path is per-installation, so `permissions.example.json` cannot
   name it: if this command is refused, the profile is missing an entry for
   `node <plugin>/scripts/shoot.mjs` and that is a setup gap, not something to
   work around. Record it in `assumptions` and fall back to the next option.
3. **Both are impossible**: say so. State in the report's `assumptions`,
   explicitly, that the work was not visually verified and why not. Never
   report visual work as done in a way that implies it was looked at when it
   was not — an agent that quietly stops looking is exactly the failure this
   loop exists to prevent, and a false claim is worse than an honest gap.

**Shoot over HTTP, not `file://`.** A root-absolute stylesheet href
(`/styles.css`) resolves correctly against a server origin and fails
completely when the page is opened straight from the filesystem — the
browser looks for the file at the filesystem root and finds nothing. A page
screenshotted over `file://` can look broken when it's actually fine, or look
fine when a real deploy would be broken. Always serve first.

**Look at composition, not just correctness.** The class of flaw that
matters most is invisible in the code and obvious in one glance at the
image — the first page ever rendered through this loop was typographically
strong but left a large dead zone because the layout didn't own the
viewport. Judge the screenshot against at least these:

- Does the composition use the viewport deliberately, or does content sit in
  a fraction of it with unclaimed space around it?
- Is vertical rhythm consistent between sections, given their differing
  content weight?
- Is there one clear focal entry point, or does the eye not know where to
  land first?
- Does anything collide, overlap, or crowd at this width?

The tool renders a viewport narrower than about 520px inside an iframe,
because a desktop OS will not make a browser window that narrow and would
otherwise lay the page out at ~496px and crop the image to the width you
asked for — an image indistinguishable from a broken mobile layout. It
crops the padding away and refuses to hand you an image of the wrong width,
so what you look at is the viewport you asked for.

**Run a mobile pass too.** Re-shoot the same URL at 390x844
(`node <plugin>/scripts/shoot.mjs <url> <out-mobile.png> 390 844`) and look
again — a layout that composes well at desktop width routinely breaks at
phone width, and that only shows up by looking.

## 5. Companion skills

If `scrollytelling` is installed, invoke it before building any scroll-linked
sequence — it carries far more on pinned layouts, reveal patterns and the
techniques that actually work than fits here, and it takes precedence over
anything this file says about motion.

If `design-taste-frontend` or `web-design-engineer` are installed, invoke
them with the `Skill` tool and follow what they say — both carry far more
detail than fits here and take precedence over this file. This skill is the
fallback for when they're absent, not a summary of them.

## 6. Banned defaults

Each of these is a tell that no decision was made:

- Inter or Roboto, picked because it's the default rather than because it fits
- a centred hero above three equal-width cards, with no reason for exactly three
- near-white greys on white — no real contrast within the neutral scale
- fabricated statistics or benchmark numbers with no source
- placeholder person names, stock avatars, or unfinished filler copy
- one border-radius value applied to every element regardless of size or role
- motion with no easing curve — linear transitions read as broken, not fast
- text laid over an image with no scrim or contrast treatment behind it
- every section sharing the same vertical rhythm regardless of content weight
- an icon glued to every bullet whether or not it adds information
- **a page with nothing to look at**: near-black ground, a display serif with
  one word in italic accent, monospace letter-spaced labels, hairline rules and
  a right-aligned specification table. This is the current house style of
  careful machine design — three separate runs of this plugin produced it
  independently, each believing it had committed to its own direction — and it
  is now as much a default as Inter and the three cards. If your page matches
  more than three of those, you have arrived at the average by the scenic route.
  Showing something real is the way out, not another prohibition.

## 7. Generated media

Check whether you actually have media tools before planning around them, and
check properly: the tools listed at startup are not the whole set. Deferred MCP
tools load on demand, so a generator absent from your context may still be one
`ToolSearch` can find — if you have `ToolSearch` at all. A page designed around
imagery that then ships without it is worse than one designed static from the
start. If the tools
are not in your context, say so in `assumptions` and design static. Never
describe media you did not generate.

When a media MCP server is configured: a poster frame on every video,
`preload="none"`, lazy-loading below the fold, and a static fallback path for
`prefers-reduced-motion`. Generate in batches — credits are metered, and a
retry loop burns them fast. A scroll page that's beautiful in the demo and
unshippable in production is a failure, not a draft.

## 8. Accessibility floor

Non-negotiable regardless of direction or dial values: visible focus states
on every interactive element, 4.5:1 contrast on body text,
`prefers-reduced-motion` honoured, everything reachable by keyboard alone,
a `lang` on `<html>`, one `<h1>` per page with no skipped heading levels, and
every image resolved through the tree below.

### Alt text is a decision, not a field to fill

"Add alt text to every image" produces worse accessibility than the tree,
because it turns decoration into noise a screen reader must read past.

For each image, in order:

1. **Does it carry information the surrounding text does not?** Write that
   information. Not what the picture *is* — what it *says*. A photograph of a
   bound document beside a caption about handover does not need "a photograph of
   a bound document".
2. **Is it a link or a control?** Describe the destination or the action, never
   the graphic. `alt="Home"`, not `alt="logo"`.
3. **Does it repeat adjacent text?** Then it is decorative here, whatever it
   depicts. Duplicated alt makes a screen reader say everything twice.
4. **Otherwise it is decorative.** `alt=""`.

**`alt=""` and no `alt` attribute are opposites.** Empty alt tells assistive
technology to skip the image, which is correct for decoration. A *missing*
attribute makes a screen reader announce the filename instead — so
`hero-final-v3.jpg` gets read aloud. Never omit the attribute.

Long-form alt belongs in the page, not the attribute: if a chart needs a
paragraph, put the paragraph on the page where everyone gets it.

## 9. What the page declares

A public page is read by machines as well as people, and what it declares —
its title, its language, its structure, its schema — is part of the build, not
a marketing afterthought. `davinci:technical-seo` covers what that means and
carries a check that runs against real build output.

## 10. Pre-flight, before you report

Mechanical checks, not vibes — run through this before writing the report:

- [ ] references actually rendered and read, with the convention you found
      and what you are doing instead recorded in `assumptions` — or a plain
      statement that you could not look and why
- [ ] direction named and recorded in `assumptions`
- [ ] all three dials present in the report, inferred or read from the brief
- [ ] the perception loop actually ran — a desktop screenshot **and** a
      mobile screenshot exist and were read, with their paths recorded in
      the report's `assumptions`; or the report states plainly that visual
      verification was impossible and why
- [ ] console checked and clear of errors introduced by this change
- [ ] none of the banned defaults in section 6 are present
- [ ] focus states, contrast, and keyboard reachability checked, not assumed
