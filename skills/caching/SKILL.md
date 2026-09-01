---
name: caching
description: Deciding what to cache, where, and how it gets invalidated — starting from the ways caches go wrong. Use before adding any cache, and when a page or endpoint is slow.
user-invocable: false
---

# Caching

A cache that is wrong is worse than no cache. A slow page annoys someone; a
stale page misinforms them, and a mis-keyed one shows them somebody else's data.
So this starts with the failure modes, and the mechanics come after.

## 1. The cache key is a security boundary

This is the one that turns a performance change into an incident.

If a response depends on **who is asking** — a session, a role, a tenant, a
locale, a feature flag — then every one of those inputs belongs in the key. Miss
one and the first user's response is served to the second.

```
BAD   key: `dashboard`                       one cache, every user
GOOD  key: `dashboard:${tenantId}:${userId}:${role}`
```

The same rule at the HTTP layer: a response that varies by cookie or
authorization header must never be `public`. If a CDN or proxy can hold it,
assume it will.

```
Cache-Control: private, no-store          anything user-specific
Cache-Control: public, max-age=31536000, immutable    fingerprinted static assets
```

**Ask of every cached value: could two different people get the same entry, and
would that be wrong?** If yes, the key is incomplete. Write down the answer in
your report — this is not a detail to leave implicit.

## 2. Invalidation is the design, not an afterthought

Before writing a cache, answer three questions in this order:

1. **What makes this wrong?** A write, a clock, an upstream change.
2. **Who clears it, at that moment?** Name the code path.
3. **What does a reader see between the change and the clear?** That window is
   not a bug to fix later, it is the behaviour you are choosing now.

If you cannot name the writer that invalidates, you have not built a cache. You
have built a delay before the truth arrives, of unknown length.

Prefer invalidating on the write path over guessing a TTL. A TTL is a statement
that stale data is acceptable for exactly that long — fine for a public marketing
page, wrong for a balance or an order status.

## 3. Stampede

When a popular entry expires, every request that wanted it misses at once and
they all hit the origin together. The cache made things worse precisely when
load was highest.

Three defences, in order of how often they are the right one:

- **Serve stale while revalidating.** One request refreshes, everyone else gets
  the slightly old value. `stale-while-revalidate` at the HTTP layer, or the
  same pattern in application code.
- **Single-flight.** Collapse concurrent misses for the same key into one
  upstream call and share the result.
- **Jitter the expiry.** Entries populated together expire together; adding a
  small random offset spreads the refresh.

## 4. Do not cache what is not slow

Measure first. A cache added to something that was never the bottleneck adds an
invalidation bug, a memory cost and a class of staleness, and buys nothing.

Find where the time actually goes — the query, the upstream call, the render, the
payload size — before deciding a cache is the answer. Often it is not: an index,
a narrower select, or one fewer round trip removes the cost instead of hiding it.

**An N+1 query does not want a cache. It wants to not be an N+1 query.**

## 5. Pick the layer that matches the lifetime

From longest-lived to shortest, cache as far from the origin as correctness
allows:

| layer | good for | wrong for |
|---|---|---|
| immutable static assets, fingerprinted | build output | anything mutable |
| CDN / shared proxy | identical-for-everyone responses | anything user-specific |
| framework render cache (SSG, ISR, revalidation) | pages whose inputs change rarely | per-request personalised views |
| query / data cache | expensive reads shared by many requests | writes, and reads inside a transaction |
| in-process memory | tiny, hot, recomputable values | anything that must survive a restart, or be consistent across instances |

In-process memory deserves its own warning: with more than one instance running,
each has its own copy and they disagree. That is acceptable for a compiled regex
and unacceptable for a permission check.

## 6. Prove it, do not assert it

The rule that applies to everything else here applies to caches, and it is easy
to skip because a cache is invisible when it works.

- Show the **before and after** on the same measurement — a timing, a query
  count, a payload size. "Added caching" is not a result.
- Show a **hit** and a **miss**, not just that the page loaded.
- Show the **invalidation firing**: write, then read, and demonstrate the reader
  sees the new value.

An untested invalidation path is the single most common way a cache ships
broken, because the happy path looks perfect until the first update.

## 7. Never cache

- Anything you would not put in a log: credentials, tokens, full card or account
  numbers.
- Responses to unauthenticated error paths, which is how a 403 gets served to a
  user who should have seen a 200.
- Anything whose correct value depends on the current time to a finer resolution
  than the TTL.

## Pre-flight

- [ ] every input the value varies by is in the key, user and tenant included
- [ ] the writer that invalidates is named, and it exists
- [ ] the staleness window is stated, and it is acceptable for this data
- [ ] a stampede defence exists for anything hot
- [ ] the thing being cached was measured as slow first
- [ ] a hit, a miss, and an invalidation were each demonstrated
- [ ] nothing user-specific is marked `public`
