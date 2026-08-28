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

// The tier vocabulary is a closed set, the same way `status` and `verdict` are.
// Those two were left loose once and agents invented `partial` and
// `pass-with-findings`; a tier the lead names and a gate does not recognise
// silently drops the work to the wrong strictness instead of erroring.
function definedTiers() {
  const skill = fs.readFileSync(
    path.join(SKILLS_DIR, 'work-tiers', 'SKILL.md'), 'utf8');
  const section = skill.split('## The three tiers')[1];
  if (!section) throw new Error('work-tiers has no "The three tiers" section');
  return [...section.matchAll(/^### ([a-z-]+)$/gm)].map((m) => m[1]);
}

test('every tier defined in work-tiers is spoken by every agent that must tell them apart', () => {
  const tiers = definedTiers();
  assert.ok(tiers.length >= 2, 'expected work-tiers to define tiers, found ' + tiers.length);

  // The lead assigns a tier, the gate sets its fan-out depth from it, and the
  // builders decide from it whether a revision pass is owed. All three branch
  // on which tier it is, so all three must know every name. A tier renamed in
  // the skill and not here leaves them reading a word nobody sends.
  const distinguishAll = [
    'tech-lead', 'code-reviewer',
    'backend-engineer', 'frontend-engineer', 'infra-architect',
  ];
  // review-lens takes one binary branch -- CRAFT blocks on load-bearing and is
  // advisory on anything else -- so it needs that one name and no more.
  const needsLoadBearingOnly = ['review-lens'];

  const byName = new Map(readAgents().map((a) => [a.name, a]));
  const missing = [];
  const check = (name, wanted) => {
    const agent = byName.get(name);
    assert.ok(agent, name + '.md is missing');
    for (const tier of wanted) {
      if (!agent.body.includes(tier)) missing.push(name + ' -> ' + tier);
    }
  };
  for (const name of distinguishAll) check(name, tiers);
  for (const name of needsLoadBearingOnly) {
    assert.ok(tiers.includes('load-bearing'),
      'work-tiers no longer defines a load-bearing tier; review-lens branches on it');
    check(name, ['load-bearing']);
  }

  assert.deepStrictEqual(missing, [],
    'agent(s) never mention a tier they are required to act on: ' + missing.join(', '));
});

test('CRAFT is never described as blocking without its load-bearing restriction', () => {
  // CRAFT blocks regardless of the brief, like SECURITY, but only on
  // load-bearing work. Drop that restriction anywhere and the criterion becomes
  // a universal blocker: review churn over fixtures, which costs delivery and
  // improves nothing.
  const unrestricted = readAgents()
    .filter((a) => a.body.includes('CRAFT') && !a.body.includes('load-bearing'))
    .map((a) => a.name);
  assert.deepStrictEqual(unrestricted, [],
    'agent(s) cite CRAFT without restricting it to load-bearing work: ' + unrestricted.join(', '));
});

test('the tier that gates the reversibility question is one work-tiers defines', () => {
  // The asking rule in delegation-contract turns on a literal tier name. Rename
  // the tier in work-tiers and the rule silently stops applying to anything --
  // agents keep reading a condition that can never be true, and the second
  // trigger disappears without an error anywhere.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'work-tiers', 'SKILL.md'), 'utf8');
  const section = skill.split('## The three tiers')[1];
  assert.ok(section, 'work-tiers has no "The three tiers" section');
  const tiers = [...section.matchAll(/^### ([a-z-]+)$/gm)].map((m) => m[1]);

  const contract = fs.readFileSync(
    path.join(SKILLS_DIR, 'delegation-contract', 'SKILL.md'), 'utf8');
  const asking = contract.split('## Asking a question')[1];
  assert.ok(asking, 'delegation-contract has no "Asking a question" section');

  const named = tiers.filter((t) => asking.includes(t));
  assert.ok(named.includes('load-bearing'),
    'the asking rule names a tier work-tiers does not define, or work-tiers no longer ' +
    'defines load-bearing; the reversibility trigger would never fire. tiers: ' + tiers.join(', '));
});

/* ---------- the entry path ---------- */

const PLUGIN_ROOT = path.join(__dirname, '..', '..');

test('the plugin does not put any agent on the main thread', () => {
  // A settings.json declaring an "agent" half-installs it: the prompt arrives,
  // the identity, the declared tools and every preloaded skill do not. Probed
  // twice, the entry agent named itself "davinci:orchestrator" once and
  // "davinci:product-manager" the next, had intake-brief in context neither
  // time, invented a classification outside the closed set, and ended a run
  // having only asked questions with nothing built.
  const settings = path.join(PLUGIN_ROOT, 'settings.json');
  if (!fs.existsSync(settings)) return;
  const parsed = JSON.parse(fs.readFileSync(settings, 'utf8').replace(/^\uFEFF/, ''));
  assert.ok(!Object.prototype.hasOwnProperty.call(parsed, 'agent'),
    'settings.json declares a main-thread agent again; that configuration silently ' +
    'strips the entry agent of its skills, its tools and its identity');
});

test('the entry command dispatches an agent this plugin actually ships', () => {
  // The command is the documented way in. If it names an agent that does not
  // exist -- a rename, a typo -- the only supported entry point fails at the
  // one moment a new user is watching.
  const dir = path.join(PLUGIN_ROOT, 'commands');
  const commands = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    : [];
  assert.ok(commands.length > 0, 'the plugin ships no entry command');

  const shipped = new Set(fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3)));

  const broken = [];
  for (const file of commands) {
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    const named = [...body.matchAll(/`davinci:([a-z-]+)`/g)].map((m) => m[1]);
    assert.ok(named.length > 0, file + ' names no agent to dispatch');
    for (const agent of named) {
      if (!shipped.has(agent)) broken.push(file + ' -> davinci:' + agent);
    }
  }
  assert.deepStrictEqual(broken, [],
    'entry command(s) dispatch an agent that does not exist: ' + broken.join(', '));
});

test('the entry command carries the user request through', () => {
  // Without the substitution token the command runs with no request in it and
  // the team builds whatever it imagines.
  const dir = path.join(PLUGIN_ROOT, 'commands');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.ok(body.includes('$ARGUMENTS'),
      file + ' never substitutes $ARGUMENTS, so the request never reaches the team');
  }
});
