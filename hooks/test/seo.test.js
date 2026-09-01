'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let analyse;
async function load() {
  if (!analyse) {
    const mod = await import(
      require('node:url').pathToFileURL(
        path.join(__dirname, '..', '..', 'scripts', 'seo.mjs')).href);
    analyse = mod.analyse;
  }
  return analyse;
}

function site(pages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
  for (const [rel, body] of Object.entries(pages)) {
    const full = path.join(root, 'out', rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

const page = (inner, head = '') => `<!doctype html><html lang="en"><head>
<title>A page</title><meta name="viewport" content="width=device-width">${head}
</head><body><h1>A page</h1>${inner}</body></html>`;

const errs = (r) => r.errors.map((e) => e.what);
const notes = (r) => r.notes.map((n) => n.what);

test('a missing alt attribute is an error and alt="" is not', async () => {
  // The distinction the whole check exists for. No alt attribute makes a screen
  // reader announce the filename; alt="" is the correct way to hide a
  // decorative image. Telling an agent to "add alt text to every image"
  // produces worse accessibility than telling it the difference.
  const run = await load();
  const r = run(site({
    'index.html': page('<img src="/logo.png"><img src="/swirl.png" alt=""><img src="/team.jpg" alt="The studio">'),
  }));
  assert.deepStrictEqual(errs(r), ['img has no alt attribute: /logo.png']);
  assert.strictEqual(r.decorative, 1, 'alt="" should count as deliberately decorative');
  assert.strictEqual(r.images, 3);
});

test('no build output is reported as unrun, never as a pass', async () => {
  // The rule this plugin has relearned five times. A check that could not run
  // is not a clean result, and source JSX cannot answer what a crawler sees.
  const run = await load();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'page.tsx'), 'export default function P(){return null}\n');
  const r = run(root);
  assert.strictEqual(r.ran, false);
  assert.strictEqual(r.confidence.level, 'none');
  assert.match(r.confidence.reason, /run the build first/);
});

test('the declarations a page cannot do without are errors', async () => {
  const run = await load();
  const r = run(site({
    'index.html': '<!doctype html><html><head></head><body><p>nothing</p></body></html>',
  }));
  const what = errs(r).join(' | ');
  for (const expected of ['no lang on <html>', 'no <title>', 'no viewport meta', 'no <h1>']) {
    assert.ok(what.includes(expected), 'missing error for: ' + expected + ' -- got ' + what);
  }
});

test('canonical and open graph are notes, not build failures', async () => {
  // A tool that fails a build over a missing canonical on a one-page site gets
  // switched off, and then it catches nothing at all.
  const run = await load();
  const r = run(site({ 'index.html': page('<img src="/a.png" alt="A">') }));
  assert.deepStrictEqual(errs(r), []);
  assert.strictEqual(r.findings, 0);
  assert.ok(notes(r).some((n) => n.includes('canonical')));
  assert.ok(notes(r).some((n) => n.includes('og:image')));
});

test('two routes sharing a title is reported', async () => {
  // Almost always a layout default that no route overrode.
  const run = await load();
  const r = run(site({
    'index.html': page('<p>home</p>'),
    'about/index.html': page('<p>about</p>'),
  }));
  assert.ok(notes(r).some((n) => /2 pages share the title/.test(n)),
    'a shared title went unreported: ' + notes(r).join(' | '));
});

test('a skipped heading level is reported', async () => {
  const run = await load();
  const r = run(site({ 'index.html': page('<h3>jumped</h3>') }));
  assert.ok(notes(r).some((n) => /heading jumps h1 to h3/.test(n)));
});

test('markup inside script and style cannot masquerade as content', async () => {
  // A template string containing <img> in a bundled script would otherwise be
  // reported as a real image with no alt -- a false positive on every page.
  const run = await load();
  const r = run(site({
    'index.html': page('<img src="/a.png" alt="A">',
      '<script>const t = "<img src=x>"; const h = "<h3>x</h3>";</script>'),
  }));
  assert.deepStrictEqual(errs(r), []);
  assert.strictEqual(r.images, 1, 'an image inside a script tag was counted');
});

test('structured data is counted, not demanded', async () => {
  const run = await load();
  const r = run(site({
    'index.html': page('<p>x</p>', '<script type="application/ld+json">{"@type":"Organization"}</script>'),
    'about/index.html': page('<p>y</p>'),
  }));
  assert.strictEqual(r.structuredDataPages, 1);
  assert.strictEqual(r.pages, 2);
  assert.ok(!errs(r).some((e) => /structured/i.test(e)), 'schema must never be an error');
});
