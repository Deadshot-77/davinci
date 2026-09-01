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

  // A `davinci:` reference names either an agent to dispatch or a skill to
  // invoke, and both must exist. The command names work-ledger, which is a
  // skill, so resolving only against agents would fail on a correct reference.
  const shippedAgents = new Set(fs.readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3)));
  const shipped = new Set([...shippedAgents,
    ...fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name)]);

  const broken = [];
  let dispatchesAnAgent = false;
  for (const file of commands) {
    const body = fs.readFileSync(path.join(dir, file), 'utf8');
    // Not every command dispatches. review-run reads a finished run's record
    // and interprets it -- it reaches no agent by design, and requiring one
    // would mean inventing a dispatch to satisfy a test. What must hold is
    // that references resolve, and that the build entry still reaches the team.
    const named = [...body.matchAll(/`davinci:([a-z-]+)`/g)].map((m) => m[1]);
    for (const ref of named) {
      if (!shipped.has(ref)) broken.push(file + ' -> davinci:' + ref);
      if (shippedAgents.has(ref)) dispatchesAnAgent = true;
    }
  }
  assert.deepStrictEqual(broken, [],
    'entry command(s) reference an agent or skill that does not exist: ' + broken.join(', '));
  // The original point of this test: the documented way in must actually
  // reach the team, not only load skills.
  assert.ok(dispatchesAnAgent, 'no entry command dispatches any agent this plugin ships');
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

test('no skill, agent or command tells an agent to read inside the plugin directory', () => {
  // The plugin lives outside the project working directory, so every such read
  // is denied with "Path is outside allowed working directories". Two skills
  // pointed at ${CLAUDE_SKILL_DIR}/templates/... for the shape of the file they
  // were required to produce. infra-architect could not read the template that
  // names the seven headings the gate demands, guessed them, and was bounced:
  //
  //   "the template that names the required ones is outside my read permission,
  //    so I guessed and guessed wrong"
  //
  // Anything an agent must read belongs in the skill body, which is preloaded.
  const root = path.join(__dirname, '..', '..');
  const offenders = [];
  for (const dir of ['skills', 'agents', 'commands']) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.md')) continue;
        const body = fs.readFileSync(full, 'utf8');
        if (/\$\{CLAUDE_SKILL_DIR\}|\$\{CLAUDE_PLUGIN_ROOT\}/.test(body)) {
          offenders.push(path.relative(root, full).split(path.sep).join('/'));
        }
      }
    };
    walk(base);
  }
  assert.deepStrictEqual(offenders, [],
    'file(s) point an agent at a path inside the plugin, which is always denied: ' +
    offenders.join(', '));
});

test('no skill ships a templates directory an agent is expected to read', () => {
  // The same trap in its other shape: a template file that exists, looks
  // authoritative, and is unreachable from where the agent runs.
  const skills = path.join(__dirname, '..', '..', 'skills');
  const withTemplates = fs.readdirSync(skills, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => fs.existsSync(path.join(skills, d.name, 'templates')))
    .map((d) => d.name);
  assert.deepStrictEqual(withTemplates, [],
    'skill(s) ship a templates/ directory no agent can read: ' + withTemplates.join(', '));
});

test('every agent that dispatches others is told to read digests, not full reports', () => {
  // Context blowback is the documented failure of multi-agent systems: an agent
  // that pulls every subordinate's full report into its own context has moved
  // the noise rather than contained it, which is the entire reason for running
  // them in separate windows. Measured on a real run: 21 reports came to about
  // 64,000 tokens, while the fields carrying a decision came to under 1,000.
  //
  // Derived from the tool lists, so an agent given the Agent tool later cannot
  // arrive without the rule.
  const dispatchers = readAgents().filter((a) =>
    a.tools.some((t) => /^Agent\(/.test(t) || t === 'Agent'));
  assert.ok(dispatchers.length >= 2,
    'expected at least two dispatching agents, found ' + dispatchers.length);

  const missing = dispatchers
    .filter((a) => !/digest/i.test(a.body))
    .map((a) => a.name);
  assert.deepStrictEqual(missing, [],
    'agent(s) dispatch others without being told to read digests rather than full reports: ' +
    missing.join(', '));
});

test('the contract tells agents their return value is not their report', () => {
  // The other half: a caller can only read digests if the callee returns one.
  const contract = fs.readFileSync(
    path.join(SKILLS_DIR, 'delegation-contract', 'SKILL.md'), 'utf8');
  assert.match(contract, /## What you return is not your report/,
    'the delegation contract no longer distinguishes the report from the return value');
  const sections = contract.split('## What you return is not your report');
  assert.strictEqual(sections.length, 2,
    'the digest section appears more than once in the contract');
});

test('the tier definitions do not choose a model', () => {
  // Stakes and reasoning-depth are different questions. When the tier chose the
  // model, a greenfield run put 19 of 21 dispatches on load-bearing -- every
  // task passes the reversibility test when nothing exists yet -- and so put
  // almost everything on Opus. The lead was obeying the rubric exactly.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'work-tiers', 'SKILL.md'), 'utf8');
  const tiers = skill.split('## The three tiers')[1].split('\n## ')[0];
  const offenders = tiers.split('\n')
    .filter((l) => /^\s*[-*]\s*\*\*model\*\*/i.test(l))
    .map((l) => l.trim());
  assert.deepStrictEqual(offenders, [],
    'a tier definition names a model again, which collapses stakes into reasoning depth: ' +
    offenders.join(' | '));
});

test('every model the rubric names is one the Agent tool accepts', () => {
  // A model string the tool does not know is not an error -- the override is
  // ignored and the agent silently runs on its frontmatter model.
  const ACCEPTED = ['haiku', 'sonnet', 'opus', 'fable'];
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'work-tiers', 'SKILL.md'), 'utf8');
  const section = skill.split('## Model is a separate question from tier')[1];
  assert.ok(section, 'work-tiers no longer separates model choice from tier');

  const named = [...section.matchAll(/`([a-z][a-z0-9.-]{2,})`/g)]
    .map((m) => m[1])
    .filter((w) => /^(haiku|sonnet|opus|fable|claude[-.]?\w*|gpt[-.]?\w*)$/i.test(w));
  const bad = [...new Set(named)].filter((m) => !ACCEPTED.includes(m));
  assert.deepStrictEqual(bad, [],
    'rubric names a model the Agent tool will not accept, so the override is silently dropped: ' +
    bad.join(', '));
});

test('every "<skill> section N" reference points at a heading that exists', () => {
  // Agents are told things like "frontend-craft section 4 governs exactly how".
  // Renumber the skill and that sentence silently sends the agent to the wrong
  // section -- no error, just the wrong instructions. Adding one section at the
  // top of frontend-craft shifted every reference by one.
  const roots = ['agents', 'skills', 'commands'];
  const headings = new Map();
  for (const dir of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const body = fs.readFileSync(path.join(SKILLS_DIR, dir.name, 'SKILL.md'), 'utf8');
    headings.set(dir.name, new Set(
      [...body.matchAll(/^##\s+(\d+)\./gm)].map((m) => m[1])));
  }

  const broken = [];
  for (const dir of roots) {
    const base = path.join(__dirname, '..', '..', dir);
    if (!fs.existsSync(base)) continue;
    for (const file of fs.readdirSync(base).filter((f) => f.endsWith('.md'))) {
      const body = fs.readFileSync(path.join(base, file), 'utf8');
      for (const m of body.matchAll(/`([a-z-]+)`\s+section\s+(\d+)/g)) {
        const [, skill, n] = m;
        if (!headings.has(skill)) continue;      // not one of ours; nothing to check
        if (!headings.get(skill).has(n)) {
          broken.push(`${dir}/${file} -> ${skill} section ${n}`);
        }
      }
    }
  }
  assert.deepStrictEqual(broken, [],
    'reference(s) point at a skill section that does not exist: ' + broken.join(', '));
});

test('every agent that builds a user-facing surface carries the director skill', () => {
  // A page assembled section by section arrives looking like a list of
  // components. story-direction decides the claim and the beats before any of
  // frontend-craft's visual decisions are made, so the agent that makes those
  // decisions has to have it.
  const byName = new Map(readAgents().map((a) => [a.name, a]));
  const fe = byName.get('frontend-engineer');
  assert.ok(fe, 'frontend-engineer.md is missing');
  assert.ok(fe.skills.includes('story-direction'),
    'frontend-engineer no longer carries story-direction: ' + fe.skills.join(', '));
  assert.ok(fe.skills.indexOf('story-direction') < fe.skills.indexOf('frontend-craft'),
    'story-direction should load before frontend-craft — it decides what the styling is for');
});

test('an asset brief cannot be written without a fallback', () => {
  // Generation fails, credits run out, a provider is absent on the next
  // machine. A beat whose fallback is a grey box was never designed, and the
  // brief template is where that gets enforced.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  assert.match(skill, /without it:/,
    'the asset brief template no longer carries a fallback field');
  assert.match(skill, /`without it` is not optional/,
    'the fallback field is present but no longer required');
});

test('story-direction does not name a single generation provider', () => {
  // The brief has to survive the provider being swapped. Naming one in the
  // skill is how it quietly becomes the only one that works.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  const vendors = ['higgsfield', 'midjourney', 'dall-e', 'dalle', 'sora', 'runway', 'veo', 'firefly'];
  // Substring, not a word-boundary regex. The first version of this used
  // '\b' + v + '\b' written with a single backslash, which in a JS string is
  // the backspace character rather than a boundary -- so the pattern could
  // never match and the test could never fail. Plain inclusion also catches
  // "higgsfield-generate", which a boundary would have missed anyway.
  const haystack = skill.toLowerCase();
  const named = vendors.filter((v) => haystack.includes(v));
  assert.deepStrictEqual(named, [],
    'story-direction names a specific provider, which is how it stops being portable: ' + named.join(', '));
});

test('the escalation ladder has a rung for beats that must show', () => {
  // Without it every clause biases toward less: "stop as soon as the beat does
  // its job", "most beats need type and space", "more than one or two is
  // decorating". Three separate runs stopped at step one and produced three
  // near-identical text-only pages, each believing it had chosen its own
  // direction. Restraint with no counterweight converges.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  assert.match(skill, /cannot be done with type/,
    'story-direction no longer says that some beats require showing');
  assert.match(skill, /showing is the job/,
    'the showing rule is present but no longer states that type cannot substitute');
  assert.match(skill, /could this be the same page for a different company/,
    'the test that catches a page showing nothing is gone');
});

test('the banned defaults name the idiom this plugin actually produces', () => {
  // Every other entry is a default inherited from training data. This one is
  // ours: the plugin converged on it three times unprompted, which makes it
  // more likely to recur than any of the others.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'frontend-craft', 'SKILL.md'), 'utf8');
  assert.match(skill, /nothing to look at/,
    'frontend-craft no longer names the restraint idiom as a banned default');
});

test('a refused probe is distinguished from an absent generator', () => {
  // A run wrote `cd … && for b in comfy sd sdxl …` across eighteen binaries,
  // had it denied for being compound, and recorded "found nothing" -- while an
  // installed, authenticated generator sat on PATH with its commands granted.
  // The same shape as reporting a screenshot never taken.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  assert.match(skill, /A refused check is not a negative result/,
    'story-direction no longer separates a blocked probe from an absent generator');
  assert.match(skill, /could not determine/,
    'the three-outcome table no longer offers "could not determine"');
});

test('the discovery probe is shaped to survive the permission layer', () => {
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  assert.match(skill, /One plain\s+`command -v <name>` per call/,
    'the probe no longer specifies one plain command per call');
  assert.match(skill, /ToolSearch/,
    'the probe no longer mentions deferred tools, which is how the only working generator was found');
});

test('the agent generator route is the CLI, not ToolSearch', () => {
  // Measured: an agent declared `tools: Bash, ToolSearch` received only Bash.
  // ToolSearch drops silently, exactly like an mcp__* wildcard. The same probe
  // ran `command -v higgsfield` and got a path back, so the binary route works
  // from inside an agent even though the deferred-MCP route cannot.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  assert.match(skill, /`ToolSearch` cannot be given to an\s+agent/,
    'story-direction still implies an agent can reach a deferred tool');
  assert.match(skill, /installs as a binary/,
    'story-direction no longer names the route that is actually open to an agent');
});

test('discovery is granted but generation is not', () => {
  const profile = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'permissions.example.json'), 'utf8'));
  const allow = profile.permissions.allow;
  assert.ok(allow.includes('Bash(command -v:*)'),
    'a probe that cannot run reports an absent generator, which is a lie the page gets built on');
  assert.ok(!allow.some((e) => /generate/i.test(e)),
    'generation spends real credits and must stay opt-in per project');
  assert.match(profile['//generators'] || '', /blocked check/,
    'the profile no longer explains what to report when a binary is found but unrunnable');
});

test('every davinci: skill named in a skill body exists on disk', () => {
  // The new failure mode this design introduces. motion-craft is deliberately
  // thin and points at four skills to invoke on demand; a pointer to a skill
  // that does not exist is the same trap as the template an agent could not
  // read -- authoritative-looking and unreachable -- except it fails at the
  // Skill call instead of the Read.
  // A `davinci:` prefix names either a skill to invoke or an agent to dispatch,
  // so both resolve. delegation-contract cites `davinci:infra-architect` as a
  // counter-example of how not to write an agent name, which is legitimate.
  const available = new Set([
    ...fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name),
    ...fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, '')),
  ]);
  const dangling = [];
  for (const dir of fs.readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const body = fs.readFileSync(path.join(SKILLS_DIR, dir.name, 'SKILL.md'), 'utf8');
    for (const m of body.matchAll(/`davinci:([a-z-]+)`/g)) {
      if (!available.has(m[1])) dangling.push(dir.name + ' -> ' + m[1]);
    }
  }
  assert.deepStrictEqual(dangling, [],
    'skill(s) point at a davinci skill that does not exist: ' + dangling.join(', '));
});

test('the technique skills are reached on demand, not preloaded', () => {
  // Preloading them would put roughly 400 lines of technique into every
  // frontend context whether or not motion is in scope -- the clutter the
  // thin-skill split exists to avoid. Measured: a subagent holding only Bash
  // and Skill invoked a plugin skill it did not preload and returned a marker
  // it could not have guessed, so on-demand is a real route, not a hope.
  const onDemand = ['parallax-layers', 'glass-surfaces', 'scroll-video', 'generating-assets', 'technique-research'];
  const preloaded = readAgents().flatMap((a) =>
    onDemand.filter((s) => a.skills.includes(s)).map((s) => a.name + ' preloads ' + s));
  assert.deepStrictEqual(preloaded, [],
    'technique skill(s) preloaded instead of invoked on demand: ' + preloaded.join(', '));

  const craft = fs.readFileSync(path.join(SKILLS_DIR, 'motion-craft', 'SKILL.md'), 'utf8');
  for (const s of onDemand) {
    assert.ok(craft.includes('`davinci:' + s + '`'),
      'motion-craft no longer names ' + s + ', so nothing routes to it');
  }
});

test('motion has to beat its own still before a beat climbs to it', () => {
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  assert.match(skill, /motion that beats its own still/,
    'the ladder no longer makes rung four earn its place against the still it replaces');
  for (const cost of ['credits', 'failure surface', 'attention']) {
    assert.ok(skill.includes(cost),
      'the ladder no longer names "' + cost + '" as a cost rung four carries');
  }
});

test('generating-assets keeps the probe shape and the blocked-check distinction', () => {
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'generating-assets', 'SKILL.md'), 'utf8');
  assert.match(skill, /blocked check/,
    'a generator found but not runnable would read as an absent generator again');
  assert.match(skill, /command -v higgsfield/,
    'the probe no longer shows one plain command per call');
  assert.match(skill, /`ToolSearch` cannot be given to an agent/,
    'an agent could again wait for a deferred tool that can never arrive');
});

test('the agent that researches technique can read a mechanism, not only see a picture', () => {
  // frontend-craft already sends it to look at the category, but every tool in
  // that pass returns an image. Measured on a real study of a live product
  // page: the video count, the plugin composition attributes, the progress
  // keyframes, the load timeout and the capability flag that nearly produced a
  // false finding all came from javascript_tool. With screenshots alone the
  // agent can describe a page and cannot read how it works.
  const fe = readAgents().find((a) => a.name === 'frontend-engineer');
  assert.ok(fe, 'frontend-engineer is not on disk');
  for (const tool of ['mcp__Claude_Browser__javascript_tool', 'mcp__Claude_Browser__read_page']) {
    assert.ok(fe.tools.includes(tool),
      'frontend-engineer lost ' + tool + ', so technique research drops back to screenshots');
  }
});

test('research separates what was disabled from what is absent', () => {
  // A live page reported readyState 0 on all sixteen of its videos because its
  // own detection had set no-inline-media on the root element. "This page does
  // not scrub video" was one inference away and would have been wrong -- the
  // same shape as a refused command recorded as a negative result.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'technique-research', 'SKILL.md'), 'utf8');
  assert.match(skill, /disable its own technique in your browser/,
    'research no longer warns that a page can hide the technique while you look at it');
  assert.match(skill, /prefers-reduced-motion/,
    'the check for a switched-off technique no longer names the obvious gate');
});

test('a finding carries what was inferred and what was not checked', () => {
  // A record that merges observation with conclusion becomes folklore. Six
  // records naming a provider once accumulated in one project until a run
  // selected it without comparing anything.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'technique-research', 'SKILL.md'), 'utf8');
  for (const field of ['measured:', 'inferred:', 'unchecked:']) {
    assert.ok(skill.includes(field),
      'the findings format no longer carries "' + field + '", so it cannot be corrected');
  }
  assert.match(skill, /A finding is not a preference/,
    'research no longer distinguishes a dated measurement from an accumulated preference');
});

test('the foundation gate makes a project declare what is already installed', () => {
  const { REQUIRED_SECTIONS } = require('../lib/foundation.js');
  assert.ok(REQUIRED_SECTIONS.includes('Available to build with'),
    'an agent choosing a technique has no record of what the project already carries');
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'stack-profile', 'SKILL.md'), 'utf8');
  assert.match(skill, /## Available to build with/,
    'the gate requires a section the skill never tells anyone to write');
});

test('the deletion pass reaches past the file that was changed', () => {
  // code-craft's pass asks an agent to clean the file it touched, which is
  // structurally blind to what that change orphaned elsewhere: the component
  // nothing imports now, the image still shipping after its section was
  // rewritten. Those are reference-graph facts, so a script answers them.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'code-craft', 'SKILL.md'), 'utf8');
  assert.match(skill, /This pass is file-scoped, and that is its limit/,
    'code-craft no longer admits the deletion pass cannot see past one file');
  assert.match(skill, /waste\.mjs/,
    'nothing routes to the sweep that finds what a change orphaned');
  assert.match(skill, /a check\s+you could not run is not a clean project/,
    'an unrunnable sweep could again be reported as a clean project');
});

test('a cache is treated as a security boundary before a performance one', () => {
  // A mis-keyed cache serves one user another user's response. That is an
  // incident, not a slow page, so the key rule leads and the trigger lives in
  // the skill every source-writing agent already preloads.
  const caching = fs.readFileSync(path.join(SKILLS_DIR, 'caching', 'SKILL.md'), 'utf8');
  assert.match(caching, /The cache key is a security boundary/,
    'caching no longer leads with the failure that makes it dangerous');
  assert.match(caching, /stampede/i, 'caching no longer covers stampede');
  assert.match(caching, /invalidation/i, 'caching no longer covers invalidation');

  const code = fs.readFileSync(path.join(SKILLS_DIR, 'code-craft', 'SKILL.md'), 'utf8');
  assert.match(code, /`davinci:caching` was invoked before any cache/,
    'nothing triggers the caching skill, so it is only found by someone already looking');

  // The entry point is the placement decision; caching is the rung it sends you
  // to. Preloading the deep-dive made a cache look like the first answer rather
  // than the last, which is how work that could have moved up a rung gets
  // hidden behind one instead.
  const backend = readAgents().find((a) => a.name === 'backend-engineer');
  assert.ok(backend.skills.includes('work-placement'),
    'the agent that serves data does not carry the placement decision');

  const placement = fs.readFileSync(path.join(SKILLS_DIR, 'work-placement', 'SKILL.md'), 'utf8');
  assert.match(placement, /`davinci:caching`/,
    'work-placement no longer routes to caching, so the deep-dive is unreachable');
});

test('work is placed before it is optimised, and measured before either', () => {
  // RED before USE, top-down, exists to stop something being optimised that
  // nobody waits on. The ladder exists so a cache is never used to hide work
  // that could have happened at build time instead.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'work-placement', 'SKILL.md'), 'utf8');
  assert.match(skill, /A route that is dynamic because nobody decided otherwise is the bug/,
    'the most common placement defect is no longer named');
  assert.match(skill, /only a defect when it is on the\s+path something waits for/,
    'work-placement no longer restrains optimising things nobody waits on');
  for (const rung of ['build', 'edge', 'server', 'client']) {
    assert.ok(skill.includes(rung), 'the ladder no longer names the "' + rung + '" rung');
  }
});

test('a weight budget is enforced only when one was given', () => {
  // A tool that invents a threshold fails builds on a number nobody agreed.
  // Reporting weight is always right; enforcing it is the project's call.
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'scripts', 'waste.mjs'), 'utf8');
  assert.match(src, /no budget given -- reported, not enforced/,
    'waste.mjs no longer distinguishes a reported weight from an enforced one');
  assert.match(src, /max-total-kb/, 'the budget flag is gone');
});

test('a reference is read for what it names, never adopted whole', () => {
  // The documented failure was never too few references -- it was convergence.
  // Three runs produced near-identical pages unaided. A specification and a
  // component library both shorten the path to somebody else's answer, so each
  // one is introduced with the fence attached rather than beside it.
  const craft = fs.readFileSync(path.join(SKILLS_DIR, 'frontend-craft', 'SKILL.md'), 'utf8');
  assert.match(craft, /\*\*Never adopt one\.\*\*/,
    'frontend-craft offers a specification source without the rule that stops it being copied');
  assert.match(craft, /styles\.refero\.design/,
    'the specification source is gone, so only screenshots remain');

  const research = fs.readFileSync(path.join(SKILLS_DIR, 'technique-research', 'SKILL.md'), 'utf8');
  assert.match(research, /Component libraries are mechanism, never design/,
    'a component library could again be read as a design source');
  assert.match(research, /Read them to learn how\. Never paste them to decide what\./,
    'the fence on component libraries is gone');
});

test('the motion-feel gap is stated rather than papered over', () => {
  // 60fps.design and its like hold what the skills cannot teach -- timing and
  // choreography -- and the agent can only screenshot them. One frame of an
  // animation carries almost none of its timing, so claiming to have reviewed
  // them would be the same lie as reporting a screenshot never taken.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'motion-craft', 'SKILL.md'), 'utf8');
  assert.match(skill, /do not claim to have\s+reviewed motion references you only ever saw still/,
    'motion-craft no longer admits it cannot watch the references that hold what it lacks');
});

test('a greenfield project is checked for runnability before it is written', () => {
  // Measured: infra-architect was given a scaffolding task under a profile that
  // grants npm run build but not npm install. Every verification command was
  // inert because node_modules never existed, and the agent only discovered it
  // after writing the tree. The grant is deliberate -- npm install runs
  // postinstall scripts, which is the arbitrary execution node -e is refused
  // for -- so the fix is to find out first and say so.
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'stack-profile', 'SKILL.md'), 'utf8');
  assert.match(skill, /Check at the start, not at the end/,
    'the greenfield check can again be discovered after the work is written');
  assert.match(skill, /Report it as built and working\.\*\* Never\./,
    'an uninstalled scaffold could again be reported as working');

  const profile = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', '..', 'permissions.example.json'), 'utf8'));
  assert.match(profile['//scaffold'] || '', /postinstall/,
    'the profile no longer says why install is withheld, so someone will grant it blind');
  assert.ok(!profile.permissions.allow.some((e) => /npm (install|ci)\b/.test(e)),
    'npm install grants arbitrary code execution through postinstall and must stay opt-in');
});

test('alt text is a decision tree, not an instruction to describe everything', () => {
  // "Add alt text to every image" produces worse accessibility than the tree:
  // it turns decoration into noise a screen reader must read past. And the two
  // states mean opposite things -- alt="" hides a decorative image, a missing
  // attribute makes a screen reader announce the filename.
  const craft = fs.readFileSync(path.join(SKILLS_DIR, 'frontend-craft', 'SKILL.md'), 'utf8');
  assert.match(craft, /Alt text is a decision, not a field to fill/,
    'the accessibility floor no longer carries the alt decision tree');
  assert.match(craft, /`alt=""` and no `alt` attribute are opposites/,
    'the distinction that makes the tree worth having is gone');
  assert.match(craft, /Never omit the attribute/,
    'nothing now stops an agent leaving alt off entirely');
});

test('SEO scope stops where the plugin runs out of evidence', () => {
  // Keyword strategy needs search-volume data and business context the plugin
  // does not have. Producing it anyway is confident output with nothing behind
  // it, which is the failure mode this whole plugin is built against.
  const seo = fs.readFileSync(path.join(SKILLS_DIR, 'technical-seo', 'SKILL.md'), 'utf8');
  assert.match(seo, /It does not cover keyword strategy/,
    'technical-seo no longer refuses the part it cannot evidence');
  assert.match(seo, /Do not write an llms\.txt/,
    'the plugin no longer declines a widely-marketed file measured to do nothing');
  assert.match(seo, /the check does not run\*\*, and it says so/,
    'an unbuilt project could again be reported as passing its SEO check');
});

test('the entry command plans before it builds, and stops after one slice', () => {
  // A run that builds everything takes an hour, cannot be interrupted, and
  // gives nothing to look at until it is finished or broken. It also drifts:
  // step-by-step agents lose the goal because each locally-best move pulls away
  // from it, while plan-ahead agents hold. The plan has to be an artifact the
  // agent re-reads, not a memory it is trusted to keep.
  const dir = path.join(PLUGIN_ROOT, 'commands');
  const build = fs.readFileSync(path.join(dir, 'build.md'), 'utf8');

  assert.match(build, /is there a plan already\?/,
    'the entry command no longer checks for an existing plan, so nothing can resume');
  assert.match(build, /this is a\s+resume/,
    'a run with unfinished slices would be re-interviewed instead of continued');
  assert.match(build, /which single\s+slice to build/,
    'the entry command no longer dispatches one slice at a time');
  assert.match(build, /\*\*Stop\.\*\*/,
    'nothing stops the run at the checkpoint, which is the whole feature');
  assert.match(build, /append-only/,
    'nothing stops the journal being rewritten, which is how history gets invented');
});

test('the plan is a contract no agent may edit', () => {
  // The entire drift control, and it only works if it is absolute. Work
  // discovered mid-slice belongs in observations, where a human decides.
  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /No agent may add a slice, remove one, or change its criteria/,
    'work-ledger no longer forbids the plan being grown mid-run');
  assert.match(ledger, /`observations`/,
    'nothing routes discovered work to the channel a human reads');
  assert.match(ledger, /re-run its acceptance criteria\s+before continuing/,
    'a resume would trust a status field over the working tree');
  assert.match(ledger, /walking skeleton/,
    'slicing guidance lost the rule that makes the first slice cheap and end-to-end');
});

test('the plan is shown and approved before anything is built', () => {
  // A plan the user never saw is a proposal, not a contract. A run that dies
  // between writing plan.md and showing it leaves exactly that, and a resume
  // would otherwise start building it.
  const build = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'build.md'), 'utf8');
  assert.match(build, /Print the whole slice list in the conversation/,
    'the user would have to open a file to see what they are agreeing to');
  assert.match(build, /Change the slices/,
    'approval offers no way to modify the plan, only to accept it');
  assert.match(build, /Loop until they approve/,
    'a single rejection would leave the plan unrevised');
  assert.match(build, /\{"event":"plan-approved"\}/,
    'nothing records that approval happened, so no later run can tell');
  assert.match(build, /is a draft, not a plan/,
    'an unapproved plan could be resumed into and built');

  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /only time `plan\.md` may be rewritten|Before it, the plan is a proposal/,
    'work-ledger no longer distinguishes a draft from a contract');
});

test('slice boundaries are drawn where the gate could split them', () => {
  // Adapted from superpowers' plan skills: split only where a reviewer could
  // meaningfully reject one unit while approving its neighbour. It fits this
  // plugin better than its source because there is an actual gate agent, so
  // the test is not hypothetical.
  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /reject one slice while\s*>?\s*approving its neighbour/,
    'the sizing rule lost the only boundary test that is actually checkable');
  assert.match(ledger, /Fold setup into the slice that needs it/,
    '"set up the tooling" could again become a slice that delivers nothing');
  assert.match(ledger, /A step is not a slice/,
    'nothing stops a plan being written as a list of two-minute actions');
});

test('a draft plan writes nothing, and main is not written to unasked', () => {
  // Work started before agreement is work the user must undo before they can
  // disagree. And a user who wanted a branch and got commits on main has a
  // mess costing more than the slice was worth.
  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /the project is read-only/,
    'a draft plan could scaffold, install, or branch before anyone agreed to it');
  assert.match(ledger, /default\s+branch/,
    'nothing checks whether the first slice is about to write to main');
});

test('an agent may object to a slice but never edit one', () => {
  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /\*\*Objecting is allowed; editing is not\.\*\*/,
    'the plan could be revised by whoever is executing it, which is the drift');
  assert.match(ledger, /Read the slice \*\*critically\*\*/,
    'a slice known to be wrong would be built anyway');
});

test('a slice is checkpointed before it starts and can be taken back', () => {
  // A checkpoint without a rollback is half a checkpoint: you can inspect the
  // work, but your only options are accept it or unpick it by hand.
  const build = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'build.md'), 'utf8');
  assert.match(build, /Take a checkpoint first/,
    'a slice could be built with no way to undo it');
  assert.match(build, /checkpoint\.mjs restore/,
    'the entry command offers no way to reject a slice');
  assert.match(build, /"status":"reverted"/,
    'a rejection would not be recorded, so the plan would march past it');

  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /the project's own git history is never touched/,
    'checkpoints could start writing to a history the user cares about');
  assert.match(ledger, /If the checkpoint could not be taken, say so before building/,
    'an unbacked slice could be built without the user knowing it cannot be undone');
});

test('trivial work skips the plan entirely', () => {
  // A regression introduced with the ledger: every new build wrote and got
  // approval for a plan, so "change this button to blue" earned intake, a
  // slice list and an approval loop. Ceremony costing more than the change it
  // governs is friction, and it teaches a user to route around the tool.
  const build = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'build.md'), 'utf8');
  assert.match(build, /Trivial work does not get a plan/,
    'trivial work is back inside the planning ceremony');
  assert.match(build, /\*\*No plan, no approval loop, no slices, no journal\.\*\*/,
    'the fast path no longer says what it skips, so it will drift back');
  assert.match(build, /is not an escape hatch/,
    'nothing stops larger work being called trivial to dodge the plan');
  assert.match(build, /If it stops being trivial while you are in it, stop/,
    'a misclassified change could quietly become an unreviewed large one');
  // The fast path must still be undoable -- small work is not exempt from that.
  const trivialSection = build.split('Trivial work does not get a plan')[1].split('## Intake')[0];
  assert.match(trivialSection, /checkpoint\.mjs save/,
    'trivial work is built with no way to take it back');

  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /Not everything gets a ledger/,
    'work-ledger claims authority over work that should bypass it');
});

test('a finished run can be read back by the plugin itself', () => {
  // Every real defect in this plugin's history was found by a human reading a
  // run record by hand. That does not scale to someone using it alone, and the
  // records were sitting there the whole time.
  const dir = path.join(PLUGIN_ROOT, 'commands');
  const review = path.join(dir, 'review-run.md');
  assert.ok(fs.existsSync(review), 'the plugin can no longer read its own runs');
  const body = fs.readFileSync(review, 'utf8');
  assert.match(body, /review-run\.mjs/, 'the command no longer runs the reader');
  assert.match(body, /Do not summarise a run you did not read/,
    'a refused reader could produce a summary of a record nobody opened');
  assert.match(body, /prompt, not a verdict/,
    'the suspicion heuristic could be reported as a confirmed defect');
});

test('an existing codebase is discovered, not assumed', () => {
  // stack-profile opened with "Generate, do not author" -- run the scaffolder.
  // That is right for an empty directory and wrong for everything else, and a
  // profile written from assumption becomes a contract every other agent obeys.
  const profile = fs.readFileSync(path.join(SKILLS_DIR, 'stack-profile', 'SKILL.md'), 'utf8');
  assert.match(profile, /If the project already exists, this section does not apply/,
    'greenfield scaffolding advice is again the first thing an agent reads on any project');
  assert.match(profile, /`davinci:brownfield`/,
    'nothing routes an existing project away from the generate-first path');

  const bf = fs.readFileSync(path.join(SKILLS_DIR, 'brownfield', 'SKILL.md'), 'utf8');
  assert.match(bf, /discover, do not assume/,
    'brownfield lost the rule that mirrors generate-do-not-author');
  assert.match(bf, /survey\.mjs/, 'brownfield no longer starts from the map');
  assert.match(bf, /write down what you did not look at/i,
    'an unread area could again be reported as an absence');
});

test('behaviour is pinned before it is changed', () => {
  // The hardest problem in existing code is not knowing what it currently
  // does, so you cannot tell whether you broke it.
  const bf = fs.readFileSync(path.join(SKILLS_DIR, 'brownfield', 'SKILL.md'), 'utf8');
  assert.match(bf, /captures what it does \*\*right now\*\*/,
    'nothing tells an agent to pin current behaviour before changing it');
  assert.match(bf, /Code not protected by tests cannot\s+be changed safely/,
    'an untested codebase could be treated as an ordinary one');
  assert.match(bf, /nothing that used to work\s+stopped/,
    'verification could again mean only that the new thing works');
  assert.match(bf, /Generated files/,
    'nothing warns against editing generated output');
});

test('the foundation is laid once, not once per slice', () => {
  // The rule said bounded and architectural briefs "always" run the
  // foundation-first sequence, while justifying it on a condition -- the
  // profile being absent -- that stops holding after the first slice.
  const lead = fs.readFileSync(path.join(AGENTS_DIR, 'tech-lead.md'), 'utf8');
  assert.match(lead, /Skip this step entirely when the journal already carries\s+`foundation-passed`/,
    'every slice would re-lay a foundation that was written once');
  assert.match(lead, /\{"event":"foundation-passed"\}/,
    'nothing records that the foundation was gated, so no later run can tell');
  assert.match(lead, /it is an\s+\*\*amendment\*\*/,
    'a genuine foundation change would trigger a fresh survey rather than a targeted amendment');
  assert.ok(!/architectural briefs always run the full foundation-first sequence/.test(lead),
    'the always-clause is back, and it contradicts the skip rule above it');
});

test('a re-gate reviews the fix, not the whole task again', () => {
  // Measured: one slice cost nine dispatches, and the gate ran more than once.
  // The re-gate was correct behaviour -- the designed fail-fix-confirm cycle,
  // bounded at two rounds -- but nothing narrowed it, so a one-line fix
  // re-ran the tier's whole fan-out: six lens dispatches on load-bearing work,
  // costing exactly what the original review cost.
  const gate = fs.readFileSync(path.join(AGENTS_DIR, 'code-reviewer.md'), 'utf8');
  assert.match(gate, /A re-gate is not a second first gate/,
    'a re-gate would again cost the same as the review it is confirming');
  assert.match(gate, /Re-dispatch only the lens or lenses that blocked/,
    'the whole fan-out would re-run to confirm one finding');
  assert.match(gate, /a fix can break something the original review\s+already passed/,
    'a narrowed re-gate with no regression check would let a fix break what passed');
  assert.match(gate, /It is new work, and it gets the tier's normal fan-out/,
    'a sprawling change could be waved through under a re-gate label');

  const lead = fs.readFileSync(path.join(AGENTS_DIR, 'tech-lead.md'), 'utf8');
  assert.match(lead, /Say when a gate dispatch is a re-gate/,
    'the gate is never told it is confirming a fix, so it cannot narrow');

  // The bound that makes the cycle terminate must survive the narrowing.
  for (const f of [gate, lead]) {
    assert.match(f, /two rounds/, 'the re-gate round bound went missing');
  }
});

test('a continuous visual has a designed waiting state', () => {
  // A still is what a beat falls back to when its motion never arrives. This
  // is the other gap: what the reader sees while it is arriving. A scroll-driven
  // site studied for this opened on a loading state naming what it was doing
  // and how far along -- the first thing every visitor sees, and on a slow
  // connection possibly the only thing.
  const craft = fs.readFileSync(path.join(SKILLS_DIR, 'motion-craft', 'SKILL.md'), 'utf8');
  assert.match(craft, /What the reader looks at while it loads/,
    'nothing covers the gap between the page arriving and the visual arriving');
  assert.match(craft, /\*\*Design the waiting state\*\*/,
    'a heavy scene could ship with a spinner and call it handled');
  assert.match(craft, /Never block the words on it/,
    'a reader who came for the argument could be made to wait for the scenery');
});

test('a reference implementation teaches its pattern, not its stack', () => {
  // The site read for this is Three.js, and that is the least transferable
  // thing about it. Copying the stack is how a studio site ships a WebGL
  // bundle to say what four images and a scroll handler would have said.
  const research = fs.readFileSync(path.join(SKILLS_DIR, 'technique-research', 'SKILL.md'), 'utf8');
  assert.match(research, /Read the pattern, not the stack it happens to use/,
    'a reference implementation could be copied wholesale, dependency and all');
  assert.match(research, /None of that is the lesson/,
    'the skill no longer separates what a reference is built from from what it teaches');
  assert.match(research, /choose the implementation from the project's stack and\s+budget/,
    'nothing routes the technique back to what the project actually carries');
  assert.match(research, /Named chapters, each with a scroll anchor/,
    'the transferable half of the pattern is gone');
});

test('a criterion must be satisfiable, not merely checkable', () => {
  // A real run was given `git diff <old-sha> -- package.json` is empty, on a
  // repository where package.json was created after that commit. Entirely
  // mechanical -- a command, an exit code, no judgement -- and impossible. The
  // builder could not have passed it by building anything.
  const intake = fs.readFileSync(path.join(SKILLS_DIR, 'intake-brief', 'SKILL.md'), 'utf8');
  assert.match(intake, /Checkable is not the same as satisfiable/,
    'a criterion that can never pass could again be written into a brief');
  assert.match(intake, /Anchor a comparison to something that exists and means what you intend/,
    'the anchoring rule that made this criterion impossible is gone');
  assert.match(intake, /Prefer a check whose result changes when the work happens/,
    'a criterion measuring something the work cannot affect would pass review');
});

test('a criterion that fails before the work is defective, and the plan is not edited', () => {
  const ledger = fs.readFileSync(path.join(SKILLS_DIR, 'work-ledger', 'SKILL.md'), 'utf8');
  assert.match(ledger, /against the untouched tree first/,
    'nothing establishes the baseline, so a defective criterion reads as failed work');
  assert.match(ledger, /\*\*defective rather than\s+unmet\*\*/,
    'an impossible criterion would be reported as the builder having failed');
  assert.match(ledger, /\*\*Do not edit\s+`plan\.md`\*\*/,
    'a criterion could be rewritten to something the agent can pass, which empties the plan of meaning');
});

test('setting up is a command, not a page of instructions', () => {
  // Six plugin tools need absolute paths that differ on every machine. Asking
  // a person to hand-write them into JSON is the first wall a new user hits,
  // and it fails quietly: the run starts, finds tools it cannot execute, and
  // honestly reports blocked checks.
  const setup = path.join(PLUGIN_ROOT, 'commands', 'setup.md');
  assert.ok(fs.existsSync(setup), 'there is no way to set the plugin up without hand-editing JSON');
  const body = fs.readFileSync(setup, 'utf8');
  assert.match(body, /setup\.mjs/, 'the command no longer runs the tool that does the work');
  assert.match(body, /Explain, do not interrogate/,
    'setup could become an interrogation of someone who wants a website');
  assert.match(body, /Never leave them stuck on this/,
    'a user unable to answer the one question would be blocked at the first step');
  assert.match(body, /Ask them to hand-write a path, a glob, or a JSON file/,
    'the rule against making a person write paths by hand is gone');
});

test('motion that is the beat is not capped like motion that decorates it', () => {
  // The ladder said rung four is rare and more than two beats means decorating
  // -- stated absolutely, with no reference to the dials. On a site whose claim
  // is "this gets better", the change IS the content, so every beat legitimately
  // reaches four. The brief would say MOTION_INTENSITY 9 and the ladder would
  // argue it down at every checkpoint.
  const sd = fs.readFileSync(path.join(SKILLS_DIR, 'story-direction', 'SKILL.md'), 'utf8');
  assert.match(sd, /some pages argue by changing/i,
    'the ladder again caps motion on a page whose argument is the change itself');
  assert.match(sd, /MOTION_INTENSITY/,
    'the ladder ignores the dial the brief sets, so the two can contradict');
  assert.match(sd, /never a cap on motion\s+that \*is\* the beat/,
    'the distinction between decorating a beat and being one is gone');
  // The guard must survive: ordinary pages still get the restraint.
  assert.match(sd, /rare \*\*on a page whose argument is made in words\*\*/,
    'the restraint was removed rather than qualified');
});

test('a supplied document informs the work, it does not specify it', () => {
  // A brand book handed over with authority reads as a specification, and the
  // design step collapses into transcription -- the generic outcome the work
  // exists to escape. Facts about the business are binding; decisions somebody
  // made once are the current answer, not the required one.
  const intake = fs.readFileSync(path.join(SKILLS_DIR, 'intake-brief', 'SKILL.md'), 'utf8');
  assert.match(intake, /A supplied document is a source, not a specification/,
    'nothing stops a handed-over document being treated as a spec');
  assert.match(intake, /Prior decisions — treat as the current answer, not the required one/,
    'the split between fact and prior decision is gone');
  assert.match(intake, /The failure to avoid is deference/,
    'nothing names transcription as the failure mode');
  assert.match(intake, /that is the user's call, not yours/,
    'an agent could silently change a decision that makes a stated fact untrue');
});

test('approval shows what will NOT be built, not only what will', () => {
  // A plan lists what gets built, and a reader checks it against what they
  // wanted. Nothing in that list tells them what quietly fell out. A live run
  // deferred a headless CMS the user had explicitly asked for -- reasoned
  // correctly, recorded under Out of scope in the brief, and never shown at the
  // one moment the user could still object. They found out several slices later.
  const build = fs.readFileSync(path.join(PLUGIN_ROOT, 'commands', 'build.md'), 'utf8');

  assert.match(build, /`Out of scope` list, in full/,
    'approval no longer prints the exclusions, so a dropped requirement is invisible at the only moment it can be caught');
  assert.match(build, /An exclusion is a decision you made on their behalf/,
    'nothing frames an exclusion as a decision the user is owed');
  assert.match(build, /Bring something back into scope/,
    'the user is shown the exclusions with no option to reverse one');
});

test('the tier rubric keeps exposure and reversibility apart', () => {
  // Both floors reach load-bearing and they buy different things. Collapsing
  // them is what makes greenfield work overspend: on a new project almost
  // every early task passes reversibility -- the scaffold, the tokens, the
  // first components everything copies -- which is a fact about the calendar,
  // not the code. A live run put 21 of 24 dispatches on the top tier for a
  // static page whose only interactive elements were a skip link and an email
  // address, and bought six lenses and a security audit on each one.
  const tiers = fs.readFileSync(path.join(SKILLS_DIR, 'work-tiers', 'SKILL.md'), 'utf8');

  assert.match(tiers, /The two floors are not the same floor/,
    'the rubric collapsed exposure and reversibility back into one floor');
  assert.match(tiers, /\*\*Reversibility\*\* says the code is expensive to change later/,
    'reversibility is no longer distinguished from danger, so cost-to-change buys a security audit again');
  assert.match(tiers, /It is not a breach/,
    'the rubric lost the line separating expensive-to-change from dangerous');
  assert.match(tiers, /load-bearing \*\*review\*\*/,
    'reversibility-only work no longer routes to review depth without the security gate');
  assert.match(tiers, /Drop any lens whose subject does not appear in the diff/,
    'the fan-out became a quota again -- six lenses run over a stylesheet with nothing for four of them to find');
});

test('a skipped gate is stated, never silently omitted', () => {
  // The safety property survives the tier fix. tech-lead used to say both gates
  // were mandatory, which contradicted work-tiers outright and won, being the
  // more emphatic of the two. Loosening it must not reintroduce the older and
  // worse failure: a gate that did not run reported as one that passed.
  const lead = fs.readFileSync(path.join(AGENTS_DIR, 'tech-lead.md'), 'utf8');

  assert.match(lead, /`security-engineer` runs per `work-tiers`/,
    'the security gate no longer defers to the tier rubric, so the contradiction is back');
  assert.match(lead, /Never omit it silently/,
    'a skipped security gate can now vanish from the report entirely');
  assert.match(lead, /did not run is never/,
    'the rule that an unrun gate is never reported as passing has been lost');
  assert.doesNotMatch(lead, /## Both gates are mandatory/,
    'the contradicting heading is back and will override the tier rubric again');
});

test('the stack profile separates the contract from its evidence', () => {
  // Every agent reads the profile before it does anything, so its length is a
  // cost paid per dispatch rather than per project. A live run grew it to 36KB
  // -- a third of it evidence for decisions, required by an acceptance
  // criterion -- and re-read the whole thing twenty-six times. The evidence is
  // legitimate and stays; it just belongs below the point a builder can stop.
  const infra = fs.readFileSync(path.join(AGENTS_DIR, 'infra-architect.md'), 'utf8');
  const contract = fs.readFileSync(path.join(SKILLS_DIR, 'delegation-contract', 'SKILL.md'), 'utf8');
  const HEADING = 'Evidence \u2014 the reasoning behind the decisions above';

  assert.ok(infra.includes(HEADING),
    'infra-architect no longer names the boundary heading, so nothing marks where the contract ends');
  assert.match(infra, /Use that heading verbatim/,
    'the heading is no longer required verbatim, so readers cannot rely on finding it');
  assert.ok(contract.includes(HEADING),
    'delegation-contract and infra-architect disagree about the boundary heading, which makes it unfindable');
  assert.match(contract, /Read the contract\s+every time/,
    'agents are no longer told to always read the contract portion');
  assert.match(contract, /it is all contract/,
    'the fallback for a profile with no boundary is gone, so agents may skip a profile that has no evidence section');
});
