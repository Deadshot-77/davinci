---
name: glass-surfaces
description: Blurred and refracting panels over moving content, and what they cost. Use when a surface must sit over imagery and stay legible.
user-invocable: false
---

# Glass surfaces

A glass panel says *there is something behind this*. Over a flat colour there is
nothing to refract and the effect is a filter applied for its own sake. Use it
where content actually passes underneath — a bar over scrolling imagery, a panel
over a moving beat.

## The two tiers

**Blur, which works everywhere.**

```css
.glass {
  backdrop-filter: blur(20px) saturate(1.1);
  background: color-mix(in oklab, canvas 55%, transparent);
  contain: paint;
}
```

Measured on a shipping Apple product page: `blur(20px) saturate(1)`, with an
animated `blur(7px)` to `blur(0px)` used as a reveal rather than a permanent
state. That is the whole vocabulary, and it is enough.

**Refraction, which does not.** True liquid glass bends what is behind it, which
CSS alone cannot do. It takes an SVG `feDisplacementMap` fed into
`backdrop-filter`, and that combination works reliably **only in Chromium**.
Everywhere else you get the blur and no bend.

So refraction is an enhancement on top of a design that is finished without it.
If the panel only reads as glass when it refracts, it is not finished.

## The cost is real

`backdrop-filter` rasterises everything behind the element, every frame it moves
or the content beneath it moves. Two rules keep it affordable:

- `contain: paint`, or `contain: strict` where the panel's size is fixed, so the
  filter's work is bounded to the element rather than the stacking context.
- Never animate the blur radius on scroll. Animate `opacity`, or step between two
  states. A radius interpolating every frame re-rasterises the backdrop every
  frame, and it lands directly on INP.

Do not stack glass on glass. Each layer re-filters the one beneath it.

## Legibility comes first

The panel exists to make text readable over imagery. Check contrast against the
*brightest* frame that will ever pass behind it, not a convenient one — and on a
scroll-driven page that frame may appear for only a moment.

If contrast cannot be met across the whole passage, put an opaque scrim behind
the text rather than raising the blur. Blur reduces detail, not luminance; a
bright background stays bright however blurred it is.

## Fallback, in order

```css
.glass { background: color-mix(in oklab, canvas 92%, transparent); }

@supports (backdrop-filter: blur(1px)) {
  .glass {
    background: color-mix(in oklab, canvas 55%, transparent);
    backdrop-filter: blur(20px) saturate(1.1);
  }
}
```

Write the opaque version first and enhance upward. Written the other way round, a
browser without support gets a near-transparent panel with unreadable text.
