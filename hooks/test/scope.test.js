const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { decideScope } = require('../lib/scope.js');
const { decideBash } = require('../lib/bash.js');

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
  for (const f of ['robots.txt', 'package.json', 'scripts/build.js']) {
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
  for (const f of ['package.json', 'config/app.yml']) {
    assert.strictEqual(decideScope(
      { agent_type: 'infra-architect', cwd: '/p', tool_input: { file_path: '/p/' + f } },
      REAL_MAP), null, f + ' should still be writable by infra-architect');
  }
});

test('the real scope map no longer lets infra-architect write into src/lib', () => {
  const d = decideScope(
    { agent_type: 'infra-architect', cwd: '/p', tool_input: { file_path: '/p/src/lib/db/client.ts' } },
    REAL_MAP);
  assert.ok(d, 'infra-architect should no longer own src/lib/** now that backend-engineer exists');
});

test('the real scope map no longer lets infra-architect write app/**', () => {
  const d = decideScope(
    { agent_type: 'infra-architect', cwd: '/p', tool_input: { file_path: '/p/app/layout.tsx' } },
    REAL_MAP);
  assert.ok(d, 'infra-architect should no longer own app/** now that frontend-engineer owns it');
});

test('the real scope map lets backend-engineer write the application data layer', () => {
  for (const f of ['src/api/users.ts', 'src/server/app.ts', 'src/lib/db/client.ts',
    'src/types/user.ts', 'src/index.ts', 'prisma/schema.prisma', 'tests/api/x.test.ts']) {
    assert.strictEqual(decideScope(
      { agent_type: 'backend-engineer', cwd: '/p', tool_input: { file_path: '/p/' + f } },
      REAL_MAP), null, f + ' should be writable by backend-engineer');
  }
});

// The scope-contract fix: the layouts a stack profile reasonably assigned
// (a flat src/server.js entrypoint, a top-level test/ directory, a flat
// src/api.js) were refused because backend-engineer's scope was too narrow
// for them, not because they were the wrong owner. Widened rather than
// reinterpreted -- these are new, additional grants alongside the existing
// src/server/**, tests/api/**, etc.
test('the real scope map lets backend-engineer write the widened flat-layout paths', () => {
  for (const f of ['src/server.js', 'test/health.test.js', 'src/api.js']) {
    assert.strictEqual(decideScope(
      { agent_type: 'backend-engineer', cwd: '/p', tool_input: { file_path: '/p/' + f } },
      REAL_MAP), null, f + ' should be writable by backend-engineer');
  }
});

// test/** (singular) must stay a different root from tests/ui/** (plural),
// which frontend-engineer owns -- the widening must not blur that boundary.
test('the widened test/** grant does not leak into frontend-engineer\'s tests/ui/**', () => {
  const d = decideScope(
    { agent_type: 'backend-engineer', cwd: '/p', tool_input: { file_path: '/p/tests/ui/a.test.js' } },
    REAL_MAP);
  assert.ok(d, 'backend-engineer should not own tests/ui/** just because it now owns test/**');
});

test('the real scope map lets frontend-engineer write app/**', () => {
  assert.strictEqual(decideScope(
    { agent_type: 'frontend-engineer', cwd: '/p', tool_input: { file_path: '/p/app/layout.tsx' } },
    REAL_MAP), null, 'app/layout.tsx should be writable by frontend-engineer');
});

test('an unowned path under src/ is denied for every agent, on purpose', () => {
  // Fail-closed is intended: some paths under src/ (e.g. src/utils/**) are
  // not claimed by any agent. An unowned path must be denied, not silently
  // routed to the nearest plausible owner.
  for (const agent of Object.keys(REAL_MAP)) {
    if (REAL_MAP[agent].length === 0) continue;
    const d = decideScope(
      { agent_type: agent, cwd: '/p', tool_input: { file_path: '/p/src/utils/x.ts' } },
      REAL_MAP);
    assert.ok(d, agent + ' unexpectedly claims src/utils/x.ts');
  }
});

test('every agent shipped on disk is governed by the real scope map', () => {
  // The check that would have caught this increment's new agents being
  // added and left ungoverned: every agents/*.md on disk must have a key
  // in scope-map.json, or its writes are never checked at all.
  const agentsDir = path.join(__dirname, '..', '..', 'agents');
  const shipped = fs.readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3));
  assert.ok(shipped.length > 0, 'expected to find agent definitions on disk');
  for (const agent of shipped) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(REAL_MAP, agent),
      agent + ' is shipped in agents/ but has no entry in scope-map.json');
  }
});

test('both gates are denied a write to an ordinary source path against the real map', () => {
  for (const agent of ['security-engineer', 'code-reviewer']) {
    const d = decideScope(
      { agent_type: agent, cwd: '/proj', tool_input: { file_path: '/proj/src/api/users.ts' } },
      REAL_MAP);
    assert.ok(d && /read-only/.test(d.deny), agent + ' should be denied a write to src/api/users.ts');
  }
});

test('the real scope map denies security-engineer a write-intent Bash command, but allows git diff', () => {
  const write = decideBash(
    { agent_type: 'security-engineer', cwd: '/proj', tool_input: { command: "sed -i 's/a/b/' src/api/users.ts" } },
    REAL_MAP);
  assert.ok(write && /read-only/.test(write.deny));

  const read = decideBash(
    { agent_type: 'security-engineer', cwd: '/proj', tool_input: { command: 'git diff --stat HEAD~1' } },
    REAL_MAP);
  assert.strictEqual(read, null);
});

test('each gate may write its own report against the real scope map', () => {
  for (const agent of ['security-engineer', 'code-reviewer']) {
    assert.strictEqual(decideScope(
      { agent_type: agent, cwd: '/r', tool_input: { file_path: '/r/.devteam/reports/' + agent + '-1.json' } },
      REAL_MAP), null, agent + ' should be able to write its own report');
  }
});

test('each gate may not write the other gate report against the real scope map', () => {
  const pairs = [
    ['security-engineer', 'code-reviewer'],
    ['code-reviewer', 'security-engineer'],
  ];
  for (const [agent, other] of pairs) {
    const d = decideScope(
      { agent_type: agent, cwd: '/r', tool_input: { file_path: '/r/.devteam/reports/' + other + '-1.json' } },
      REAL_MAP);
    assert.ok(d && /read-only/.test(d.deny), agent + ' should not be able to write ' + other + "'s report");
  }
});

test('each gate may not write an ordinary source path against the real scope map', () => {
  for (const agent of ['security-engineer', 'code-reviewer']) {
    const d = decideScope(
      { agent_type: agent, cwd: '/r', tool_input: { file_path: '/r/src/x.ts' } },
      REAL_MAP);
    assert.ok(d && /read-only/.test(d.deny), agent + ' should be denied a write to src/x.ts');
  }
});

test('each gate is still denied a write-intent Bash command, while git diff is still allowed', () => {
  for (const agent of ['security-engineer', 'code-reviewer']) {
    const write = decideBash(
      { agent_type: agent, cwd: '/r', tool_input: { command: "sed -i 's/a/b/' src/x.ts" } },
      REAL_MAP);
    assert.ok(write && /read-only/.test(write.deny), agent + ' should be denied a write-intent Bash command');

    const read = decideBash(
      { agent_type: agent, cwd: '/r', tool_input: { command: 'git diff --stat HEAD~1' } },
      REAL_MAP);
    assert.strictEqual(read, null, agent + ' should still be allowed git diff');
  }
});

test('review-lens is present in the real scope map', () => {
  assert.ok(
    Object.prototype.hasOwnProperty.call(REAL_MAP, 'review-lens'),
    'review-lens should have an entry in scope-map.json');
});

test('review-lens may write its own report against the real scope map', () => {
  assert.strictEqual(decideScope(
    { agent_type: 'review-lens', cwd: '/r', tool_input: { file_path: '/r/.devteam/reports/review-lens-1.json' } },
    REAL_MAP), null);
});

test('review-lens may not write an ordinary source path against the real scope map', () => {
  const d = decideScope(
    { agent_type: 'review-lens', cwd: '/r', tool_input: { file_path: '/r/src/x.ts' } },
    REAL_MAP);
  assert.ok(d && /read-only/.test(d.deny), 'review-lens should be denied a write to src/x.ts');
});

test('review-lens may not write another agent report against the real scope map', () => {
  const d = decideScope(
    { agent_type: 'review-lens', cwd: '/r', tool_input: { file_path: '/r/.devteam/reports/code-reviewer-1.json' } },
    REAL_MAP);
  assert.ok(d && /read-only/.test(d.deny), 'review-lens should not be able to write code-reviewer\'s report');
});

test('review-lens is denied a write-intent Bash command, but allowed git diff, against the real map', () => {
  const write = decideBash(
    { agent_type: 'review-lens', cwd: '/r', tool_input: { command: "sed -i 's/a/b/' src/x.ts" } },
    REAL_MAP);
  assert.ok(write && /read-only/.test(write.deny));

  const read = decideBash(
    { agent_type: 'review-lens', cwd: '/r', tool_input: { command: 'git diff --stat HEAD~1' } },
    REAL_MAP);
  assert.strictEqual(read, null);
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
    'tsconfig.json', 'src/api/users.ts', 'src/server/app.ts', 'src/lib/db/client.ts',
    'src/types/user.ts', 'src/index.ts', 'prisma/schema.prisma', 'tests/api/x.test.ts',
    'app/layout.tsx', 'src/server.js', 'test/health.test.js', 'src/api.js',
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
