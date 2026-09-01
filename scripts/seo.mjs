// Dependency-free check of what a page declares to a crawler and a screen reader.
//
// It reads BUILT HTML, not source. A framework's metadata export, a layout's
// title, a component's alt attribute -- none of them can be verified by reading
// the file they are written in, because what ships is the render. So this runs
// against out/, dist/ or build/, and when there is no build it says so rather
// than guessing from JSX.
//
// Usage: node scripts/seo.mjs [projectRoot] [--json]
// Exit:  0 = no errors, 1 = errors, 2 = could not run
//
// Split deliberately into errors and notes. An <img> with no alt attribute is
// an error: a screen reader announces the filename instead. A missing canonical
// is a note: often correct on a single-page site, and a tool that fails a build
// over it gets switched off.

import fs from 'node:fs';
import path from 'node:path';

const BUILD_DIRS = ['out', 'dist', 'build', 'public/build', '_site'];
const SKIP = new Set(['node_modules', '.git', '.next', '.devteam', 'coverage']);

function findHtml(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) findHtml(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i'))
    || tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? m[1] : null;
};
const hasAttr = (tag, name) => new RegExp('[\\s"\']' + name + '\\s*(=|[/>\\s])', 'i').test(tag);

function checkPage(html, rel) {
  const errors = [];
  const notes = [];

  // Strip script/style so their contents cannot masquerade as markup.
  const body = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

  const htmlTag = html.match(/<html\b[^>]*>/i);
  if (!htmlTag || !attr(htmlTag[0], 'lang')) {
    errors.push({ rel, what: 'no lang on <html>', why: 'a screen reader guesses the language and mispronounces the page' });
  }

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  if (!title || !title.trim()) {
    errors.push({ rel, what: 'no <title>', why: 'the tab, the bookmark and the search result all have no name' });
  }

  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const metaByName = (n) => metas.find((t) => (attr(t, 'name') || '').toLowerCase() === n);
  const metaByProp = (p) => metas.find((t) => (attr(t, 'property') || '').toLowerCase() === p);

  if (!metaByName('viewport')) {
    errors.push({ rel, what: 'no viewport meta', why: 'indexing is mobile-first, and without it the mobile render is a scaled desktop page' });
  }
  const desc = metaByName('description');
  if (!desc || !(attr(desc, 'content') || '').trim()) {
    notes.push({ rel, what: 'no meta description', why: 'the search result snippet gets written for you, from whatever text is first' });
  }
  if (!html.match(/<link\b[^>]*rel\s*=\s*["']canonical["']/i)) {
    notes.push({ rel, what: 'no canonical', why: 'fine on a single-URL page; a duplicate-content risk once a page is reachable two ways' });
  }
  for (const p of ['og:title', 'og:description', 'og:image']) {
    if (!metaByProp(p)) notes.push({ rel, what: 'no ' + p, why: 'a shared link renders with no card' });
  }

  // Images. A missing alt attribute and alt="" mean opposite things: the first
  // makes a screen reader read the filename, the second correctly hides a
  // decorative image. Only the first is a defect.
  const imgs = [...body.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  let decorative = 0;
  for (const tag of imgs) {
    if (!hasAttr(tag, 'alt')) {
      const src = attr(tag, 'src') || '(no src)';
      errors.push({ rel, what: 'img has no alt attribute: ' + src, why: 'a screen reader announces the filename; alt="" is how you hide a decorative image' });
    } else if (!(attr(tag, 'alt') || '').trim()) {
      decorative++;
    }
  }

  // Headings: one h1, and no skipped level on the way down.
  const heads = [...body.matchAll(/<h([1-6])\b[^>]*>/gi)].map((m) => Number(m[1]));
  const h1s = heads.filter((h) => h === 1).length;
  if (h1s === 0) errors.push({ rel, what: 'no <h1>', why: 'nothing states what the page is' });
  if (h1s > 1) notes.push({ rel, what: h1s + ' <h1> elements', why: 'the page claims several subjects; usually one is the real one' });
  for (let i = 1; i < heads.length; i++) {
    if (heads[i] - heads[i - 1] > 1) {
      notes.push({ rel, what: `heading jumps h${heads[i - 1]} to h${heads[i]}`, why: 'a screen reader user navigating by heading finds a level missing' });
      break;
    }
  }

  const jsonLd = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html);
  return { rel, errors, notes, title: (title || '').trim(), jsonLd, images: imgs.length, decorative };
}

export function analyse(root) {
  if (!fs.existsSync(root)) return { ok: false, error: `no such directory: ${root}` };

  const buildDir = BUILD_DIRS
    .map((d) => path.join(root, d))
    .find((d) => fs.existsSync(d) && fs.statSync(d).isDirectory() && findHtml(d).length);

  if (!buildDir) {
    // Not a clean result. The check did not run.
    return {
      ok: true, ran: false, pages: 0, errors: [], notes: [],
      confidence: {
        level: 'none',
        reason: 'no built HTML found in ' + BUILD_DIRS.join(', ') + ' -- run the build first',
      },
      findings: 0,
    };
  }

  const files = findHtml(buildDir);
  const pages = files.map((f) => checkPage(fs.readFileSync(f, 'utf8'), path.relative(root, f).split(path.sep).join('/')));

  const errors = pages.flatMap((p) => p.errors);
  const notes = pages.flatMap((p) => p.notes);

  // Two pages sharing a title are usually a layout that never set one per route.
  const byTitle = new Map();
  for (const p of pages) {
    if (!p.title) continue;
    if (!byTitle.has(p.title)) byTitle.set(p.title, []);
    byTitle.get(p.title).push(p.rel);
  }
  for (const [t, where] of byTitle) {
    if (where.length > 1) {
      notes.push({ rel: where.join(', '), what: `${where.length} pages share the title "${t.slice(0, 50)}"`, why: 'each route should say what it is; a shared title is usually the layout default' });
    }
  }

  return {
    ok: true, ran: true, buildDir: path.relative(root, buildDir) || '.',
    pages: pages.length,
    images: pages.reduce((n, p) => n + p.images, 0),
    decorative: pages.reduce((n, p) => n + p.decorative, 0),
    structuredDataPages: pages.filter((p) => p.jsonLd).length,
    errors, notes,
    // Regex, not a parser. Good enough for attributes on well-formed built
    // output, and stated so nobody reads a pass as a guarantee.
    confidence: {
      level: 'partial',
      reason: 'markup read by pattern, not parsed; malformed or unusually written HTML can be missed',
    },
    findings: errors.length,
  };
}

function report(r) {
  if (!r.ok) { console.error('seo: ' + r.error); return 2; }
  const lines = [];

  if (!r.ran) {
    lines.push('DID NOT RUN -- ' + r.confidence.reason);
    lines.push('This is not a pass. Build the project, then run this again,');
    lines.push('and report the check as unrun if you cannot.');
    console.log(lines.join('\n'));
    return 0;
  }

  lines.push(`read ${r.pages} built page(s) from ${r.buildDir}/ -- ${r.images} image(s), ${r.decorative} marked decorative`);
  lines.push(`structured data on ${r.structuredDataPages}/${r.pages} page(s)`);

  if (r.errors.length) {
    lines.push('', `errors -- ${r.errors.length}:`);
    for (const e of r.errors) lines.push(`  ${e.rel}: ${e.what}\n      ${e.why}`);
  }
  if (r.notes.length) {
    lines.push('', `notes -- ${r.notes.length}:`);
    for (const n of r.notes) lines.push(`  ${n.rel}: ${n.what}\n      ${n.why}`);
  }

  lines.push('', `CONFIDENCE: ${r.confidence.level} -- ${r.confidence.reason}`);
  lines.push('', r.errors.length ? `${r.errors.length} error(s)` : 'no errors');
  console.log(lines.join('\n'));
  return r.errors.length ? 1 : 0;
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return import.meta.url.endsWith(path.basename(process.argv[1])); } catch { return false; }
})();

if (invokedDirectly) {
  const args = process.argv.slice(2);
  const root = path.resolve(args.find((a) => !a.startsWith('--')) || process.cwd());
  const r = analyse(root);
  if (args.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? (r.findings ? 1 : 0) : 2);
  }
  process.exit(report(r));
}
