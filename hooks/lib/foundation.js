'use strict';

const { PLACEHOLDER } = require('./report.js');
const { parseJson } = require('./json.js');
const { matchAny } = require('./glob.js');
const { effectiveScopeMap } = require('./scope-map.js');

const REQUIRED_SECTIONS = [
  'Framework', 'Language', 'Package manager', 'Directory map',
  'Naming conventions', 'Testing', 'Commands',
];

// Declared framework -> the npm package name that proves it.
const FRAMEWORK_PACKAGES = {
  'next.js': 'next', next: 'next', astro: 'astro', remix: '@remix-run/react',
  nuxt: 'nuxt', sveltekit: '@sveltejs/kit', vite: 'vite',
};

function parseSections(text) {
  const sections = {};
  let current = null;
  let buf = [];
  let inFence = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const m = /^##\s+(.+?)\s*$/.exec(line);
      if (m) {
        if (current !== null) sections[current] = buf.join('\n').trim();
        current = m[1];
        buf = [];
        continue;
      }
    }
    if (current !== null) buf.push(line);
  }
  if (current !== null) sections[current] = buf.join('\n').trim();
  return sections;
}

function validateFoundation(profileText, packageJsonText) {
  const errors = [];
  if (typeof profileText !== 'string' || profileText.trim() === '') {
    return ['stack-profile.md is missing or empty.'];
  }

  const sections = parseSections(profileText);

  for (const name of REQUIRED_SECTIONS) {
    if (!(name in sections)) {
      errors.push(`stack-profile.md is missing the required section "## ${name}".`);
    } else if (sections[name] === '') {
      errors.push(`stack-profile.md section "## ${name}" is empty. Fill it or the builders have no contract.`);
    } else if (PLACEHOLDER.test(sections[name])) {
      errors.push(`stack-profile.md section "## ${name}" contains placeholder text.`);
    }
  }

  if (packageJsonText && sections.Framework) {
    let pkg = null;
    let parseFailed = false;
    try { pkg = parseJson(packageJsonText); } catch (err) { pkg = null; parseFailed = true; }
    if (parseFailed) {
      errors.push(
        'package.json is present but could not be parsed, so the framework declared in ' +
        'stack-profile.md could not be verified against it.'
      );
    } else if (pkg) {
      const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      const declared = sections.Framework.toLowerCase();
      const key = Object.keys(FRAMEWORK_PACKAGES).find((k) => declared.includes(k));
      const expected = key && FRAMEWORK_PACKAGES[key];
      if (expected && !(expected in deps)) {
        errors.push(
          `stack-profile.md declares framework "${sections.Framework.split('\n')[0]}" ` +
          `but package.json has no "${expected}" dependency. The contract does not match the code.`
        );
      }
    }
  }

  return errors;
}

// A stack profile is only a builder's contract when there was scaffolding to
// govern. If a report touched nothing outside .devteam/ (e.g. it only wrote
// its own report or the brief), there is no code for the profile to describe.
function isUnderDevteam(filePath) {
  const norm = String(filePath).split('\\').join('/').replace(/^\.\//, '');
  return norm === '.devteam' || norm.startsWith('.devteam/');
}

function requiresStackProfile(report) {
  const files = Array.isArray(report && report.files_changed) ? report.files_changed : [];
  return files.some((f) => typeof f === 'string' && !isUnderDevteam(f));
}

// The report is written by the agent being gated, so it cannot be the only
// evidence. Anything the working tree shows as changed outside .devteam/ means
// a scaffold happened, whether or not the report admitted it.
//
// Classification (trivial/bounded/architectural) is deliberately not
// consulted here: the hook has no reliable access to the brief's
// classification, and today's routing rule (tech-lead never dispatches
// infra-architect on a `Route: direct` brief) already makes it redundant.
//
// The self-report half of this evidence is exactly requiresStackProfile()'s
// question ("does files_changed touch anything outside .devteam/?"), so it
// is reused here rather than duplicated with a second outside()/isUnderDevteam
// implementation that could quietly drift out of sync with it.
function scaffoldEvidence(reportFilesChanged, gitPorcelainLines) {
  const fromReport = requiresStackProfile({ files_changed: reportFilesChanged });
  const fromGit = (gitPorcelainLines || []).some((l) => !isUnderDevteam(l.slice(3).trim()));
  return fromReport || fromGit;
}

// Parse the "Directory map" table into { path, owner } rows. Tolerates
// backticks around the path cell and extra whitespace anywhere. Header and
// separator rows ("| File | Owner |", "|---|---|") are not special-cased --
// they parse into rows too, but their "owner" cell ("Owner", "---") never
// matches a real agent name, so scopeConflicts() below ignores them the
// same way it ignores any other row naming a non-agent as owner.
function parseDirectoryMapRows(sectionText) {
  const rows = [];
  for (const rawLine of String(sectionText || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 2) continue;
    const p = cells[0].replace(/^`+|`+$/g, '').trim();
    const owner = cells[1].trim();
    if (!p || !owner) continue;
    rows.push({ path: p, owner });
  }
  return rows;
}

// The foundation gate's other half: does the Directory map this profile
// hands to every builder actually match what scope-map.json will let them
// write? A profile can be internally coherent (all sections filled, no
// placeholders, framework matches package.json) and still assign a path to
// an agent whose scope-map.json entry does not cover it -- the contract and
// its enforcement silently contradicting each other. That contradiction
// only surfaces later, when the assigned builder's write is refused and it
// reports blocked instead of shipping.
//
// Reuses matchAny() (hooks/lib/glob.js) for the actual glob matching, and
// mirrors the self-report exemption already expressed in
// hooks/lib/scope.js's decideScope() (".devteam/reports/<agent>-*.json" is
// always writable by its own agent) rather than reimplementing either.
//
// A row whose owner is not a key in scopeMap is not a scope conflict --
// it names something the write-scope hook does not govern at all (a typo,
// a team name, a future agent), so there is nothing to contradict.
// The foundation gate is where a bad project scope map must be caught: the
// hook falls back to the shipped map rather than failing open, so an invalid
// file would otherwise take effect as silence -- infra believing it had set the
// scopes while nothing changed.
function projectScopeMapErrors(projectMapText, shippedMap) {
  if (typeof projectMapText !== 'string' || projectMapText.trim() === '') return [];
  const { errors } = effectiveScopeMap(shippedMap, projectMapText);
  return errors;
}

function scopeConflicts(profileText, scopeMap) {
  if (typeof profileText !== 'string' || profileText.trim() === '') return [];
  const sections = parseSections(profileText);
  const rows = parseDirectoryMapRows(sections['Directory map']);
  const map = scopeMap || {};
  const errors = [];

  for (const { path: p, owner } of rows) {
    if (!Object.prototype.hasOwnProperty.call(map, owner)) continue;

    const scopes = map[owner];
    if (matchAny(p, [`.devteam/reports/${owner}-*.json`])) continue;

    const scopeDesc = scopes.length ? scopes.join(', ') : '(none -- read-only)';
    if (scopes.length === 0 || !matchAny(p, scopes)) {
      errors.push(
        `stack-profile.md Directory map assigns "${p}" to ${owner}, but ${owner}'s actual write ` +
        `scope (${scopeDesc}) does not cover it. The builder will refuse this write and report ` +
        `blocked rather than write out of scope.`
      );
    }
  }

  return errors;
}

module.exports = {
  projectScopeMapErrors,
  validateFoundation, REQUIRED_SECTIONS, parseSections,
  requiresStackProfile, scaffoldEvidence, scopeConflicts,
};
