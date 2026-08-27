const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeAgentType } = require('../lib/agents.js');
const { decideScope } = require('../lib/scope.js');
const { decideBash } = require('../lib/bash.js');

const MAP = { 'code-reviewer': [], 'frontend-engineer': ['src/app/**'] };
const KNOWN = new Set(['code-reviewer', 'frontend-engineer', 'tech-lead', 'newcomer']);

test('a plugin-namespaced agent type is reduced to its bare name', () => {
  assert.strictEqual(normalizeAgentType('davinci:infra-architect'), 'infra-architect');
  assert.strictEqual(normalizeAgentType('infra-architect'), 'infra-architect');
  assert.strictEqual(normalizeAgentType(undefined), '');
});

test('a namespaced read-only agent is still denied', () => {
  const d = decideScope(
    { agent_type: 'davinci:code-reviewer', cwd: '/p', tool_input: { file_path: '/p/src/x.ts' } }, MAP);
  assert.ok(d && /read-only/.test(d.deny));
});

test('a namespaced builder is still scope-checked', () => {
  assert.strictEqual(decideScope(
    { agent_type: 'davinci:frontend-engineer', cwd: '/p', tool_input: { file_path: '/p/src/app/a.tsx' } }, MAP), null);
  assert.ok(decideScope(
    { agent_type: 'davinci:frontend-engineer', cwd: '/p', tool_input: { file_path: '/p/src/api/a.ts' } }, MAP));
});

test('a Davinci agent missing from the scope map is denied, not allowed', () => {
  const d = decideScope(
    { agent_type: 'davinci:newcomer', cwd: '/p', tool_input: { file_path: '/p/src/x.ts' } }, MAP, KNOWN);
  assert.ok(d && /no entry in scope-map/.test(d.deny));
});

test('an agent that is not ours is still never governed', () => {
  assert.strictEqual(decideScope(
    { agent_type: 'general-purpose', cwd: '/p', tool_input: { file_path: '/p/src/x.ts' } }, MAP, KNOWN), null);
});

test('the same rules apply to write-intent bash commands', () => {
  assert.ok(decideBash({ agent_type: 'davinci:code-reviewer', cwd: '/p', tool_input: { command: 'echo x > a' } }, MAP));
  assert.ok(decideBash({ agent_type: 'davinci:newcomer', cwd: '/p', tool_input: { command: 'echo x > a' } }, MAP, KNOWN));
});

test('knownAgents with no argument resolves the shipped agents directory', () => {
  const { knownAgents } = require('../lib/agents.js');
  const names = knownAgents();
  for (const name of ['davinci', 'tech-lead', 'infra-architect', 'code-reviewer']) {
    assert.ok(names.has(name), `expected knownAgents() to contain ${name}`);
  }
});
