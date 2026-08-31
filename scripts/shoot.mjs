#!/usr/bin/env node
// Zero-dependency headless screenshot tool. Node 18+.
//
// Locates an already-installed Chromium-family browser (Edge, Chrome,
// Chromium) and drives it headlessly to screenshot a URL, then verifies the
// output is a real PNG before declaring success. This exists so an agent can
// genuinely look at what it built instead of styling blind: a silent failure
// here — a missing file, a truncated file, an HTML error page written to a
// .png path — would let an agent believe it looked when it did not.
//
// Usage: node scripts/shoot.mjs <url> <out.png> [width] [height]

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { cropPng } from './png-crop.mjs';
import { pathToFileURL } from 'node:url';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 900;

// Reads width/height out of a PNG's IHDR chunk. Throws on anything that
// isn't a well-formed PNG header — callers should treat that as "the browser
// did not actually produce a screenshot", not as a parsing detail to shrug off.
export function parsePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    throw new Error('not a valid PNG: file is too small to contain a header');
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a valid PNG: bad magic bytes');
  }
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') {
    throw new Error(`not a valid PNG: expected IHDR chunk, found "${chunkType}"`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

// Ordered list of places to look for a Chromium-family browser. CHROME_PATH
// always wins when set. After that: common Windows install paths for Edge
// and Chrome, then macOS paths, then Linux paths, then bare command names
// resolved against PATH as a last resort.
export function browserCandidates(env = process.env, platform = process.platform) {
  const candidates = [];

  if (env.CHROME_PATH) candidates.push(env.CHROME_PATH);

  const programFiles = env['ProgramFiles'] || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = env['LOCALAPPDATA'];

  candidates.push(
    path.win32.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.win32.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.win32.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.win32.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  );
  if (localAppData) {
    candidates.push(path.win32.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }

  candidates.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  );

  candidates.push(
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  );

  candidates.push('google-chrome', 'chromium', 'chrome', 'msedge');

  void platform; // kept as a parameter for testability; candidates are platform-agnostic on purpose
  return candidates;
}

function isPathLike(candidate) {
  return candidate.includes('/') || candidate.includes('\\') || /^[a-zA-Z]:/.test(candidate);
}

function commandExists(cmd, platform = process.platform) {
  const checker = platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(checker, [cmd], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

// Walks the candidate list and returns the first one that actually exists on
// disk (absolute paths) or resolves on PATH (bare command names). Returns
// null when none of them do — callers must treat that as fatal, not silently
// skip the perception loop.
export function findBrowser(candidates = browserCandidates(), platform = process.platform) {
  for (const candidate of candidates) {
    if (isPathLike(candidate)) {
      if (fs.existsSync(candidate)) return candidate;
    } else if (commandExists(candidate, platform)) {
      return candidate;
    }
  }
  return null;
}

// Parses `<url> <out.png> [width] [height]`. Throws with a message meant to
// be printed directly — no wrapping needed by the caller.
export function parseArgs(argv) {
  const [url, out, widthArg, heightArg] = argv;

  if (!url) {
    throw new Error('missing required argument: <url>');
  }
  if (!out) {
    throw new Error('missing required argument: <out.png>');
  }

  const width = widthArg === undefined ? DEFAULT_WIDTH : Number.parseInt(widthArg, 10);
  const height = heightArg === undefined ? DEFAULT_HEIGHT : Number.parseInt(heightArg, 10);

  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`invalid width: "${widthArg}"`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`invalid height: "${heightArg}"`);
  }

  return { url, out, width, height };
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) return false;
    sleepSync(100);
  }
  return true;
}

// Runs the full shoot-and-verify flow. Returns {path, width, height, bytes}
// on success; throws an Error with an actionable message on any failure.
// This is the function that stands between an agent believing it looked at
// its own work and actually having done so — it must never resolve unless
// the file on disk is genuinely a PNG with real dimensions.
// A desktop OS will not make a browser window narrower than roughly 480-500
// CSS pixels. Below that, --window-size is clamped: the page lays out at the
// clamped width and the screenshot is cropped to the width asked for, which
// produces an image indistinguishable from a broken mobile layout. Measured at
// 496px on Windows 11, and unaffected by --force-device-scale-factor because
// the clamp is in CSS pixels.
//
// Above this threshold the window is used directly. At or below it the page is
// rendered in an iframe of the true size inside a legal window, which gives it
// a genuine viewport, and the letterbox is cropped off afterwards so the agent
// looks at exactly the viewport it asked for.
// This tool is an unguarded write primitive. The write-scope hook checks the
// Write and Edit tools by path, and checks Bash commands against patterns for
// redirection, `sed -i`, `cp`, `node -e` and the like -- none of which match
// `node scripts/shoot.mjs <url> <output-path>`. So a read-only gate could
// write a PNG over a source file, or outside the project entirely, and the
// hook would allow it. The plugin's own foundation gate found this while
// reviewing the run it was part of.
//
// The guard belongs here rather than in the hook: patching the hook means
// chasing every script that happens to write a file, while a check at the
// tool holds whoever invokes it and however.
export function assertInsideProject(absOut, cwd) {
  const root = path.resolve(cwd);
  const rel = path.relative(root, absOut);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(
      `refusing to write ${absOut}: it is outside the project (${root}). ` +
        `Screenshots go somewhere inside the project you are working on.`,
    );
  }
  if (!/\.png$/i.test(absOut)) {
    throw new Error(
      `refusing to write ${absOut}: a screenshot must be a .png. ` +
        `Writing PNG bytes over a source file is not a screenshot.`,
    );
  }
}

export const MIN_WINDOW_WIDTH = 520;

export function needsIframeViewport(width, minimum = MIN_WINDOW_WIDTH) {
  return width < minimum;
}

// The wrapper page. The iframe is pinned to the top-left at exactly the
// requested size, so the crop is a plain top-left crop.
export function viewportWrapperHtml(url, width, height) {
  return '<!doctype html><meta charset="utf-8">' +
    '<style>html,body{margin:0;padding:0;background:#000;overflow:hidden}' +
    'iframe{display:block;border:0;width:' + width + 'px;height:' + height + 'px}</style>' +
    '<iframe src="' + String(url).replace(/"/g, '&quot;') + '"></iframe>';
}

export function shoot({ url, out, width, height }, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const candidates = opts.candidates || browserCandidates(env, platform);
  const browser = opts.findBrowser ? opts.findBrowser(candidates, platform) : findBrowser(candidates, platform);

  if (!browser) {
    throw new Error(
      'no Chromium-family browser found. Tried: ' +
        candidates.join(', ') +
        '. Set CHROME_PATH to an explicit browser executable and retry.',
    );
  }

  const absOut = path.resolve(out);
  assertInsideProject(absOut, opts.cwd || process.cwd());
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  const minWidth = opts.minWindowWidth || MIN_WINDOW_WIDTH;
  const useIframe = needsIframeViewport(width, minWidth);

  let target = url;
  let windowWidth = width;
  let wrapperPath = null;

  if (useIframe) {
    windowWidth = minWidth;
    wrapperPath = path.join(
      opts.tmpDir || os.tmpdir(),
      `davinci-viewport-${width}x${height}-${process.pid}.html`,
    );
    fs.writeFileSync(wrapperPath, viewportWrapperHtml(url, width, height), 'utf8');
    target = 'file://' + wrapperPath.split(path.sep).join('/');
  }

  const args = [
    '--headless=new',
    '--disable-gpu',
    `--screenshot=${absOut}`,
    `--window-size=${windowWidth},${height}`,
  ];
  if (useIframe) args.push('--allow-file-access-from-files');
  args.push(target);

  const spawnImpl = opts.spawnSyncImpl || spawnSync;
  const result = spawnImpl(browser, args, { stdio: 'ignore' });
  if (wrapperPath) { try { fs.unlinkSync(wrapperPath); } catch { /* best effort */ } }

  if (result.error) {
    throw new Error(`failed to launch "${browser}": ${result.error.message}`);
  }

  const timeoutMs = opts.timeoutMs || 15000;
  if (!waitForFile(absOut, timeoutMs)) {
    throw new Error(
      `${absOut} was never written after launching ${browser} ` +
        `(waited ${timeoutMs}ms). The browser may have failed silently — ` +
        `check that the URL is reachable and the window size is valid.`,
    );
  }

  let buffer = fs.readFileSync(absOut);
  let dims;
  try {
    dims = parsePng(buffer);
  } catch (err) {
    throw new Error(
      `${absOut} exists but is not a valid PNG (${err.message}). ` +
        `The browser likely wrote an error page or partial file instead of a screenshot.`,
    );
  }

  // Trim the letterbox the wrapper window leaves, so the file on disk is the
  // viewport that was asked for and nothing else.
  if (useIframe && dims.width > width) {
    try {
      buffer = cropPng(buffer, width, Math.min(height, dims.height));
    } catch (err) {
      throw new Error(
        `rendered ${dims.width}x${dims.height} but could not crop to ${width}x${height}: ` +
          `${err.message}. Refusing to leave a letterboxed image behind — an agent would ` +
          `read the padding as dead space in the design.`,
      );
    }
    fs.writeFileSync(absOut, buffer);
    dims = parsePng(buffer);
  }

  if (dims.width !== width) {
    throw new Error(
      `asked for a ${width}px-wide viewport but the image is ${dims.width}px. ` +
        `Do not judge a layout from this file.`,
    );
  }

  return { path: absOut, width: dims.width, height: dims.height, bytes: buffer.length };
}

function main() {
  const argv = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    console.error(`shoot.mjs: ${err.message}`);
    console.error('usage: node scripts/shoot.mjs <url> <out.png> [width] [height]');
    process.exitCode = 1;
    return;
  }

  try {
    const result = shoot(parsed);
    console.log(`wrote ${result.path} ${result.width}x${result.height} ${result.bytes} bytes`);
  } catch (err) {
    console.error(`shoot.mjs: ${err.message}`);
    process.exitCode = 1;
  }
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  main();
}
