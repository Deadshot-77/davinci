const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { decideScope } = require('../lib/scope.js');

const REAL_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scope-map.json'), 'utf8'));

const MAP = {
  'tech-lead': [],
  'code-reviewer': [],
  'frontend-engineer': ['src/app/**', 'public/**'],
};

function input(agent, file) {
  return { agent_type: agent, cwd: '/proj', tool_input: { file_path: '/proj/' + file } };
}

test('builder writing inside its scope is allowed', () => {
  assert.strictEqual(decideScope(input('frontend-engineer', 'src/app/page.tsx'), MAP), null);
});

test('builder writing outside its scope is denied', () => {
  const d = decideScope(input('frontend-engineer', 'src/api/users.ts'), MAP);
  assert.ok(d && d.deny.includes('src/api/users.ts'));
});

test('read-only agent is denied any write', () => {
  const d = decideScope(input('code-reviewer', 'src/app/page.tsx'), MAP);
  assert.ok(d && /read-only/.test(d.deny));
});

test('any agent may write its own report', () => {
  assert.strictEqual(
    decideScope(input('code-reviewer', '.devteam/reports/code-reviewer-1.json'), MAP), null);
});

test('an agent may not write another agent report', () => {
  const d = decideScope(input('code-reviewer', '.devteam/reports/tech-lead-1.json'), MAP);
  assert.ok(d && /read-only/.test(d.deny));
});

test('unknown agent is not governed', () => {
  assert.strictEqual(decideScope(input('general-purpose', 'anywhere.ts'), MAP), null);
});

test('main session with no agent_type is not governed', () => {
  assert.strictEqual(decideScope({ cwd: '/proj', tool_input: { file_path: '/proj/x.ts' } }, MAP), null);
});

test('writing outside the project root is denied', () => {
  const d = decideScope(
    { agent_type: 'frontend-engineer', cwd: '/proj', tool_input: { file_path: '/etc/passwd' } }, MAP);
  assert.ok(d && /outside the project/.test(d.deny));
});

test('governed agent with an unrecognisable input shape is denied, not allowed', () => {
  const d = decideScope(
    { agent_type: 'frontend-engineer', cwd: '/proj', tool_input: { weird_key: '/proj/src/app/x.tsx' } }, MAP);
  assert.ok(d && /no recognisable file path/.test(d.deny));
});

test('notebook_path is recognised as a write target', () => {
  const d = decideScope(
    { agent_type: 'code-reviewer', cwd: '/proj', tool_input: { notebook_path: '/proj/analysis.ipynb' } }, MAP);
  assert.ok(d && /read-only/.test(d.deny));
});

test('ungoverned agent with an unrecognisable input shape still gets no decision', () => {
  assert.strictEqual(
    decideScope({ agent_type: 'general-purpose', cwd: '/proj', tool_input: { weird_key: 'x' } }, MAP), null);
});

test('a path normalising to exactly .. is denied as outside the project', () => {
  const d = decideScope(
    { agent_type: 'frontend-engineer', cwd: '/proj/sub', tool_input: { file_path: '/proj' } }, MAP);
  assert.ok(d && /outside the project/.test(d.deny));
});

test('the real scope map lets infra-architect write the stack profile it owns', () => {
  assert.strictEqual(decideScope(
    { agent_type: 'infra-architect', cwd: '/proj', tool_input: { file_path: '/proj/.devteam/stack-profile.md' } },
    REAL_MAP), null);
});

test('the real scope map lets davinci write the brief it owns', () => {
  assert.strictEqual(decideScope(
    { agent_type: 'davinci', cwd: '/proj', tool_input: { file_path: '/proj/.devteam/brief.md' } },
    REAL_MAP), null);
});

test('the real scope map keeps every gate agent read-only', () => {
  for (const agent of ['security-engineer', 'code-reviewer', 'tech-lead']) {
    const d = decideScope(
      { agent_type: agent, cwd: '/proj', tool_input: { file_path: '/proj/src/x.ts' } }, REAL_MAP);
    assert.ok(d && /read-only/.test(d.deny), agent + ' should be read-only');
  }
});

test('the real scope map actually governs davinci', () => {
  const d = decideScope(
    { agent_type: 'davinci', cwd: '/proj', tool_input: { file_path: '/proj/src/x.ts' } }, REAL_MAP);
  assert.ok(d, 'davinci is absent from the scope map, so it is ungoverned');
});

test('the real scope map actually governs infra-architect', () => {
  const d = decideScope(
    { agent_type: 'infra-architect', cwd: '/proj', tool_input: { file_path: '/proj/.devteam/brief.md' } }, REAL_MAP);
  assert.ok(d, 'infra-architect is absent from the scope map, or its scope is too wide');
});

test('the real scope map lets infra-architect scaffold ordinary config and structure files', () => {
  for (const f of ['robots.txt', 'package.json', 'src/lib/a.ts']) {
    assert.strictEqual(decideScope(
      { agent_type: 'davinci:infra-architect', cwd: '/p', tool_input: { file_path: '/p/' + f } },
      REAL_MAP), null, f + ' should be writable by the scaffolder');
  }
});

test('widening the scaffolder scope did not let it reach another agent report', () => {
  assert.ok(decideScope(
    { agent_type: 'infra-architect', cwd: '/p', tool_input: { file_path: '/p/.devteam/reports/tech-lead-1.json' } },
    REAL_MAP));
});

test('the real scope map lets frontend-engineer write markup and styling', () => {
  for (const f of ['index.html', 'src/components/Hero.tsx', 'src/styles/a.css', 'public/img.svg']) {
    assert.strictEqual(decideScope(
      { agent_type: 'frontend-engineer', cwd: '/p', tool_input: { file_path: '/p/' + f } },
      REAL_MAP), null, f + ' should be writable by frontend-engineer');
  }
});

test('the real scope map no longer lets infra-architect write markup', () => {
  const d = decideScope(
    { agent_type: 'infra-architect', cwd: '/p', tool_input: { file_path: '/p/index.html' } },
    REAL_MAP);
  assert.ok(d, 'infra-architect should no longer own index.html now that frontend-engineer exists');
});

test('the real scope map still lets infra-architect write structure and config', () => {
  for (const f of ['package.json', 'src/lib/x.ts']) {
    assert.strictEqual(decideScope(
      { agent_type: 'infra-architect', cwd: '/p', tool_input: { file_path: '/p/' + f } },
      REAL_MAP), null, f + ' should still be writable by infra-architect');
  }
});

test('no path is allowed for more than one scoped agent in the real map', () => {
  // Behavioural check, not a glob-string comparison: two agents can own
  // scopes that overlap in practice (e.g. one agent's "src/**" swallowing
  // another's "src/app/**") without ever sharing an identical glob string.
  // Route each representative path through decideScope for every agent that
  // has a non-empty scope, and require at most one to allow it.
  const paths = [
    'index.html', 'styles.css', 'src/app/page.tsx', 'src/components/Hero.tsx',
    'src/styles/a.css', 'tests/ui/a.test.js', 'package.json', 'src/lib/db.ts',
    'tsconfig.json',
  ];
  const scopedAgents = Object.keys(REAL_MAP).filter((a) => REAL_MAP[a].length > 0);

  for (const p of paths) {
    const allowedBy = scopedAgents.filter((agent) => decideScope(
      { agent_type: agent, cwd: '/r', tool_input: { file_path: '/r/' + p } },
      REAL_MAP) === null);
    assert.ok(
      allowedBy.length <= 1,
      p + ' is allowed for more than one agent: ' + allowedBy.join(', ') +
      ' — the disjoint-scope guarantee is broken for this path.');
  }
});
