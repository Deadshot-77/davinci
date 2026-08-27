const { test } = require('node:test');
const assert = require('node:assert');
const { globToRegExp, matchAny } = require('../lib/glob.js');

test('* does not cross a slash', () => {
  assert.ok(globToRegExp('*.json').test('package.json'));
  assert.ok(!globToRegExp('*.json').test('src/tsconfig.json'));
});

test('** crosses slashes', () => {
  assert.ok(globToRegExp('src/**').test('src/api/users.ts'));
  assert.ok(globToRegExp('src/**').test('src/index.ts'));
  assert.ok(!globToRegExp('src/**').test('lib/index.ts'));
});

test('dots are literal, not wildcards', () => {
  assert.ok(!globToRegExp('.gitignore').test('xgitignore'));
  assert.ok(globToRegExp('.gitignore').test('.gitignore'));
});

test('matchAny returns true when any glob matches', () => {
  assert.ok(matchAny('src/app/page.tsx', ['public/**', 'src/app/**']));
  assert.ok(!matchAny('src/api/db.ts', ['public/**', 'src/app/**']));
});

test('empty glob list never matches', () => {
  assert.ok(!matchAny('anything.ts', []));
});

test('? is literal, not a quantifier', () => {
  assert.ok(globToRegExp('a?.json').test('a?.json'));
  assert.ok(!globToRegExp('a?.json').test('.json'));
});
