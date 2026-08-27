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
work is the failure mode this section exists to prevent. Run the loop, don't
skip steps, and don't stop after one pass:

`preview_start` → screenshot → critique against the checks below → revise →
repeat until it actually passes. Then `resize_window` for a mobile pass, and
`read_console_messages` for what's silently broken — a missing font, a failed
request, a hydration warning rarely throws where you're looking.

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
- [ ] the perception loop actually ran — a screenshot exists, not just code
- [ ] a mobile-width screenshot was taken
- [ ] console checked and clear of errors introduced by this change
- [ ] none of the banned defaults in section 5 are present
- [ ] focus states, contrast, and keyboard reachability checked, not assumed
