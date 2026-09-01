// Dependency-free project waste detection.
//
// It exists because `code-craft`'s deletion pass is file-scoped: it asks an
// agent to clean the file it just changed. That cannot see what the change
// orphaned somewhere else -- the component nobody imports any more, the route
// gone dead, the photograph still shipping in the bundle after the section that
// used it was rewritten. Those are reference-graph facts, not judgement, so a
// script answers them exactly and an agent adjudicates only what is ambiguous.
//
// Usage: node scripts/waste.mjs [projectRoot] [--json]
// Exit:  0 = nothing found, 1 = findings, 2 = could not run
//
// The report distinguishes a finding from an unknown. A project that builds
// paths at runtime cannot be statically resolved, and saying "unreferenced"
// about a file reached through a template literal would be the same error as
// reporting a refused command as a negative result.

import fs from 'node:fs';
import path from 'node:path';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.astro', '.vue', '.svelte']);
const STYLE_EXT = new Set(['.css', '.scss', '.sass', '.less']);
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.astro',
  'out', 'dist', 'build', 'coverage', '.devteam', '.turbo', '.vercel', '.cache',
]);
const STATIC_DIRS = ['public', 'static', 'assets'];

// Files a framework calls directly. Nothing imports them and that is correct.
const ENTRY_BASENAMES = new Set([
  'page', 'layout', 'route', 'loading', 'error', 'not-found', 'template',
  'default', 'global-error', 'middleware', 'instrumentation',
  'icon', 'apple-icon', 'opengraph-image', 'twitter-image',
  'sitemap', 'robots', 'manifest',
  'index', 'main', 'app', '_app', '_document',
]);

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');

function isEntryPoint(root, file) {
  const r = rel(root, file);
  const base = path.basename(file, path.extname(file));
  if (ENTRY_BASENAMES.has(base)) return true;
  // Route directories: anything under pages/ is reached by the router.
  if (/(^|\/)pages\//.test(r)) return true;
  // Config and tooling at any level.
  if (/\.(config|setup|d)\.[cm]?[jt]sx?$/.test(r)) return true;
  if (/(^|\/)(tests?|__tests__|e2e)\//.test(r) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(r)) return true;
  return false;
}

// Import specifiers, however they are written. Deliberately loose: a missed
// specifier produces a false "orphan", so over-matching is the safe direction.
function specifiersIn(text) {
  const out = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /@(?:import|use)\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) out.push(m[1]);
  }
  return out;
}

// A path assembled at runtime cannot be resolved statically. Its presence
// downgrades every "unreferenced" claim in the report rather than being
// silently ignored.
function dynamicReferenceSites(text) {
  const out = [];
  const patterns = [
    /\bimport\s*\(\s*[`]/g,
    /\brequire\s*\(\s*[^'")]*[`$]/g,
    /(?:src|href)\s*=\s*\{[^}]*[`+][^}]*\}/g,
    /(?:src|href)\s*=\s*[`][^`]*\$\{/g,
  ];
  for (const re of patterns) if (re.test(text)) out.push(re.source);
  return out;
}

function resolveSpecifier(root, fromFile, spec, allFiles) {
  let target = null;
  if (spec.startsWith('.')) {
    target = path.resolve(path.dirname(fromFile), spec);
  } else if (spec.startsWith('@/')) {
    for (const base of ['src', '.']) {
      const cand = path.resolve(root, base, spec.slice(2));
      if (allFiles.has(cand) || fs.existsSync(cand)) { target = cand; break; }
      target = target || cand;
    }
  } else if (spec.startsWith('~/')) {
    target = path.resolve(root, spec.slice(2));
  } else {
    return null; // a package, not a file in this project
  }
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.astro', '.vue', '.svelte', '.css', '.scss'];
  for (const e of exts) {
    const c = target + e;
    if (allFiles.has(c)) return c;
  }
  for (const e of exts.slice(1)) {
    const c = path.join(target, 'index' + e);
    if (allFiles.has(c)) return c;
  }
  return null;
}

export function analyse(root) {
  if (!fs.existsSync(root)) return { ok: false, error: `no such directory: ${root}` };
  const files = walk(root);
  const allFiles = new Set(files.map((f) => path.resolve(f)));

  const sources = files.filter((f) => SOURCE_EXT.has(path.extname(f)) || STYLE_EXT.has(path.extname(f)));
  const texts = new Map();
  for (const f of sources) {
    try { texts.set(f, fs.readFileSync(f, 'utf8')); } catch { /* unreadable, skip */ }
  }

  // Every project file that something else imports.
  const imported = new Set();
  const dynamic = [];
  for (const [f, text] of texts) {
    for (const spec of specifiersIn(text)) {
      const t = resolveSpecifier(root, path.resolve(f), spec, allFiles);
      if (t) imported.add(t);
    }
    if (dynamicReferenceSites(text).length) dynamic.push(rel(root, f));
  }

  const orphanModules = sources
    .filter((f) => !isEntryPoint(root, f))
    .filter((f) => !imported.has(path.resolve(f)))
    .map((f) => rel(root, f));

  // Static assets, and whether any source text mentions them.
  const staticRoots = STATIC_DIRS
    .map((d) => path.join(root, d))
    .filter((d) => fs.existsSync(d) && fs.statSync(d).isDirectory());
  const assets = staticRoots.flatMap((d) => walk(d));
  const haystack = [...texts.values()].join('\n');
  const unreferencedAssets = [];
  let totalAssetBytes = 0;
  const assetWeights = [];
  for (const a of assets) {
    let size = 0;
    try { size = fs.statSync(a).size; } catch { /* ignore */ }
    totalAssetBytes += size;
    const r = rel(root, a);
    assetWeights.push({ path: r, bytes: size });
    const base = path.basename(a);
    const served = '/' + r.split('/').slice(1).join('/');
    if (!haystack.includes(base) && !haystack.includes(served)) unreferencedAssets.push({ path: r, bytes: size });
  }

  // Internal links that point at nothing: /foo.png with no such asset, and
  // /route with no page behind it.
  const servedAssets = new Set(assets.map((a) => '/' + rel(root, a).split('/').slice(1).join('/')));
  const routes = new Set();
  for (const f of sources) {
    const r = rel(root, f);
    const m = r.match(/(?:^|\/)(?:app|pages)\/(.*)\/(?:page|route|index)\.[cm]?[jt]sx?$/);
    if (m) routes.add('/' + m[1].replace(/\((?:[^)]*)\)\//g, '').replace(/^\//, ''));
    if (/(?:^|\/)(?:app|pages)\/(?:page|index)\.[cm]?[jt]sx?$/.test(r)) routes.add('/');
  }
  const brokenLinks = [];
  const linkRe = /(?:href|src)\s*=\s*["'](\/[^"'#?]*)["']/g;
  for (const [f, text] of texts) {
    let m;
    while ((m = linkRe.exec(text))) {
      const href = m[1];
      if (servedAssets.has(href)) continue;
      const bare = href.replace(/\/$/, '') || '/';
      if (routes.has(bare) || routes.has(bare + '/')) continue;
      if (/\.[a-z0-9]{2,5}$/i.test(href)) {
        brokenLinks.push({ from: rel(root, f), href, kind: 'asset' });
      } else if (routes.size) {
        brokenLinks.push({ from: rel(root, f), href, kind: 'route' });
      }
    }
  }

  assetWeights.sort((a, b) => b.bytes - a.bytes);
  const findings = orphanModules.length + unreferencedAssets.length + brokenLinks.length;

  return {
    ok: true,
    root,
    scanned: { sources: sources.length, assets: assets.length },
    orphanModules,
    unreferencedAssets,
    brokenLinks,
    weight: { totalAssetBytes, heaviest: assetWeights.slice(0, 5) },
    // Named, not swallowed: these files build paths at runtime, so a static
    // pass cannot see what they reach.
    confidence: dynamic.length
      ? { level: 'partial', reason: 'paths built at runtime; static resolution cannot see these', files: dynamic }
      : { level: 'full', reason: 'no runtime-built paths found' },
    findings,
  };
}

const kb = (n) => (n / 1024).toFixed(0) + 'KB';

function report(r) {
  if (!r.ok) { console.error('waste: ' + r.error); return 2; }
  const lines = [];
  lines.push(`scanned ${r.scanned.sources} source files, ${r.scanned.assets} static assets`);

  if (r.orphanModules.length) {
    lines.push('', `orphaned modules (nothing imports them) -- ${r.orphanModules.length}:`);
    for (const m of r.orphanModules) lines.push('  ' + m);
  }
  if (r.unreferencedAssets.length) {
    const bytes = r.unreferencedAssets.reduce((a, b) => a + b.bytes, 0);
    lines.push('', `unreferenced assets -- ${r.unreferencedAssets.length}, ${kb(bytes)}:`);
    for (const a of r.unreferencedAssets) lines.push(`  ${a.path}  ${kb(a.bytes)}`);
  }
  if (r.brokenLinks.length) {
    lines.push('', `links pointing at nothing -- ${r.brokenLinks.length}:`);
    for (const b of r.brokenLinks) lines.push(`  ${b.href}  (${b.kind}, in ${b.from})`);
  }

  lines.push('', `static weight: ${kb(r.weight.totalAssetBytes)} total`);
  for (const h of r.weight.heaviest) lines.push(`  ${h.path}  ${kb(h.bytes)}`);

  if (r.confidence.level !== 'full') {
    lines.push('', `CONFIDENCE: ${r.confidence.level} -- ${r.confidence.reason}`);
    for (const f of r.confidence.files) lines.push('  ' + f);
    lines.push('An "unreferenced" result above may be reached by one of those paths.');
    lines.push('Check before deleting. Do not report this pass as clean.');
  }

  lines.push('', r.findings ? `${r.findings} finding(s)` : 'no findings');
  console.log(lines.join('\n'));
  return r.findings ? 1 : 0;
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href
      || import.meta.url.endsWith(path.basename(process.argv[1]));
  } catch { return false; }
})();

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const root = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
  const r = analyse(root);
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? (r.findings ? 1 : 0) : 2);
  }
  process.exit(report(r));
}
