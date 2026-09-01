// Writes the permission profile, so nobody has to hand-assemble one.
//
// The plugin's agents run in sealed sessions and cannot reach the user --
// measured: AskUserQuestion exists on the main thread and nowhere below it. So
// a command an agent lacks permission for is not a prompt, it is a refusal, and
// the agent correctly reports a blocked check instead of doing the work.
// Measured runs against a hand-narrowed profile hit 25 to 57 refusals each.
//
// Six of this plugin's tools live in the plugin directory, whose absolute path
// differs on every machine, so a committed profile cannot name them. This
// script knows its own location and fills them in.
//
// Usage: node scripts/setup.mjs [projectRoot] [--write] [--allow-install]
//                               [--allow-generate <binary>] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const posix = (p) => p.split(path.sep).join('/');

// Read-only, safe anywhere, and what an agent needs to look before it writes.
const BASE = [
  'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)',
  'Bash(grep:*)', 'Bash(rg:*)', 'Bash(find:*)', 'Bash(test -f:*)', 'Bash(test -d:*)',
  'Bash(command -v:*)', 'Bash(which:*)', 'Bash(mkdir:*)',
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)',
  'Bash(git rev-parse:*)', 'Bash(git ls-files:*)', 'Bash(git show:*)',
  'Write', 'Edit',
];

// Only the tools an agent invokes. eval.mjs and png-crop.mjs are not among
// them: one is a harness you run yourself, the other is a library.
const TOOLS = ['shoot.mjs', 'waste.mjs', 'seo.mjs', 'checkpoint.mjs', 'survey.mjs', 'review-run.mjs'];

// Granting a script that does not exist is noise that teaches people to stop
// reading the profile.
function projectScripts(root) {
  const out = [];
  const pkgPath = path.join(root, 'package.json');
  let pkg = null;
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { /* unparseable */ }
  }
  if (pkg) {
    const s = pkg.scripts || {};
    for (const name of ['build', 'test', 'lint', 'typecheck', 'check']) {
      if (s[name]) { out.push(`Bash(npm run ${name})`, `Bash(npm run ${name}:*)`); }
    }
    if (s.test) out.push('Bash(npm test)', 'Bash(npm test:*)');
    out.push('Bash(npm ls:*)', 'Bash(npm view:*)', 'Bash(node --version)', 'Bash(node --test:*)');
  }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'))) {
    out.push('Bash(python -m pytest:*)', 'Bash(python3 -m pytest:*)', 'Bash(pytest:*)',
      'Bash(ruff check:*)', 'Bash(python --version)', 'Bash(python3 --version)');
  }
  return out;
}

function detect(root) {
  const has = (f) => fs.existsSync(path.join(root, f));
  let framework = null, pkg = null;
  if (has('package.json')) {
    try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { /* */ }
  }
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  for (const [name, label] of [['next', 'Next.js'], ['astro', 'Astro'], ['nuxt', 'Nuxt'],
    ['vite', 'Vite'], ['react', 'React'], ['svelte', 'Svelte']]) {
    if (deps[name]) { framework = label; break; }
  }
  if (!framework && (has('pyproject.toml') || has('requirements.txt'))) framework = 'Python';
  return {
    framework,
    hasPackageJson: !!pkg,
    hasGit: has('.git'),
    isEmpty: !pkg && !has('src') && !has('app') && !has('pyproject.toml'),
    scriptNames: pkg ? Object.keys(pkg.scripts || {}) : [],
  };
}

export function buildProfile(root, opts = {}) {
  const allow = [...BASE, ...projectScripts(root)];
  for (const t of TOOLS) allow.push(`Bash(node ${posix(path.join(PLUGIN, 'scripts', t))}:*)`);

  // Both of these hand real power to an agent, so neither is on unless asked
  // for. Each carries the reason with it, in the file, where the next person
  // to wonder will actually look.
  if (opts.allowInstall) {
    allow.push('Bash(npm install)', 'Bash(npm ci)', 'Bash(npx --yes create-next-app:*)',
      'Bash(npm create:*)', 'Bash(npx --yes create-astro:*)');
  }
  if (opts.allowGenerate) {
    const bin = String(opts.allowGenerate).replace(/[^a-zA-Z0-9_.-]/g, '');
    if (bin) allow.push(`Bash(${bin} generate:*)`, `Bash(${bin} workflow:*)`,
      `Bash(${bin} account status)`, `Bash(${bin} model:*)`);
  }

  const profile = {
    '//': 'Written by davinci setup. The absolute paths below point at this machine\'s plugin install, so this file is machine-specific and should not be committed.',
    permissions: { allow: [...new Set(allow)] },
    '//excluded': 'Deliberately absent: node -e, node -p, and running an arbitrary script file. The write-scope hook watches file writes and cannot see inside a shell command, so `node -e "require(\'fs\').writeFileSync(...)"` would write anywhere on disk. This list is the only thing preventing that. An agent that needs real code writes a test and runs it with node --test.',
  };
  if (!opts.allowInstall) {
    profile['//install'] = 'npm install is not granted. Installing runs a package\'s own postinstall scripts, which is arbitrary code from the internet executing on this machine. Re-run setup with --allow-install to turn it on -- that is what lets the plugin scaffold a project and choose current versions itself.';
  }
  if (!opts.allowGenerate) {
    profile['//generate'] = 'No image generator is granted. Discovery is (command -v), so an agent can find one and will report a blocked check rather than claiming none exists. Re-run with --allow-generate <binary> to let it actually generate -- that spends real credits.';
  }
  return profile;
}

export function settingsPath(root) { return path.join(root, '.claude', 'settings.local.json'); }

// settings.local.json is the personal, per-machine file. These paths are
// specific to one install, so committing them would break every other machine.
function ensureGitignored(root) {
  const gi = path.join(root, '.gitignore');
  const line = '.claude/settings.local.json';
  if (!fs.existsSync(gi)) return { added: false, reason: 'no .gitignore in this project' };
  const text = fs.readFileSync(gi, 'utf8');
  if (text.includes('.claude/settings.local.json') || /^\.claude\/?$/m.test(text)) {
    return { added: false, reason: 'already ignored' };
  }
  fs.appendFileSync(gi, (text.endsWith('\n') ? '' : '\n') + line + '\n');
  return { added: true, reason: 'appended' };
}

export function setup(root, opts = {}) {
  if (!fs.existsSync(root)) return { ok: false, error: `no such directory: ${root}` };
  const detected = detect(root);
  const profile = buildProfile(root, opts);
  const target = settingsPath(root);

  const result = {
    ok: true, root, plugin: posix(PLUGIN), detected, profile, target,
    granted: profile.permissions.allow.length,
    wrote: false, merged: false, gitignore: null,
  };
  if (!opts.write) return result;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    // Never clobber settings someone already has. Merge, and say so.
    try {
      const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
      const before = new Set(existing?.permissions?.allow || []);
      const merged = { ...existing, ...profile,
        permissions: { ...(existing.permissions || {}), ...profile.permissions,
          allow: [...new Set([...before, ...profile.permissions.allow])] } };
      fs.writeFileSync(target, JSON.stringify(merged, null, 2) + '\n');
      result.merged = true;
      result.granted = merged.permissions.allow.length;
    } catch (err) {
      return { ...result, ok: false, error: `${target} exists but is not valid JSON (${err.message}); fix or move it, nothing was written` };
    }
  } else {
    fs.writeFileSync(target, JSON.stringify(profile, null, 2) + '\n');
  }
  result.wrote = true;
  result.gitignore = ensureGitignored(root);
  return result;
}

function report(r) {
  if (!r.ok) { console.error('setup: ' + r.error); return 2; }
  const d = r.detected;
  const out = [];
  out.push(`project: ${r.root}`);
  out.push(`  ${d.framework ? d.framework + ' detected' : d.isEmpty ? 'empty directory — nothing to detect yet' : 'no framework detected'}` +
    (d.scriptNames.length ? `, scripts: ${d.scriptNames.join(', ')}` : '') +
    (d.hasGit ? '' : ', not a git repository'));
  out.push(`plugin:  ${r.plugin}`);
  out.push('');
  out.push(`${r.granted} commands granted, including the six plugin tools by absolute path.`);

  const optIns = Object.keys(r.profile).filter((k) => k === '//install' || k === '//generate');
  if (optIns.length) {
    out.push('', 'Not granted, on purpose:');
    if (r.profile['//install']) out.push('  - installing packages (npm install). Without it the plugin cannot scaffold a\n    new project or pick current versions itself. Turn on with --allow-install.');
    if (r.profile['//generate']) out.push('  - generating images. Turn on with --allow-generate <binary>; it spends credits.');
  }
  out.push('', '  node -e is never granted. It is how an agent could write outside its lane,');
  out.push('  and the file-write hook cannot see inside a shell command.');

  if (r.wrote) {
    out.push('', `${r.merged ? 'Merged into' : 'Wrote'} ${r.target}`);
    if (r.gitignore?.added) out.push('Added it to .gitignore — the paths are specific to this machine.');
    else if (r.gitignore) out.push(`.gitignore: ${r.gitignore.reason}.`);
  } else {
    out.push('', 'Nothing written. Re-run with --write to save it to');
    out.push('  ' + r.target);
  }
  console.log(out.join('\n'));
  return 0;
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url.endsWith(path.basename(process.argv[1])); } catch { return false; }
})();

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
  const genFlag = args.find((a) => a.startsWith('--allow-generate'));
  const r = setup(root, {
    write: args.includes('--write'),
    allowInstall: args.includes('--allow-install'),
    allowGenerate: genFlag ? (genFlag.split('=')[1] || args[args.indexOf(genFlag) + 1]) : null,
  });
  if (args.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 2); }
  process.exit(report(r));
}
