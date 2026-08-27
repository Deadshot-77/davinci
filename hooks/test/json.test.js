const { test } = require('node:test');
const assert = require('node:assert');
const { parseJson } = require('../lib/json.js');

test('parses ordinary JSON', () => {
  assert.deepStrictEqual(parseJson('{"a":1}'), { a: 1 });
});

test('parses JSON carrying a UTF-8 BOM', () => {
  assert.deepStrictEqual(parseJson('\uFEFF{"a":1}'), { a: 1 });
});

test('still throws on genuinely invalid JSON', () => {
  assert.throws(() => parseJson('{nope}'), SyntaxError);
});
