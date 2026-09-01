// Workspace checkpoints, so a slice can be taken back.
//
// A checkpoint without a rollback is only half a checkpoint: you can look at
// the work, but your only options are accept it or unpick it by hand. This
// gives the third option.
//
// It uses a SHADOW git repository -- a git dir under .devteam pointed at the
// project as its work tree. The idea is borrowed from Cline, and it is the
// right one for two reasons. The user's own git history stays completely
// untouched, so nothing here writes to a branch or a log they care about; and
// this plugin's permission profile deliberately withholds `git commit`, which a
// commit-per-slice scheme would have needed.
//
// Usage: node scripts/checkpoint.mjs save    <root> <label>
//        node scripts/checkpoint.mjs list    <root>
//        node scripts/checkpoint.mjs changes <root> <label>
//        node scripts/checkpoint.mjs restore <root> <label>
// Exit:  0 ok, 1 refused or nothing to do, 2 could not run

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SHADOW = ['.devteam', 'checkpoints', 'git'];

// Snapshotting node_modules would be catastrophic and pointless: it is large,
// reproducible from the manifest, and nothing an agent should be reverting.
const EXCLUDE = [
  'node_modules/', '.next/', '.nuxt/', '.svelte-kit/', '.astro/',
  'out/', 'dist/', 'build/', 'coverage/', '.turbo/', '.vercel/', '.cache/',
  '.venv/', '__pycache__/', '*.pyc', '.DS_Store',
  // The shadow repo must never snapshot itself.
  '.devteam/checkpoints/',
];

function git(gitDir, workTree, args, opts = {}) {
  const base = ['--git-dir', gitDir];
  if (workTree) base.push('--work-tree', workTree);
  const res = (opts.spawnImpl || spawnSync)('git', base.concat(args), {
    encoding: 'utf8', cwd: workTree || undefined,
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: String(res.stdout || '').trim(),
    stderr: String(res.stderr || '').trim(),
  };
}

export function shadowDir(root) { return path.join(root, ...SHADOW); }

function gitAvailable(spawnImpl = spawnSync) {
  const res = spawnImpl('git', ['--version'], { encoding: 'utf8' });
  return res.status === 0;
}

function ensureShadow(root, opts = {}) {
  const dir = shadowDir(root);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    const init = git(dir, root, ['init', '--quiet'], opts);
    if (!init.ok) return { ok: false, error: 'could not create the checkpoint store: ' + init.stderr };
  }
  // A checkpoint must be byte-exact. With the machine's autocrlf on -- the
  // default on Windows -- restoring rewrote every LF to CRLF, which silently
  // corrupts a project that uses LF. Caught by this script's own tests.
  for (const [k, v] of [['core.autocrlf', 'false'], ['core.safecrlf', 'false'], ['core.fileMode', 'false']]) {
    git(dir, root, ['config', k, v], opts);
  }
  // Rewritten every time so an updated exclude list takes effect.
  const info = path.join(dir, 'info');
  fs.mkdirSync(info, { recursive: true });
  fs.writeFileSync(path.join(info, 'exclude'), EXCLUDE.join('\n') + '\n');
  return { ok: true, dir };
}

export function save(root, label, opts = {}) {
  if (!fs.existsSync(root)) return { ok: false, error: `no such directory: ${root}` };
  if (!label) return { ok: false, error: 'a checkpoint needs a label' };
  if (!gitAvailable(opts.spawnImpl)) {
    // Not a silent skip. A checkpoint that was never taken must not look like
    // one that was, or a later restore will quietly do nothing.
    return { ok: false, error: 'git is not available, so no checkpoint was taken. Say so rather than proceeding as if one exists.' };
  }
  const shadow = ensureShadow(root, opts);
  if (!shadow.ok) return shadow;

  const add = git(shadow.dir, root, ['add', '-A'], opts);
  if (!add.ok) return { ok: false, error: 'could not stage the workspace: ' + add.stderr };

  const commit = git(shadow.dir, root, [
    '-c', 'user.name=davinci', '-c', 'user.email=davinci@localhost',
    'commit', '--allow-empty', '--quiet', '-m', label,
  ], opts);
  if (!commit.ok) return { ok: false, error: 'could not record the checkpoint: ' + commit.stderr };

  const sha = git(shadow.dir, root, ['rev-parse', 'HEAD'], opts);
  return { ok: true, label, sha: sha.stdout.slice(0, 12) };
}

export function list(root, opts = {}) {
  const dir = shadowDir(root);
  if (!fs.existsSync(dir)) return { ok: true, checkpoints: [] };
  const log = git(dir, root, ['log', '--format=%H%x09%s'], opts);
  if (!log.ok) return { ok: true, checkpoints: [] };
  const checkpoints = log.stdout.split('\n').filter(Boolean).map((line) => {
    const [sha, ...rest] = line.split('\t');
    return { sha: sha.slice(0, 12), label: rest.join('\t') };
  });
  return { ok: true, checkpoints };
}

function findCheckpoint(root, label, opts) {
  const { checkpoints } = list(root, opts);
  // Most recent match, so a re-run of a slice reverts to its latest attempt.
  return checkpoints.find((c) => c.label === label) || null;
}

export function changes(root, label, opts = {}) {
  const found = findCheckpoint(root, label, opts);
  if (!found) return { ok: false, error: `no checkpoint labelled "${label}"` };
  const dir = shadowDir(root);
  git(dir, root, ['add', '-A'], opts);
  const diff = git(dir, root, ['diff', '--stat', found.sha], opts);
  return { ok: true, label, sha: found.sha, stat: diff.stdout };
}

export function restore(root, label, opts = {}) {
  if (!gitAvailable(opts.spawnImpl)) return { ok: false, error: 'git is not available, so nothing can be restored' };
  const found = findCheckpoint(root, label, opts);
  if (!found) return { ok: false, error: `no checkpoint labelled "${label}"` };
  const dir = shadowDir(root);

  // Undoing is itself undoable. Without this, rejecting a slice destroys the
  // work with no way back if the rejection was the mistake.
  const before = save(root, `before-restore-of-${label}`, opts);
  if (!before.ok) return { ok: false, error: 'refused: could not snapshot the current state first (' + before.error + ')' };

  const read = git(dir, root, ['read-tree', '-u', '--reset', found.sha], opts);
  if (!read.ok) return { ok: false, error: 'could not restore: ' + read.stderr };

  return { ok: true, label, sha: found.sha, safetyCheckpoint: before.label };
}

function main() {
  const [cmd, rootArg, label] = process.argv.slice(2);
  const root = path.resolve(rootArg || process.cwd());

  const print = (r, ok) => {
    if (!r.ok) { console.error('checkpoint: ' + r.error); return r.error && /refused|not available/.test(r.error) ? 1 : 2; }
    ok(r);
    return 0;
  };

  switch (cmd) {
    case 'save':
      return print(save(root, label), (r) => console.log(`saved checkpoint "${r.label}" (${r.sha})`));
    case 'list':
      return print(list(root), (r) => {
        if (!r.checkpoints.length) return console.log('no checkpoints');
        for (const c of r.checkpoints) console.log(`${c.sha}  ${c.label}`);
      });
    case 'changes':
      return print(changes(root, label), (r) => {
        console.log(`changes since "${r.label}" (${r.sha}):`);
        console.log(r.stat || '  (nothing changed)');
      });
    case 'restore':
      return print(restore(root, label), (r) => {
        console.log(`restored to "${r.label}" (${r.sha})`);
        console.log(`the state before this restore is saved as "${r.safetyCheckpoint}"`);
      });
    default:
      console.error('usage: node scripts/checkpoint.mjs save|list|changes|restore <root> [label]');
      return 2;
  }
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url.endsWith(path.basename(process.argv[1])); } catch { return false; }
})();

if (invokedDirectly) process.exit(main());
