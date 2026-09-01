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
      path.join(__dirname, '..', '..', 'scripts', 'setup.mjs')).href);
  }
  return mod;
}

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}
const NEXT_PKG = JSON.stringify({
  scripts: { dev: 'next dev', build: 'next build', lint: 'eslint' },
  dependencies: { next: '16.2.2', react: '19.2.4' },
});

test('the plugin tools are granted by absolute path', async () => {
  // The whole reason this exists. Six tools live in the plugin directory, whose
  // path differs on every machine, so a committed profile cannot name them and
  // a person should not have to type them.
  const { buildProfile } = await load();
  const allow = buildProfile(project({ 'package.json': NEXT_PKG })).permissions.allow;
  for (const tool of ['shoot.mjs', 'waste.mjs', 'seo.mjs', 'checkpoint.mjs', 'survey.mjs', 'review-run.mjs']) {
    const entry = allow.find((a) => a.includes(tool));
    assert.ok(entry, 'no grant for ' + tool);
    assert.match(entry, /Bash\(node \/?[A-Za-z]?:?\/.*scripts\//, tool + ' was granted by a relative path: ' + entry);
  }
});

test('only scripts the project actually has are granted', async () => {
  // Granting a script that does not exist is noise, and noise teaches people to
  // stop reading the file.
  const { buildProfile } = await load();
  const allow = buildProfile(project({ 'package.json': NEXT_PKG })).permissions.allow;
  assert.ok(allow.includes('Bash(npm run build)'));
  assert.ok(allow.includes('Bash(npm run lint)'));
  assert.ok(!allow.some((a) => /npm run typecheck/.test(a)), 'granted a script the project does not define');
  assert.ok(!allow.some((a) => /npm test/.test(a)), 'granted npm test with no test script');
});

test('node -e is never granted, whatever the options', async () => {
  // The write-scope hook watches file writes and cannot see inside a shell
  // command, so node -e would let a builder write anywhere on disk. This
  // command must not become the exception that reintroduces it.
  const { buildProfile } = await load();
  const root = project({ 'package.json': NEXT_PKG });
  for (const opts of [{}, { allowInstall: true }, { allowGenerate: 'higgsfield' }]) {
    const allow = buildProfile(root, opts).permissions.allow;
    // The precise property, not a loose pattern: every `node` grant must run a
    // named .mjs inside this plugin's own scripts directory. `node -e`,
    // `node -p` and a bare `node` all fail that, and so does running an
    // arbitrary file. An earlier version of this test matched `node ` followed
    // by anything non-dash, which flagged the plugin's own legitimate grants.
    // Exactly three shapes are safe, and the profile already documents two of
    // them: `node --version` reports and does nothing, `node --test` is the
    // sanctioned way to prove something with real code, and a named .mjs inside
    // this plugin's scripts directory is audited code. Anything else -- `node -e`,
    // `node -p`, a bare `node`, an arbitrary file -- runs whatever it is handed.
    const SAFE = [
      /^Bash\(node --version\)$/,
      /^Bash\(node --test(:\*)?\)$/,
      /^Bash\(node .*\/scripts\/[a-z-]+\.mjs:\*\)$/,
    ];
    const nodeGrants = allow.filter((a) => /^Bash\(node\b/.test(a));
    assert.ok(nodeGrants.length > 0, 'expected the plugin tools to be granted');
    for (const g of nodeGrants) {
      assert.ok(SAFE.some((re) => re.test(g)),
        'a node grant that runs arbitrary code, with options '
        + JSON.stringify(opts) + ': ' + g);
    }
  }
});

test('installing and generating are off unless asked for, and say why', async () => {
  const { buildProfile } = await load();
  const root = project({ 'package.json': NEXT_PKG });

  const off = buildProfile(root);
  assert.ok(!off.permissions.allow.some((a) => /npm install|create-next-app/.test(a)));
  assert.match(off['//install'], /postinstall/, 'the reason install is withheld is not in the file');
  assert.match(off['//generate'], /blocked check/, 'nothing explains what happens without a generator');

  const on = buildProfile(root, { allowInstall: true });
  assert.ok(on.permissions.allow.includes('Bash(npm install)'));
  assert.ok(!on['//install'], 'the withheld-note should go once it is granted');
});

test('a generator grant is sanitised, not interpolated raw', async () => {
  // The binary name lands inside a permission string. Anything shell-shaped in
  // it would be granting something nobody asked for.
  const { buildProfile } = await load();
  const root = project({ 'package.json': NEXT_PKG });
  const allow = buildProfile(root, { allowGenerate: 'higgs; rm -rf /' }).permissions.allow;
  assert.ok(!allow.some((a) => a.includes(';')), 'a shell metacharacter survived into a grant');
  assert.ok(allow.some((a) => /higgsrm-rf/.test(a)), 'expected the name to be stripped, got: ' + allow.filter((a) => /generate/.test(a)));
});

test('an existing settings file is merged, never clobbered', async () => {
  const { setup, settingsPath } = await load();
  const root = project({
    'package.json': NEXT_PKG,
    '.claude/settings.local.json': JSON.stringify({
      permissions: { allow: ['Bash(my-own-tool:*)'] }, somethingElse: true,
    }),
  });
  const r = setup(root, { write: true });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.merged, true);
  const written = JSON.parse(fs.readFileSync(settingsPath(root), 'utf8'));
  assert.ok(written.permissions.allow.includes('Bash(my-own-tool:*)'), 'an existing grant was lost');
  assert.strictEqual(written.somethingElse, true, 'an unrelated setting was lost');
});

test('an unreadable settings file stops rather than being replaced', async () => {
  const { setup } = await load();
  const root = project({ 'package.json': NEXT_PKG, '.claude/settings.local.json': '{ not json' });
  const r = setup(root, { write: true });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /not valid JSON/);
  assert.match(fs.readFileSync(path.join(root, '.claude', 'settings.local.json'), 'utf8'), /not json/,
    'the unreadable file was overwritten anyway');
});

test('the written file is kept out of version control', async () => {
  // It contains absolute paths for one machine. Committed, it breaks everyone
  // else's checkout.
  const { setup } = await load();
  const root = project({ 'package.json': NEXT_PKG, '.gitignore': 'node_modules/\n' });
  const r = setup(root, { write: true });
  assert.strictEqual(r.gitignore.added, true);
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /\.claude\/settings\.local\.json/);
});

test('a dry run writes nothing', async () => {
  const { setup, settingsPath } = await load();
  const root = project({ 'package.json': NEXT_PKG });
  const r = setup(root);
  assert.strictEqual(r.wrote, false);
  assert.strictEqual(fs.existsSync(settingsPath(root)), false, 'a dry run created the settings file');
  assert.ok(r.profile.permissions.allow.length > 0, 'a dry run should still show what it would grant');
});

test('an empty directory is set up without pretending to detect a stack', async () => {
  const { setup } = await load();
  const r = setup(project({}));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.detected.framework, null);
  assert.strictEqual(r.detected.isEmpty, true);
  assert.ok(r.profile.permissions.allow.length > 0, 'even an empty project needs the base grants');
});
