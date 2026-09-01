'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  parsePlan, validatePlan, parseProgress, statusOf, nextSlice, lastDone, summarise,
} = require('../lib/ledger.js');

const PLAN = [
  '# Plan',
  '',
  '## S1 — the page renders at all',
  '**Delivers:** a route that builds and serves, with nothing on it but the masthead.',
  '- [ ] npm run build exits 0',
  '- [ ] out/jobs/index.html exists',
  '',
  '## S2 — the rows carry real data',
  '**Delivers:** every job visible with client, stage, owner and due date.',
  '- [ ] twenty rows render',
  '',
].join('\n');

test('a plan parses into ordered slices with their criteria', () => {
  const slices = parsePlan(PLAN);
  assert.strictEqual(slices.length, 2);
  assert.strictEqual(slices[0].id, 'S1');
  assert.match(slices[0].title, /renders at all/);
  assert.match(slices[0].delivers, /nothing on it but the masthead/);
  assert.deepStrictEqual(slices[0].criteria, ['npm run build exits 0', 'out/jobs/index.html exists']);
  assert.strictEqual(slices[1].id, 'S2');
});

test('a plan with no slices, gaps, or missing criteria fails at intake', () => {
  // Cheap to fix while writing the plan, expensive to discover three slices in.
  assert.match(validatePlan(parsePlan('# Plan\n\njust prose\n'))[0], /defines no slices/);

  const gap = parsePlan(['## S1 — a', '**Delivers:** x', '- [ ] y', '## S3 — b', '**Delivers:** z', '- [ ] w'].join('\n'));
  assert.ok(validatePlan(gap).some((e) => /should be "S2"/.test(e)), 'out-of-order ids went unreported');

  const noCriteria = parsePlan('## S1 — a\n**Delivers:** x\n');
  assert.ok(validatePlan(noCriteria).some((e) => /"done" is an opinion/.test(e)));

  const noDelivers = parsePlan('## S1 — a\n- [ ] y\n');
  assert.ok(validatePlan(noDelivers).some((e) => /Delivers/.test(e)));
});

test('a valid plan produces no errors', () => {
  assert.deepStrictEqual(validatePlan(parsePlan(PLAN)), []);
});

test('the journal is append-only and the last event for a slice wins', () => {
  const { events, errors } = parseProgress([
    '{"slice":"S1","status":"started"}',
    '{"slice":"S1","status":"blocked"}',
    '{"slice":"S1","status":"done","evidence":[{"cmd":"npm run build","exit_code":0}]}',
  ].join('\n'));
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(statusOf('S1', events), 'done',
    'a slice that was blocked and later finished should read as done');
});

test('a malformed journal line is reported, never skipped', () => {
  // Silently ignoring history is how a resume lands in the wrong place.
  const { events, errors } = parseProgress([
    '{"slice":"S1","status":"done"}',
    'not json at all',
    '{"slice":"S2","status":"invented"}',
    '{"status":"done"}',
  ].join('\n'));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(errors.length, 3);
  assert.ok(errors.some((e) => /line 2 is not valid JSON/.test(e)));
  assert.ok(errors.some((e) => /status "invented"/.test(e)));
  assert.ok(errors.some((e) => /names no slice/.test(e)));
});

test('resume targets the first slice that is not done', () => {
  const slices = parsePlan(PLAN);
  const { events } = parseProgress('{"slice":"S1","status":"done"}');
  const next = nextSlice(slices, events);
  assert.strictEqual(next.slice.id, 'S2');
  assert.strictEqual(next.status, 'pending');
  assert.strictEqual(next.resuming, false);
});

test('a slice left started is resumed, not skipped past', () => {
  // A killed run may have written half its files. Moving on would leave that
  // half-work in the tree with nothing accountable for it.
  const slices = parsePlan(PLAN);
  const { events } = parseProgress(
    '{"slice":"S1","status":"done"}\n{"slice":"S2","status":"started"}');
  const next = nextSlice(slices, events);
  assert.strictEqual(next.slice.id, 'S2');
  assert.strictEqual(next.resuming, true,
    'an interrupted slice must be re-entered, not treated as finished');
});

test('a finished plan has no next slice', () => {
  const slices = parsePlan(PLAN);
  const { events } = parseProgress(
    '{"slice":"S1","status":"done"}\n{"slice":"S2","status":"done"}');
  assert.strictEqual(nextSlice(slices, events), null);
});

test('the last done slice is what a resume re-verifies', () => {
  const slices = parsePlan(PLAN);
  const { events } = parseProgress('{"slice":"S1","status":"done"}');
  assert.strictEqual(lastDone(slices, events).id, 'S1');
  assert.strictEqual(lastDone(slices, parseProgress('').events), null,
    'nothing done yet means nothing to re-verify');
});

test('a summary counts every slice exactly once', () => {
  const slices = parsePlan(PLAN);
  const { events } = parseProgress('{"slice":"S1","status":"done"}');
  const s = summarise(slices, events);
  assert.strictEqual(s.total, 2);
  assert.strictEqual(s.done + s.pending + s.started + s.blocked, s.total);
  assert.strictEqual(s.done, 1);
  assert.strictEqual(s.pending, 1);
});
