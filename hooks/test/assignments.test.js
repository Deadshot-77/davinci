'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { validateAssignments, decideWorkerWrite } = require('../lib/assignments.js');
const { decideScope } = require('../lib/scope.js');

const MAP = {
  'frontend-engineer': ['components/**', 'app/**'],
  'backend-engineer': ['src/api/**'],
  implementer: [],
};

function doc(overrides) {
  return Object.assign({
    batch: 's3-beat-one',
    lead: 'frontend-engineer',
    assignments: [
      { label: 'pillars', paths: ['components/home/Pillars.tsx'] },
      { label: 'audience', paths: ['components/home/Audience.tsx'] },
    ],
  }, overrides);
}

// --- the two properties parallel writers depend on -------------------------

test('a path assigned to two workers is rejected', () => {
  // The race this whole file exists to prevent. Two agents editing one file do
  // not merge -- the second overwrites whatever the first wrote, and neither
  // knows it happened.
  const errors = validateAssignments(doc({
    assignments: [
      { label: 'a', paths: ['components/home/Pillars.tsx'] },
      { label: 'b', paths: ['components/home/Pillars.tsx'] },
    ],
  }), MAP);
  assert.ok(errors.some((e) => /assigned to both/.test(e)), errors.join(' | '));
});

test('a path outside the dispatching lead own scope is rejected', () => {
  // Without this, spawning a worker is a way around the scope map rather than
  // a way to work inside it faster: a frontend lead could have a worker write
  // the API layer it is not allowed to touch itself.
  const errors = validateAssignments(doc({
    assignments: [{ label: 'sneaky', paths: ['src/api/routes.ts'] }],
  }), MAP);
  assert.ok(errors.some((e) => /outside/.test(e) && /own scope/.test(e)), errors.join(' | '));
});

test('a well-formed batch validates clean', () => {
  assert.deepStrictEqual(validateAssignments(doc(), MAP), []);
});

test('a lead that is not in the scope map is rejected', () => {
  const errors = validateAssignments(doc({ lead: 'nobody' }), MAP);
  assert.ok(errors.some((e) => /no entry in the scope map/.test(e)), errors.join(' | '));
});

// --- claiming --------------------------------------------------------------

test('the first worker to write an assignment claims it', () => {
  const r = decideWorkerWrite({
    rel: 'components/home/Pillars.tsx', agent: 'implementer', agentId: 'w1',
    doc: doc(), claims: null, scopeMap: MAP,
  });
  assert.ok(r.allow, JSON.stringify(r));
  assert.strictEqual(r.claims.byIndex['0'], 'w1');
});

test('a second worker reaching into a claimed assignment is denied and told why', () => {
  const r = decideWorkerWrite({
    rel: 'components/home/Pillars.tsx', agent: 'implementer', agentId: 'w2',
    doc: doc(), claims: { batch: 's3-beat-one', byIndex: { 0: 'w1' } }, scopeMap: MAP,
  });
  assert.ok(r.deny, 'a second worker was allowed into a file another worker holds');
  assert.match(r.deny, /another worker is already writing/);
});

test('a worker keeps writing its own assignment across every file in it', () => {
  const d = doc({
    assignments: [{
      label: 'pillars',
      paths: ['components/home/Pillars.tsx', 'components/home/Pillars.module.css'],
    }],
  });
  const claims = { batch: d.batch, byIndex: { 0: 'w1' } };
  for (const rel of d.assignments[0].paths) {
    const r = decideWorkerWrite({ rel, agent: 'implementer', agentId: 'w1', doc: d, claims, scopeMap: MAP });
    assert.ok(r.allow, 'holder was denied its own path ' + rel + ': ' + r.deny);
  }
});

test('claims from a previous batch do not block the next one', () => {
  // The lead names a new batch and the old claims retire themselves. Without
  // this the lead has to delete a file by hand, and a forgotten cleanup denies
  // a live worker for a reason nothing on screen explains.
  const r = decideWorkerWrite({
    rel: 'components/home/Pillars.tsx', agent: 'implementer', agentId: 'w9',
    doc: doc({ batch: 's4-beats' }),
    claims: { batch: 's3-beat-one', byIndex: { 0: 'w1' } }, scopeMap: MAP,
  });
  assert.ok(r.allow, 'a stale claim from an earlier batch blocked a new worker');
  assert.strictEqual(r.claims.batch, 's4-beats');
});

// --- failing closed --------------------------------------------------------

test('a path in no assignment is denied', () => {
  const r = decideWorkerWrite({
    rel: 'app/page.tsx', agent: 'implementer', agentId: 'w1',
    doc: doc(), claims: null, scopeMap: MAP,
  });
  assert.ok(r.deny, 'a worker took a file nobody assigned it');
  assert.match(r.deny, /is in no assignment/);
});

test('no assignments file at all means no worker writes, and says who writes one', () => {
  // Failing closed here is enforced twice over -- validateAssignments rejects a
  // null document too -- so this asserts the part that is not redundant: the
  // denial has to tell the worker that its lead owns the file, or the worker
  // tries to write one itself and picks its own scope, which is the exact thing
  // the partition exists to stop.
  const r = decideWorkerWrite({
    rel: 'components/home/Pillars.tsx', agent: 'implementer', agentId: 'w1',
    doc: null, claims: null, scopeMap: MAP,
  });
  assert.ok(r.deny, 'a worker wrote with nothing declaring what it owns');
  assert.match(r.deny, /lead writes that file/,
    'the denial does not say who produces the assignments file, so a blocked worker will write its own');
  assert.match(r.deny, /never picks its own paths/,
    'nothing stops the worker concluding it may choose its own scope');
});

test('an invalid assignments file is not more permissive than a valid one', () => {
  // The failure mode to avoid is a guard that opens when it breaks. An
  // overlapping partition is exactly when writes are most dangerous, so it
  // must deny rather than fall through to allowing.
  const r = decideWorkerWrite({
    rel: 'components/home/Pillars.tsx', agent: 'implementer', agentId: 'w1',
    doc: doc({
      assignments: [
        { label: 'a', paths: ['components/home/Pillars.tsx'] },
        { label: 'b', paths: ['components/home/Pillars.tsx'] },
      ],
    }),
    claims: null, scopeMap: MAP,
  });
  assert.ok(r.deny, 'an overlapping partition allowed a write');
  assert.match(r.deny, /not usable/);
});

// --- integration through decideScope ---------------------------------------

function write(agent, rel, workers, agentId) {
  return decideScope(
    {
      agent_type: agent,
      agent_id: agentId || 'w1',
      cwd: '/proj',
      tool_input: { file_path: '/proj/' + rel },
    },
    MAP,
    new Set(['implementer', 'frontend-engineer']),
    { hasStackProfile: true, routeDirect: false },
    workers);
}

test('an implementer with an assignment is allowed and gets a claim to persist', () => {
  const d = write('implementer', 'components/home/Pillars.tsx', { doc: doc(), claims: null });
  assert.ok(d && d.allow, 'the worker branch did not allow an assigned path: ' + JSON.stringify(d));
  assert.ok(d.claims, 'no claim was returned, so nothing stops a second worker taking the same file');
});

test('an implementer is never treated as read-only despite its empty scope entry', () => {
  // implementer holds an empty scope so the disjointness test over the real map
  // keeps passing. That empty entry would otherwise read as "read-only", so the
  // worker branch has to be reached before that rule.
  const d = write('implementer', 'components/home/Pillars.tsx', { doc: doc(), claims: null });
  assert.ok(!(d && d.deny && /read-only/.test(d.deny)),
    'the empty scope entry made the worker read-only, so workers could never write anything');
});

test('an implementer write is denied through the hook when the path is unassigned', () => {
  const d = write('implementer', 'app/page.tsx', { doc: doc(), claims: null });
  assert.ok(d && d.deny, 'the hook allowed a worker into a file nobody assigned it');
});

test('a non-worker agent is unaffected by the assignments file', () => {
  assert.strictEqual(
    write('frontend-engineer', 'components/home/Pillars.tsx', { doc: doc(), claims: null }), null,
    'the lead was blocked from its own scope by a file meant to govern its workers');
});

test('a worker still may not write before the foundation exists', () => {
  const d = decideScope(
    {
      agent_type: 'implementer', agent_id: 'w1', cwd: '/proj',
      tool_input: { file_path: '/proj/components/home/Pillars.tsx' },
    },
    MAP, new Set(['implementer']),
    { hasStackProfile: false, routeDirect: false },
    { doc: doc(), claims: null });
  assert.ok(d && d.deny, 'a worker wrote code before any stack profile existed');
  assert.match(d.deny, /stack-profile/);
});

// --- who may write the batch file ------------------------------------------

test('a lead may write the assignments file; a worker and a gate may not', () => {
  // The mechanism is dead on arrival if the lead cannot write the file, and
  // self-defeating if a worker can: choosing your own assignment is choosing
  // your own scope. Both were true of the first version of this code.
  const REAL = JSON.parse(require('fs').readFileSync(
    require('path').join(__dirname, '..', 'scope-map.json'), 'utf8'));
  const known = new Set(Object.keys(REAL));
  const ask = (agent) => decideScope(
    { agent_type: agent, agent_id: 'w1', cwd: '/proj', tool_input: { file_path: '/proj/.devteam/assignments.json' } },
    REAL, known, { hasStackProfile: true, routeDirect: false }, { doc: null, claims: null });

  for (const lead of ['frontend-engineer', 'backend-engineer']) {
    assert.strictEqual(ask(lead), null, lead + ' cannot write the batch file its own workers are governed by');
  }
  for (const other of ['implementer', 'code-reviewer', 'infra-architect', 'security-engineer']) {
    assert.ok(ask(other), other + ' may write the assignments file, and so may govern workers it does not dispatch');
  }
});
