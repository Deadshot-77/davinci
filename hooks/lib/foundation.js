'use strict';

const { PLACEHOLDER } = require('./report.js');
const { parseJson } = require('./json.js');

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

module.exports = { validateFoundation, REQUIRED_SECTIONS, parseSections, requiresStackProfile };
