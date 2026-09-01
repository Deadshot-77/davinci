#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { decideScope } = require('./lib/scope.js');
const { decideBash } = require('./lib/bash.js');
const { parseJson } = require('./lib/json.js');
const { knownAgents } = require('./lib/agents.js');
const { effectiveScopeMap } = require('./lib/scope-map.js');
const { ASSIGNMENTS_PATH, CLAIMS_PATH } = require('./lib/assignments.js');

function main() {
  let input;
  try {
    input = parseJson(fs.readFileSync(0, 'utf8'));
  } catch (err) {
    process.exit(0); // Unparseable input: never block an ordinary session.
  }

  let shippedMap;
  try {
    shippedMap = parseJson(fs.readFileSync(path.join(__dirname, 'scope-map.json'), 'utf8'));
  } catch (err) {
    process.stderr.write('davinci: scope-map.json unreadable: ' + err.message + '\n');
    process.exit(0);
  }

  // A project may declare its own layout. An absent, unparseable or invalid one
  // leaves the shipped map in force -- never an absent map, which would mean no
  // governance at all.
  const projectMapPath = path.join((input && input.cwd) || process.cwd(), '.devteam', 'scope-map.json');
  let projectMapText = '';
  try {
    if (fs.existsSync(projectMapPath)) projectMapText = fs.readFileSync(projectMapPath, 'utf8');
  } catch (err) {
    projectMapText = '';
  }
  const effective = effectiveScopeMap(shippedMap, projectMapText);
  if (effective.errors.length) {
    process.stderr.write('davinci: ignoring .devteam/scope-map.json: ' + effective.errors[0] + '\n');
  }
  const scopeMap = effective.map;

  // Read once, here, so scope.js stays pure and testable.
  const cwd = (input && input.cwd) || process.cwd();
  let foundation;
  try {
    const brief = fs.existsSync(path.join(cwd, '.devteam', 'brief.md'))
      ? fs.readFileSync(path.join(cwd, '.devteam', 'brief.md'), 'utf8')
      : '';
    foundation = {
      hasStackProfile: fs.existsSync(path.join(cwd, '.devteam', 'stack-profile.md')),
      routeDirect: /^\s*\*{0,2}Route:?\*{0,2}\s*direct\b/im.test(brief),
    };
  } catch (err) {
    // Cannot tell -- do not invent a blocker out of a filesystem error.
    foundation = undefined;
  }

  // Read here so scope.js and assignments.js stay pure. A missing or corrupt
  // file is passed through as absent, and assignments.js decides what that
  // means -- which is "no worker writes", never "any worker writes".
  function readJson(rel) {
    try {
      const p = path.join(cwd, rel);
      return fs.existsSync(p) ? parseJson(fs.readFileSync(p, 'utf8')) : null;
    } catch (err) {
      return null;
    }
  }
  const workers = {
    doc: readJson(ASSIGNMENTS_PATH),
    claims: readJson(CLAIMS_PATH),
  };

  const ti = (input && input.tool_input) || {};
  const isBashShaped = Object.prototype.hasOwnProperty.call(ti, 'command') ||
    Object.prototype.hasOwnProperty.call(ti, 'script');
  const known = knownAgents();
  const decision = isBashShaped
    ? decideBash(input, scopeMap, known)
    : decideScope(input, scopeMap, known, foundation, workers);
  if (!decision) process.exit(0);

  // An allowed worker write carries the claim table to persist, so the next
  // worker that reaches for the same assignment is refused. Failing to write
  // it must not block a write the rules already permitted -- the cost of a
  // lost claim is a race we warn about, and the cost of denying here is a
  // stalled slice for a filesystem hiccup.
  if (decision.claims) {
    try {
      fs.writeFileSync(path.join(cwd, CLAIMS_PATH), JSON.stringify(decision.claims, null, 2));
    } catch (err) {
      process.stderr.write('davinci: could not record assignment claim: ' + err.message + '\n');
    }
    process.exit(0);
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: decision.deny,
    },
  }));
  process.exit(0);
}

main();
