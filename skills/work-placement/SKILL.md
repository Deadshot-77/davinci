---
name: work-placement
description: Deciding where work happens — build, edge, server or client — and finding what actually costs time before changing anything. Use when a page or endpoint is slow, when choosing how a route renders, or before adding a cache.
user-invocable: false
---

# Work placement

The cheapest work is work you do not do. The next cheapest is work you do once.
Almost everything else is a variation on those two sentences.

This skill is the entry point for that decision. `davinci:caching` is one rung
of it, not the subject.

## 1. The ladder

Every piece of work sits on one of four rungs, and it belongs on the highest one
its inputs allow:

| rung | cost per request | what it fits |
|---|---|---|
| **build** | none — HTML exists as a file | anything whose inputs change on deploy, not per visitor |
| **edge / CDN** | a cache read | identical-for-everyone responses that change on a clock |
| **server** | a render, maybe a query | genuinely request-dependent output |
| **client** | a download, then work on someone's phone | interaction that cannot be known in advance |

A statically rendered route does **no per-request work at all**: the file is on
disk, a CDN serves it, and time-to-first-byte is bounded by network latency
rather than by anything you wrote.

## 2. Name what forces work downward

Work moves down a rung only when something specific forces it. Cookies. Search
params. Per-user or per-tenant content. Data that must be fresher than the build.

**A route that is dynamic because nobody decided otherwise is the bug.** It is
also the most common one, because dynamic is usually the framework default and
nothing complains. One request-time value read at the top of a page — a header, a
cookie, the current time — can move an entire route down a rung, so know which
line did it.

The common shape at scale: prerender the pages that matter, serve the long tail
dynamically, and let revalidation move it back up once it is warm. Static and
dynamic are a per-route decision, not a per-project one.

## 3. Find the cost before you change anything

Two named methods, and the order is the point.

**RED first — Rate, Errors, Duration.** Treat the thing as a black box and ask
what a user actually experiences. This tells you *whether* something is wrong and
*where*, from outside.

**USE second — Utilisation, Saturation, Errors.** Now look at the resource: what
is busy, what is queueing, what is failing. This tells you *why*.

Top-down, in that order, exists to stop you optimising something nobody is
waiting on. **Work the page does for no reason is only a defect when it is on the
path something waits for.** Otherwise removing it costs a change, a risk and a
review, and buys nothing measurable — and you will not be able to show it helped,
because it did not.

So: measure, name the number, change one thing, measure again. A performance
claim with no before-and-after is not a result.

## 4. The failure modes worth knowing by name

- **Request waterfall.** Requests that could have run together run in sequence
  because each waits on the one above. Usually the largest single win and rarely
  the one people look for first.
- **Over-fetching.** Selecting every column to display two of them, or fetching a
  whole object to read its id. Cheap to fix, invisible until you look.
- **N+1.** One query, then one more per row. It does not want a cache — it wants
  to stop being an N+1.
- **Dynamic by accident.** Covered above, and worth checking on every route you
  touch.
- **Re-rendering on state that did not change.** Client-side, and the one most
  often "fixed" by guessing. Profile it or leave it.
- **Shipping work to the client that the build could have done.** Formatting,
  sorting, filtering a list that was already known at build time.

## 5. Budgets, so it stays fixed

A one-off cleanup regresses. Enforcement lives at three points and current
practice is deliberately asymmetric — **hard gates on the few metrics that
matter, soft warnings on the leading indicators**:

| point | what it catches |
|---|---|
| build / bundler | file and asset weight, before anything ships |
| CI | user-visible timings, on a representative device rather than a fast laptop |
| production telemetry | what real users get, which is the only number that was ever true |

The plugin enforces the first of these directly:

```
node <plugin>/scripts/waste.mjs . --max-total-kb=1500 --max-asset-kb=400
```

The other two belong to the project, not to this plugin. If a project has no
budget, say so in `assumptions` rather than inventing one and quietly enforcing
it.

## 6. When the answer really is a cache

A cache is the right tool when the work is genuinely needed, genuinely expensive,
and its result is genuinely reusable. That is narrower than it sounds, and every
cache adds an invalidation path, a staleness window and a way to serve one user
another user's data.

If you have measured, placed the work as high on the ladder as its inputs allow,
and it is still the bottleneck — invoke `davinci:caching` and do it properly.

## Pre-flight

- [ ] every route's rung is a decision, and anything dynamic names what forced it
- [ ] a number was measured before the change and after it
- [ ] the thing changed was on the path something waits for
- [ ] no cache was added to hide work that could have moved up a rung
- [ ] asset weight checked against a budget, or the absence of one recorded
