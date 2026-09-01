'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// waste.mjs is an ES module; these tests are CJS like the rest of the suite,
// so it is loaded through a dynamic import once and shared.
let analyse;
async function load() {
  if (!analyse) {
    const mod = await import(
      require('node:url').pathToFileURL(
        path.join(__dirname, '..', '..', 'scripts', 'waste.mjs')).href);
    analyse = mod.analyse;
  }
  return analyse;
}

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waste-'));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

const PAGE = 'import { Used } from "@/components/Used";\nexport default function Home(){return <Used/>}\n';
const USED = 'export function Used(){return null}\n';

test('a module nothing imports is reported', async () => {
  const run = await load();
  const root = project({
    'src/app/page.tsx': PAGE,
    'src/components/Used.tsx': USED,
    'src/components/Abandoned.tsx': 'export function Abandoned(){return null}\n',
  });
  const r = run(root);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.orphanModules, ['src/components/Abandoned.tsx']);
});

test('an entry point is never an orphan', async () => {
  // Nothing imports app/page.tsx -- the router calls it. Reporting framework
  // entry points would make every finding noise and the check would be ignored.
  const run = await load();
  const root = project({ 'src/app/page.tsx': PAGE, 'src/components/Used.tsx': USED });
  const r = run(root);
  assert.deepStrictEqual(r.orphanModules, [],
    'an entry point was reported as unused');
});

test('an aliased import counts as a reference', async () => {
  // `@/components/Used` resolves through the tsconfig alias. Missing it would
  // report a file that is used on every page, which is the false positive that
  // makes a tool like this get switched off.
  const run = await load();
  const root = project({ 'src/app/page.tsx': PAGE, 'src/components/Used.tsx': USED });
  const r = run(root);
  assert.ok(!r.orphanModules.includes('src/components/Used.tsx'));
});

test('assets nothing mentions are reported with their weight', async () => {
  const run = await load();
  const root = project({
    'src/app/page.tsx': 'export default function H(){return <img src="/real.png"/>}\n',
    'public/real.png': 'x',
    'public/stale.png': 'xxxxxxxxxx',
  });
  const r = run(root);
  assert.deepStrictEqual(r.unreferencedAssets.map((a) => a.path), ['public/stale.png']);
  assert.strictEqual(r.unreferencedAssets[0].bytes, 10);
});

test('links pointing at nothing are reported, assets and routes alike', async () => {
  const run = await load();
  const root = project({
    'src/app/page.tsx':
      'export default function H(){return <><a href="/gone.png">a</a><a href="/nowhere">b</a></>}\n',
  });
  const r = run(root);
  const hrefs = r.brokenLinks.map((b) => b.href).sort();
  assert.deepStrictEqual(hrefs, ['/gone.png', '/nowhere']);
});

test('a real route behind a link is not called broken', async () => {
  const run = await load();
  const root = project({
    'src/app/page.tsx': 'export default function H(){return <a href="/jobs">j</a>}\n',
    'src/app/jobs/page.tsx': 'export default function J(){return null}\n',
  });
  const r = run(root);
  assert.deepStrictEqual(r.brokenLinks, []);
});

test('a path built at runtime downgrades confidence instead of being ignored', async () => {
  // The rule this whole plugin keeps relearning: a check that could not see
  // something must say so, not return a clean result. A template-literal href
  // can reach a file this pass cannot resolve, so "unreferenced" stops being a
  // safe word and the report has to say why.
  const run = await load();
  const root = project({
    'src/app/page.tsx':
      'export default function H(){const n="a";return <img src={`/${n}.png`}/>}\n',
    'public/a.png': 'x',
  });
  const r = run(root);
  assert.strictEqual(r.confidence.level, 'partial');
  assert.match(r.confidence.reason, /runtime/);
  assert.ok(r.confidence.files.includes('src/app/page.tsx'));
});

test('a clean project reports full confidence and no findings', async () => {
  const run = await load();
  const root = project({
    'src/app/page.tsx': 'export default function H(){return <img src="/real.png"/>}\n',
    'public/real.png': 'x',
  });
  const r = run(root);
  assert.strictEqual(r.findings, 0);
  assert.strictEqual(r.confidence.level, 'full');
});

test('build output and dependencies are never scanned', async () => {
  // Scanning .next or node_modules would bury every real finding under
  // thousands of false ones.
  const run = await load();
  const root = project({
    'src/app/page.tsx': PAGE,
    'src/components/Used.tsx': USED,
    'node_modules/pkg/index.js': 'module.exports={}\n',
    '.next/static/chunk.js': 'console.log(1)\n',
    'out/index.html': '<html></html>\n',
  });
  const r = run(root);
  assert.deepStrictEqual(r.orphanModules, []);
  assert.ok(r.scanned.sources <= 2, 'scanned build output: ' + r.scanned.sources);
});
