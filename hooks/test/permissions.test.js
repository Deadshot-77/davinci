'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROFILE = path.join(__dirname, '..', '..', 'permissions.example.json');
const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8').replace(/^﻿/, ''));
const allow = profile.permissions.allow;

// A builder is NOT bash-guarded by the write-scope hook -- decideBash returns
// early for any agent whose scope is real source, because an arbitrary shell
// cannot be checked by path. So for builders this allowlist is the only thing
// standing between them and writing outside their scope. Any entry that runs
// caller-supplied code removes the plugin's central safety property.
//
// A live run had five agents ask for `node -e` to assert on build output. The
// answer is a test run with `node --test`, not an escape hatch.
const ARBITRARY_CODE = [
  /\bnode\s+-e\b/, /\bnode\s+-p\b/, /\bnode\s+--eval\b/, /\bnode\s+--input-type\b/,
  /\bbash\s+-c\b/, /\bsh\s+-c\b/, /\bzsh\s+-c\b/,
  /\bpython3?\s+-c\b/, /\bperl\s+-e\b/, /\bruby\s+-e\b/,
  /\beval\b/,
];

test('the permission profile grants no arbitrary code execution', () => {
  const offenders = allow.filter((entry) => ARBITRARY_CODE.some((re) => re.test(entry)));
  assert.deepStrictEqual(offenders, [],
    'entry grants arbitrary code execution, which lets a builder write outside its scope ' +
    'through the filesystem API and bypass the write-scope hook entirely: ' + offenders.join(', '));
});

test('the permission profile grants nothing that installs, commits, or deploys', () => {
  // Verification only. These widen the blast radius of a mistake and are not
  // needed to prove work correct.
  const forbidden = [
    /npm\s+(i|install|add|ci)\b/, /pnpm\s+(i|install|add)\b/, /yarn\s+(add|install)\b/,
    /git\s+(commit|push|reset|clean|checkout|restore)\b/,
    /\b(vercel|netlify|wrangler|fly|heroku)\b/, /npm\s+publish\b/,
    /\brm\b/, /\bcurl\b/, /\bwget\b/,
  ];
  const offenders = allow.filter((entry) => forbidden.some((re) => re.test(entry)));
  assert.deepStrictEqual(offenders, [], 'profile grants more than verification: ' + offenders.join(', '));
});

test('every npm run script granted with arguments is also granted bare', () => {
  // Claude Code matches `Bash(npm run build:*)` against a command with a
  // suffix. A plain `npm run build` has none -- and it is the only
  // verification command an Astro or Next project has. The profile shipped
  // with `Bash(npm test)` AND `Bash(npm test:*)` but only the :* form for
  // build, lint and typecheck, so those silently never matched.
  const missing = [];
  for (const entry of allow) {
    const m = entry.match(/^Bash\((npm run [a-z0-9:@._-]+):\*\)$/);
    if (!m) continue;
    if (!allow.includes(`Bash(${m[1]})`)) missing.push(m[1]);
  }
  assert.deepStrictEqual(missing, [],
    'script(s) granted only in the :* form, so the bare command never matches: ' + missing.join(', '));
});

test('the profile still grants the commands an agent needs to prove its work', () => {
  // The other half of the balance. A profile that denies everything is safe
  // and useless: reports come back with empty verification arrays, and the
  // design's central rule -- prove completion with commands -- cannot be met.
  const required = [
    /npm test/, /node --test/, /npm run build/, /git status/, /git diff/, /npx --yes serve/,
  ];
  const unmet = required.filter((re) => !allow.some((entry) => re.test(entry)));
  assert.deepStrictEqual(unmet.map(String), [],
    'profile no longer grants a command agents need to verify anything');
});

test('the profile explains why the escape hatches are absent', () => {
  // Without the reason on record, the next person to hit a blocked assertion
  // adds `node -e` and the boundary is gone with nothing to argue against.
  const notes = Object.entries(profile)
    .filter(([k]) => k.startsWith('//'))
    .map(([, v]) => String(v))
    .join('\n');
  assert.match(notes, /node -e/, 'no note explains why node -e is excluded');
  assert.match(notes, /node --test/, 'the note should point at the sanctioned alternative');
});
