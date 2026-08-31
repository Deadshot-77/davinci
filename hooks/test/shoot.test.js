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


const fs = require('node:fs');

/* ---------- the small-viewport defect ---------- */
//
// A desktop OS refuses to make a browser window narrower than roughly 480-500
// CSS pixels. Asking for 390 produced a page laid out at 496 and a PNG cropped
// to 390: a desktop render that looks exactly like a broken mobile layout.
// Every mobile screenshot this tool took on Windows was that, and the mobile
// pass frontend-craft mandates was therefore lying. Measured with a probe page
// that renders its own window.innerWidth: 496 at scale factor 1, 483 at 2 --
// the clamp is in CSS pixels, so device scale factor does not help.

function loadCrop() {
  return import('../../scripts/png-crop.mjs');
}

// A real, inflate-able PNG: solid rows whose left half differs from the right,
// so a crop that keeps the wrong columns is visible in the assertion.
function makeRealPng(width, height) {
  const zlib = require('node:zlib');
  const bpp = 3;
  const stride = width * bpp;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const o = rowStart + 1 + x * bpp;
      const left = x < Math.floor(width / 2);
      raw[o] = left ? 200 : 20;
      raw[o + 1] = left ? 100 : 20;
      raw[o + 2] = y & 0xff;
    }
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('cropPng returns an image of exactly the requested size', async () => {
  const { cropPng } = await loadCrop();
  const { parsePng } = await loadShoot();
  const cropped = cropPng(makeRealPng(520, 844), 390, 844);
  assert.deepStrictEqual(parsePng(cropped), { width: 390, height: 844 });
});

test('cropPng keeps the top-left pixels and drops only the letterbox', async () => {
  const { cropPng } = await loadCrop();
  const zlib = require('node:zlib');
  // 100 wide: columns 0-49 are (200,100,y), 50-99 are (20,20,y).
  const cropped = cropPng(makeRealPng(100, 4), 50, 4);
  // Re-read the cropped image's first row and check it is all left-half pixels.
  let offset = 8; const idat = [];
  while (offset + 8 <= cropped.length) {
    const length = cropped.readUInt32BE(offset);
    const type = cropped.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(cropped.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert.strictEqual(raw[0], 0, 'first scanline should use filter type 0');
  assert.strictEqual(raw[1], 200, 'first pixel red channel should be the left-half value');
  assert.strictEqual(raw[1 + 49 * 3], 200, 'last kept pixel should still be left-half');
  assert.strictEqual(raw.length, (50 * 3 + 1) * 4, 'cropped data should be 50px wide, 4 rows');
});

test('cropPng refuses to enlarge, rather than returning something wrong', async () => {
  const { cropPng } = await loadCrop();
  assert.throws(() => cropPng(makeRealPng(100, 100), 200, 100), /larger than the image/);
});

test('cropPng rejects a buffer that is not a PNG', async () => {
  const { cropPng } = await loadCrop();
  assert.throws(() => cropPng(Buffer.from('nope'), 10, 10), /not a PNG/);
});

test('a viewport narrower than the window minimum is rendered through an iframe', async () => {
  const { shoot, MIN_WINDOW_WIDTH } = await loadShoot();
  let captured = null;
  const png = makeRealPng(MIN_WINDOW_WIDTH, 844);
  const out = require('node:path').join(require('node:os').tmpdir(), 'davinci-shoot-iframe.png');

  shoot({ url: 'http://localhost:3000', out, width: 390, height: 844 }, {
    cwd: require('node:os').tmpdir(),
    findBrowser: () => 'browser.exe',
    spawnSyncImpl: (bin, args) => { captured = args; fs.writeFileSync(out, png); return {}; },
  });

  const windowArg = captured.find((a) => a.startsWith('--window-size='));
  assert.strictEqual(windowArg, '--window-size=' + MIN_WINDOW_WIDTH + ',844',
    'the window must be legal-sized; the OS would clamp anything narrower and crop the render');
  assert.ok(captured.some((a) => a.startsWith('file://') && a.endsWith('.html')),
    'the page should be loaded inside a local wrapper, not directly');
  fs.unlinkSync(out);
});

test('the letterbox is cropped away so the file is the viewport that was asked for', async () => {
  const { shoot, MIN_WINDOW_WIDTH } = await loadShoot();
  const { parsePng } = await loadShoot();
  const out = require('node:path').join(require('node:os').tmpdir(), 'davinci-shoot-crop.png');
  const png = makeRealPng(MIN_WINDOW_WIDTH, 844);

  const result = shoot({ url: 'http://x', out, width: 390, height: 844 }, {
    cwd: require('node:os').tmpdir(),
    findBrowser: () => 'browser.exe',
    spawnSyncImpl: () => { fs.writeFileSync(out, png); return {}; },
  });

  assert.strictEqual(result.width, 390,
    'an agent judging a layout must not be handed a wider image than it asked for');
  assert.deepStrictEqual(parsePng(fs.readFileSync(out)), { width: 390, height: 844 });
  fs.unlinkSync(out);
});

test('a viewport wide enough for a real window is shot directly, with no wrapper', async () => {
  const { shoot } = await loadShoot();
  let captured = null;
  const out = require('node:path').join(require('node:os').tmpdir(), 'davinci-shoot-direct.png');

  shoot({ url: 'http://localhost:3000', out, width: 1280, height: 900 }, {
    cwd: require('node:os').tmpdir(),
    findBrowser: () => 'browser.exe',
    spawnSyncImpl: (bin, args) => { captured = args; fs.writeFileSync(out, makeRealPng(1280, 900)); return {}; },
  });

  assert.ok(captured.includes('--window-size=1280,900'));
  assert.ok(captured.includes('http://localhost:3000'), 'the URL should be loaded directly');
  assert.ok(!captured.some((a) => a.startsWith('file://')), 'no wrapper is needed at this width');
  fs.unlinkSync(out);
});

test('needsIframeViewport draws the line at the window minimum', async () => {
  const { needsIframeViewport, MIN_WINDOW_WIDTH } = await loadShoot();
  assert.strictEqual(needsIframeViewport(390), true);
  assert.strictEqual(needsIframeViewport(MIN_WINDOW_WIDTH - 1), true);
  assert.strictEqual(needsIframeViewport(MIN_WINDOW_WIDTH), false);
  assert.strictEqual(needsIframeViewport(1280), false);
});

test('the wrapper pins the iframe to the exact requested viewport', async () => {
  const { viewportWrapperHtml } = await loadShoot();
  const html = viewportWrapperHtml('http://localhost:3000/x', 390, 844);
  assert.match(html, /width:390px/);
  assert.match(html, /height:844px/);
  assert.match(html, /src="http:\/\/localhost:3000\/x"/);
  assert.match(html, /margin:0/, 'any margin would shift the render out of the crop');
});

test('a URL containing a quote cannot break out of the wrapper attribute', async () => {
  const { viewportWrapperHtml } = await loadShoot();
  const html = viewportWrapperHtml('http://x/?a="onload=alert(1)', 390, 844);
  assert.ok(!/src="http:\/\/x\/\?a="\s*onload/.test(html), 'quote should be escaped');
  assert.match(html, /&quot;/);
});

test('a render that comes back the wrong width is refused, not handed over', async () => {
  // Defence in depth for the direct path: if a browser silently renders at a
  // width other than the one asked for -- an OS clamp, a profile setting, a
  // future headless change -- the file must not reach an agent that is about
  // to judge a layout from it. This is the failure the whole file exists to
  // stop, so it must fail loudly even where no crop is involved.
  const { shoot } = await loadShoot();
  const out = require('node:path').join(require('node:os').tmpdir(), 'davinci-shoot-wrong.png');

  assert.throws(
    () => shoot({ url: 'http://x', out, width: 1280, height: 900 }, {
      cwd: require('node:os').tmpdir(),
    findBrowser: () => 'browser.exe',
      spawnSyncImpl: () => { fs.writeFileSync(out, makeRealPng(900, 900)); return {}; },
    }),
    /asked for a 1280px-wide viewport but the image is 900px/,
  );
  try { fs.unlinkSync(out); } catch { /* the throw may precede the write */ }
});

/* ---------- the tool as an unguarded write primitive ---------- */
//
// The write-scope hook checks Write and Edit by path, and Bash by patterns for
// redirection, `sed -i`, `cp`, `node -e`. None of those match
// `node scripts/shoot.mjs <url> <path>`, so a read-only gate could write a PNG
// over a source file or outside the project and the hook would allow it.
// Verified against the real scope map before the guard existed:
//
//   ALLOWED  code-reviewer  node scripts/shoot.mjs http://x ../../escape.png
//   ALLOWED  code-reviewer  node scripts/shoot.mjs http://x src/app/page.tsx

test('a screenshot may not be written outside the project', async () => {
  const { assertInsideProject } = await loadShoot();
  const root = process.platform === 'win32' ? 'C:\proj' : '/proj';
  for (const outside of ['../escape.png', '../../elsewhere/x.png']) {
    const abs = require('node:path').resolve(root, outside);
    assert.throws(() => assertInsideProject(abs, root), /outside the project/,
      outside + ' should be refused');
  }
});

test('a screenshot may not be written over a source file', async () => {
  const { assertInsideProject } = await loadShoot();
  const path = require('node:path');
  const root = process.platform === 'win32' ? 'C:\proj' : '/proj';
  assert.throws(
    () => assertInsideProject(path.join(root, 'src', 'app', 'page.tsx'), root),
    /must be a \.png/,
  );
});

test('an ordinary screenshot path inside the project is allowed', async () => {
  const { assertInsideProject } = await loadShoot();
  const path = require('node:path');
  const root = process.platform === 'win32' ? 'C:\proj' : '/proj';
  assert.doesNotThrow(() => assertInsideProject(path.join(root, '.devteam', 'shots', 'a.png'), root));
  assert.doesNotThrow(() => assertInsideProject(path.join(root, 'out.png'), root));
});

test('shoot refuses the write before launching a browser', async () => {
  // The refusal must come before the spawn, or the browser has already written
  // the file by the time anything objects.
  const { shoot } = await loadShoot();
  let spawned = false;
  assert.throws(
    () => shoot({ url: 'http://x', out: '../escape.png', width: 1280, height: 900 }, {
      cwd: require('node:os').tmpdir(),
    findBrowser: () => 'browser.exe',
      spawnSyncImpl: () => { spawned = true; return {}; },
    }),
    /outside the project/,
  );
  assert.strictEqual(spawned, false, 'the browser must not run for a refused path');
});
