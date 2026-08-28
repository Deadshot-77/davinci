const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validateProjectScopeMap, effectiveScopeMap } = require('../lib/scope-map.js');
const { decideScope } = require('../lib/scope.js');

const SHIPPED = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scope-map.json'), 'utf8'));

const ASTRO = {
  'frontend-engineer': ['src/pages/**', 'src/content/**', 'src/layouts/**', 'public/**'],
  'backend-engineer': ['src/lib/server/**', 'db/**'],
};

test('no project map leaves the shipped map in force', () => {
  const { map, source } = effectiveScopeMap(SHIPPED, '');
  assert.strictEqual(source, 'shipped');
  assert.deepStrictEqual(map, SHIPPED);
});

test('a valid project map takes effect', () => {
  // The whole point: Astro puts routes under src/pages/**, which the shipped
  // map does not mention at all.
  const { map, source, errors } = effectiveScopeMap(SHIPPED, JSON.stringify(ASTRO));
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(source, 'project');
  assert.deepStrictEqual(map['frontend-engineer'], ASTRO['frontend-engineer']);

  assert.strictEqual(decideScope(
    { agent_type: 'frontend-engineer', cwd: '/p', tool_input: { file_path: '/p/src/pages/index.astro' } },
    map), null, 'src/pages/index.astro should be writable under the project map');
});

test('an agent the project map does not mention keeps its shipped scope', () => {
  // A map specialising the frontend must not silently strip everyone else.
  const { map } = effectiveScopeMap(SHIPPED, JSON.stringify({ 'frontend-engineer': ['src/pages/**'] }));
  assert.deepStrictEqual(map['infra-architect'], SHIPPED['infra-architect']);
  assert.deepStrictEqual(map['code-reviewer'], SHIPPED['code-reviewer']);
});

test('a project map cannot invent an agent', () => {
  const errors = validateProjectScopeMap({ 'devops-engineer': ['infra/**'] }, SHIPPED);
  assert.ok(errors.some((e) => /not an agent this plugin ships/.test(e)), errors.join(' | '));
});

test('a project map cannot turn a gate into a builder', () => {
  // The safety property that matters most: an auditor who can patch its own
  // findings is grading its own homework, and no per-project layout needs that.
  for (const gate of ['code-reviewer', 'review-lens', 'security-engineer']) {
    const errors = validateProjectScopeMap({ [gate]: ['src/**'] }, SHIPPED);
    assert.ok(errors.some((e) => /may not be turned into a builder/.test(e)),
      gate + ' was allowed source scope: ' + errors.join(' | '));
  }
});

test('a project map cannot widen itself or reach other coordination state', () => {
  for (const glob of [
    '.devteam/scope-map.json',
    '.devteam/reports/**',
    '.devteam/brief.md',
    '.devteam/stack-profile.md',
    '.devteam/scratch/code-reviewer/**',
  ]) {
    const errors = validateProjectScopeMap({ 'backend-engineer': [glob] }, SHIPPED);
    assert.ok(errors.some((e) => /may not assign anything under \.devteam\//.test(e)),
      glob + ' was allowed: ' + errors.join(' | '));
  }
});

test('an agent may still be given its own scratch directory', () => {
  assert.deepStrictEqual(
    validateProjectScopeMap({ 'review-lens': ['.devteam/scratch/review-lens/**'] }, SHIPPED), []);
});

test('a project map cannot escape the project', () => {
  for (const glob of ['/etc/**', '../other-project/**', 'C:/Windows/**', 'src/../../elsewhere/**']) {
    const errors = validateProjectScopeMap({ 'backend-engineer': [glob] }, SHIPPED);
    assert.ok(errors.some((e) => /absolute or escapes/.test(e)),
      glob + ' was allowed: ' + errors.join(' | '));
  }
});

test('a project map must keep scopes disjoint', () => {
  // Two agents dispatched in one message write concurrently; a shared glob is
  // how they land in the same file.
  const errors = validateProjectScopeMap({
    'frontend-engineer': ['src/shared/**'],
    'backend-engineer': ['src/shared/**'],
  }, SHIPPED);
  assert.ok(errors.some((e) => /must be disjoint/.test(e)), errors.join(' | '));
});

test('a project map that is not an object is rejected', () => {
  for (const bad of [[], 'nope', 42, null]) {
    assert.ok(validateProjectScopeMap(bad, SHIPPED).length > 0, JSON.stringify(bad) + ' was accepted');
  }
});

test('an entry that is not an array of globs is rejected', () => {
  assert.ok(validateProjectScopeMap({ 'backend-engineer': 'src/**' }, SHIPPED)
    .some((e) => /array of non-empty glob strings/.test(e)));
  assert.ok(validateProjectScopeMap({ 'backend-engineer': ['src/**', ''] }, SHIPPED)
    .some((e) => /array of non-empty glob strings/.test(e)));
});

test('unparseable JSON falls back to the shipped map rather than throwing', () => {
  const { map, source, errors } = effectiveScopeMap(SHIPPED, '{ not json');
  assert.strictEqual(source, 'shipped');
  assert.deepStrictEqual(map, SHIPPED);
  assert.ok(errors.some((e) => /not valid JSON/.test(e)));
});

test('an invalid project map falls back to the shipped map, never to no map', () => {
  // Falling back to an empty map would mean every agent is ungoverned, which is
  // the one outcome worse than the wrong scopes.
  const { map, source, errors } = effectiveScopeMap(SHIPPED, JSON.stringify({ 'code-reviewer': ['src/**'] }));
  assert.strictEqual(source, 'shipped');
  assert.deepStrictEqual(map, SHIPPED);
  assert.ok(errors.length > 0);

  // And the gate it tried to promote is still refused.
  assert.ok(decideScope(
    { agent_type: 'code-reviewer', cwd: '/p', tool_input: { file_path: '/p/src/x.ts' } }, map));
});

test('a project map does not loosen the ban on writing outside the project', () => {
  const { map } = effectiveScopeMap(SHIPPED, JSON.stringify(ASTRO));
  const d = decideScope(
    { agent_type: 'frontend-engineer', cwd: '/p', tool_input: { file_path: '/etc/passwd' } }, map);
  assert.ok(d && /outside the project/.test(d.deny));
});
