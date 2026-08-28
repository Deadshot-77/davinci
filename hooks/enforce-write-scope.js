#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { decideScope } = require('./lib/scope.js');
const { decideBash } = require('./lib/bash.js');
const { parseJson } = require('./lib/json.js');
const { knownAgents } = require('./lib/agents.js');

function main() {
  let input;
  try {
    input = parseJson(fs.readFileSync(0, 'utf8'));
  } catch (err) {
    process.exit(0); // Unparseable input: never block an ordinary session.
  }

  let scopeMap;
  try {
    scopeMap = parseJson(fs.readFileSync(path.join(__dirname, 'scope-map.json'), 'utf8'));
  } catch (err) {
    process.stderr.write('davinci: scope-map.json unreadable: ' + err.message + '\n');
    process.exit(0);
  }

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

  const ti = (input && input.tool_input) || {};
  const isBashShaped = Object.prototype.hasOwnProperty.call(ti, 'command') ||
    Object.prototype.hasOwnProperty.call(ti, 'script');
  const known = knownAgents();
  const decision = isBashShaped
    ? decideBash(input, scopeMap, known)
    : decideScope(input, scopeMap, known, foundation);
  if (!decision) process.exit(0);

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
