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

test('a plan is a draft until the user approves it', () => {
  // The earliest form of "it drove away on its own": a run dies after writing
  // plan.md but before the user ever saw it, then a resume finds slices that
  // are not done and starts building a plan nobody agreed to.
  const { planApproved } = require('../lib/ledger.js');
  assert.strictEqual(planApproved(parseProgress('').events), false,
    'an empty journal must not read as approval');
  assert.strictEqual(
    planApproved(parseProgress('{"slice":"S1","status":"started"}').events), false,
    'starting work is not the same as the plan having been approved');
  assert.strictEqual(
    planApproved(parseProgress('{"event":"plan-approved"}').events), true);
});

test('an unknown plan-level event is reported, not silently accepted', () => {
  const { events, errors } = parseProgress('{"event":"plan-rewritten"}');
  assert.strictEqual(events.length, 0);
  assert.ok(errors.some((e) => /unknown event "plan-rewritten"/.test(e)));
});

test('approval events do not disturb slice status', () => {
  const slices = parsePlan(PLAN);
  const { events, errors } = parseProgress([
    '{"event":"plan-approved"}',
    '{"slice":"S1","status":"done","evidence":[{"cmd":"npm run build","exit_code":0}]}',
  ].join('\n'));
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(statusOf('S1', events), 'done');
  assert.strictEqual(nextSlice(slices, events).slice.id, 'S2');
});

test('a reverted slice becomes pending again, not done', async () => {
  // Rejecting a slice puts the tree back; the work is to be done differently,
  // not continued. If reverted read as terminal the plan would march past a
  // slice the user explicitly refused.
  const slices = parsePlan(PLAN);
  const { events, errors } = parseProgress([
    '{"event":"plan-approved"}',
    '{"slice":"S1","status":"done","evidence":[{"cmd":"npm run build","exit_code":0}]}',
    '{"slice":"S2","status":"done","evidence":[{"cmd":"npm run lint","exit_code":0}]}',
    '{"slice":"S2","status":"reverted"}',
  ].join('\n'));
  assert.deepStrictEqual(errors, [], 'reverted must be a status the journal accepts');
  assert.strictEqual(statusOf('S2', events), 'reverted');
  const next = nextSlice(slices, events);
  assert.strictEqual(next.slice.id, 'S2', 'a rejected slice was skipped past');
  assert.strictEqual(next.resuming, false, 'a rejected slice starts fresh, it does not resume');
});

test('the foundation is recorded once so later slices need not re-lay it', async () => {
  // Measured on a real run: one slice cost nine dispatches, three of them
  // laying and re-gating a stack profile that already existed and had not
  // changed. The rule that caused it justified itself by saying the write hook
  // blocks builders "while stack-profile.md does not exist" -- a condition that
  // stops being true the moment it does.
  const { foundationPassed } = require('../lib/ledger.js');
  assert.strictEqual(foundationPassed(parseProgress('').events), false);
  assert.strictEqual(
    foundationPassed(parseProgress('{"event":"plan-approved"}').events), false,
    'approving a plan is not the same as gating a foundation');
  assert.strictEqual(
    foundationPassed(parseProgress('{"event":"foundation-passed"}').events), true);

  // Both plan-level events coexist, and an invented one is still rejected.
  const both = parseProgress('{"event":"plan-approved"}\n{"event":"foundation-passed"}');
  assert.deepStrictEqual(both.errors, []);
  assert.strictEqual(parseProgress('{"event":"invented"}').errors.length, 1);
});

test('a ruling that names a slice does not overwrite that slice status', () => {
  // The hazard that made record events dangerous to admit: statusOf() walks
  // events and assigns `status = e.status` for every entry naming the slice.
  // A ruling carrying {"slice":"S1"} and no status would set S1 to undefined
  // and lose it on the next resume. Record events stay out of that array.
  const journal = [
    '{"event":"plan-approved"}',
    '{"slice":"S1","status":"started"}',
    '{"slice":"S1","status":"done"}',
    '{"event":"ruling","slice":"S1","decision":"ISR over static","why":"incumbent","cost_if_wrong":"one config line"}',
  ].join('\n');
  const { events, records, errors } = parseProgress(journal);
  assert.deepStrictEqual(errors, [], 'a ruling was rejected by the journal parser');
  assert.strictEqual(records.length, 1, 'the ruling was not recorded');
  const slices = [{ id: 'S1', title: 't', delivers: 'd', criteria: ['c'] },
                  { id: 'S2', title: 't', delivers: 'd', criteria: ['c'] }];
  const next = nextSlice(slices, events);
  assert.strictEqual(next && next.slice.id, 'S2',
    'a ruling on S1 corrupted its status, so resume went back to a finished slice');
});

test('the journal accepts the record events a real run writes, and still rejects a typo', () => {
  // A live run wrote scope-map-fixed, plan-amended and decision. The parser
  // called all three unknown, so the file that makes resume work was carrying
  // errors nobody surfaced.
  for (const e of ['ruling', 'decision', 'plan-amended', 'scope-map-fixed', 'note']) {
    const { errors } = parseProgress(JSON.stringify({ event: e }));
    assert.deepStrictEqual(errors, [], `the journal rejects the record event "${e}"`);
  }
  const { errors } = parseProgress('{"event":"plan-aproved"}');
  assert.ok(errors.length,
    'the whitelist opened wide, so a misspelled plan-approved now means nothing silently');
});
