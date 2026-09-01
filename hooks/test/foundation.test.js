const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { validateFoundation, REQUIRED_SECTIONS, parseSections, requiresStackProfile, scaffoldEvidence, scopeConflicts } = require('../lib/foundation.js');

function profile(overrides) {
  const body = {
    Framework: 'Next.js 15',
    Language: 'TypeScript 5',
    'Package manager': 'npm',
    'Directory map': 'src/app, src/components',
    'Naming conventions': 'kebab-case files',
    Testing: 'vitest',
    Commands: 'npm run dev',
    'Available to build with': 'framer-motion 11; no GSAP',
  };
  Object.assign(body, overrides || {});
  return REQUIRED_SECTIONS.map((s) => `## ${s}\n\n${body[s] || ''}\n`).join('\n');
}

const PKG = JSON.stringify({ dependencies: { next: '15.0.0' } });

test('a complete profile matching package.json passes', () => {
  assert.deepStrictEqual(validateFoundation(profile(), PKG), []);
});

test('a missing section is reported', () => {
  const text = profile().replace('## Testing', '## Sundries');
  assert.ok(validateFoundation(text, PKG).some((e) => /Testing/.test(e)));
});

test('an empty section is reported', () => {
  assert.ok(validateFoundation(profile({ Commands: '' }), PKG).some((e) => /Commands/.test(e)));
});

test('placeholder text is reported', () => {
  assert.ok(validateFoundation(profile({ Testing: 'TBD' }), PKG).some((e) => /placeholder/i.test(e)));
});

test('a copied but unfilled template section is caught', () => {
  const text = profile({ Testing: 'FILL — runner, file location, naming pattern.' });
  assert.ok(validateFoundation(text, PKG).some((e) => /placeholder/i.test(e)));
});

test('declared framework absent from package.json is reported', () => {
  const pkg = JSON.stringify({ dependencies: { astro: '4.0.0' } });
  assert.ok(validateFoundation(profile(), pkg).some((e) => /package\.json/.test(e)));
});

test('a missing package.json is tolerated', () => {
  assert.deepStrictEqual(validateFoundation(profile(), null), []);
});

test('a ## line inside a fenced code block is not treated as a heading', () => {
  const text = profile({ Commands: '```bash\n## build the app\nnpm run build\n```' });
  const sections = parseSections(text);
  assert.ok(!('build the app' in sections), 'a fenced ## leaked in as a section heading');
  assert.match(sections.Commands, /npm run build/);
  assert.deepStrictEqual(Object.keys(sections).sort(), REQUIRED_SECTIONS.slice().sort());
});

test('the last section keeps its full body', () => {
  const sections = parseSections(profile({ Commands: 'npm run dev\nnpm run build' }));
  assert.match(sections.Commands, /npm run dev/);
  assert.match(sections.Commands, /npm run build/);
});

test('a present but malformed package.json is reported, not silently skipped', () => {
  const errs = validateFoundation(profile(), '{ this is not json');
  assert.ok(errs.some((e) => /could not be parsed/.test(e)));
});

test('requiresStackProfile is false when every changed file is under .devteam/', () => {
  assert.strictEqual(requiresStackProfile({
    files_changed: ['.devteam/reports/infra-architect-1.json', '.devteam/brief.md'],
  }), false);
});

test('requiresStackProfile is false for a report that changed no files', () => {
  assert.strictEqual(requiresStackProfile({ files_changed: [] }), false);
});

test('requiresStackProfile is true when files_changed includes package.json', () => {
  assert.strictEqual(requiresStackProfile({ files_changed: ['package.json'] }), true);
});

test('requiresStackProfile is true for a genuine scaffold with mixed files', () => {
  assert.strictEqual(requiresStackProfile({
    files_changed: ['package.json', 'src/app/page.tsx', '.devteam/stack-profile.md'],
  }), true);
});

test('scaffoldEvidence is false when both report and git show only .devteam/', () => {
  assert.strictEqual(scaffoldEvidence(['.devteam/reports/infra-architect-1.json'], []), false);
});

test('scaffoldEvidence is true when the report under-reports but git shows a scaffold', () => {
  // The hole this closes: an agent whose report names only its own report
  // file, while the working tree shows package.json actually changed.
  assert.strictEqual(
    scaffoldEvidence(['.devteam/reports/infra-architect-1.json'], [' M package.json']),
    true);
});

test('scaffoldEvidence is true when the report names a scaffolded file even with no git evidence', () => {
  assert.strictEqual(scaffoldEvidence(['package.json'], []), true);
});

test('scaffoldEvidence parses git porcelain status prefixes rather than treating lines as raw paths', () => {
  // Untracked and modified prefixes both strip correctly...
  assert.strictEqual(scaffoldEvidence([], ['?? src/index.ts']), true);
  assert.strictEqual(scaffoldEvidence([], [' M package.json']), true);
  // ...and a porcelain line for a file actually under .devteam/ is not
  // mistaken for "outside" just because the raw line (with its status
  // prefix) doesn't start with ".devteam/".
  assert.strictEqual(scaffoldEvidence([], ['M  .devteam/stack-profile.md']), false);
});

test('scaffoldEvidence tolerates an undefined or empty git line array', () => {
  assert.strictEqual(scaffoldEvidence(['.devteam/brief.md'], undefined), false);
  assert.strictEqual(scaffoldEvidence(['.devteam/brief.md']), false);
});

// --- scopeConflicts: does the Directory map assign paths agents can't write? ---
//
// The defect this closes: a stack profile can name a real agent as owner of
// a path that agent's scope-map.json entry does not actually cover. The
// foundation gate approved exactly this ("pass"), the builder correctly
// refused to write out of scope and reported blocked, and two deliverables
// were never produced. scopeConflicts() is the pure check that would have
// caught it: parse the Directory map table, and for every row whose owner
// is a real agent, confirm the scope map actually lets that agent write
// there -- reusing matchAny() and the self-report exemption rather than
// reimplementing glob matching.

const REAL_SCOPE_MAP = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'scope-map.json'), 'utf8'));

function dirMapProfile(rows) {
  const table = ['| File | Owner |', '|---|---|', ...rows].join('\n');
  return profile({ 'Directory map': table });
}

test('assigning src/server.js to backend-engineer produces no conflict', () => {
  const text = dirMapProfile(['| `src/server.js` | backend-engineer |']);
  assert.deepStrictEqual(scopeConflicts(text, REAL_SCOPE_MAP), []);
});

test('assigning public/index.html to backend-engineer produces a conflict naming the path and owner', () => {
  const text = dirMapProfile(['| `public/index.html` | backend-engineer |']);
  const errors = scopeConflicts(text, REAL_SCOPE_MAP);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /public\/index\.html/);
  assert.match(errors[0], /backend-engineer/);
});

test('assigning a path to a read-only agent produces a conflict', () => {
  const text = dirMapProfile(['| `src/anything.ts` | code-reviewer |']);
  const errors = scopeConflicts(text, REAL_SCOPE_MAP);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /code-reviewer/);
});

test('a profile with no Directory map table produces no conflicts', () => {
  assert.deepStrictEqual(scopeConflicts(profile(), REAL_SCOPE_MAP), []);
});

test('an empty or missing profile produces no conflicts', () => {
  assert.deepStrictEqual(scopeConflicts('', REAL_SCOPE_MAP), []);
  assert.deepStrictEqual(scopeConflicts(null, REAL_SCOPE_MAP), []);
  assert.deepStrictEqual(scopeConflicts(undefined, REAL_SCOPE_MAP), []);
});

test('a row whose owner is not a known agent is ignored', () => {
  const text = dirMapProfile(['| `src/whatever.ts` | some-random-team |']);
  assert.deepStrictEqual(scopeConflicts(text, REAL_SCOPE_MAP), []);
});

test('multiple conflicting rows each produce their own error', () => {
  const text = dirMapProfile([
    '| `public/index.html` | backend-engineer |',
    '| `src/app/page.tsx` | code-reviewer |',
  ]);
  assert.strictEqual(scopeConflicts(text, REAL_SCOPE_MAP).length, 2);
});
