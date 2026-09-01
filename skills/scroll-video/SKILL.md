---
name: scroll-video
description: Driving a video playhead from scroll position, with the decode limits and fallbacks that make it survive real devices. Use when a beat needs a clip the reader scrubs through.
user-invocable: false
---

# Scroll video

A scrubbed clip is the most convincing scroll technique there is, and the easiest
to ship broken, because it works perfectly on the machine that built it.

## The shape

One clip per beat, named for the beat. Not one long film — a single video couples
every beat to every other, and a slow load anywhere stalls everything.

```html
<video id="beat-case" muted playsinline preload="none"
       role="img" aria-label="The case closing around the earbuds"
       poster="/case-poster.jpg"></video>
```

Every attribute is doing work. `muted` and `playsinline` are what allow
programmatic control without a user gesture. `preload="none"` keeps it off the
critical path. `role="img"` with an `aria-label` announces the *subject* rather
than "video". `poster` is the frame the beat falls back to, and it has to be a
frame that carries the beat alone.

## Attach the source when it comes into view, once

```js
const io = new IntersectionObserver(([e]) => {
  if (!e.isIntersecting || video.dataset.loaded) return;
  video.dataset.loaded = '1';
  video.src = srcForBreakpoint();
  video.load();
  io.disconnect();
}, { rootMargin: '200px' });
io.observe(video);
```

Give it a deadline. Apple's own players carry a three-second load timeout; past
it the poster simply stays. Build that timer before the happy path, because it is
what most users on a bad connection actually see.

## Map scroll to time, and clamp

```js
const p = Math.min(1, Math.max(0, -rect.top / (rect.height - innerHeight)));
const t = p * video.duration;
if (Math.abs(video.currentTime - t) > 0.01) video.currentTime = t;
```

Two details that are not optional. Clamp progress to 0 through 1, or overscroll
seeks past the end and the picture blanks. And skip writes smaller than a frame:
assigning `currentTime` cancels the in-flight seek, so writing on every frame
keeps the decoder starting over, and the picture freezes while the numbers look
correct.

Read once per `requestAnimationFrame`, never per scroll event.

## What actually breaks

**Backward scrubbing.** Decoders hold a limited window of decoded frames.
Scrolling up seeks backwards repeatedly, the worst case for every codec, and on
mobile it stutters where scrolling down is smooth. Test upward first.

**Keyframe spacing.** Seeking lands on the nearest keyframe and decodes forward.
A clip encoded for streaming has keyframes seconds apart and will scrub like a
slideshow. Encode scrub clips with dense keyframes; the file gets larger and that
is the trade you are making.

**Duration is not ready when you are.** `video.duration` is `NaN` until metadata
loads. Guard every mapping on it.

**One clip, every breakpoint.** A phone should not download a 4k asset. Choose
the source at attach time, and prefer converting one master with an aspect
workflow over generating each crop separately, so the variants stay the same
footage.

## Decide the last frame before you generate

A scrubbed section ends where the reader stops scrolling, so the final frame is a
composition they will sit and look at. Generate the first and last stills,
confirm both, then generate the motion between them — models taking a
`start_image` and an `end_image` exist precisely for this. See
`davinci:generating-assets`.

## Reduced motion

```js
if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // poster stays
```

Do not substitute a fade. The poster is the design at rest, which is why it had
to be a frame that carries the beat alone.
