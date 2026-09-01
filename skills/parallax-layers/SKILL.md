---
name: parallax-layers
description: Building depth from a decomposed still — layers that move at different rates on scroll without dropping frames. Use once you have a layer set and a beat that needs depth.
user-invocable: false
---

# Parallax layers

Parallax is the effect most often done wrong, because the cheap version —
translate a background image slower than the page — reads as a template setting.
The version that works needs *separated* layers, which is why this skill starts
after `davinci:generating-assets` has decomposed a still.

## Only two properties may move

`transform` and `opacity` are composited on the GPU. Everything else — `top`,
`margin`, `background-position`, `width` — forces layout or paint on every frame
and will drop frames on a mid-range laptop the moment two layers move at once.

```css
.layer {
  will-change: transform;
  transform: translate3d(0, var(--shift), 0);
}
```

Set `will-change` only on the handful of elements that actually move, and remove
it when the section leaves view. Left on permanently it promotes every layer to
its own compositor tile and costs memory for nothing.

## Drive it from one measurement per frame

Reading `getBoundingClientRect()` per layer per frame is the usual cause of jank:
each read after a write forces a synchronous layout. Measure the *section* once,
then write to every layer from that one number.

```js
const layers = [...section.querySelectorAll('[data-depth]')];
let ticking = false;

function frame() {
  const r = section.getBoundingClientRect();          // one read
  const p = -r.top / (r.height - innerHeight || 1);   // 0 to 1 through the section
  for (const el of layers) {                          // writes only
    el.style.setProperty('--shift', (p * parseFloat(el.dataset.depth)) + 'px');
  }
  ticking = false;
}

addEventListener('scroll', () => {
  if (!ticking) { ticking = true; requestAnimationFrame(frame); }
}, { passive: true });
```

`{ passive: true }` matters — without it the browser must wait to see whether you
will call `preventDefault` before it can scroll at all.

## Choose depths that mean something

Depth values should follow the picture, not a sequence. The ground moves least,
the subject barely at all, anything nominally in front of the subject moves most.
A subject that moves as much as its background is not depth, it is drift.

Keep total travel small. Movement beyond roughly a tenth of the section height
reads as sliding rather than depth, and it forces you to oversize every layer to
avoid exposing an edge.

## Contain the damage

```css
.parallax-section { contain: layout paint; overflow: clip; }
```

`contain` stops layout and paint inside the section from invalidating the rest of
the page. `overflow: clip` hides the oversized edges of layers that have
travelled.

## The two paths you must build

**Reduced motion.** Not optional, and not a fade-in substitute:

```css
@media (prefers-reduced-motion: reduce) {
  .layer { transform: none !important; }
}
```

The composition must still read with every layer at rest. If it does not, the
layers are carrying the beat and the still underneath is not finished.

**Off-screen.** Gate the listener with an `IntersectionObserver` so sections
nowhere near the viewport are not computing transforms.

## What to check before calling it done

Scroll the section at speed and watch the seams: a layer exposing its edge was
not oversized enough, and a layer shearing away from the one behind it has a
depth value that does not match the image. Then load it on a throttled CPU and
confirm the page still scrolls at rate. Parallax that costs the scroll its
smoothness has taken more than it gave.
