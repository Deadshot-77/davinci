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
      path.join(__dirname, '..', '..', 'scripts', 'checkpoint.mjs')).href);
  }
  return mod;
}

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}
const read = (root, rel) => {
  try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch { return null; }
};

test('a restore reverts edits, restores deletions, and removes additions', async () => {
  // The three ways a slice changes a tree. Reverting only edits would leave
  // the rejected slice's new files behind, which is the failure that makes a
  // half-built undo worse than none.
  const { save, restore } = await load();
  const root = project({ 'src/edit.txt': 'before\n', 'src/gone.txt': 'here\n' });

  assert.strictEqual(save(root, 'S1').ok, true);
  fs.writeFileSync(path.join(root, 'src/edit.txt'), 'after\n');
  fs.unlinkSync(path.join(root, 'src/gone.txt'));
  fs.writeFileSync(path.join(root, 'src/added.txt'), 'new\n');

  const r = restore(root, 'S1');
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(read(root, 'src/edit.txt'), 'before\n', 'an edit was not reverted');
  assert.strictEqual(read(root, 'src/gone.txt'), 'here\n', 'a deletion was not restored');
  assert.strictEqual(read(root, 'src/added.txt'), null, 'a file the slice added was left behind');
});

test('undoing is itself undoable', async () => {
  // Rejecting a slice must not be the destructive act. If the rejection was
  // the mistake, the work has to be recoverable.
  const { save, restore } = await load();
  const root = project({ 'a.txt': 'v1\n' });
  save(root, 'S1');
  fs.writeFileSync(path.join(root, 'a.txt'), 'v2\n');

  const undo = restore(root, 'S1');
  assert.strictEqual(read(root, 'a.txt'), 'v1\n');
  assert.ok(undo.safetyCheckpoint, 'no safety checkpoint was taken before restoring');

  const redo = restore(root, undo.safetyCheckpoint);
  assert.strictEqual(redo.ok, true, redo.error);
  assert.strictEqual(read(root, 'a.txt'), 'v2\n', 'the discarded work could not be recovered');
});

test('the project\'s own git history is never touched', async () => {
  // The whole reason for a shadow repo. A commit-per-slice scheme would have
  // needed the `git commit` grant this profile deliberately withholds, and
  // would have written into a history the user cares about.
  const { save, shadowDir } = await load();
  const root = project({ 'a.txt': 'x\n' });
  save(root, 'S1');
  assert.strictEqual(fs.existsSync(path.join(root, '.git')), false,
    'a real git repository was created in the project');
  assert.ok(fs.existsSync(shadowDir(root)), 'the shadow store was not created');
});

test('build output and dependencies are never snapshotted', async () => {
  const { save, restore } = await load();
  const root = project({ 'a.txt': 'x\n', 'node_modules/p/i.js': 'lib\n', '.next/c.js': 'chunk\n' });
  save(root, 'S1');
  fs.writeFileSync(path.join(root, 'node_modules/p/i.js'), 'CHANGED\n');
  restore(root, 'S1');
  assert.strictEqual(read(root, 'node_modules/p/i.js'), 'CHANGED\n',
    'node_modules was captured, which would make every checkpoint enormous');
  assert.strictEqual(read(root, '.next/c.js'), 'chunk\n');
});

test('the shadow store never snapshots itself', async () => {
  const { save, list } = await load();
  const root = project({ 'a.txt': 'x\n' });
  save(root, 'S1');
  save(root, 'S2');
  assert.strictEqual(list(root).checkpoints.length, 2);
  assert.strictEqual(save(root, 'S3').ok, true, 'a store containing itself eventually fails to commit');
});

test('restoring a checkpoint that does not exist refuses rather than doing nothing', async () => {
  // Quietly succeeding here would let a rejection appear to work while the
  // rejected code stayed exactly where it was.
  const { restore } = await load();
  const root = project({ 'a.txt': 'x\n' });
  const r = restore(root, 'never-saved');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no checkpoint labelled/);
});

test('the most recent checkpoint with a label is the one restored', async () => {
  // A slice re-run after rejection saves its label again; reverting must go to
  // the latest attempt, not the first.
  const { save, restore } = await load();
  const root = project({ 'a.txt': 'first\n' });
  save(root, 'S1');
  fs.writeFileSync(path.join(root, 'a.txt'), 'second\n');
  save(root, 'S1');
  fs.writeFileSync(path.join(root, 'a.txt'), 'third\n');
  restore(root, 'S1');
  assert.strictEqual(read(root, 'a.txt'), 'second\n');
});

test('a save with no label is refused', async () => {
  const { save } = await load();
  const root = project({ 'a.txt': 'x\n' });
  const r = save(root, '');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /needs a label/);
});

test('git being absent is reported, never treated as a checkpoint taken', async () => {
  // Same rule as everywhere else: a check that could not run is not a check
  // that passed. A checkpoint nobody took must not look like one that exists,
  // or a later restore silently does nothing.
  const { save } = await load();
  const root = project({ 'a.txt': 'x\n' });
  const noGit = () => ({ status: 127, stdout: '', stderr: 'not found' });
  const r = save(root, 'S1', { spawnImpl: noGit });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /git is not available/);
  assert.match(r.error, /rather than proceeding as if one exists/);
});
