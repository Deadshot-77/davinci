'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// shoot.mjs is ESM (it must ship as .mjs so it runs on Node 18 without a
// "type": "module" package.json) so it's loaded here via dynamic import.
// node:test's async test callbacks make this safe to call per-test; Node
// caches the module after the first import.
function loadShoot() {
  return import('../../scripts/shoot.mjs');
}

function makePngBuffer(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR data length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

test('parsePng reads width and height from a valid PNG buffer', async () => {
  const { parsePng } = await loadShoot();
  const buf = makePngBuffer(800, 600);
  assert.deepStrictEqual(parsePng(buf), { width: 800, height: 600 });
});

test('parsePng rejects a buffer that is not a PNG', async () => {
  const { parsePng } = await loadShoot();
  assert.throws(() => parsePng(Buffer.from('not a png, just text padded out past 24 bytes')));
});

test('parsePng rejects a buffer too short to hold a header', async () => {
  const { parsePng } = await loadShoot();
  assert.throws(() => parsePng(Buffer.from([0x89, 0x50, 0x4e, 0x47])));
});

test('browserCandidates returns a non-empty list', async () => {
  const { browserCandidates } = await loadShoot();
  const candidates = browserCandidates({}, 'linux');
  assert.ok(Array.isArray(candidates));
  assert.ok(candidates.length > 0);
});

test('browserCandidates puts a CHROME_PATH override first when set', async () => {
  const { browserCandidates } = await loadShoot();
  const candidates = browserCandidates({ CHROME_PATH: '/custom/chrome-beta' }, 'linux');
  assert.strictEqual(candidates[0], '/custom/chrome-beta');
});

test('browserCandidates omits any override when CHROME_PATH is unset', async () => {
  const { browserCandidates } = await loadShoot();
  const candidates = browserCandidates({}, 'linux');
  assert.ok(!candidates.includes(undefined));
});

test('parseArgs defaults to 1280x900 when width/height are omitted', async () => {
  const { parseArgs } = await loadShoot();
  const parsed = parseArgs(['http://localhost:3000', 'out.png']);
  assert.deepStrictEqual(parsed, { url: 'http://localhost:3000', out: 'out.png', width: 1280, height: 900 });
});

test('parseArgs accepts explicit width and height overrides', async () => {
  const { parseArgs } = await loadShoot();
  const parsed = parseArgs(['http://localhost:3000', 'out.png', '390', '844']);
  assert.deepStrictEqual(parsed, { url: 'http://localhost:3000', out: 'out.png', width: 390, height: 844 });
});

test('parseArgs rejects a missing url', async () => {
  const { parseArgs } = await loadShoot();
  assert.throws(() => parseArgs([]), /url/);
});

test('parseArgs rejects a missing output path', async () => {
  const { parseArgs } = await loadShoot();
  assert.throws(() => parseArgs(['http://localhost:3000']), /out\.png/);
});

test('parseArgs rejects a non-numeric width', async () => {
  const { parseArgs } = await loadShoot();
  assert.throws(() => parseArgs(['http://localhost:3000', 'out.png', 'wide', '900']));
});
