'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Claude Code ships bundled skills under fixed names. If a plugin skill
// directory collides, the bundled skill silently shadows ours -- exactly
// what happened when `security-review` here was shadowed by the bundled
// `security-review` skill, which runs `git diff origin/HEAD...` as dynamic
// context and killed the agent during construction in any repo without an
// `origin` remote. Renamed to `security-audit`; this test guards against a
// repeat with any future skill name, by reading the real directory on disk
// so a newly added colliding skill fails the suite.
const AGENTS_DIR = path.join(__dirname, '..', '..', 'agents');
const SKILLS_DIR = path.join(__dirname, '..', '..', 'skills');

const BUNDLED_SKILL_NAMES = [
  'code-review', 'security-review', 'debug', 'loop', 'batch',
  'doctor', 'verify', 'init', 'run', 'schedule', 'simplify',
];

test('no skill under davinci/skills/ uses a name that collides with a Claude Code bundled skill', () => {
  const names = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const collisions = names.filter((n) => BUNDLED_SKILL_NAMES.includes(n));
  assert.deepStrictEqual(collisions, [],
    `skill name(s) collide with bundled Claude Code skills and will be silently shadowed: ${collisions.join(', ')}`);
});

// Agent definitions are markdown with a YAML frontmatter block. We only need
// three keys, so this reads those three rather than pulling in a YAML parser.
function readAgents() {
  return fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const text = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8');
      const end = text.indexOf('\n---', 4);
      if (!text.startsWith('---\n') || end === -1) {
        throw new Error(`${f} has no frontmatter block`);
      }
      const front = text.slice(4, end);
      const toolsLine = front.match(/^tools:[ \t]*(.+)$/m);
      const skillsBlock = front.match(/^skills:\n((?:[ \t]+- .+\n?)+)/m);
      return {
        name: f.slice(0, -3),
        body: text.slice(end + 4),
        tools: toolsLine
          ? toolsLine[1].split(',').map((t) => t.trim()).filter(Boolean)
          : [],
        skills: skillsBlock
          ? skillsBlock[1].split('\n').map((l) => l.replace(/^[ \t]*-[ \t]*/, '').trim()).filter(Boolean)
          : [],
      };
    });
}

test('every skill named in an agent frontmatter exists on disk', () => {
  const available = new Set(fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name));
  const dangling = [];
  for (const agent of readAgents()) {
    for (const skill of agent.skills) {
      if (!available.has(skill)) dangling.push(`${agent.name} -> ${skill}`);
    }
  }
  // A renamed or deleted skill leaves the reference behind and the agent then
  // starts with nothing where its standard should be -- silently, because a
  // missing preload raises no error. This is the `security-review` rename
  // generalised.
  assert.deepStrictEqual(dangling, [],
    `agent(s) reference a skill that does not exist: ${dangling.join(', ')}`);
});

test('every agent that can write project source preloads code-craft', () => {
  // Derived from the write-scope map rather than a list kept here, so an agent
  // added later with a source scope fails this test instead of quietly
  // shipping without the authoring standard.
  const scopeMap = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'scope-map.json'), 'utf8'));
  const writesSource = (name) =>
    (scopeMap[name] || []).some((p) => !p.startsWith('.devteam/'));

  const missing = readAgents()
    .filter((a) => writesSource(a.name) && !a.skills.includes('code-craft'))
    .map((a) => a.name);
  assert.deepStrictEqual(missing, [],
    `agent(s) can write source but do not carry code-craft: ${missing.join(', ')}`);
});

test('an agent told to invoke a skill has the Skill tool to invoke it with', () => {
  const broken = readAgents()
    .filter((a) => /`Skill` tool/.test(a.body) && !a.tools.includes('Skill'))
    .map((a) => a.name);
  // Instructing an agent to use a tool absent from its allowlist does not
  // error -- it improvises something else, and the instruction silently does
  // nothing.
  assert.deepStrictEqual(broken, [],
    `agent(s) instructed to use the Skill tool without it on their tool list: ${broken.join(', ')}`);
});
