const { test } = require('node:test');
const assert = require('node:assert');
const { decideBash } = require('../lib/bash.js');

const MAP = { 'code-reviewer': [], 'frontend-engineer': ['src/app/**'] };

function cmd(agent, command) {
  return { agent_type: agent, cwd: '/proj', tool_input: { command } };
}

test('a read-only agent may still run read-only commands', () => {
  assert.strictEqual(decideBash(cmd('code-reviewer', 'git diff --stat HEAD~1'), MAP), null);
  assert.strictEqual(decideBash(cmd('code-reviewer', 'npm test'), MAP), null);
  assert.strictEqual(decideBash(cmd('code-reviewer', 'grep -rn TODO src/'), MAP), null);
});

test('a read-only agent may not redirect output into a file', () => {
  assert.ok(decideBash(cmd('code-reviewer', 'echo hacked > src/x.ts'), MAP));
});

test('a read-only agent may not use sed -i', () => {
  assert.ok(decideBash(cmd('code-reviewer', "sed -i 's/a/b/' src/x.ts"), MAP));
});

test('a read-only agent may not shell out to a scripting one-liner', () => {
  assert.ok(decideBash(cmd('code-reviewer', 'node -e "require(\'fs\').writeFileSync(\'x\',\'y\')"'), MAP));
});

test('an agent with a real write scope is not guarded by this hook', () => {
  assert.strictEqual(decideBash(cmd('frontend-engineer', 'echo x > src/app/page.tsx'), MAP), null);
});

test('an ungoverned agent is never guarded', () => {
  assert.strictEqual(decideBash(cmd('general-purpose', 'rm -rf /'), MAP), null);
});
