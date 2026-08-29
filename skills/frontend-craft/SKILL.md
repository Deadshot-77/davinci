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

## 1. Commit to a direction first

Before touching markup, name a specific visual direction: editorial,
brutalist, minimal-swiss, maximalist, retro-futurist, whatever the brief
calls for. Record it in the report's `assumptions` even when the brief didn't
ask for one. A direction chosen after the first component exists isn't a
direction — it's a rationalisation of whatever fell out by default.

## 2. The three dials

Read `DESIGN_VARIANCE`, `MOTION_INTENSITY`, `VISUAL_DENSITY` (1-10 each) from
the brief's Design dials section when it has one. When it doesn't, infer them
from the product and the direction you picked, and record the inferred values
and your reasoning under `assumptions`. Never ask the user to pick numbers —
that question belongs to intake, not to you.

## 3. Look at what you build

CSS written and never viewed is a guess, not a design. An agent styling
blind is the single most common way this goes wrong, and shipping unlooked-at
work is the failure mode this section exists to prevent. Verify in this
order, don't skip steps, and don't stop after one pass:

1. **Serve, then shoot.** Start the project's dev server (or a static server —
   `npx --yes serve` works for a plain HTML/CSS build with no server of its
   own) against a real `http://` URL, then run
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

## 4. Companion skills

If `design-taste-frontend` or `web-design-engineer` are installed, invoke
them with the `Skill` tool and follow what they say — both carry far more
detail than fits here and take precedence over this file. This skill is the
fallback for when they're absent, not a summary of them.

## 5. Banned defaults

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

## 6. Generated media

When a media MCP server is configured: a poster frame on every video,
`preload="none"`, lazy-loading below the fold, and a static fallback path for
`prefers-reduced-motion`. Generate in batches — credits are metered, and a
retry loop burns them fast. A scroll page that's beautiful in the demo and
unshippable in production is a failure, not a draft.

## 7. Accessibility floor

Non-negotiable regardless of direction or dial values: visible focus states
on every interactive element, 4.5:1 contrast on body text,
`prefers-reduced-motion` honoured, everything reachable by keyboard alone.

## 8. Pre-flight, before you report

Mechanical checks, not vibes — run through this before writing the report:

- [ ] direction named and recorded in `assumptions`
- [ ] all three dials present in the report, inferred or read from the brief
- [ ] the perception loop actually ran — a desktop screenshot **and** a
      mobile screenshot exist and were read, with their paths recorded in
      the report's `assumptions`; or the report states plainly that visual
      verification was impossible and why
- [ ] console checked and clear of errors introduced by this change
- [ ] none of the banned defaults in section 5 are present
- [ ] focus states, contrast, and keyboard reachability checked, not assumed
