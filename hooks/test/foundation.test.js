const { test } = require('node:test');
const assert = require('node:assert');
const { validateFoundation, REQUIRED_SECTIONS, parseSections } = require('../lib/foundation.js');

function profile(overrides) {
  const body = {
    Framework: 'Next.js 15',
    Language: 'TypeScript 5',
    'Package manager': 'npm',
    'Directory map': 'src/app, src/components',
    'Naming conventions': 'kebab-case files',
    Testing: 'vitest',
    Commands: 'npm run dev',
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
