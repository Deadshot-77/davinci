#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { decideScope } = require('./lib/scope.js');
const { decideBash } = require('./lib/bash.js');
const { parseJson } = require('./lib/json.js');

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

  const ti = (input && input.tool_input) || {};
  const isBashShaped = Object.prototype.hasOwnProperty.call(ti, 'command') ||
    Object.prototype.hasOwnProperty.call(ti, 'script');
  const decision = isBashShaped ? decideBash(input, scopeMap) : decideScope(input, scopeMap);
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
