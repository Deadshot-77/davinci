'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let mod;
async function load() {
  if (!mod) {
    mod = await import(require('node:url').pathToFileURL(
      path.join(__dirname, '..', '..', 'scripts', 'eval.mjs')).href);
  }
  return mod;
}

function workspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evalt-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

test('an unusable pattern fails the check instead of throwing', async () => {
  // This is the important one. The first version threw on `(?i)` -- PCRE
  // syntax, not JavaScript -- and destroyed a nine-minute run that had already
  // cost $2.36. A typo in an assertion must never cost a paid run.
  const { check } = await load();
  const r = check({ kind: 'stream-contains', pattern: '(?i)oops' }, { root: '.', stream: 'x' });
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.invalid, true);
  assert.match(r.detail, /unusable pattern/);
});

test('an unknown expectation kind is reported, not silently passed', async () => {
  // A typo in `kind` that quietly scored as a pass would make a case look
  // stronger than it is, which is worse than no case at all.
  const { check } = await load();
  const r = check({ kind: 'file-contians', path: 'a.txt', pattern: 'x' }, { root: '.', stream: '' });
  assert.strictEqual(r.pass, false);
  assert.strictEqual(r.invalid, true);
  assert.match(r.detail, /unknown expectation kind/);
});

test('file presence and absence are both checkable', async () => {
  const { check } = await load();
  const root = workspace({ 'there.txt': 'x' });
  assert.strictEqual(check({ kind: 'file-exists', path: 'there.txt' }, { root }).pass, true);
  assert.strictEqual(check({ kind: 'file-exists', path: 'gone.txt' }, { root }).pass, false);
  assert.strictEqual(check({ kind: 'file-absent', path: 'gone.txt' }, { root }).pass, true);
  assert.strictEqual(check({ kind: 'file-absent', path: 'there.txt' }, { root }).pass, false);
});

test('a missing file fails file-contains but satisfies file-lacks', async () => {
  // "The text is not in this file" is true of a file that does not exist, and
  // "the text is in it" cannot be.
  const { check } = await load();
  const root = workspace({});
  assert.strictEqual(check({ kind: 'file-contains', path: 'x.txt', pattern: 'a' }, { root }).pass, false);
  assert.strictEqual(check({ kind: 'file-lacks', path: 'x.txt', pattern: 'a' }, { root }).pass, true);
});

test('patterns are case-insensitive unless the case says otherwise', async () => {
  const { check } = await load();
  const root = workspace({ 'a.txt': 'Classification: TRIVIAL\n' });
  assert.strictEqual(check({ kind: 'file-contains', path: 'a.txt', pattern: 'trivial' }, { root }).pass, true);
  assert.strictEqual(
    check({ kind: 'file-contains', path: 'a.txt', pattern: 'trivial', flags: '' }, { root }).pass, false,
    'an explicit flags value should override the default');
});

test('the run stream is checkable in both directions', async () => {
  const { check } = await load();
  const ctx = { root: '.', stream: 'called checkpoint.mjs save . trivial' };
  assert.strictEqual(check({ kind: 'stream-contains', pattern: 'checkpoint\\.mjs save' }, ctx).pass, true);
  assert.strictEqual(check({ kind: 'stream-lacks', pattern: 'plan-approved' }, ctx).pass, true);
  assert.strictEqual(check({ kind: 'stream-lacks', pattern: 'checkpoint' }, ctx).pass, false);
});

test('every expectation carries the sentence explaining what a failure means', async () => {
  const { score } = await load();
  const results = score(
    [{ kind: 'file-absent', path: 'plan.md', why: 'a one-line change earned a plan' }],
    { root: workspace({ 'plan.md': 'x' }), stream: '' });
  assert.strictEqual(results[0].pass, false);
  assert.strictEqual(results[0].why, 'a one-line change earned a plan',
    'a failure with no explanation makes the reader guess what broke');
});

test('the shipped cases are all loadable and their patterns compile', async () => {
  // Catches a broken case before a run is spent on it, which is the whole
  // reason the pattern check is separable from the run.
  const { loadCases, check } = await load();
  const cases = loadCases();
  assert.ok(cases.length > 0, 'the plugin ships no eval cases');
  for (const c of cases) {
    assert.ok(!c.error, `${c.name}: ${c.error}`);
    assert.ok(c.prompt, `${c.name} has no prompt`);
    assert.ok((c.expect || []).length, `${c.name} asserts nothing`);
    for (const e of c.expect) {
      const r = check(e, { root: os.tmpdir(), stream: '' });
      assert.ok(!r.invalid, `${c.name}: ${r.detail}`);
      assert.ok(e.why, `${c.name}: an expectation has no "why"`);
    }
  }
});

test('a run that never attempted the task is inconclusive, not scored', async () => {
  // The first baseline arm answered "Unknown command: /davinci:build" in zero
  // turns for $0.00 and scored 3/5 -- every pass was an assertion about a file
  // absent because nothing had run. Scoring that as a delta would have been a
  // fabricated result, which is the failure this harness exists to catch
  // everywhere else.
  const { score } = await load();
  const stream = '{"type":"assistant","message":{"content":[{"type":"text","text":"Unknown command: /davinci:build"}]}}';
  const results = score(
    [{ kind: 'file-absent', path: 'plan.md', why: 'no plan was written' }],
    { root: os.tmpdir(), stream });
  assert.strictEqual(results[0].pass, true,
    'the assertion itself still passes -- which is exactly why the arm must be marked unattempted');

  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'scripts', 'eval.mjs'), 'utf8');
  assert.match(src, /const noAttempt =/,
    'nothing detects a run that never started, so absence reads as success');
  assert.match(src, /INCONCLUSIVE, the run never attempted the task/,
    'an unattempted arm would be reported with a score');
});

test('absence proves nothing in a run that was cut short', async () => {
  // The blocked-check case scored 3/3 while TIMED OUT. Two of those three were
  // stream-lacks assertions -- and a phrase missing from a truncated stream may
  // simply not have been written yet. Reporting that as a pass is the same
  // error as scoring a check that never ran, one costume along.
  const { score } = await load();
  const expectations = [
    { kind: 'stream-lacks', pattern: 'no generator', why: 'absence claimed' },
    { kind: 'stream-contains', pattern: 'refused', why: 'the block was acknowledged' },
  ];

  const finished = score(expectations, { root: os.tmpdir(), stream: 'the probe was refused' });
  assert.strictEqual(finished[0].pass, true, 'a finished run scores its negative assertion normally');
  assert.strictEqual(finished[1].pass, true);

  const cut = score(expectations, { root: os.tmpdir(), stream: 'the probe was refused', truncated: true });
  assert.strictEqual(cut[0].unsound, true, 'a negative assertion survived a truncated run as a pass');
  assert.strictEqual(cut[0].pass, false);
  assert.match(cut[0].detail, /absence proves nothing/);
  assert.strictEqual(cut[1].pass, true,
    'a positive assertion is still sound on a truncated run -- presence is presence');
  assert.ok(!cut[1].unsound);
});
